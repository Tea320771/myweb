import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'; // SchemaType 추가

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
        // 최신 모델 사용 권장 (flash 2.0 or 1.5-pro)
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: {
                temperature: 0.1, // 정확한 데이터 추출을 위해 낮춤
                responseMimeType: "application/json" // [복구] 이제 버전업으로 사용 가능
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

    } catch (error) {
        console.error("AI Error:", error);
        return res.status(500).json({ error: error.message });
    }
}