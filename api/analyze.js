import { GoogleGenerativeAI } from '@google/generative-ai';

// Vercel Serverless Function 설정
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
        if (!apiKey) {
            return res.status(500).json({ error: '서버 설정 오류: GEMINI_API_KEY가 없습니다.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // [수정됨] generationConfig에서 responseMimeType을 제거했습니다.
        const result = await model.generateContent({
            contents: [{ role: "user", parts: parts }],
            generationConfig: {
                temperature: 0.2, 
                // responseMimeType: "application/json"  <-- 이 줄이 400 오류의 원인이므로 삭제함
            }
        });

        const response = await result.response;
        const text = response.text();

        return res.status(200).json({ 
            candidates: [
                { content: { parts: [{ text: text }] } }
            ]
        });

    } catch (error) {
        console.error("AI 분석 중 오류:", error);
        return res.status(500).json({ error: error.message || "AI 분석 실패" });
    }
}