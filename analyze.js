/* ==========================================
   api/analyze.js
   - [UPDATE] CORS 허용 설정 추가 (405 에러 해결)
   ========================================== */

export default async function handler(req, res) {
    // 1. CORS 헤더 설정 (모든 도메인 허용)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // 보안을 위해 나중에는 실제 도메인으로 변경 권장
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // 2. OPTIONS 요청 처리 (브라우저의 사전 검사)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 3. POST 요청만 허용
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Server configuration error: API Key missing' });
    }

    try {
        const { parts } = req.body;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: parts }] })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(response.status).json(errorData);
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}