/* ==========================================
   script.js 전체 코드 (최종 수정본 - 2024.05.22)
   ========================================== */

// 1. 기본 보안 및 초기화 설정
document.addEventListener('contextmenu', function (e) { e.preventDefault(); alert("보안 정책상 우클릭을 사용할 수 없습니다."); });
document.onkeydown = function (e) {
    if (e.keyCode == 123) { e.preventDefault(); return false; } // F12
    if (e.ctrlKey && e.shiftKey && (e.keyCode == 73 || e.keyCode == 74 || e.keyCode == 67)) { e.preventDefault(); return false; } // DevTools
    if (e.ctrlKey && e.keyCode == 85) { e.preventDefault(); return false; } // View Source
    if (e.ctrlKey && e.keyCode == 83) { e.preventDefault(); return false; } // Save
};

window.addEventListener('DOMContentLoaded', function() {
    // 인트로 애니메이션 후 화면 표시
    setTimeout(function() {
        var overlay = document.getElementById('intro-overlay');
        var container = document.getElementById('mainContainer');
        if(overlay) overlay.style.display = 'none';
        if(container) container.style.opacity = '1';
        updateBackButtonVisibility(); 
    }, 2500);
    
    // 자동완성 및 드래그앤드롭 설정
    setupAutocomplete("courtName1", "suggestionList1");
    setupAutocomplete("courtName2", "suggestionList2");
    setupDragAndDrop();
    
    // 초기 버튼 상태 점검
    checkCalculatorCompletion();
});

// --- 전역 변수 ---
let queuedFiles = [];       // 업로드 대기중인 파일 목록
let aiExtractedData = {};   // AI 분석 결과 저장

// --- 2. 파일 업로드 및 대기열 관리 로직 ---

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
        const dt = e.dataTransfer;
        const files = dt.files;
        queueFiles(files); 
    }, false);
}

function queueFiles(files) {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) {
            alert(`이미지 파일만 가능합니다: ${file.name}`);
            continue;
        }
        const isDuplicate = queuedFiles.some(f => f.name === file.name && f.size === file.size);
        if (!isDuplicate) {
            queuedFiles.push(file);
        }
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
        item.innerHTML = `
            <div class="file-name">📷 ${file.name} <span style="font-size:0.8em; color:#94a3b8;">(${Math.round(file.size/1024)}KB)</span></div>
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

// --- 3. OCR 분석 및 데이터 추출 로직 ---

async function startAnalysis() {
    if (queuedFiles.length === 0) {
        alert("분석할 파일이 없습니다.");
        return;
    }

    const actionArea = document.getElementById('action-area');
    const logsContainer = document.getElementById('processing-logs');
    
    actionArea.classList.add('hidden'); 
    logsContainer.style.display = 'block';
    logsContainer.innerHTML = `<div class="log-item log-info">분석 엔진(Tesseract) 구동 중...</div>`;
    
    let combinedText = "";

    try {
        const worker = await Tesseract.createWorker('kor'); 
        logsContainer.innerHTML += `<div class="log-item log-success">엔진 준비 완료. OCR 시작.</div>`;

        for (let i = 0; i < queuedFiles.length; i++) {
            const file = queuedFiles[i];
            logsContainer.innerHTML += `<div class="log-item log-info">🔄 [${i+1}/${queuedFiles.length}] ${file.name} 텍스트 판독 중...</div>`;
            
            const { data: { text } } = await worker.recognize(file);
            
            logsContainer.innerHTML += `<div class="log-item log-success">✅ ${file.name} 판독 완료</div>`;
            combinedText += `\n[[FILE:${file.name}]]\n` + text + `\n[[END_FILE]]\n`;
            
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }
        await worker.terminate();

        logsContainer.innerHTML += `<div class="log-item log-info" style="font-weight:bold;">📊 법률 용어 및 비용 데이터 추출 중...</div>`;

        // 데이터 분석 실행
        aiExtractedData = analyzeLegalDocuments(combinedText);
        
        logsContainer.innerHTML += `<div class="log-item log-success" style="font-weight:bold;">✨ 분석 완료! 확인 절차로 이동합니다.</div>`;
        
        setTimeout(() => {
            confirmApplicantProcess(aiExtractedData);
        }, 800);

    } catch (error) {
        console.error(error);
        logsContainer.innerHTML += `<div class="log-item log-error">❌ 오류: ${error.message}</div>`;
        alert("분석 중 오류가 발생했습니다. 다시 시도해주세요.");
        actionArea.classList.remove('hidden');
    }
}

// [핵심 수정] 위임계약서 및 비용 정보 정밀 분석 함수
function analyzeLegalDocuments(fullText) {
    const result = {
        courtName1: null, caseNo1: null,
        courtName2: null, caseNo2: null,
        plaintiffName: null, defendantName: null, 
        contractClientName: null, contractOpponentName: null,
        soga1: null, 
        startFee1: null, successFee1: null,
        costBurdenPayer: null
    };

    // --- 1. 위임계약서 특화 분석 (업로드해주신 이미지 맞춤) ---
    
    // (1) 당사자(위임인/김갑동) 찾기
    // 패턴: "당 사 자" 혹은 "위임인(갑)" 뒤에 오는 이름
    // [가-힣] 사이에 공백이 있을 수 있음.
    const clientRegex = /(?:당\s*사\s*자|위\s*임\s*인(?:\(갑\))?)[^가-힣a-zA-Z0-9]*([가-힣]{2,5})/;
    const clientMatch = fullText.match(clientRegex);
    if (clientMatch) result.contractClientName = clientMatch[1];

    // (2) 상대방(이을녀) 찾기
    // 패턴: "상 대 방" 뒤에 오는 이름
    const opponentRegex = /(?:상\s*대\s*방)[^가-힣a-zA-Z0-9]*([가-힣]{2,5})/;
    const opponentMatch = fullText.match(opponentRegex);
    if (opponentMatch) result.contractOpponentName = opponentMatch[1];

    // (3) 착수보수 찾기 ("금 1,100,000원")
    // 로직: "착수보수" 언급 후, 줄바꿈 등을 지나 "금" 뒤의 숫자 추출
    const startFeeRegex = /(?:착\s*수\s*보\s*수|착\s*수\s*금)(?:[\s\S]*?)금\s*([0-9,]+)/;
    const startMatch = fullText.match(startFeeRegex);
    if (startMatch) {
        // 쉼표 제거 후 저장하지 않고, setAndTrigger에서 처리하도록 둠
        result.startFee1 = startMatch[1]; 
    }

    // (4) 성공보수 찾기
    const successFeeRegex = /(?:성\s*과\s*보\s*수|성\s*공\s*보\s*수)(?:[\s\S]*?)금\s*([0-9,]+)/;
    const successMatch = fullText.match(successFeeRegex);
    if (successMatch) {
        result.successFee1 = successMatch[1];
    }

    // --- 2. 판결문 및 기타 정보 분석 ---
    
    // 원고/피고 (판결문용)
    const pMatches = fullText.match(/(?:원\s*고|신\s*청\s*인)\s*([가-힣]{2,5})/g);
    if(pMatches) {
        const names = [...new Set(pMatches.map(s => s.replace(/원\s*고|신\s*청\s*인|\s/g, '')))];
        if(names.length > 0) result.plaintiffName = names[0];
    }
    const dMatches = fullText.match(/(?:피\s*고|피\s*신\s*청\s*인)\s*([가-힣]{2,5})/g);
    if(dMatches) {
        const names = [...new Set(dMatches.map(s => s.replace(/피\s*고|피\s*신\s*청\s*인|\s/g, '')))];
        if(names.length > 0) result.defendantName = names[0];
    }

    // 소가 찾기
    const sogaM = fullText.match(/(?:소\s*가|소송목적의\s*값|청\s*구\s*금\s*액)[^0-9]*([0-9,]+)/);
    if(sogaM) result.soga1 = sogaM[1];

    // 심급 및 주문 분석
    const fileBlocks = fullText.split('[[FILE:');
    let highestLevelFound = 0; 
    let finalRulingText = ""; 

    fileBlocks.forEach(block => {
        if(!block.trim()) return;
        const courtMatch = block.match(/([가-힣]+(?:지방|고등|가정|행정|회생)법원(?:\s*[가-힣]+지원)?)/);
        const courtName = courtMatch ? courtMatch[1] : "";
        const caseMatch = block.match(/(20\d{2}[가-힣]{1,3}\d+)/);
        const caseNo = caseMatch ? caseMatch[1] : "";

        let currentLevel = 0;
        if (courtName.includes("대법원")) currentLevel = 3;
        else if (courtName.includes("고등") || caseNo.includes("나") || caseNo.includes("누")) currentLevel = 2;
        else if (courtName.includes("법원") || caseNo.includes("가") || caseNo.includes("다")) currentLevel = 1;

        if (currentLevel === 1) { result.courtName1 = courtName; result.caseNo1 = caseNo; }
        if (currentLevel === 2) { result.courtName2 = courtName; result.caseNo2 = caseNo; }

        if (currentLevel >= highestLevelFound) {
            highestLevelFound = currentLevel;
            const orderMatch = block.match(/주\s*문([\s\S]*?)(?:청\s*구\s*취\s*지|이\s*유)/);
            if (orderMatch) finalRulingText = orderMatch[1];
        }
    });

    if (finalRulingText) {
        const cleanOrder = finalRulingText.replace(/\s+/g, ''); 
        if (cleanOrder.includes("소송총비용은피고가부담") || cleanOrder.includes("소송비용은피고가부담")) {
            result.costBurdenPayer = 'defendant'; 
        } else if (cleanOrder.includes("소송총비용은원고가부담") || cleanOrder.includes("소송비용은원고가부담")) {
            result.costBurdenPayer = 'plaintiff'; 
        }
    }

    return result;
}

// --- 4. 신청인 확인 및 데이터 주입 ---

function confirmApplicantProcess(data) {
    let candidateAppName = "미확인";
    let candidateRespName = "미확인";

    // 1순위: 위임계약서에서 추출된 당사자/상대방 사용
    if (data.contractClientName) {
        candidateAppName = data.contractClientName; // 김갑동
        
        if (data.contractOpponentName) {
            candidateRespName = data.contractOpponentName; // 이을녀
        } else {
            // 상대방이 없다면 판결문 정보로 보완
            if (data.plaintiffName && data.plaintiffName !== candidateAppName) candidateRespName = data.plaintiffName;
            else if (data.defendantName && data.defendantName !== candidateAppName) candidateRespName = data.defendantName;
        }
    } else {
        // 위임계약서 없으면 판결문 정보 사용
        candidateAppName = data.plaintiffName || "원고(미확인)";
        candidateRespName = data.defendantName || "피고(미확인)";
    }

    document.getElementById('modal-plaintiff-name').innerText = candidateAppName; 
    document.getElementById('modal-defendant-name').innerText = candidateRespName;
    
    document.getElementById('applicant-selection-modal').classList.remove('hidden');
}

function selectApplicant(selectionSide) {
    document.getElementById('applicant-selection-modal').classList.add('hidden'); 

    const data = aiExtractedData;
    const leftName = document.getElementById('modal-plaintiff-name').innerText;
    const rightName = document.getElementById('modal-defendant-name').innerText;

    let finalAppName = "", finalRespName = "";

    // 좌측 버튼이 '위임인/원고', 우측 버튼이 '상대방/피고' 위치임
    if (selectionSide === 'plaintiff') { 
        finalAppName = leftName; finalRespName = rightName;
    } else { 
        finalAppName = rightName; finalRespName = leftName;
    }

    // 이름 입력
    if(finalAppName && finalAppName !== "미확인") setAndTrigger('applicantName', finalAppName);
    if(finalRespName && finalRespName !== "미확인") {
        document.getElementById('step3-area').classList.remove('hidden');
        document.getElementById('btnToCaseInfo').classList.remove('hidden');
        setAndTrigger('respondentName', finalRespName);
    }
    
    fillRemainingData(data);
    showManualInput();
    alert(`신청인을 '${finalAppName}'(으)로 설정하였습니다.\n자동으로 입력된 내용을 확인해주세요.`);
}

function fillRemainingData(data) {
    // 2심 사건이면 2심 탭을 활성화해야 함
    if(data.caseNo2 || data.courtName2) {
        document.getElementById('case-step-2').classList.remove('hidden');
    }

    if(data.courtName1) setAndTrigger('courtName1', data.courtName1);
    if(data.caseNo1) setAndTrigger('caseNo1', data.caseNo1);
    if(data.courtName2) setAndTrigger('courtName2', data.courtName2);
    if(data.caseNo2) setAndTrigger('caseNo2', data.caseNo2);
    
    // 비용 데이터 입력 (1심, 2심 어디에 넣을지 판단 필요하지만 우선 1심 필드에 기본 매핑)
    // 만약 2심 사건번호(나)가 감지되었다면 2심 칸에 넣는 것이 더 적절할 수 있으나,
    // 현재 UI 구조상 값이 있으면 무조건 채워넣고 활성화를 유도함.
    
    // [중요] OCR로 읽은 '1,100,000' 같은 값을 입력 필드에 넣음
    // 2심 사건(2024나...)인 경우 2심 비용란에 넣도록 개선
    const targetSuffix = (data.caseNo2) ? '2' : '1'; 

    if(data.soga1) setAndTrigger('soga' + targetSuffix, data.soga1);
    if(data.startFee1) setAndTrigger('startFee' + targetSuffix, data.startFee1);
    if(data.successFee1) setAndTrigger('successFee' + targetSuffix, data.successFee1);
}

// [핵심 수정] 값을 넣고 이벤트를 발생시켜 버튼 활성화를 유도하는 함수
function setAndTrigger(id, value) {
    const el = document.getElementById(id);
    if(el) {
        // 콤마 제거 등 정제 (formatCurrency가 다시 포맷팅함)
        // OCR 결과가 '1,100,000'이면 그대로 넣어도 됨
        el.value = value; 
        el.classList.add('ai-filled'); 
        
        // 이벤트 강제 발생 (유효성 검사 트리거)
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        
        // 금액 필드의 경우 keyup 이벤트가 있어야 포맷팅 및 계산이 돔
        if (id.includes('Fee') || id.includes('soga')) {
             el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        }
    }
    // 데이터 입력 후 즉시 전체 계산 로직 수행하여 버튼 상태 갱신
    calculateAll();
}

// --- 5. 기존 UI 제어 및 계산 로직 (유지) ---

function showManualInput() {
    const section = document.getElementById('manualInputSection');
    section.classList.remove('hidden');
    section.classList.add('fade-in-section');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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

const familyCases = { "가류": ["혼인 무효", "이혼 무효", "인지 무효", "친생자관계존부확인", "입양 무효", "파양 무효"], "나류": ["사실상혼인관계존부확인", "혼인 취소", "이혼 취소", "재판상 이혼", "부의 결정", "친생부인", "인지 취소", "인지에 대한 이의", "인지청구", "입양 취소", "파양 취소", "재판상 파양", "친양자 입양 취소", "친양자 파양"], "다류": ["약혼해제/사실혼파기 손해배상", "혼인/이혼 무효/취소 손해배상", "입양/파양 무효/취소 손해배상", "재산분할 관련 사해행위 취소"], "마류": ["재산분할", "상속재산분할"] };
let currentFamilyCategory = "";

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

function goToCaseInfo() {
    playTransition("인적 사항을 확인했어요.<br>이제 수행하신 소송의 법원명, 사건번호를 기재해주세요.", function() {
        document.getElementById('introPage').classList.add('hidden');
        const casePage = document.getElementById('caseInfoPage');
        casePage.classList.remove('hidden'); casePage.classList.add('fade-in-section');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        updateBackButtonVisibility(); 
    });
}

function checkCaseInfoStep() {
    const court1 = document.getElementById('courtName1').value.trim();
    const caseNo1 = document.getElementById('caseNo1').value.trim();
    const finalized1 = document.getElementById('finalized1').checked;
    const step2Div = document.getElementById('case-step-2');
    const step3Div = document.getElementById('case-step-3');
    const btnCalc = document.getElementById('btnToCalculator');
    const step1Valid = (court1 !== "" && caseNo1 !== "");

    if (step1Valid && !finalized1) {
        if (step2Div.classList.contains('hidden')) { step2Div.classList.remove('hidden'); step2Div.classList.add('fade-in-section'); }
    } else { step2Div.classList.add('hidden'); step3Div.classList.add('hidden'); }

    const court2 = document.getElementById('courtName2').value.trim();
    const caseNo2 = document.getElementById('caseNo2').value.trim();
    const finalized2 = document.getElementById('finalized2').checked;
    
    if (!step2Div.classList.contains('hidden') && court2 !== "" && caseNo2 !== "" && !finalized2) {
         if (step3Div.classList.contains('hidden')) { step3Div.classList.remove('hidden'); step3Div.classList.add('fade-in-section'); }
    } else { step3Div.classList.add('hidden'); }

    const caseNo3 = document.getElementById('caseNo3').value.trim();
    if ((step1Valid && finalized1) || (step1Valid && !finalized1 && court2 && caseNo2 && finalized2) || (step1Valid && !finalized1 && court2 && caseNo2 && !finalized2 && caseNo3)) {
        if (btnCalc.classList.contains('hidden')) { btnCalc.classList.remove('hidden'); btnCalc.classList.add('fade-in-section'); }
    } else { btnCalc.classList.add('hidden'); }
}

function getMaxInstanceLevel() {
    if (document.getElementById('finalized1').checked) return 1;
    if (document.getElementById('finalized2').checked) return 2;
    return 3; 
}

function goToCalculator() {
    const appNameVal = appName.value.trim() || "입력안함";
    let repNameVal = repName.value.trim();
    if(noRepCheck.checked) repNameVal = "없음 (본인 소송)"; else if (!repNameVal) repNameVal = "입력안함";
    const respNameVal = respName.value.trim() || "입력안함";
    document.getElementById('dispAppName').innerText = appNameVal;
    document.getElementById('dispRepName').innerText = repNameVal;
    document.getElementById('dispRespName').innerText = respNameVal;

    const maxLevel = getMaxInstanceLevel();
    let summaryHtml = "";
    const court1 = document.getElementById('courtName1').value || "-";
    const caseNo1 = document.getElementById('caseNo1').value || "-";
    summaryHtml += `<div class="case-item"><span>1심</span> <span>${court1} ${caseNo1}</span></div>`;
    if (maxLevel >= 2) {
        const court2 = document.getElementById('courtName2').value || "-";
        const caseNo2 = document.getElementById('caseNo2').value || "-";
        summaryHtml += `<div class="case-item"><span>2심</span> <span>${court2} ${caseNo2}</span></div>`;
    }
    if (maxLevel >= 3) {
        const court3 = document.getElementById('courtName3').value || "대법원";
        const caseNo3 = document.getElementById('caseNo3').value || "-";
        summaryHtml += `<div class="case-item"><span>3심</span> <span>${court3} ${caseNo3}</span></div>`;
    }
    document.getElementById('caseSummary').innerHTML = summaryHtml;
    playTransition("법원 및 사건 정보를 확인했어요.<br>이제 소송비용을 계산하도록 할게요.", function() {
        document.getElementById('caseInfoPage').classList.add('hidden');
        const calcPage = document.getElementById('calcPage');
        calcPage.classList.remove('hidden'); calcPage.classList.add('fade-in-section');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        populateFamilyOptions(); updateBackButtonVisibility();
    });
}

function populateFamilyOptions() {
    const select = document.getElementById('familySpecificCase');
    while (select.options.length > 1) { select.remove(1); }
    const categories = ["가류", "나류", "다류", "마류"];
    categories.forEach(cat => {
        const group = document.createElement('optgroup'); group.label = cat + " 사건";
        familyCases[cat].forEach(caseName => {
            const option = document.createElement('option'); option.value = caseName; option.text = caseName; group.appendChild(option);
        });
        select.appendChild(group);
    });
}

function handleFamilyCaseChange() {
    const selectedCase = document.getElementById('familySpecificCase').value;
    const displayDiv = document.getElementById('family-category-display');
    if (!selectedCase) { currentFamilyCategory = ""; displayDiv.innerText = ""; calculateAll(); return; }
    let foundCategory = "";
    for (const [category, cases] of Object.entries(familyCases)) { if (cases.includes(selectedCase)) { foundCategory = category; break; } }
    currentFamilyCategory = foundCategory;
    if(foundCategory) displayDiv.innerText = `선택하신 사건은 [${foundCategory}] 사건으로 분류됩니다.`; else displayDiv.innerText = "";
    calculateAll();
}

const SERVICE_UNIT_PRICE = 5500; 

function formatCurrency(input, idSuffix) {
    let value = input.value.replace(/[^0-9]/g, '');
    if (value) {
        const numVal = parseInt(value, 10);
        input.value = numVal.toLocaleString('ko-KR');
        const koreanEl = document.getElementById('korean' + idSuffix);
        if(koreanEl) koreanEl.innerText = numberToKorean(numVal) + ' 원';
    } else {
        input.value = '';
        const koreanEl = document.getElementById('korean' + idSuffix);
        if(koreanEl) koreanEl.innerText = '0원';
    }
    // 값이 바뀔 때마다 계산 및 버튼 상태 체크
    calculateAll();
}

function updateNextCardVisibility() {
    const maxLevel = getMaxInstanceLevel(); 
    const card1 = document.getElementById('card-1'); card1.classList.remove('card-hidden'); card1.style.display = 'flex';
    const start1 = document.getElementById('startFee1').value;
    const success1 = document.getElementById('successFee1').value;
    const soga1 = document.getElementById('soga1').value;
    const isCard1Filled = (start1 !== "" && success1 !== "" && soga1 !== "");
    const card2 = document.getElementById('card-2');
    let showCard2 = false;
    if (maxLevel >= 2) showCard2 = true; // 2심 사건이면 무조건 표시 (데이터 없어도)
    if (showCard2) {
        if (card2.style.display !== 'flex') { card2.classList.remove('card-hidden'); card2.style.display = 'flex'; card2.classList.add('fade-in'); }
    } else { card2.style.display = 'none'; card2.classList.add('card-hidden'); }
    
    // 3심 처리 생략
    const card3 = document.getElementById('card-3');
    if (maxLevel >= 3) {
        card3.classList.remove('card-hidden'); card3.style.display = 'flex';
    } else {
        card3.classList.add('card-hidden'); card3.style.display = 'none';
    }
}

function calculateAll() {
    const caseType = document.getElementById('caseType').value;
    if (!caseType) return;
    updateNextCardVisibility();
    let partyCount = parseInt(document.getElementById('partyCount').value);
    if(isNaN(partyCount) || partyCount < 2) partyCount = 2; 
    let totalLawyer = 0; let totalScrivener = 0; let totalCourt = 0;

    for (let i = 1; i <= 3; i++) {
        const cardEl = document.getElementById('card-' + i);
        if (i > 1 && (!cardEl || cardEl.classList.contains('card-hidden') || cardEl.style.display === 'none')) continue; 
        const soga = getNumberValue('soga' + i);
        const startFee = getNumberValue('startFee' + i);
        const successFee = getNumberValue('successFee' + i);
        const actualLawyerCost = startFee + successFee;
        const isWithdraw = document.getElementById('withdraw' + i).checked;
        const useScrivener = document.getElementById('useScrivener' + i).checked;
        const isPaper = document.getElementById('isPaper' + i).checked;
        let isPayer = false;
        if (i === 1) isPayer = document.getElementById('isPlaintiff1').checked;
        if (i === 2) isPayer = document.getElementById('isAppellant2').checked;
        if (i === 3) isPayer = document.getElementById('isPetitioner3').checked;

        let recognizedFee = 0;
        let limit = calcLawyerFeeLimit(soga);
        if (isWithdraw) limit = Math.floor(limit * 0.5);
        recognizedFee = Math.min(actualLawyerCost, limit);

        let sFee = 0;
        const elScrivener = document.getElementById('scrivener' + i);
        if (useScrivener) { sFee = calcScrivenerFee(soga); elScrivener.classList.remove('inactive'); } 
        else { elScrivener.classList.add('inactive'); }

        let stamp = 0; let service = 0;
        const elStamp = document.getElementById('stamp' + i);
        const elService = document.getElementById('service' + i);
        if (isPayer) {
            stamp = calcStampDuty(soga, i, caseType, isPaper);
            service = calcServiceFee(i, partyCount, caseType, soga);
            elStamp.classList.remove('inactive'); elService.classList.remove('inactive');
        } else { elStamp.classList.add('inactive'); elService.classList.add('inactive'); }

        document.getElementById('lawyer' + i).innerText = recognizedFee.toLocaleString();
        document.getElementById('scrivener' + i).innerText = sFee.toLocaleString();
        document.getElementById('stamp' + i).innerText = stamp.toLocaleString();
        document.getElementById('service' + i).innerText = service.toLocaleString();
        totalLawyer += recognizedFee; totalScrivener += sFee; totalCourt += (stamp + service);
    }
    const grandTotal = totalLawyer + totalScrivener + totalCourt;
    document.getElementById('grandTotal').innerText = grandTotal.toLocaleString() + " 원";
    document.getElementById('totalLawyer').innerText = totalLawyer.toLocaleString();
    document.getElementById('totalScrivener').innerText = totalScrivener.toLocaleString();
    document.getElementById('totalCourt').innerText = totalCourt.toLocaleString();
    
    checkCalculatorCompletion(); // [중요] 계산 후 버튼 상태 업데이트
}

// [핵심 수정] 버튼 활성화 로직 개선
function checkCalculatorCompletion() {
    const btn = document.getElementById('btnToEvidence');
    let isAnyCardComplete = false;

    // 1,2,3심 중 하나라도 (착수금 && 성공보수 && 소가)가 채워져 있으면 활성화
    for(let i=1; i<=3; i++) {
        const card = document.getElementById('card-' + i);
        // 카드가 보이고(active)
        if(card && !card.classList.contains('card-hidden') && card.style.display !== 'none') {
            const startVal = document.getElementById('startFee' + i).value;
            const successVal = document.getElementById('successFee' + i).value;
            const sogaVal = document.getElementById('soga' + i).value;
            
            // 셋 다 비어있지 않다면 OK
            if(startVal !== "" && successVal !== "" && sogaVal !== "") {
                isAnyCardComplete = true;
                break; 
            }
        }
    }

    btn.disabled = !isAnyCardComplete;
}

function calcLawyerFeeLimit(soga) {
    if (soga <= 0) return 0;
    if (soga <= 3000000) return 300000;
    else if (soga <= 20000000) return Math.floor(soga * 0.1); 
    else if (soga <= 50000000) return 2000000 + Math.floor((soga - 20000000) * 0.08);
    else if (soga <= 100000000) return 4400000 + Math.floor((soga - 50000000) * 0.06);
    else if (soga <= 150000000) return 7400000 + Math.floor((soga - 100000000) * 0.04);
    else if (soga <= 200000000) return 9400000 + Math.floor((soga - 150000000) * 0.02);
    else if (soga <= 500000000) return 10400000 + Math.floor((soga - 200000000) * 0.01);
    else return 13400000 + Math.floor((soga - 500000000) * 0.005);
}

function calcScrivenerFee(soga) {
    if (soga <= 0) return 0;
    if (soga <= 30000000) return 560000;
    else if (soga <= 200000000) return 560000 + Math.floor((soga - 30000000) * 0.0010);
    else if (soga <= 500000000) return 730000 + Math.floor((soga - 200000000) * 0.0009);
    else if (soga <= 1000000000) return 1000000 + Math.floor((soga - 500000000) * 0.0004);
    else if (soga <= 2000000000) return 1200000 + Math.floor((soga - 1000000000) * 0.0003);
    else return 1500000 + Math.floor((soga - 2000000000) * 0.0001);
}

function calcStampDuty(soga, instance, caseType, isPaper) {
    if(soga === 0) return 0;
    if (caseType === 'patent') soga = 100000000;
    if (caseType === 'family' && currentFamilyCategory === '마류') soga = Math.floor(soga / 3);
    let baseStamp = 0;
    if (caseType === 'family' && (currentFamilyCategory === '가류' || currentFamilyCategory === '나류')) baseStamp = 18000;
    else if (caseType === 'civil_app') { const mainStamp = calcCivilBaseStamp(soga); baseStamp = Math.floor(mainStamp * 0.5); if (baseStamp > 450000) baseStamp = 450000; }
    else baseStamp = calcCivilBaseStamp(soga);
    let multiplier = 1.0; if (instance === 2) multiplier = 1.5; if (instance === 3) multiplier = 2.0;
    let finalStamp = baseStamp * multiplier;
    if (!isPaper) finalStamp = finalStamp * 0.9;
    finalStamp = Math.floor(finalStamp / 100) * 100;
    const minStamp = isPaper ? 1000 : 900; if (finalStamp < minStamp) finalStamp = minStamp;
    return finalStamp;
}

function calcCivilBaseStamp(soga) {
    if (soga < 10000000) return soga * 0.0050; else if (soga < 100000000) return soga * 0.0045 + 5000; else if (soga < 1000000000) return soga * 0.0040 + 55000; else return soga * 0.0035 + 555000;
}

function calcServiceFee(instance, totalParties, caseType, soga) {
    const UNIT = 5500; let targetCount = Math.max(1, totalParties - 1); let times = 0;
    if (caseType === 'civil') { if (instance === 1) { if (soga < 30000000) times = 10; else times = 15; } else if (instance === 2) times = 12; else times = 8; } 
    else if (caseType === 'civil_app') { targetCount = totalParties; times = 2; }
    else if (caseType === 'family') { if (instance === 1) times = 15; else if (instance === 2) times = 12; else times = 8; }
    else if (caseType === 'admin') { if (instance === 1) times = 10; else if (instance === 2) times = 10; else times = 8; }
    else if (caseType === 'patent') { if (instance === 1) times = 10; else times = 8; }
    return targetCount * times * UNIT;
}

function showContentAndCalculate() {
    const caseType = document.getElementById('caseType').value;
    const mainContent = document.getElementById('main-calc-content');
    const familyContainer = document.getElementById('family-specific-container');
    if (caseType === 'family') { familyContainer.classList.remove('hidden'); familyContainer.classList.add('fade-in'); } 
    else { familyContainer.classList.add('hidden'); document.getElementById('familySpecificCase').value = ""; currentFamilyCategory = ""; document.getElementById('family-category-display').innerText = ""; }
    if (caseType) { mainContent.classList.remove('hidden'); mainContent.classList.add('fade-in-section'); calculateAll(); }
}

function getNumberValue(id) {
    const el = document.getElementById(id);
    if(!el) return 0;
    const val = el.value.replace(/,/g, '');
    return val ? parseInt(val, 10) : 0;
}

function numberToKorean(number) {
    if(number == 0) return '0';
    var unitWords = ['', '만', '억', '조', '경']; var unit = 10000; var splitCount = unitWords.length; var resultArray = []; var resultString = '';
    for (var i = 0; i < splitCount; i++){ var unitResult = (number % Math.pow(unit, i + 1)) / Math.pow(unit, i); unitResult = Math.floor(unitResult); if (unitResult > 0){ resultArray[i] = unitResult; } }
    for (var i = 0; i < resultArray.length; i++){ if(!resultArray[i]) continue; resultString = String(resultArray[i]) + unitWords[i] + ' ' + resultString; }
    return resultString.trim();
}

function goToEvidence() {
    playTransition("이제 거의 다 왔습니다.<br>지출한 소송 비용을 소명할 수 있는 자료를 선택해주세요.", function() {
        document.getElementById('calcPage').classList.add('hidden');
        const maxLevel = getMaxInstanceLevel();
        if (maxLevel >= 2) document.getElementById('ev-group-2').classList.remove('hidden'); else document.getElementById('ev-group-2').classList.add('hidden');
        if (maxLevel >= 3) document.getElementById('ev-group-3').classList.remove('hidden'); else document.getElementById('ev-group-3').classList.add('hidden');
        const evPage = document.getElementById('evidencePage'); evPage.classList.remove('hidden'); evPage.classList.add('fade-in-section');
        window.scrollTo({ top: 0, behavior: 'smooth' }); updateBackButtonVisibility();
    });
}

function goToPreview() {
    playTransition("입력해주신 내용을 토대로<br>PDF 양식에 맞춘 신청서를 작성합니다.", function() {
        document.getElementById('evidencePage').classList.add('hidden');
        renderPreview();
        const pvPage = document.getElementById('previewPage'); pvPage.classList.remove('hidden'); pvPage.classList.add('fade-in-section');
        window.scrollTo({ top: 0, behavior: 'smooth' }); updateBackButtonVisibility();
    });
}

function renderPreview() {
    const appNameVal = document.getElementById('applicantName').value || "";
    const appAddrVal = document.getElementById('applicantAddr').value || "";
    const respNameVal = document.getElementById('respondentName').value || "";
    const respAddrVal = document.getElementById('respondentAddr').value || "";
    const repNameVal = document.getElementById('repName').value || "";
    const repLawyerVal = document.getElementById('repLawyerName') ? document.getElementById('repLawyerName').value : "";
    const repAddrVal = document.getElementById('repAddr').value || "";
    const noRep = document.getElementById('noRepresentative').checked;

    document.getElementById('prev-appName').innerText = appNameVal;
    document.getElementById('prev-appAddr').innerText = appAddrVal;
    document.getElementById('prev-respName').innerText = respNameVal;
    document.getElementById('prev-respAddr').innerText = respAddrVal;

    if (noRep || !repNameVal) {
        document.getElementById('prev-rep-box').style.display = 'none';
        document.getElementById('prev-signFirm').innerText = appNameVal;
        document.getElementById('prev-signLawyer').parentNode.style.display = 'none';
    } else {
        document.getElementById('prev-rep-box').style.display = 'block';
        document.getElementById('prev-lawFirm').innerText = repNameVal;
        document.getElementById('prev-lawyerName').innerText = repLawyerVal || "(담당변호사)";
        document.getElementById('prev-repAddr').innerText = repAddrVal;
        document.getElementById('prev-signFirm').innerText = repNameVal;
        document.getElementById('prev-signLawyer').innerText = repLawyerVal.split(',')[0] || "OOO";
        document.getElementById('prev-signLawyer').parentNode.style.display = 'inline-block';
    }

    const court1 = document.getElementById('courtName1').value;
    const case1 = document.getElementById('caseNo1').value;
    const date1 = (document.getElementById('date1') && document.getElementById('date1').value) ? document.getElementById('date1').value : "20XX. X. X.";
    let judgementText = `${court1} ${date1} 선고 ${case1} 사건 판결`;
    let finalJudgementText = judgementText; 

    const card2 = document.getElementById('card-2');
    if (card2 && card2.style.display !== 'none' && !card2.classList.contains('card-hidden')) {
        const court2 = document.getElementById('courtName2').value;
        const case2 = document.getElementById('caseNo2').value;
        const date2 = (document.getElementById('date2') && document.getElementById('date2').value) ? document.getElementById('date2').value : "20XX. X. X.";
        if (court2 && case2) { judgementText += `, ${court2} ${date2} 선고 ${case2} 사건 판결`; finalJudgementText = `${court2} ${date2} 선고 ${case2} 사건 판결`; }
    }
    const card3 = document.getElementById('card-3');
    if (card3 && card3.style.display !== 'none' && !card3.classList.contains('card-hidden')) {
        const court3 = document.getElementById('courtName3').value;
        const case3 = document.getElementById('caseNo3').value;
        const date3 = (document.getElementById('date3') && document.getElementById('date3').value) ? document.getElementById('date3').value : "20XX. X. X.";
        if (case3) { judgementText += `, ${court3} ${date3} 선고 ${case3} 사건 판결`; finalJudgementText = `${court3} ${date3} 선고 ${case3} 사건 판결`; }
    }
    document.getElementById('prev-judgements').innerText = judgementText;
    document.getElementById('prev-final-judgement').innerText = finalJudgementText;
    const fDate = (document.getElementById('finalDate') && document.getElementById('finalDate').value) ? document.getElementById('finalDate').value : "20XX. X. X.";
    document.getElementById('prev-finalDate').innerText = fDate;
    const today = new Date();
    document.getElementById('prev-date').innerText = `${today.getFullYear()}. ${today.getMonth()+1}.`;
    document.getElementById('prev-courtName').innerText = (court1 || "OO지방법원");

    const maxLevel = getMaxInstanceLevel();
    const checkboxes = document.querySelectorAll('.evidence-item input[type="checkbox"]:checked');
    let evHtml = '<ol>';
    checkboxes.forEach(cb => { 
        const parentGroup = cb.closest('.evidence-group');
        let include = true;
        if (parentGroup) {
            if (parentGroup.id === 'ev-group-2' && maxLevel < 2) include = false;
            if (parentGroup.id === 'ev-group-3' && maxLevel < 3) include = false;
        }
        if(include) evHtml += `<li>${cb.value}</li>`; 
    });
    evHtml += '</ol>';
    document.getElementById('prev-evidenceList').innerHTML = evHtml;
    const tbody = document.getElementById('calcTableBody'); tbody.innerHTML = ""; 
    let maxSoga = 0; for(let i=1; i<=3; i++) { const s = getNumberValue('soga'+i); if (s > maxSoga) maxSoga = s; }
    document.getElementById('prev-calc-soga').innerText = maxSoga.toLocaleString();
    
    let tableTotalAmount = 0; 
    function addRow(inst, item, amount, remarks) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="center">${inst}</td><td class="center">${item}</td><td class="right">${amount.toLocaleString()}</td><td class="left remarks">${remarks}</td>`;
        tbody.appendChild(tr);
    }
    function getLawyerFormulaText(soga, amount) {
        if (soga <= 3000000) return "300,000원 (최소한도)";
        if (soga <= 20000000) return `{${soga.toLocaleString()} × 10%}`;
        if (soga <= 50000000) return `{2,000,000원 + (${soga.toLocaleString()} - 2천만) × 8%}`;
        if (soga <= 100000000) return `{4,400,000원 + (${soga.toLocaleString()} - 5천만) × 6%}`;
        return "변호사보수의 소송비용 산입에 관한 규칙에 따름";
    }
    for(let i=1; i<=3; i++) {
        const card = document.getElementById('card-'+i);
        if (i > 1 && (card.style.display === 'none' || card.classList.contains('card-hidden'))) continue;
        const instName = (i===1) ? "1심" : (i===2 ? "2심" : "3심");
        const soga = getNumberValue('soga'+i);
        const isPaper = document.getElementById('isPaper'+i).checked;
        const scriEl = document.getElementById('scrivener'+i);
        const scriVal = scriEl ? parseInt(scriEl.innerText.replace(/,/g,'')) : 0;
        if(scriVal > 0) { addRow(instName, "서기료", scriVal, "법무사보수표에 따름"); tableTotalAmount += scriVal; }
        const lawEl = document.getElementById('lawyer'+i);
        const lawVal = lawEl ? parseInt(lawEl.innerText.replace(/,/g,'')) : 0;
        if(lawVal > 0) { const formula = getLawyerFormulaText(soga, lawVal); addRow(instName, "변호사보수", lawVal, `변호사보수 규칙 제3조,\n최대 보수: ${formula}`); tableTotalAmount += lawVal; }
        const stampEl = document.getElementById('stamp'+i);
        const stampVal = stampEl ? parseInt(stampEl.innerText.replace(/,/g,'')||0) : 0;
        if(!stampEl.classList.contains('inactive') && stampVal > 0) { const discountText = isPaper ? "종이소송(할인없음)" : "전자소송 10% 할인"; addRow(instName, "인지대", stampVal, discountText); tableTotalAmount += stampVal; }
        const servEl = document.getElementById('service'+i);
        const servVal = servEl ? parseInt(servEl.innerText.replace(/,/g,'')||0) : 0;
        if(!servEl.classList.contains('inactive') && servVal > 0) { addRow(instName, "송달료", servVal, `당사자수 및 심급별 횟수 기준\n(1회: ${SERVICE_UNIT_PRICE.toLocaleString()}원)`); tableTotalAmount += servVal; }
    }
    const fixedStamp = 900; const fixedService = 31200; 
    addRow("기타(신청)", "인지대", fixedStamp, "확정신청서 접수 인지대"); tableTotalAmount += fixedStamp;
    addRow("기타(신청)", "송달료", fixedService, "확정신청서 송달 비용"); tableTotalAmount += fixedService;
    const trTotal = document.createElement('tr');
    trTotal.innerHTML = `<td class="center" style="font-weight:bold; background:#f9f9f9;">합계</td><td class="center" style="font-weight:bold; background:#f9f9f9;"></td><td class="right" style="font-weight:bold; background:#f9f9f9;">${tableTotalAmount.toLocaleString()}</td><td class="left" style="background:#f9f9f9;"></td>`;
    tbody.appendChild(trTotal);
    document.getElementById('prev-totalAmount').innerText = tableTotalAmount.toLocaleString();
}

const pageOrder = ['introPage', 'caseInfoPage', 'calcPage', 'evidencePage', 'previewPage'];
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

const courtList = ["서울고등법원", "서울중앙지방법원", "서울남부지방법원", "서울동부지방법원", "서울북부지방법원", "서울서부지방법원", "서울가정법원", "서울행정법원", "서울회생법원", "인천지방법원", "인천지방법원 강화군법원", "인천지방법원 부천지원", "인천지방법원 부천지원 김포시법원", "인천가정법원", "수원고등법원", "수원지방법원", "수원지방법원 성남지원", "수원지방법원 성남지원 광주시법원", "수원지방법원 안산지원", "수원지방법원 안산지원 광명시법원", "수원지방법원 안양지원", "수원지방법원 여주지원", "수원지방법원 여주지원 양평군법원", "수원지방법원 여주지원 이천시법원", "수원지방법원 오산시법원", "수원지방법원 용인시법원", "수원지방법원 평택지원", "수원지방법원 평택지원 안성시법원", "의정부지방법원", "의정부지방법원 고양지원", "의정부지방법원 고양지원 파주시법원", "의정부지방법원 남양주지원", "의정부지방법원 남양주지원 가평군법원", "의정부지방법원 동두천시법원", "의정부지방법원 연천군법원", "의정부지방법원 철원군법원", "의정부지방법원 포천시법원", "춘천지방법원", "춘천지방법원 강릉지원", "춘천지방법원 강릉지원 동해시법원", "춘천지방법원 강릉지원 삼척시법원", "춘천지방법원 속초지원", "춘천지방법원 속초지원 고성군법원", "춘천지방법원 속초지원 양양군법원", "춘천지방법원 양구군법원", "춘천지방법원 영월지원", "춘천지방법원 영월지원 정선군법원", "춘천지방법원 영월지원 태백시법원", "춘천지방법원 영월지원 평창군법원", "춘천지방법원 원주지원", "춘천지방법원 원주지원 횡성군법원", "춘천지방법원 인제군법원", "춘천지방법원 홍천군법원", "춘천지방법원 화천군법원", "청주지방법원", "청주지방법원 괴산군법원", "청주지방법원 보은군법원", "청주지방법원 영동지원", "청주지방법원 영동지원 옥천군법원", "청주지방법원 제천지원", "청주지방법원 제천지원 단양군법원", "청주지방법원 진천군법원", "청주지방법원 충주지원", "청주지방법원 충주지원 음성군법원", "대전고등법원", "대전지방법원", "대전지방법원 공주지원", "대전지방법원 공주지원 청양군법원", "대전지방법원 금산군법원", "대전지방법원 논산지원", "대전지방법원 논산지원 부여군법원", "대전지방법원 서산지원", "대전지방법원 서산지원 당진시법원", "대전지방법원 서산지원 태안군법원", "대전지방법원 세종특별자치시법원", "대전지방법원 천안지원", "대전지방법원 천안지원 아산시법원", "대전지방법원 홍성지원", "대전지방법원 홍성지원 보령시법원", "대전지방법원 홍성지원 서천군법원", "대전지방법원 홍성지원 예산군법원", "대전가정법원", "대전가정법원 공주지원", "대전가정법원 논산지원", "대전가정법원 서산지원", "대전가정법원 천안지원", "대전가정법원 홍성지원", "특허법원", "대구고등법원", "대구지방법원", "대구지방법원 경산시법원", "대구지방법원 경주지원", "대구지방법원 서부지원 고령군법원", "대구지방법원 김천지원", "대구지방법원 김천지원 구미시법원", "대구지방법원 상주지원", "대구지방법원 상주지원 문경시법원", "대구지방법원 상주지원 예천군법원", "대구지방법원 서부지원", "대구지방법원 서부지원 성주군법원", "대구지방법원 안동지원", "대구지방법원 안동지원 봉화군법원", "대구지방법원 안동지원 영주시법원", "대구지방법원 영덕지원", "대구지방법원 영덕지원 영양군법원", "대구지방법원 영덕지원 울진군법원", "대구지방법원 영천시법원", "대구지방법원 의성지원", "대구지방법원 의성지원 군위군법원", "대구지방법원 의성지원 청송군법원", "대구지방법원 청도군법원", "대구지방법원 포항지원", "대구지방법원 칠곡군법원", "대구가정법원", "대구가정법원 경주지원", "대구가정법원 김천지원", "대구가정법원 상주지원", "대구가정법원 안동지원", "대구가정법원 영덕지원", "대구가정법원 의성지원", "대구가정법원 포항지원", "부산고등법원", "부산지방법원", "부산지방법원 동부지원", "부산지방법원 서부지원", "부산가정법원", "울산지방법원", "울산지방법원 양산시법원", "창원지방법원", "창원지방법원 거창지원", "창원지방법원 거창지원 함양군법원", "창원지방법원 거창지원 합천군법원", "창원지방법원 김해시법원", "창원지방법원 마산지원", "창원지방법원 마산지원 의령군법원", "창원지방법원 마산지원 함안군법원", "창원지방법원 밀양지원", "창원지방법원 밀양지원 창녕군법원", "창원지방법원 진주지원", "창원지방법원 진주지원 남해군법원", "창원지방법원 진주지원 사천시법원", "창원지방법원 진주지원 산청군법원", "창원지방법원 진주지원 하동군법원", "창원지방법원 창원남부시법원", "창원지방법원 통영지원", "창원지방법원 통영지원 거제시법원", "창원지방법원 통영지원 고성군법원", "광주고등법원", "광주지방법원", "광주지방법원 목포지원", "광주지방법원 장흥지원", "광주지방법원 순천지원", "광주지방법원 해남지원", "광주가정법원", "광주가정법원 장흥지원", "광주가정법원 순천지원", "광주가정법원 해남지원", "광주가정법원 목포지원", "광주지방법원 곡성군법원", "광주지방법원 영광군법원", "광주지방법원 나주시법원", "광주지방법원 장성군법원", "광주지방법원 화순군법원", "광주지방법원 담양군법원", "광주지방법원 목포지원 함평군법원", "광주지방법원 목포지원 영암군법원", "광주지방법원 목포지원 무안군법원", "광주지방법원 장흥지원 강진군법원", "광주지방법원 순천지원 보성군법원", "광주지방법원 순천지원 고흥군법원", "광주지방법원 순천지원 여수시법원", "광주지방법원 순천지원 구례군법원", "광주지방법원 순천지원 광양시법원", "광주지방법원 해남지원 완도군법원", "광주지방법원 해남지원 진도군법원", "전주지방법원", "전주지방법원 군산지원", "전주지방법원 군산지원 익산시법원", "전주지방법원 김제시법원", "전주지방법원 남원지원", "전주지방법원 남원지원 순창군법원", "전주지방법원 남원지원 장수군법원", "전주지방법원 무주군법원", "전주지방법원 임실군법원", "전주지방법원 정읍지원", "전주지방법원 정읍지원 고창군법원", "전주지방법원 정읍지원 부안군법원", "전주지방법원 진안군법원", "제주지방법원", "제주지방법원 서귀포시법원"];

function setupAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    input.addEventListener("input", function() {
        const val = this.value; closeList(); if (!val) return;
        const matches = courtList.filter(court => court.includes(val));
        if (matches.length === 0) return;
        matches.forEach(match => {
            const item = document.createElement("li"); item.className = "suggestion-item";
            const regex = new RegExp(`(${val})`, "gi"); item.innerHTML = match.replace(regex, "<strong>$1</strong>");
            item.addEventListener("click", function() { input.value = match; closeList(); checkCaseInfoStep(); });
            list.appendChild(item);
        });
        input.classList.add("input-with-list"); list.style.display = "block";
    });
    function closeList() { list.innerHTML = ""; list.style.display = "none"; input.classList.remove("input-with-list"); }
    document.addEventListener("click", function(e) { if (e.target !== input && e.target !== list) { closeList(); } });
}
