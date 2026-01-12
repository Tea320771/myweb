/* ==========================================
   /api/update-rag.js
   - 기능: 사용자가 입력한 새로운 판례/논리를 Pinecone DB에 저장 (Upsert)
   ========================================== */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from '@pinecone-database/pinecone';
import { v4 as uuidv4 } from 'uuid'; // ID 생성을 위해 필요 (없으면 npm install uuid 하거나 Date.now() 사용)

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
            return res.status(500).json({ error: 'API Keys Missing (Gemini or Pinecone)' });
        }

        if (!textToEmbed || !logicToStore) {
            return res.status(400).json({ error: '데이터가 부족합니다 (text or logic missing)' });
        }

        // 2. 텍스트 임베딩 (Vector화)
        // 향후 검색할 때 "textToEmbed"(예: 판결 주문)와 비슷한 문장이 들어오면 찾아내기 위함
        const genAI = new GoogleGenerativeAI(geminiKey);
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        
        const embedResult = await embedModel.embedContent(textToEmbed);
        const vectorValues = embedResult.embedding.values;

        // 3. Pinecone에 저장 (Upsert)
        const pinecone = new Pinecone({ apiKey: pineconeKey });
        const index = pinecone.index("legal-rag-db"); // analyze.js와 동일한 인덱스 이름 사용

        // 고유 ID 생성 (uuid가 없으면 Date.now()로 대체 가능)
        const uniqueId = `manual-feedback-${Date.now()}`;

        await index.upsert([{
            id: uniqueId,
            values: vectorValues,
            metadata: {
                text: textToEmbed,     // 원본 상황 텍스트
                logicRule: logicToStore, // AI가 참고해야 할 핵심 논리
                source: "user_debug_feedback",
                createdAt: new Date().toISOString()
            }
        }]);

        console.log(`✅ RAG Upsert Success: ${uniqueId}`);
        return res.status(200).json({ success: true, id: uniqueId });

    } catch (error) {
        console.error("❌ RAG Update Error:", error);
        return res.status(500).json({ error: error.message });
    }
}