/* ==========================================
   api/analyze.js
   - [FINAL FIX] 사용 가능한 모델(gemini-2.0-flash)로 확정 적용
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

        // [핵심] 진단 결과에서 확인된 '사용 가능한 모델'로 고정
        const targetModel = 'models/gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: parts }] })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // 에러 메시지 분석
            const errorMessage = (errorData.error && errorData.error.message) ? errorData.error.message.toLowerCase() : "";
            
            // 429 Too Many Requests (할당량 초과) 상세 처리
            if (response.status === 429) {
                return res.status(429).json({ 
                    error: "잠시만요! 1분 동안 너무 많은 요청이 있었습니다. 1분 뒤에 다시 시도해주세요." 
                });
            }

            return res.status(response.status).json(errorData);
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}