/* ==========================================
   api/analyze.js
   - [FINAL FIX] 무료로 사용 가능한 실험용 모델(gemini-2.0-flash-exp) 적용
   ========================================== */

export default async function handler(req, res) {
    // 1. CORS 설정 (접속 허용)
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

        // [핵심 변경] 'limit: 0' 에러가 뜨는 정식 버전 대신, 무료로 열려있는 '실험용(exp) 버전' 사용
        const targetModel = 'models/gemini-2.0-flash-exp';
        const url = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: parts }] })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Gemini API Error:", errorData);
            
            // 에러 메시지 원본 전달
            const specificMessage = errorData.error?.message || JSON.stringify(errorData);
            
            // 429 Too Many Requests 처리
            if (response.status === 429) {
                 return res.status(429).json({ 
                    error: `[할당량 초과] ${specificMessage}` 
                });
            }

            return res.status(response.status).json({ 
                error: `[Google Error ${response.status}] ${specificMessage}` 
            });
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}