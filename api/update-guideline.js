// api/update-guideline.js

export default async function handler(request, response) {
  // 1. 보안 점검: POST 방식의 요청만 허용합니다.
  if (request.method !== 'POST') {
    return response.status(405).json({ error: '허용되지 않는 전송 방식입니다.' });
  }

  // 2. 환경 변수(비밀번호) 확인
  const GITHUB_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
  if (!GITHUB_TOKEN) {
    return response.status(500).json({ error: '서버 설정 오류: 토큰이 없습니다.' });
  }

  // 3. 사용자 입력 데이터 받기
  // [FIX] targetFile 파라미터 추가 수신 (어떤 파일을 업데이트할지 결정)
  const { newRule, targetFile } = request.body;
  
  const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'Tea320771'; 
  const REPO_NAME = process.env.GITHUB_REPO_NAME || 'myweb';
  
  // [FIX] targetFile에 따라 업데이트할 파일 경로 결정 (기본값: guideline.json)
  // 보안을 위해 허용된 파일명인지 확인 후 적용
  const ALLOWED_FILES = ['guideline.json', 'reading_guide.json'];
  const FILE_PATH = (targetFile && ALLOWED_FILES.includes(targetFile)) ? targetFile : 'guideline.json';
  
  const BRANCH = 'main'; // 브랜치 이름 (보통 main 또는 master)

  try {
    // 4. [GitHub API] 기존 파일 정보 가져오기 (SHA 값을 얻기 위해 필수)
    // 파일을 수정하려면 "내가 지금 수정하려는 파일이 최신 버전이다"라는 증거(SHA)가 필요합니다.
    const getUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FILE_PATH}`;
    
    const getResponse = await fetch(getUrl, {
      headers: { 
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json' // 최신 API 버전 사용
      }
    });

    if (!getResponse.ok) {
      throw new Error(`GitHub에서 파일(${FILE_PATH})을 찾지 못했습니다.`);
    }

    const fileData = await getResponse.json();
    
    // 5. 내용 수정하기
    // GitHub는 파일 내용을 Base64라는 암호 같은 문자로 줍니다. 이걸 우리가 읽을 수 있게 풉니다(Decoding).
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    
    let jsonContent;
    try {
      jsonContent = JSON.parse(content);
    } catch (e) {
      // 만약 파일이 비어있거나 깨져있으면 빈 배열로 시작
      jsonContent = [];
    }

    // 기존 내용이 배열이 아니면 배열로 감싸줍니다. (새 규칙을 추가하기 위함)
    if (!Array.isArray(jsonContent)) {
      jsonContent = [jsonContent];
    }

    // 새로운 규칙을 리스트 맨 끝에 추가합니다.
    jsonContent.push(newRule);

    // 6. 다시 암호화(Encoding)하여 GitHub에 보낼 준비
    const updatedContent = Buffer.from(JSON.stringify(jsonContent, null, 2)).toString('base64');

    // 7. [GitHub API] 파일 업데이트 요청 (PUT)
    const putResponse = await fetch(getUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `🤖 AI 학습: ${FILE_PATH} 업데이트 (사용자 피드백 반영)`, // 커밋 메시지 동적 변경
        content: updatedContent,
        sha: fileData.sha, // 중요: 아까 받아온 파일의 ID(SHA)를 같이 줘야 덮어쓰기가 됩니다.
        branch: BRANCH
      })
    });

    if (!putResponse.ok) {
      const err = await putResponse.json();
      throw new Error(`저장 실패: ${err.message}`);
    }

    // 성공!
    return response.status(200).json({ success: true, message: `학습 완료! ${FILE_PATH}에 저장되었습니다.` });

  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: error.message });
  }
}