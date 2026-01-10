// api/analyze.js
import { GoogleGenerativeAI } from '@google/generative-ai';

// Vercel Serverless Function 설정 (타임아웃 늘리기 등)
export const config = {
    maxDuration: 60, // 무료 플랜은 최대 10초~60초 제한이 있을 수 있음
};

export default async function handler(req, res) {
    // 1. POST 요청만 허용
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { parts } = req.body; // 프론트엔드에서 보낸 이미지 데이터

        // 2. API 키 확인
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: '서버 설정 오류: GEMINI_API_KEY가 없습니다.' });
        }

        // 3. Gemini 모델 초기화
        const genAI = new GoogleGenerativeAI(apiKey);
        // 최신 모델 사용 (gemini-1.5-flash가 속도/비용 면에서 유리)
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 4. AI에게 전송 및 응답 대기
        const result = await model.generateContent({
            contents: [{ role: "user", parts: parts }],
            generationConfig: {
                temperature: 0.2, // 사실적인 분석을 위해 창의성 낮춤
                responseMimeType: "application/json", // JSON 모드 강제 (지원 모델인 경우)
            }
        });

        const response = await result.response;
        const text = response.text();

        // 5. 결과 반환
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