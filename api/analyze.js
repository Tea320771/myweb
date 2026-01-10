import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
    maxDuration: 60,
};

// 시도할 모델 목록 (우선순위 순서)
// 1. 최신/빠름/무료량 많음 (1.5 Flash 계열)
// 2. 안정적/무료량 많음 (Pro 계열)
// 3. 최후의 수단 (Flash Latest - 20회 제한 있음)
const MODELS_TO_TRY = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash-002",
    "gemini-1.5-pro",
    "gemini-1.0-pro",
    "gemini-pro",
    "gemini-flash-latest"
];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { parts } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API Key Missing' });

        const genAI = new GoogleGenerativeAI(apiKey);
        let lastError = null;

        // [순차 시도] 리스트에 있는 모델을 하나씩 시도합니다.
        for (const modelName of MODELS_TO_TRY) {
            try {
                console.log(`Trying model: ${modelName}...`);
                
                // gemini-pro 계열은 JSON 모드를 지원하지 않을 수 있어 예외 처리
                const config = {
                    temperature: 0.1
                };
                // 1.5 버전이나 flash 버전일 때만 JSON 강제 모드 적용
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
                
                // 만약 429(할당량 초과)라면, 다음 모델(더 넉넉한 모델)을 시도해볼 가치가 있음.
                // 만약 404(모델 없음)라면, 당연히 다음 모델로 넘어가야 함.
                // 즉, 어떤 에러든 다음 모델을 시도합니다.
                continue;
            }
        }

        // 모든 모델이 실패했을 경우
        console.error("All models failed.");
        throw new Error(`모든 모델 시도 실패. 마지막 에러: ${lastError ? lastError.message : 'Unknown'}`);

    } catch (error) {
        console.error("Final Handler Error:", error);
        return res.status(500).json({ error: error.message });
    }
}