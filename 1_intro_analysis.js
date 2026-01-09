/* ==========================================
   1_intro_analysis.js
   - 기본 설정, 네비게이션, 파일 업로드
   - [UPDATE] 판결문/계약서 구분 및 사건번호 우선순위 적용
   - [UPDATE] 이체내역(송금) 금액 추출 및 사용자 확인 로직
   - [UPDATE] 판결문 당사자/주소 정밀 추출 및 '주문' 분석을 통한 승패소(비용부담) 판단
   ========================================== */

// ✅ 사용자가 제공한 OCR.space API 키 적용
const OCR_API_KEY = 'K81181494888957'; 

// --- 1. 기본 보안 및 초기화 설정 ---
document.addEventListener('contextmenu', function (e) { e.preventDefault(); alert("보안 정책상 우클릭을 사용할 수 없습니다."); });
document.onkeydown = function (e) {
    if (e.keyCode == 123) { e.preventDefault(); return false; } 
    if (e.ctrlKey && e.shiftKey && (e.keyCode == 73 || e.keyCode == 74 || e.keyCode == 67)) { e.preventDefault(); return false; } 
    if (e.ctrlKey && e.keyCode == 85) { e.preventDefault(); return false; } 
    if (e.ctrlKey && e.keyCode == 83) { e.preventDefault(); return false; } 
};

window.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        var overlay = document.getElementById('intro-overlay');
        var container = document.getElementById('mainContainer');
        if(overlay) overlay.style.display = 'none';
        if(container) container.style.opacity = '1';
        updateBackButtonVisibility(); 
    }, 2500);
    
    setupDragAndDrop();
    if(typeof checkCalculatorCompletion === 'function') checkCalculatorCompletion();
});

// --- 전역 변수 ---
let queuedFiles = [];       
let aiExtractedData = {};   
const pageOrder = ['introPage', 'caseInfoPage', 'calcPage', 'evidencePage', 'previewPage'];

// --- 2. 네비게이션 및 공통 UI 로직 ---
function playTransition(message, callback) {
    const overlay = document.getElementById('transition-overlay');
    const textContent = document.getElementById('transition-text-content');
    textContent.innerHTML = message;
    overlay.classList.remove('hidden');
    textContent.classList.add('animate-flow');
    setTimeout(() => {
        overlay.classList.add('hidden'); textContent.classList.remove('animate-flow');
        if (callback) callback();
    }, 2500);
}

function updateBackButtonVisibility() {
    const backBtn = document.getElementById('globalBackBtn');
    const introPage = document.getElementById('introPage');
    if (!introPage.classList.contains('hidden')) backBtn.classList.remove('visible'); else backBtn.classList.add('visible');
}

function goBackStep() {
    let currentIndex = -1;
    for (let i = 0; i < pageOrder.length; i++) { if (!document.getElementById(pageOrder[i]).classList.contains('hidden')) { currentIndex = i; break; } }
    if (currentIndex > 0) {
        const currentPage = document.getElementById(pageOrder[currentIndex]);
        const prevPage = document.getElementById(pageOrder[currentIndex - 1]);
        currentPage.classList.add('hidden'); currentPage.classList.remove('fade-in-section'); 
        prevPage.classList.remove('hidden'); prevPage.classList.add('fade-in-section'); 
        window.scrollTo({ top: 0, behavior: 'smooth' }); updateBackButtonVisibility();
    }
}

// --- 3. 파일 업로드 및 대기열 관리 로직 ---
function setupDragAndDrop() {
    const dropZone = document.getElementById('smartUploadZone');
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault(); e.stopPropagation();
            dropZone.classList.add('drag-over');
        }, false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault(); e.stopPropagation();
            dropZone.classList.remove('drag-over');
        }, false);
    });
    dropZone.addEventListener('drop', (e) => {
        queueFiles(e.dataTransfer.files); 
    }, false);
}

function queueFiles(files) {
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            alert(`지원하지 않는 파일 형식입니다: ${file.name}\n(이미지 또는 PDF만 가능)`);
            continue;
        }
        const isDuplicate = queuedFiles.some(f => f.name === file.name && f.size === file.size);
        if (!isDuplicate) queuedFiles.push(file);
    }
    updateFileListUI();
}

function updateFileListUI() {
    const listContainer = document.getElementById('file-queue-list');
    const actionArea = document.getElementById('action-area');
    listContainer.innerHTML = "";
    
    if (queuedFiles.length > 0) {
        listContainer.classList.remove('hidden');
        actionArea.classList.remove('hidden');
    } else {
        listContainer.classList.add('hidden');
        actionArea.classList.add('hidden');
    }

    queuedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-queue-item';
        let icon = file.type === 'application/pdf' ? '📑' : '📷';
        item.innerHTML = `
            <div class="file-name">${icon} ${file.name} <span style="font-size:0.8em; color:#94a3b8;">(${Math.round(file.size/1024)}KB)</span></div>
            <div class="file-remove" onclick="removeFile(${index})" title="삭제">×</div>
        `;
        listContainer.appendChild(item);
    });
}

function removeFile(index) {
    queuedFiles.splice(index, 1);
    updateFileListUI();
    document.getElementById('docInput').value = ""; 
}

// --- [핵심] 4. OCR.space API 호출 로직 ---
async function startAnalysis() {
    if (queuedFiles.length === 0) { alert("분석할 파일이 없습니다."); return; }
    const actionArea = document.getElementById('action-area');
    const logsContainer = document.getElementById('processing-logs');
    
    actionArea.classList.add('hidden'); 
    logsContainer.style.display = 'block';
    logsContainer.innerHTML = `<div class="log-item log-info">분석 엔진(OCR.space) 연결 중...</div>`;
    
    // 심급별 텍스트 저장용 (판결문과 일반 문서를 분리하여 저장)
    let categorizedText = { 
        1: { jud: "", etc: "" }, 
        2: { jud: "", etc: "" }, 
        3: { jud: "", etc: "" }, 
        common: "" 
    };

    try {
        for (let i = 0; i < queuedFiles.length; i++) {
            const file = queuedFiles[i];
            logsContainer.innerHTML += `<div class="log-item log-info">📡 서버 전송 및 분석 중... (${file.name})</div>`;
            logsContainer.scrollTop = logsContainer.scrollHeight;

            let formData = new FormData();
            formData.append("file", file);
            formData.append("language", "kor");
            formData.append("isOverlayRequired", "false");
            formData.append("OCREngine", "2");
            formData.append("scale", "true");
            formData.append("detectOrientation", "true");

            const response = await fetch("https://api.ocr.space/parse/image", {
                method: "POST",
                headers: { "apikey": OCR_API_KEY },
                body: formData
            });

            const result = await response.json();

            if (result.IsErroredOnProcessing) {
                console.error(result);
                throw new Error(result.ErrorMessage?.[0] || "OCR 처리 중 오류 발생");
            }

            let extractedText = "";
            if (result.ParsedResults && result.ParsedResults.length > 0) {
                result.ParsedResults.forEach(page => { extractedText += " " + page.ParsedText; });
            }

            const normalizedText = extractedText.replace(/\r\n|\n|\r/g, ' ').replace(/\s+/g, ' ');
            console.log(`[${file.name}] 추출 텍스트:`, normalizedText);

            // 심급 추정
            let targetInstance = 'common';
            if (file.name.includes("1심") || file.name.includes("지방")) targetInstance = 1;
            else if (file.name.includes("2심") || file.name.includes("항소") || file.name.includes("고등")) targetInstance = 2;
            else if (file.name.includes("3심") || file.name.includes("상고") || file.name.includes("대법")) targetInstance = 3;
            else {
                if (normalizedText.includes("지방 법원") || normalizedText.includes("지방법원") || normalizedText.includes("지원")) targetInstance = 1;
                else if (normalizedText.includes("고등 법원") || normalizedText.includes("고등법원")) targetInstance = 2;
                else if (normalizedText.includes("대법원")) targetInstance = 3;
            }

            // 문서 종류 판별 (판결문 vs 계약서/이체내역)
            const isJudgment = normalizedText.includes("판결") && (normalizedText.includes("주문") || normalizedText.includes("이유"));

            if (targetInstance !== 'common') {
                if (isJudgment) {
                    categorizedText[targetInstance].jud += ` ${normalizedText}`;
                } else {
                    categorizedText[targetInstance].etc += ` ${normalizedText}`;
                }
            } else {
                categorizedText['common'] += ` ${normalizedText}`;
            }
            
            logsContainer.innerHTML += `<div class="log-item log-success">✅ ${file.name} 분석 완료</div>`;
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }

        logsContainer.innerHTML += `<div class="log-item log-info" style="font-weight:bold;">📊 데이터 정밀 추출 중...</div>`;

        aiExtractedData = analyzeLegalDocuments(categorizedText);
        
        logsContainer.innerHTML += `<div class="log-item log-success" style="font-weight:bold;">✨ 분석 완료! 결과 확인</div>`;
        setTimeout(() => { confirmApplicantProcess(aiExtractedData); }, 800);

    } catch (error) {
        console.error(error);
        logsContainer.innerHTML += `<div class="log-item log-error">❌ 오류: ${error.message}</div>`;
        alert("분석 중 오류가 발생했습니다.\nAPI 키를 확인하거나 잠시 후 다시 시도하세요.");
        actionArea.classList.remove('hidden');
    }
}

// --- [핵심] 5. 데이터 추출 알고리즘 (판결문 주소/당사자 정밀 파악 + 비용부담자 파악) ---
function analyzeLegalDocuments(categorizedText) {
    const result = {
        courtName1: null, caseNo1: null,
        courtName2: null, caseNo2: null,
        courtName3: null, caseNo3: null,
        plaintiffName: null, defendantName: null, 
        plaintiffAddr: null, defendantAddr: null, // [NEW] 판결문에서 추출한 주소
        contractClientName: null, contractOpponentName: null,
        clientAddress: null,
        winnerSide: null, // [NEW] 승소측 (비용 확정 신청 권리자)
        soga1: null, soga2: null, soga3: null,
        startFee1: null, successFee1: null,
        startFee2: null, successFee2: null,
        startFee3: null, successFee3: null,
        ambiguousAmounts: [] 
    };

    const allJudText = categorizedText[1].jud + categorizedText[2].jud + categorizedText[3].jud;
    const allText = categorizedText.common 
        + categorizedText[1].jud + categorizedText[1].etc 
        + categorizedText[2].jud + categorizedText[2].etc 
        + categorizedText[3].jud + categorizedText[3].etc;

    // 1-1. 판결문 기반 당사자(이름 + 주소) 정밀 추출 [NEW Logic]
    // 패턴: (원고|피고|...) [이름] [주소] 형식으로 이어지는 경우 포착
    function extractPartyFromJudgment(text) {
        // 이름 뒤에 시/도/구/군 등으로 시작하는 주소가 오는지 확인
        // 예: "원고 홍길동 서울 서초구..."
        const pNameRegex = /(?:원\s*고|항\s*소\s*인|상\s*고\s*인|신\s*청\s*인)(?:[^가-힣]*)([가-힣]{2,5})\s+(?:주\s*소\s*[:;]?)?\s*([가-힣]{1,5}(?:시|도|구|군)[^0-9\n]*(?:로|길|동)[^0-9\n]*[0-9]+(?:-[0-9]+)?)/;
        const dNameRegex = /(?:피\s*고|피\s*항\s*소\s*인|피\s*상\s*고\s*인|피\s*신\s*청\s*인)(?:[^가-힣]*)([가-힣]{2,5})\s+(?:주\s*소\s*[:;]?)?\s*([가-힣]{1,5}(?:시|도|구|군)[^0-9\n]*(?:로|길|동)[^0-9\n]*[0-9]+(?:-[0-9]+)?)/;

        const pMatch = text.match(pNameRegex);
        if (pMatch) {
            result.plaintiffName = pMatch[1];
            result.plaintiffAddr = pMatch[2];
        }
        const dMatch = text.match(dNameRegex);
        if (dMatch) {
            result.defendantName = dMatch[1];
            result.defendantAddr = dMatch[2];
        }
    }
    // 가장 상급심 판결문부터, 혹은 전체 판결문 텍스트에서 검색
    extractPartyFromJudgment(allJudText);

    // 1-2. 계약서 기반 당사자 추출 (기존 로직 유지 - 백업용)
    const clientPatterns = [/위\s*임\s*인\s*\(?갑\)?\s*[:;]?\s*([가-힣]{2,5})(?!\s*변호사)/, /당\s*사\s*자\s*[:;]?\s*([가-힣]{2,5})/];
    result.contractClientName = findBestMatch(allText, clientPatterns);
    
    // 2. 주소 추출 (기존 일반 검색 + 판결문 주소 우선 적용)
    if (!result.clientAddress) {
        const addrRegex = /주\s*소\s*[:;]?\s*([가-힣0-9\s,\-\(\)로길층호]+(?:시|도|구|군|동|면|읍)\s*[가-힣0-9\s,\-\(\)로길층호]*)(?=\s주\s*민|\s전\s*화)/;
        const addrMatch = allText.match(addrRegex);
        if (addrMatch) result.clientAddress = addrMatch[1].trim();
    }

    // 3. 심급별 상세 정보 추출
    function extractFromText(text, level, isJudgmentSource) {
        if (!text) return;

        // (1) 법원명
        if (!result['courtName' + level] || isJudgmentSource) {
            const courtRegex = /([가-힣]{2,}(?:지방|고등|가정|행정|회생)법원(?:[가-힣]*지원)?|대법원)/g;
            let cMatch;
            while ((cMatch = courtRegex.exec(text)) !== null) {
                const name = cMatch[1];
                if (level === 3 && name === "대법원") { result.courtName3 = name; break; }
                if (level === 2 && (name.includes("고등") || name.includes("지방"))) { result.courtName2 = name; if(name.includes("고등")) break; }
                if (level === 1 && !name.includes("고등") && !name.includes("대법원")) { result.courtName1 = name; break; }
            }
        }

        // (2) 사건번호 [판결문 우선 적용]
        if (!result['caseNo' + level] || isJudgmentSource) {
            const caseNoRegex = /(20\d{2})\s*([가-힣]{1,5})[^0-9]*?(\d{3,})/;
            const caseMatch = text.match(caseNoRegex);
            if (caseMatch) {
                const fullCaseNo = caseMatch[1] + caseMatch[2] + caseMatch[3];
                if (isJudgmentSource) {
                    result['caseNo' + level] = fullCaseNo;
                } else if (!result['caseNo' + level]) {
                    result['caseNo' + level] = fullCaseNo;
                }
            }
        }
        
        // (3) 비용 부담(주문) 분석 [NEW Logic]
        // 판결문(jud)인 경우에만 실행
        if (isJudgmentSource) {
            // "주문" ~ "이유" 사이 텍스트 추출 (없으면 전체에서 검색)
            let orderText = text;
            const startIdx = text.indexOf("주 문");
            const endIdx = text.indexOf("이 유");
            if (startIdx !== -1 && endIdx !== -1) {
                orderText = text.substring(startIdx, endIdx);
            } else if (startIdx !== -1) {
                orderText = text.substring(startIdx);
            }

            // 원고 부담 -> 피고가 신청인 / 피고 부담 -> 원고가 신청인
            if (orderText.includes("소송비용은 원고가 부담") || orderText.includes("항소비용은 원고가 부담") || orderText.includes("상고비용은 원고가 부담")) {
                result.winnerSide = "defendant"; // 피고가 이김 -> 피고가 신청
            } else if (orderText.includes("소송비용은 피고가 부담") || orderText.includes("항소비용은 피고가 부담") || orderText.includes("상고비용은 피고가 부담")) {
                result.winnerSide = "plaintiff"; // 원고가 이김 -> 원고가 신청
            }
        }

        // (4) 착수금/성공보수/소가 (기존 로직)
        const feeRegexStart = /(?:착\s*수\s*금|착\s*수\s*보\s*수)[^0-9]*?금\s*([0-9,]+)\s*원/;
        const startMatch = text.match(feeRegexStart);
        if (startMatch && !result['startFee' + level]) result['startFee' + level] = startMatch[1];

        const feeRegexSuccess = /(?:성\s*공\s*보\s*수|성\s*과\s*보\s*수|승\s*소\s*한\s*경\s*우)[^0-9]*?금\s*([0-9,]+)\s*원/;
        const successMatch = text.match(feeRegexSuccess);
        if (successMatch && !result['successFee' + level]) result['successFee' + level] = successMatch[1];

        const sogaMatch = text.match(/(?:소\s*가|소송목적의\s*값)[^0-9]*([0-9,]+)/);
        if (sogaMatch && !result['soga' + level]) result['soga' + level] = sogaMatch[1];
    }

    [1, 2, 3].forEach(level => {
        extractFromText(categorizedText[level].jud, level, true);
        extractFromText(categorizedText[level].etc, level, false);
    });
    
    // Fallback
    if (!result.courtName1 && !result.courtName2 && !result.courtName3) {
        extractFromText(categorizedText.common, 1, false);
        if(result.courtName1 && result.courtName1.includes("대법원")) { 
            result.courtName3 = result.courtName1; result.courtName1 = null; 
            if(result.caseNo1) { result.caseNo3 = result.caseNo1; result.caseNo1 = null; }
            if(result.startFee1) { result.startFee3 = result.startFee1; result.startFee1 = null; }
        }
        else if(result.courtName1 && result.courtName1.includes("고등")) {
             result.courtName2 = result.courtName1; result.courtName1 = null;
             if(result.caseNo1) { result.caseNo2 = result.caseNo1; result.caseNo1 = null; }
             if(result.startFee1) { result.startFee2 = result.startFee1; result.startFee1 = null; }
        }
    }

    // 4. 이체내역(송금) 정밀 분석 (기존 유지)
    function scanForTransfers(text, level) {
        const transferRegex = /(?:출금|이체|송금|법무법인)[^0-9\-\n]*?[\-\s]([0-9,]{3,})(?:원|\s|$)/g;
        const simpleMinusRegex = /[\-]\s*([0-9,]{3,})\s*원/g;
        let matches = []; let match;
        while ((match = transferRegex.exec(text)) !== null) matches.push(match[1]);
        while ((match = simpleMinusRegex.exec(text)) !== null) matches.push(match[1]);

        matches.forEach(amt => {
            let cleanAmt = amt.replace(/,/g, '');
            if (parseInt(cleanAmt) > 100000) { 
                const alreadyFound = [
                    result.startFee1, result.successFee1, 
                    result.startFee2, result.successFee2, 
                    result.startFee3, result.successFee3
                ].some(fee => fee && fee.replace(/,/g, '') === cleanAmt);
                if (!alreadyFound && !result.ambiguousAmounts.some(item => item.amount === amt)) {
                     result.ambiguousAmounts.push({ amount: amt, level: level });
                }
            }
        });
    }
    scanForTransfers(categorizedText[1].etc, 1);
    scanForTransfers(categorizedText[2].etc, 2);
    scanForTransfers(categorizedText[3].etc, 3);
    scanForTransfers(categorizedText.common, 'common');

    return result;
}

function findBestMatch(text, patternArray) {
    for (let regex of patternArray) {
        const match = text.match(regex);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return null;
}

// --- 6. 신청인 확인 및 데이터 주입 (판결문 기반 자동 선택 로직 추가) ---
function confirmApplicantProcess(data) {
    processAmbiguousFees(data); // 이체내역 확인

    // [NEW] 판결문에서 파악된 원/피고 이름 및 승소 여부 반영
    let extractedPlaintiff = data.plaintiffName || data.contractClientName || "원고(미확인)";
    let extractedDefendant = data.defendantName || data.contractOpponentName || "피고(미확인)";
    
    // 모달에 이름 표시
    document.getElementById('modal-plaintiff-name').innerText = extractedPlaintiff; 
    document.getElementById('modal-defendant-name').innerText = extractedDefendant;
    
    // [NEW] 승소측(비용신청권자)이 파악되었다면 자동 선택 유도 (혹은 모달 순서 배치)
    // 여기서는 사용자가 모달에서 클릭해야 하므로, 안내 메시지를 띄우거나 콘솔 로그 등으로 확인 가능
    // 만약 data.winnerSide가 있으면, 해당 쪽을 신청인으로 간주하고 처리할 수도 있으나
    // 사용자가 명시적으로 선택하게 하는 기존 UX를 유지하되, 이름이 정확히 매핑되도록 함.
    
    document.getElementById('applicant-selection-modal').classList.remove('hidden');
    
    // (선택적) 만약 승소측이 확실하면 알림을 줄 수도 있음
    if (data.winnerSide) {
        const winnerName = (data.winnerSide === 'plaintiff') ? extractedPlaintiff : extractedDefendant;
        console.log(`판결문 분석 결과, 소송비용 신청 권리자는 ${winnerName} (${data.winnerSide})로 추정됩니다.`);
    }
}

// [NEW] 미분류 이체내역 처리 함수 (기존 동일)
function processAmbiguousFees(data) {
    if (!data.ambiguousAmounts || data.ambiguousAmounts.length === 0) return;
    let handledAmounts = [];
    data.ambiguousAmounts.forEach(item => {
        if (handledAmounts.includes(item.amount)) return;
        let assigned = false;
        const amt = item.amount;
        const levelText = (item.level !== 'common') ? `${item.level}심` : "심급 미상";

        if (item.level !== 'common') {
            if (!data['startFee' + item.level]) {
                if (confirm(`[이체내역 분석]\n'${amt}원'이 발견되었습니다 (${levelText} 추정).\n이 금액을 '${item.level}심 착수금'으로 입력하시겠습니까?`)) {
                    data['startFee' + item.level] = amt;
                    assigned = true;
                }
            }
            if (!assigned && !data['successFee' + item.level]) {
                if (confirm(`그럼 '${amt}원'을 '${item.level}심 성공보수'로 입력하시겠습니까?`)) {
                    data['successFee' + item.level] = amt;
                    assigned = true;
                }
            }
        }
        if (!assigned) {
            if (!data.startFee1 && confirm(`'${amt}원'을 '1심 착수금'으로 설정할까요?`)) { data.startFee1 = amt; assigned = true; }
            else if (!data.startFee2 && confirm(`'${amt}원'을 '2심 착수금'으로 설정할까요?`)) { data.startFee2 = amt; assigned = true; }
            else if (!data.startFee3 && confirm(`'${amt}원'을 '3심 착수금'으로 설정할까요?`)) { data.startFee3 = amt; assigned = true; }
        }
        handledAmounts.push(amt);
    });
}

function selectApplicant(selectionSide) {
    document.getElementById('applicant-selection-modal').classList.add('hidden'); 

    const data = aiExtractedData;
    // 모달에 표시된 이름 가져오기
    const leftName = document.getElementById('modal-plaintiff-name').innerText;
    const rightName = document.getElementById('modal-defendant-name').innerText;

    let finalAppName = "", finalRespName = "";
    // 사용자가 '왼쪽(원고측)'을 선택했는지 '오른쪽(피고측)'을 선택했는지에 따라 할당
    if (selectionSide === 'plaintiff') { 
        finalAppName = leftName; finalRespName = rightName;
    } else { 
        finalAppName = rightName; finalRespName = leftName;
    }

    // 이름 입력
    if(finalAppName && !finalAppName.includes("미확인")) setAndTrigger('applicantName', finalAppName);
    
    // [NEW] 주소 입력 로직 강화
    // 사용자가 선택한 쪽(신청인)이 원고인지 피고인지 판단하여 판결문에서 추출한 주소 할당
    if (selectionSide === 'plaintiff') {
        // 신청인이 원고인 경우
        if (data.plaintiffAddr) setAndTrigger('applicantAddr', data.plaintiffAddr);
        else if (data.clientAddress) setAndTrigger('applicantAddr', data.clientAddress);
    } else {
        // 신청인이 피고인 경우
        if (data.defendantAddr) setAndTrigger('applicantAddr', data.defendantAddr);
        // 피고 주소가 판결문에 없으면 계약서 주소라도 시도 (보통 계약서엔 갑 주소만 있지만)
        else if (data.clientAddress && finalAppName === data.contractClientName) setAndTrigger('applicantAddr', data.clientAddress);
    }

    // 피신청인 입력
    if(finalRespName && !finalRespName.includes("미확인")) {
        document.getElementById('step3-area').classList.remove('hidden');
        document.getElementById('btnToCaseInfo').classList.remove('hidden');
        setAndTrigger('respondentName', finalRespName);
    }

    fillRemainingData(data);
    showManualInput();
    alert(`분석 완료!\n신청인: ${finalAppName}\n피신청인: ${finalRespName}\n1심, 2심, 3심 내용이 반영되었습니다.`);
}

function fillRemainingData(data) {
    if(data.caseNo2 || data.courtName2 || data.startFee2) {
        document.getElementById('case-step-2').classList.remove('hidden');
    }
    if(data.caseNo3 || data.courtName3 || data.startFee3) {
        document.getElementById('case-step-3').classList.remove('hidden');
    }

    if(data.courtName1) setAndTrigger('courtName1', data.courtName1);
    if(data.caseNo1) setAndTrigger('caseNo1', data.caseNo1);
    if(data.soga1) setAndTrigger('soga1', data.soga1);
    if(data.startFee1) setAndTrigger('startFee1', data.startFee1);
    if(data.successFee1) setAndTrigger('successFee1', data.successFee1);

    if(data.courtName2) setAndTrigger('courtName2', data.courtName2);
    if(data.caseNo2) setAndTrigger('caseNo2', data.caseNo2);
    if(data.soga2) setAndTrigger('soga2', data.soga2);
    if(data.startFee2) setAndTrigger('startFee2', data.startFee2);
    if(data.successFee2) setAndTrigger('successFee2', data.successFee2);

    if(data.courtName3) setAndTrigger('courtName3', data.courtName3);
    else if(data.caseNo3) setAndTrigger('courtName3', '대법원'); 
    
    if(data.caseNo3) setAndTrigger('caseNo3', data.caseNo3);
    if(data.startFee3) setAndTrigger('startFee3', data.startFee3);
    if(data.successFee3) setAndTrigger('successFee3', data.successFee3);
}

function setAndTrigger(id, value) {
    const el = document.getElementById(id);
    if(el && value) {
        el.value = value; 
        el.classList.add('ai-filled'); 
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (id.includes('Fee') || id.includes('soga')) {
             el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        }
    }
    if (typeof calculateAll === 'function') calculateAll();
}

// --- 6. 수동 입력 UI 제어 ---
function showManualInput() {
    const section = document.getElementById('manualInputSection');
    section.classList.remove('hidden');
    section.classList.add('fade-in-section');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 이벤트 리스너들
const appName = document.getElementById('applicantName');
const appAddr = document.getElementById('applicantAddr');
const step2Area = document.getElementById('step2-area');
const repName = document.getElementById('repName');
const repAddr = document.getElementById('repAddr');
const noRepCheck = document.getElementById('noRepresentative');
const step3Area = document.getElementById('step3-area');
const respName = document.getElementById('respondentName');
const respAddr = document.getElementById('respondentAddr');
const btnToCaseInfo = document.getElementById('btnToCaseInfo');

function checkStep1() {
    if (appName && appName.value.trim() !== "" && appAddr && appAddr.value.trim() !== "") {
        if (step2Area.classList.contains('hidden')) { step2Area.classList.remove('hidden'); step2Area.classList.add('fade-in-section'); }
    }
}
if(appName) appName.addEventListener('input', checkStep1);
if(appAddr) appAddr.addEventListener('input', checkStep1);

function checkStep2() {
    const isChecked = noRepCheck.checked;
    const isFilled = (repName.value.trim() !== "" && repAddr.value.trim() !== "");
    if (isChecked || isFilled) {
        if (step3Area.classList.contains('hidden')) { step3Area.classList.remove('hidden'); step3Area.classList.add('fade-in-section'); }
    }
}
if(repName) repName.addEventListener('input', checkStep2);
if(repAddr) repAddr.addEventListener('input', checkStep2);

function toggleRepInputs(checkbox) {
    const repInputs = document.getElementById('rep-inputs');
    const repNameInput = document.getElementById('repName');
    const repAddrInput = document.getElementById('repAddr');
    const repLawyer = document.getElementById('repLawyerName');
    if (checkbox.checked) {
        repInputs.style.opacity = '0.5'; repInputs.style.pointerEvents = 'none';
        repNameInput.value = ''; repAddrInput.value = ''; if(repLawyer) repLawyer.value = '';
        checkStep2();
    } else { repInputs.style.opacity = '1'; repInputs.style.pointerEvents = 'auto'; }
}

function checkStep3() {
    if (respName.value.trim() !== "" && respAddr.value.trim() !== "") {
        if (btnToCaseInfo.classList.contains('hidden')) { btnToCaseInfo.classList.remove('hidden'); btnToCaseInfo.classList.add('fade-in-section'); }
    }
}
if(respName) respName.addEventListener('input', checkStep3);
if(respAddr) respAddr.addEventListener('input', checkStep3);