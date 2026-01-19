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
    "gemini-2.0-flash",
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

            // [변경됨] 프론트엔드에 있던 핵심 프롬프트를 백엔드로 이식
            const systemPrompt = `
            너는 대한민국 법원의 '소송비용액 확정 신청'을 처리하는 AI다.
            제공된 판결문 이미지들을 분석하여 **최종 확정된 비용 부담 내용**을 JSON으로 출력하라.

            === [판단 기준 및 우선순위] ===
            1순위 (절대적): **[RAG Learned Data]** (사용자 피드백 및 유사 판례)
            2순위: **[Logic Guide]** (기본 해석 규칙)
            3순위: **[Reading Guide]** (단순 텍스트 추출)

            === [Step-by-Step 작업 지시] ===
            
            1. **[Reading & Classification]**: 
               - 업로드된 모든 이미지의 내용을 읽고 사건번호 부호를 통해 **심급(1심/2심/3심)을 분류**하라.
               - (예: '가단, 가합, 소' = 1심 / '나' = 2심 / '다' = 3심)
               - 1심 정보는 json의 '...1' 필드에, 2심 정보는 '...2', 3심 정보는 '...3' 필드에 각각 정확히 매핑하여 추출하라. 
               - 2심이나 3심 판결문이 있다면 해당 주문(Cost Ruling)과 청구취지를 반드시 추출해야 한다.
            
            2. **[RAG Check & Overwrite] (매우 중요)**:
               - [RAG Learned Data]에 이번 사건과 유사한 패턴(예: "상급심에서 취소됨", "피고가 전부 부담")이 있는지 확인하라.
               - **만약 RAG 데이터가 "피고 부담(reimburseRatio: 100)"이라고 결론 내렸다면, 문서에 뭐라고 적혀있든 무조건 RAG의 결론을 따라라.**
               - 특히 "1심 판결이 취소된 경우"에는 1심 주문 텍스트를 무시하고, **최종 확정된(2심/3심) 부담 비율**을 1심 데이터(burdenRatio1)에도 똑같이 적용하라.

            3. **[Calculation]**:
               - 피신청인(피고)의 'reimburseRatio'(상환 비율)를 계산하라.
               - 공식: (100 - 원고 부담 비율) = 피고 부담 비율.
               - 예: "소송비용은 피고가 부담한다" -> reimburseRatio: 100
               - 예: "소송비용 중 30%는 원고가 부담한다" -> reimburseRatio: 70

            === [Output Format] ===
            반드시 아래 JSON 구조를 엄격히 준수하라. (주석은 제거하고 출력)
            
            {
                "courtName1": "...", "caseNo1": "...", "rulingDate1": "...", "costRulingText1": "...",
                "courtName2": "...", "caseNo2": "...", "rulingDate2": "...", "costRulingText2": "...",
                "courtName3": "...", "caseNo3": "...", "rulingDate3": "...", "costRulingText3": "...",

                "soga1": 0, "soga2": 0, "soga3": 0,
                "burdenRatio1": "100", "burdenRatio2": "100", "burdenRatio3": "100",

                "plaintiffs": [...],
                "defendants": [...],
                "costBurdenDetails1": [...]
            }

            ---
            [Reading Guide Data]
            ${readingGuideStr}

            [Logic Guide Data]
            ${logicGuideStr}
            ---

            오직 JSON 형식의 텍스트만 응답하라.
            `;
            
            // 기존 코드 유지 (프롬프트를 배열 맨 앞에 추가)
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