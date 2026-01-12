/* ==========================================
   /api/analyze.js (RAG Integrated)
   ========================================== */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from '@pinecone-database/pinecone';

export const config = {
    maxDuration: 60, // RAG 검색 시간이 추가되므로 타임아웃 넉넉히 유지
};

// 시도할 모델 목록
const MODELS_TO_TRY = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
    "gemini-1.5-pro",
    "gemini-1.0-pro",
    "gemini-pro"
];

// --- [Helper 1] Pinecone 초기화 ---
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// --- [Helper 2] 문서 내용을 바탕으로 RAG 검색 수행 ---
async function retrieveRAGContext(genAI, parts) {
    try {
        // 1. 이미지 데이터 찾기 (parts 배열에서 inline_data 찾기)
        const imagePart = parts.find(p => p.inline_data);
        if (!imagePart) return ""; // 이미지가 없으면 RAG 건너뜀

        // 2. [검색용 쿼리 생성] Gemini Flash를 이용해 이미지를 텍스트로 요약
        // (이미지를 벡터로 바로 만들 수 없으므로, 텍스트로 변환 후 검색)
        const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const summaryPrompt = "이 법률 문서의 종류(예: 판결문, 계약서)와 핵심 내용(주문, 특약사항 등)을 3줄 요약해서 검색 쿼리로 만들어줘.";
        
        const summaryResult = await visionModel.generateContent([
            summaryPrompt,
            imagePart // 이미지 전달
        ]);
        const queryText = summaryResult.response.text();
        console.log("🔍 RAG Search Query Generated:", queryText.substring(0, 50) + "...");

        // 3. [임베딩] 검색 쿼리를 벡터로 변환
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const embedResult = await embedModel.embedContent(queryText);
        const queryVector = embedResult.embedding.values;

        // 4. [검색] Pinecone DB 조회
        const index = pinecone.index("legal-rag-db"); // rag-train.js에서 만든 인덱스 이름
        const queryResponse = await index.query({
            vector: queryVector,
            topK: 2, // 가장 유사한 사례 2개만 가져옴
            includeMetadata: true
        });

        // 5. [컨텍스트 조립] 검색 결과를 문자열로 변환
        if (queryResponse.matches.length === 0) return "";

        let ragContext = "\n\n=== [RAG: 유사 사례 참조 지침] ===\nAI야, 아래는 과거 유사한 문서에서 학습된 '해석 노하우'야. 분석 시 최우선으로 참고해.\n";
        
        queryResponse.matches.forEach((match, i) => {
            const meta = match.metadata;
            ragContext += `\n[사례 ${i + 1}]\n- Reading Strategy: ${meta.readingStrategy || '없음'}\n- Logic Rule: ${meta.logicRule || '없음'}\n`;
        });
        ragContext += "=====================================\n\n";

        return ragContext;

    } catch (e) {
        console.warn("⚠️ RAG Retrieval Failed (Continuing without RAG):", e.message);
        return ""; // 에러 나면 RAG 없이 진행
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. 프론트엔드에서 보낸 parts 받기
        let { parts } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API Key Missing' });

        const genAI = new GoogleGenerativeAI(apiKey);

        // ---------------------------------------------------------
        // [NEW] RAG 프로세스 삽입
        // ---------------------------------------------------------
        console.log("🚀 Starting RAG Retrieval...");
        const additionalContext = await retrieveRAGContext(genAI, parts);
        
        if (additionalContext) {
            console.log("✅ RAG Context Injected.");
            // parts[0]은 보통 시스템 프롬프트(텍스트)입니다. 여기에 RAG 지침을 이어 붙입니다.
            if (parts.length > 0 && parts[0].text) {
                parts[0].text = parts[0].text + additionalContext; 
            } else {
                // 만약 텍스트 파트가 없으면 맨 앞에 추가
                parts.unshift({ text: additionalContext });
            }
        }
        // ---------------------------------------------------------

        let lastError = null;

        // [기존 로직] 모델 순차 시도
        for (const modelName of MODELS_TO_TRY) {
            try {
                console.log(`Trying model: ${modelName}...`);
                
                const config = { temperature: 0.1 };
                if (modelName.includes("1.5") || modelName.includes("flash")) {
                    config.responseMimeType = "application/json";
                }

                const model = genAI.getGenerativeModel({ 
                    model: modelName, 
                    generationConfig: config
                });

                const result = await model.generateContent({
                    contents: [{ role: "user", parts: parts }]
                });

                const response = await result.response;
                const text = response.text();

                console.log(`✅ Success with model: ${modelName}`);
                
                return res.status(200).json({ 
                    candidates: [{ content: { parts: [{ text: text }] } }]
                });

            } catch (error) {
                console.warn(`❌ Failed with ${modelName}: ${error.message}`);
                lastError = error;
                continue;
            }
        }

        console.error("All models failed.");
        throw new Error(`모든 모델 시도 실패. 마지막 에러: ${lastError ? lastError.message : 'Unknown'}`);

    } catch (error) {
        console.error("Final Handler Error:", error);
        return res.status(500).json({ error: error.message });
    }
}