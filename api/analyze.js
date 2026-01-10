import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

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
        
        // [수정] 
        // gemini-flash-latest는 할당량이 매우 적은(20회) 실험적 모델로 연결될 수 있습니다.
        // 하루 1,500회 무료 사용이 가능한 표준 모델 'gemini-1.5-flash'를 사용해야 합니다.
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash-002", 
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

    } catch (error) {
        console.error("AI Error:", error);
        return res.status(500).json({ error: error.message });
    }
}