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
            반드시 아래에 명시된 **UI 요소의 ID(Key Name)**를 엄격히 준수하여 JSON을 출력하라.

            === [판단 기준 및 우선순위] ===
            1순위 (절대적): **[RAG Learned Data]** (사용자 피드백 및 유사 판례)
            2순위: **[Logic Guide]** (기본 해석 규칙)
            3순위: **[Reading Guide]** (단순 텍스트 추출)

            === [사건 정보 및 선고일자 추출 규칙] ===
            1. **선고일자(rulingDate)**: 
            - 판결문 중 '판결선고' 기재된 날짜인 '0000. 00. 00.'를 찾아라.
            - 출력 키: "rulingDate1", "rulingDate2", "rulingDate3" (필수 추출)
            - 형식: "YYYY. MM. DD." (예: 2023. 10. 10.)

            2. **사건번호 및 법원**:
            - 출력 키: "caseNo1", "courtName1", "caseNo2", "courtName2"... (caseNumber 아님)

            === [Step-by-Step 작업 지시] ===
            
            1. **[Reading & Classification]**: 
               - 업로드된 모든 이미지의 내용을 읽고 사건번호 부호를 통해 **심급(1심/2심/3심)을 분류**하라.
               - (예: '가단, 가합, 소' = 1심 / '나' = 2심 / '다' = 3심)
               - 1심 정보는 json의 '...1' 필드에, 2심 정보는 '...2', 3심 정보는 '...3' 필드에 각각 정확히 매핑하여 추출하라. 
               - 2심이나 3심 판결문이 있다면 해당 주문(Cost Ruling)과 청구취지를 반드시 추출해야 한다.

             2. **[Document Classification]**:
               - 업로드된 이미지가 무엇인지 분류하라.
               - (A) **판결문**: 사건번호, 주문, 청구취지 등이 포함됨.
               - (B) **증빙서류**: '사건위임계약서', '약정서', '이체확인증', '영수증' 등

             3. **[Soga Extraction (중요: 청구취지 분석)]**:
               - **'청구취지'(1심), '항소(항고)취지'(2심), '상고(재항고)취지'(3심)** 섹션을 찾아라.
               - 해당 문장 내에서 피고(피신청인)에게 지급을 명하는 **가장 큰 금전 액수(숫자)**를 찾아 이를 'soga'로 간주하라.
               - 예: "피고는 원고에게 금 50,000,000원을 지급하라" -> soga: 50000000
               - 예: "제1심 판결을 취소한다... 금 70,000,000원을 지급하라" -> soga: 70000000 (항소심 기준)

            4. **[Lawyer Fee Extraction (증빙서류 분석)]**:
               - **(A) 사건위임계약서/약정서**: '착수금', '성공보수(성과보수)' 항목을 찾아 약정된 금액을 추출하라.
               - **(B) 이체내역서/영수증**: 법무법인이나 변호사에게 실제로 송금된 금액을 추출하라.
               - 추출된 금액은 해당 심급(1/2/3심)에 맞춰 'startFee1'(1심 착수금), 'successFee1'(1심 성공보수) 등의 필드에 할당하라.
               - 어떤 심급의 비용인지 불분명하다면 판결문 날짜와 이체 날짜를 비교하여 추론하라.

            5. **[Judgment Analysis]**:
               - 판결문의 '주문(Ruling)'을 읽고 비용 부담 비율을 계산하라.
               - 1심 정보는 '...1' 필드, 2심은 '...2', 3심은 '...3' 필드에 매핑하라.
               - 피신청인(피고)의 'reimburseRatio'(상환 비율)를 계산하라.
               - 공식: (100 - 원고 부담 비율) = 피고 부담 비율.
               - 예: "소송비용은 피고가 부담한다" -> reimburseRatio: 100
               - 예: "소송비용 중 30%는 원고가 부담한다" -> reimburseRatio: 70

            6. **소가 합산 금지 (Individual Soga Extraction)**:
            - 보조참가인, 독립당사자참가인에 대한 비용 청구 시, 각 원고와의 독립된 청구액을 소가로 추출한다.
            - 추출 데이터 예시:
            * (김갑동 vs 보조참가인) soga: 50,000,000 
            * (이을녀 vs 보조참가인) soga: 100,000,000 

            - "피고들은 원고에게 A를 지급하고, 피고 보조참가인은 피고들과 연대하여 그중 B를 지급하라"는 문구에서 소가는 (A + B)가 아닌 **A**다.
            - 피고 보조참가인의 책임은 피고들의 전체 책임 범위 내에 포함된 연대 채무이므로, 해당 원고가 청구하는 총액(A)을 소가로 산정한다.
            - 추출 데이터 예시 : 
            * 청구취지 예시 : "피고들은 연대하여 원고 김갑동에게 150,000,000원, 원고 이을녀에게 175,000,000원, 피고 보조참가인은 피고들과 연대하여 원고 김갑동에게 50,000,000원, 원고 이을녀에게 100,000,000원을 각 지급하라."
            - **원고 김갑동 vs 피고들**: 소가(soga)는 150,000,000원이다. (5,000만 원을 더하지 마라) 
            - **원고 이을녀 vs 피고들**: 소가(soga)는 175,000,000원이다. (1억 원을 더하지 마라)


            7. **비용 부담 상세화 (Cost Burden Details)**:
            - 'costBurdenDetails1' 배열 내에 위 정산 단위를 별도로 기재하라.
            - 각 객체는 { "name": "방국봉", "targetPlaintiff": "김갑동", "soga": 50000000, "reimburseRatio": 100 } 형태를 유지하라.

            8. **선고일자 추출**:
            - '판결 선고' 항목의 2011. 3. 1.을 찾아 'rulingDate1'에 저장하라[cite: 11].

            9. **[RAG Check & Overwrite] (매우 중요)**:
               - [RAG Learned Data]에 이번 사건과 유사한 패턴(예: "상급심에서 취소됨", "피고가 전부 부담")이 있는지 확인하라.
               - **만약 RAG 데이터가 "피고 부담(reimburseRatio: 100)"이라고 결론 내렸다면, 문서에 뭐라고 적혀있든 무조건 RAG의 결론을 따라라.**
               - 특히 "1심 판결이 취소된 경우"에는 1심 주문 텍스트를 무시하고, **최종 확정된(2심/3심) 부담 비율**을 1심 데이터(burdenRatio1)에도 똑같이 적용하라.

            === [Output Format & Anti-Hallucination Rules] ===
            **경고: 아래 규칙을 어길 시 시스템 오류가 발생하므로 엄격히 준수하라.**

            1. **No Nesting (중첩 금지)**: 
               - 결과는 무조건 **Flat JSON**이어야 한다.
               - 상위 객체(Wrapper)를 절대 생성하지 마라.

            2. **Strict Data Types (자료형 준수)**:
               - 'plaintiffs': 반드시 **객체 배열** '[{ "name": "...", "addr": "..." }]' 형태여야 한다. (문자열 금지)
               - 'defendants': 반드시 **객체 배열** '[{ "name": "...", "addr": "..." }]' 형태여야 한다. (문자열 금지)

            3. **Key Name Strictness (키 이름 준수)**: 
               - 'court1' (x) -> 'courtName1' (o)
               - 'court2' (x) -> 'courtName2' (o)
               - 'ruling1' (x) -> 'costRulingText1' (o)
               - 'caseNumber1' (x) -> 'caseNo1' (o)
               - 반드시 제공된 예시('reading_guide.json')의 키 이름과 똑같이 출력하라.

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