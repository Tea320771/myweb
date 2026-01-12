/* ==========================================
   /api/update-rag.js
   - 기능: 사용자가 입력한 새로운 판례/논리를 Pinecone DB에 저장 (Upsert)
   - [수정] uuid 패키지 의존성 제거 (Date.now() 사용)
   ========================================== */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from '@pinecone-database/pinecone';

// Vercel Serverless 함수 설정
export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { textToEmbed, logicToStore } = req.body;
        
        // 1. 필수 환경변수 체크
        const geminiKey = process.env.GEMINI_API_KEY;
        const pineconeKey = process.env.PINECONE_API_KEY;
        
        if (!geminiKey || !pineconeKey) {
            console.error("❌ API Keys Missing");
            return res.status(500).json({ error: 'API Keys Missing (Gemini or Pinecone)' });
        }

        if (!textToEmbed || !logicToStore) {
            return res.status(400).json({ error: '데이터가 부족합니다 (text or logic missing)' });
        }

        // 2. 텍스트 임베딩 (Vector화)
        const genAI = new GoogleGenerativeAI(geminiKey);
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        
        const embedResult = await embedModel.embedContent(textToEmbed);
        const vectorValues = embedResult.embedding.values;

        // 3. Pinecone에 저장 (Upsert)
        const pinecone = new Pinecone({ apiKey: pineconeKey });
        const index = pinecone.index("legal-rag-db"); // [중요] Pinecone 콘솔에 이 이름의 Index가 있어야 함

        // 고유 ID 생성 (uuid 패키지 없이 시간 기반 생성)
        const uniqueId = `manual-feedback-${Date.now()}`;

        await index.upsert([{
            id: uniqueId,
            values: vectorValues,
            metadata: {
                text: textToEmbed,       // 원본 상황 텍스트 (검색될 내용)
                logicRule: logicToStore, // AI가 참고해야 할 핵심 논리 (검색 결과)
                source: "user_debug_feedback",
                createdAt: new Date().toISOString()
            }
        }]);

        console.log(`✅ RAG Upsert Success: ${uniqueId}`);
        return res.status(200).json({ success: true, id: uniqueId });

    } catch (error) {
        console.error("❌ RAG Update Error:", error);
        // 에러 내용을 상세히 반환하여 디버깅 돕기
        return res.status(500).json({ error: error.message, stack: error.stack });
    }
}