/* ==========================================
   api/analyze.js
   - [DIAGNOSTIC MODE]
   - 분석 시도 후 404 에러 발생 시, 사용 가능한 모델 목록을 조회하여 알려주는 기능 포함
   ========================================== */

export default async function handler(req, res) {
    // 1. CORS(교차 출처 리소스 공유) 허용 설정
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // 2. OPTIONS 요청(사전 검사) 처리
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 3. POST 요청만 허용
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 4. API Key 확인
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Server configuration error: API Key missing' });
    }

    try {
        const { parts } = req.body;

        // [목표 모델] 가장 안정적인 'gemini-1.5-flash' 시도
        const targetModel = 'models/gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: parts }] })
        });

        // 🚨 [진단 로직] 404 오류(모델 없음) 발생 시 -> 사용 가능한 모델 목록을 조회해서 알려줌
        if (response.status === 404) {
            console.log("Model not found (404). Fetching available models list...");
            
            // 모델 목록 조회 (ListModels API)
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
            const listResp = await fetch(listUrl);
            
            let availableModels = "조회 실패";
            
            if (listResp.ok) {
                const listData = await listResp.json();
                if (listData.models) {
                    // 'gemini'가 포함된 모델 이름만 필터링해서 보여줌
                    availableModels = listData.models
                        .map(m => m.name) // 예: models/gemini-1.5-flash
                        .filter(name => name.includes('gemini')) 
                        .join('\n');
                }
            }

            // 에러를 던지는 대신, 프론트엔드 화면에 진단 결과를 보여주기 위해 성공(200)으로 위장하여 응답
            return res.status(200).json({
                candidates: [{
                    content: { parts: [{ text: `
\`\`\`json
{
  "error_diagnosis": true,
  "message": "⚠️ 현재 코드에 설정된 모델(${targetModel})을 이 API 키로 사용할 수 없습니다.",
  "available_models": "${availableModels.replace(/\n/g, ', ')}",
  "advice": "위 목록에 있는 모델 이름 중 하나를 골라 api/analyze.js 코드의 targetModel 변수를 수정하세요."
}
\`\`\`
` }] }
                }]
            });
        }

        // 그 외 에러 처리
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(response.status).json(errorData);
        }

        // 성공 시 데이터 반환
        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}