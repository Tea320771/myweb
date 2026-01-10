import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { parts } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API Key Missing' });

        const genAI = new GoogleGenerativeAI(apiKey);

        try {
            // ---------------------------------------------------------
            // [1차 시도] gemini-flash-latest 사용
            // (장점: 최신 모델 / 단점: 무료 할당량이 하루 20~50회로 적음)
            // ---------------------------------------------------------
            const model = genAI.getGenerativeModel({ 
                model: "gemini-flash-latest", 
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: "application/json" 
                }
            });

            const result = await model.generateContent({
                contents: [{ role: "user", parts: parts }]
            });

            const response = await result.response;
            const text = response.text();

            return res.status(200).json({ 
                candidates: [{ content: { parts: [{ text: text }] } }]
            });

        } catch (firstError) {
            // 에러가 429(Too Many Requests) 또는 Quota(할당량) 관련인지 확인
            const isQuotaError = firstError.message.includes('429') || 
                                 firstError.message.includes('Quota') || 
                                 firstError.message.includes('Too Many Requests');

            if (isQuotaError) {
                console.warn("⚠️ gemini-flash-latest 할당량 초과(429). gemini-pro로 전환합니다.");

                // ---------------------------------------------------------
                // [2차 시도 - Fallback] gemini-pro 사용
                // (장점: 하루 1,500회 무료로 매우 넉넉함 / 단점: Flash보다 약간 느릴 수 있음)
                // ---------------------------------------------------------
                const fallbackModel = genAI.getGenerativeModel({ 
                    model: "gemini-pro", 
                    generationConfig: {
                        temperature: 0.1
                        // gemini-pro(1.0) 호환성을 위해 JSON 강제 옵션은 제거함
                    }
                });

                const fallbackResult = await fallbackModel.generateContent({
                    contents: [{ role: "user", parts: parts }]
                });

                const fallbackResponse = await fallbackResult.response;
                const fallbackText = fallbackResponse.text();

                return res.status(200).json({ 
                    candidates: [{ content: { parts: [{ text: fallbackText }] } }]
                });
            } else {
                // 429 에러가 아니면(예: 400 Bad Request, 서버 오류 등) 그대로 에러 발생
                throw firstError;
            }
        }

    } catch (error) {
        console.error("AI Error:", error);
        return res.status(500).json({ error: error.message });
    }
}