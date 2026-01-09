/* ==========================================
   api/analyze.js
   - [FINAL FIX] 사용 가능한 모델(gemini-2.0-flash)로 변경
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

        // [핵심 변경] 진단 결과에서 확인된 '사용 가능한 모델'로 교체
        // models/gemini-2.0-flash (최신 고성능 모델)
        const targetModel = 'models/gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: parts }] })
        });

        // 404가 또 뜰 경우를 대비한 안전장치 (그대로 유지)
        if (response.status === 404) {
            console.log("Model not found (404). Fetching available models list...");
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
            const listResp = await fetch(listUrl);
            let availableModels = "조회 실패";
            if (listResp.ok) {
                const listData = await listResp.json();
                if (listData.models) {
                    availableModels = listData.models.map(m => m.name).filter(n => n.includes('gemini')).join('\n');
                }
            }
            return res.status(200).json({
                candidates: [{
                    content: { parts: [{ text: `
\`\`\`json
{
  "error_diagnosis": true,
  "message": "⚠️ 설정한 모델(${targetModel})도 사용할 수 없습니다.",
  "available_models": "${availableModels.replace(/\n/g, ', ')}",
  "advice": "위 목록 중 다른 모델을 시도해보세요."
}
\`\`\`
` }] }
                }]
            });
        }

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