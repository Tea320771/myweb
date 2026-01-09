/* ==========================================
   api/analyze.js (디버깅용 임시 코드)
   - 내 키로 사용 가능한 모델 목록을 조회합니다.
   ========================================== */

export default async function handler(req, res) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    try {
        // 모델 목록 조회 (ListModels)
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: "API Key 문제 발생",
                details: data
            });
        }

        // 성공 시 사용 가능한 모델 이름들만 뽑아서 보여줌
        return res.status(200).json({
            message: "API 키는 정상입니다! 아래 모델 중 하나를 코드에 써야 합니다.",
            available_models: data.models.map(m => m.name) // 예: "models/gemini-1.5-flash"
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}