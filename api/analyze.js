/* ==========================================
   /api/analyze.js
   - 기능 1: Static Context (서버의 JSON 가이드라인 읽기)
   - 기능 2: RAG (Pinecone에서 유사 판례 검색)
   - 기능 3: Gemini 분석 실행
   ========================================== */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from '@pinecone-database/pinecone';
import fs from 'fs';
import path from 'path';

export const config = {
    maxDuration: 60,
};

// 시도할 모델 목록
const MODELS_TO_TRY = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.0-pro"
];

// Pinecone 초기화 (API Key 없으면 에러 방지 위해 try-catch 감쌈)
let pinecone;
try {
    if (process.env.PINECONE_API_KEY) {
        pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    }
} catch (e) {
    console.warn("⚠️ Pinecone init failed:", e);
}

// [Helper] RAG 검색 함수
async function retrieveRAGContext(genAI, parts) {
    if (!pinecone) return ""; // Pinecone 설정 안됐으면 패스

    try {
        const imagePart = parts.find(p => p.inline_data);
        if (!imagePart) return "";

        // 1. 이미지를 텍스트 검색 쿼리로 변환
        const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const summaryPrompt = "이 법률 문서의 핵심 내용(주문, 특약 등)을 3줄로 요약해줘.";
        const summaryResult = await visionModel.generateContent([summaryPrompt, imagePart]);
        const queryText = summaryResult.response.text();

        // 2. 임베딩 및 검색
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const embedResult = await embedModel.embedContent(queryText);
        const queryVector = embedResult.embedding.values;

        const index = pinecone.index("legal-rag-db");
        const queryResponse = await index.query({
            vector: queryVector,
            topK: 2,
            includeMetadata: true
        });

        if (queryResponse.matches.length === 0) return "";

        let ragContext = "\n\n=== [RAG: 유사 사례 참조] ===\nAI야, 아래 유사 판례의 해석 로직을 참고해:\n";
        queryResponse.matches.forEach((match, i) => {
            ragContext += `[사례${i+1}] ${match.metadata.logicRule || ''}\n`;
        });
        return ragContext;

    } catch (e) {
        console.warn("⚠️ RAG Search Error:", e.message);
        return ""; // 에러 나면 RAG 없이 진행
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        let { parts } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API Key Missing' });

        const genAI = new GoogleGenerativeAI(apiKey);

        // ---------------------------------------------------------
        // [1] Static Context 주입 (JSON 파일 읽기)
        // ---------------------------------------------------------
        try {
            // Vercel에서는 process.cwd() + 'public' 조합 사용
            const readingPath = path.join(process.cwd(), 'public', 'reading_guide.json');
            const logicPath = path.join(process.cwd(), 'public', 'guideline.json');

            // 파일이 존재하는지 체크 후 읽기
            let readingGuideStr = "{}";
            let logicGuideStr = "{}";

            if (fs.existsSync(readingPath)) readingGuideStr = fs.readFileSync(readingPath, 'utf8');
            if (fs.existsSync(logicPath)) logicGuideStr = fs.readFileSync(logicPath, 'utf8');

            const systemPrompt = `
            너는 법률 사무원 AI야. 아래 가이드라인을 엄격히 준수해.
            
            [STEP 1: Reading Guide]
            ${readingGuideStr}

            [STEP 2: Logic Guide]
            ${logicGuideStr}

            [STEP 3]
            위 규칙에 따라 JSON 포맷으로만 응답해.
            `;

            // parts 배열 맨 앞에 시스템 프롬프트 추가
            parts.unshift({ text: systemPrompt });

        } catch (fsError) {
            console.error("❌ File System Error:", fsError);
            // 파일 읽기 실패해도 기본 프롬프트는 넣어줌
            parts.unshift({ text: "너는 법률 분석 AI야. JSON 포맷으로 응답해." });
        }

        // ---------------------------------------------------------
        // [2] RAG Context 주입 (Pinecone)
        // ---------------------------------------------------------
        const ragContext = await retrieveRAGContext(genAI, parts);
        if (ragContext) {
            // 시스템 프롬프트(parts[0]) 뒤에 RAG 내용을 이어 붙임
            parts[0].text += ragContext;
        }

        // ---------------------------------------------------------
        // [3] Gemini 호출
        // ---------------------------------------------------------
        let lastError = null;
        for (const modelName of MODELS_TO_TRY) {
            try {
                const model = genAI.getGenerativeModel({ 
                    model: modelName,
                    generationConfig: { responseMimeType: "application/json" }
                });

                const result = await model.generateContent({
                    contents: [{ role: "user", parts: parts }]
                });
                
                return res.status(200).json({ 
                    candidates: [{ content: { parts: [{ text: result.response.text() }] } }]
                });

            } catch (error) {
                console.warn(`Retry ${modelName} failed:`, error.message);
                lastError = error;
            }
        }

        throw new Error("All models failed. " + lastError?.message);

    } catch (error) {
        console.error("Handler Final Error:", error);
        return res.status(500).json({ error: error.message });
    }
}