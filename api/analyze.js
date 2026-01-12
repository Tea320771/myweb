/* ==========================================
   /api/analyze.js
   - 기능 1: Static Context (서버 JSON 읽기)
   - 기능 2: RAG (Pinecone 검색)
   - 기능 3: Gemini 분석 (temp3의 안정적 모델 로직 적용)
   ========================================== */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from '@pinecone-database/pinecone';
import fs from 'fs';
import path from 'path';

export const config = {
    maxDuration: 60,
};

// [temp3에서 가져옴] 더 다양하고 강력한 모델 목록
const MODELS_TO_TRY = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash-002",
    "gemini-1.5-pro",
    "gemini-1.0-pro",
    "gemini-pro",
    "gemini-flash-latest"
];

// Pinecone 초기화
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
    if (!pinecone) return ""; 

    try {
        const imagePart = parts.find(p => p.inline_data);
        if (!imagePart) return "";

        // 1. 요약 및 쿼리 생성
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
        return ""; 
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
        // [1] Static Context 주입
        // ---------------------------------------------------------
        try {
            const readingPath = path.join(process.cwd(), 'public', 'reading_guide.json');
            const logicPath = path.join(process.cwd(), 'public', 'guideline.json');

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
            
            parts.unshift({ text: systemPrompt });

        } catch (fsError) {
            console.error("❌ File System Error:", fsError);
            parts.unshift({ text: "너는 법률 분석 AI야. JSON 포맷으로 응답해." });
        }

        // ---------------------------------------------------------
        // [2] RAG Context 주입
        // ---------------------------------------------------------
        const ragContext = await retrieveRAGContext(genAI, parts);
        if (ragContext) {
            parts[0].text += ragContext;
        }

        // ---------------------------------------------------------
        // [3] Gemini 호출 (temp3의 안정적 로직 적용)
        // ---------------------------------------------------------
        let lastError = null;
        
        for (const modelName of MODELS_TO_TRY) {
            try {
                console.log(`🤖 Trying model: ${modelName}`);

                // [중요] 모델별 설정 분기 (temp3 로직)
                // 1.5 버전이나 flash 버전일 때만 JSON 모드 강제, 그 외엔 일반 텍스트 모드
                const generationConfig = {
                    temperature: 0.1
                };
                
                if (modelName.includes("1.5") || modelName.includes("flash")) {
                    generationConfig.responseMimeType = "application/json";
                }

                const model = genAI.getGenerativeModel({ 
                    model: modelName,
                    generationConfig: generationConfig
                });

                const result = await model.generateContent({
                    contents: [{ role: "user", parts: parts }]
                });
                
                const responseText = result.response.text();
                
                console.log(`✅ Success with ${modelName}`);

                return res.status(200).json({ 
                    candidates: [{ content: { parts: [{ text: responseText }] } }]
                });

            } catch (error) {
                console.warn(`❌ Failed with ${modelName}:`, error.message);
                lastError = error;
                // 에러가 나면 멈추지 않고 다음 모델을 시도합니다 (continue)
                continue;
            }
        }

        throw new Error("모든 모델 시도 실패. " + (lastError?.message || "Unknown error"));

    } catch (error) {
        console.error("Handler Final Error:", error);
        return res.status(500).json({ error: error.message });
    }
}