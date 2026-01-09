/* ==========================================
   api/analyze.js
   - [FINAL FIX] 사용자 키 목록에 존재하는 'models/gemini-flash-latest' 적용
   ========================================== */

export default async function handler(req, res) {
    // 1. CORS 설정
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) { return res.status(500).json({ error: 'Server configuration error: API Key missing' }); }

    try {
        const { parts } = req.body;

        // [핵심 수정] 사용자님 목록(screenshot)에 있는 정확한 모델명 사용
        // 'gemini-1.5-flash' (X) -> 'gemini-flash-latest' (O)
        const targetModel = 'models/gemini-flash-latest';
        
        const url = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: parts }] })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Gemini API Error:", errorData);
            
            const specificMessage = errorData.error?.message || JSON.stringify(errorData);
            
            // 429 할당량 초과 에러 처리
            if (response.status === 429) {
                 return res.status(429).json({ 
                    error: `[할당량 초과] 사용량이 많아 잠시 제한되었습니다. 1분 뒤에 다시 시도해주세요. (${specificMessage})` 
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