/* ==========================================
   api/analyze.js
   - [FINAL FIX] 무료 계정에서 확실히 지원하는 'gemini-1.5-flash' 적용
   - 2.0/2.5 버전은 무료 계정(Free Tier)에서 limit: 0 으로 막혀있음 확인됨
   ========================================== */

export default async function handler(req, res) {
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

        // [핵심] 무료 계정(Free Tier)의 유일한 희망: 1.5 Flash
        // 2.0, 2.5, exp 등은 무료 계정에서 limit: 0 (사용 불가) 상태임이 확인되었습니다.
        const targetModel = 'models/gemini-1.5-flash';
        
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
            
            // 429 에러 처리 (이제 limit:0 은 안 뜰 겁니다)
            if (response.status === 429) {
                 return res.status(429).json({ 
                    error: `[할당량 초과] 1분 뒤에 다시 시도해주세요. (${specificMessage})` 
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