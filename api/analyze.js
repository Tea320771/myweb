/* ==========================================
   api/analyze.js
   - [DEBUG MODE] 에러 메시지 원본 출력
   - "1분 대기" 추측 로직을 제거하고 구글의 실제 응답을 보여줍니다.
   ========================================== */

export default async function handler(req, res) {
    // 1. CORS 설정
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) { return res.status(500).json({ error: 'Server configuration error: API Key missing' }); }

    try {
        const { parts } = req.body;

        // 모델: gemini-2.0-flash
        const targetModel = 'models/gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: parts }] })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Gemini API Error:", errorData);
            
            // [수정됨] 내 맘대로 에러를 해석하지 않고, 구글의 원본 메시지를 그대로 보냄
            // 이렇게 해야 'Daily Limit'인지 'Rate Limit'인지 정확히 알 수 있음
            return res.status(response.status).json({
                error: `[구글 서버 응답] ${errorData.error?.message || response.statusText}`
            });
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}