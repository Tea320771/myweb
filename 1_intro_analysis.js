/* ==========================================
   1_intro_analysis.js
   - [UPDATE] 진단 모드 제거 (Gemini 2.0 확정)
   - [UPDATE] 이체내역 확인을 '예쁜 모달'로 변경 (Sequential UI)
   ========================================== */

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

// [NEW] 이체내역 검토를 위한 상태 변수
let feeReviewQueue = [];
let feeReviewIndex = 0;

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

// --- 4. 분석 시작 ---
async function startAnalysis() {
    if (queuedFiles.length === 0) { alert("분석할 파일이 없습니다."); return; }
    
    const actionArea = document.getElementById('action-area');
    const logsContainer = document.getElementById('processing-logs');
    
    actionArea.classList.add('hidden'); 
    logsContainer.style.display = 'block';
    logsContainer.innerHTML = `<div class="log-item log-info">AI 분석 엔진(Gemini 2.0) 준비 중...</div>`;

    try {
        let parts = [];
        
        // 시스템 프롬프트 (기존 유지)
        const systemPrompt = `
        너는 유능한 법률 사무원이야. 제공된 법률 문서 이미지들을 분석해서 소송비용확정신청에 필요한 정보를 JSON 포맷으로 추출해줘.
        
        [분석 원칙]
        1. '판결문' > '사건위임계약서' > '이체내역' 순서로 신뢰해라.
        2. 당사자(원고, 피고)와 주소를 정확히 찾아라.
        3. 비용 부담자(승패소)를 파악해 'winnerSide'('plaintiff' 또는 'defendant')에 명시해라.
        4. 각 심급별 판결선고일, 착수금, 성공보수, 소가 등을 추출해라.
        5. 'ambiguousAmounts'에는 이체내역 중 착수금/성공보수로 추정되나 확신할 수 없는 금액을 넣어라.
        
        [JSON 구조]
        {
          "plaintiffName": "...", "plaintiffAddr": "...",
          "defendantName": "...", "defendantAddr": "...",
          "winnerSide": "...",
          "courtName1": "...", "caseNo1": "...", "rulingDate1": "...", "startFee1": "...", "successFee1": "...", "soga1": "...",
          "courtName2": "...", "caseNo2": "...", "rulingDate2": "...", "startFee2": "...", "successFee2": "...",
          "courtName3": "...", "caseNo3": "...", "rulingDate3": "...", "startFee3": "...", "successFee3": "...",
          "ambiguousAmounts": [ {"amount": "금액", "level": "추정심급(없으면 common)"} ]
        }
        반드시 JSON만 응답해.
        `;

        parts.push({ text: systemPrompt });

        for (let i = 0; i < queuedFiles.length; i++) {
            const file = queuedFiles[i];
            logsContainer.innerHTML += `<div class="log-item log-info">📂 파일 읽는 중... (${file.name})</div>`;
            const base64Data = await fileToBase64(file);
            parts.push({
                inline_data: { mime_type: file.type, data: base64Data }
            });
        }
        
        logsContainer.innerHTML += `<div class="log-item log-info" style="font-weight:bold;">🤖 Google Gemini가 문서를 분석 중입니다...</div>`;
        logsContainer.scrollTop = logsContainer.scrollHeight;

        aiExtractedData = await callBackendFunction(parts);

        logsContainer.innerHTML += `<div class="log-item log-success" style="font-weight:bold;">✨ AI 분석 완료! 결과 확인</div>`;
        
        // [변경] 바로 모달을 띄우지 않고, 검토 프로세스 시작
        setTimeout(() => { startDataReview(aiExtractedData); }, 800);

    } catch (error) {
        console.error(error);
        logsContainer.innerHTML += `<div class="log-item log-error">❌ 오류: ${error.message}</div>`;
        alert(error.message); 
        actionArea.classList.remove('hidden');
    }
}

async function callBackendFunction(parts) {
    const url = '/api/analyze'; 
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts: parts })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
             throw new Error("요청이 너무 많습니다. 1분만 기다렸다가 다시 시도해주세요.");
        }
        throw new Error(`서버 오류 (${response.status})`);
    }

    const result = await response.json();
    if (!result.candidates || result.candidates.length === 0) throw new Error("분석 결과가 없습니다.");

    let rawText = result.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    return JSON.parse(rawText);
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = (error) => reject(error);
    });
}

// --- 5. 데이터 검토 및 이체내역 확인 (모달 연동) ---

function startDataReview(data) {
    // 1. 이체내역(ambiguousAmounts)이 있으면 큐에 담고 모달 시작
    if (data.ambiguousAmounts && data.ambiguousAmounts.length > 0) {
        // 중복 제거
        const uniqueFees = [];
        const seen = new Set();
        data.ambiguousAmounts.forEach(item => {
            if (!seen.has(item.amount)) {
                seen.add(item.amount);
                uniqueFees.push(item);
            }
        });
        
        feeReviewQueue = uniqueFees;
        feeReviewIndex = 0;
        
        if (feeReviewQueue.length > 0) {
            showFeeReviewModal(); // 이체내역 모달 띄우기
        } else {
            showApplicantModal(data); // 없으면 바로 당사자 확인
        }
    } else {
        showApplicantModal(data);
    }
}

// [NEW] 이체내역 확인 모달 표시 함수
function showFeeReviewModal() {
    if (feeReviewIndex >= feeReviewQueue.length) {
        // 모든 검토가 끝나면 모달 닫고 당사자 확인으로 이동
        document.getElementById('fee-check-modal').classList.add('hidden');
        showApplicantModal(aiExtractedData);
        return;
    }

    const currentItem = feeReviewQueue[feeReviewIndex];
    const levelText = (currentItem.level !== 'common') ? `${currentItem.level}심` : "심급 미상";

    // 모달 내용 업데이트
    document.getElementById('fee-amount-display').innerText = currentItem.amount;
    document.getElementById('fee-level-display').innerText = `(AI 추정: ${levelText})`;
    
    // 모달 표시
    document.getElementById('fee-check-modal').classList.remove('hidden');
}

// [NEW] 버튼 클릭 시 처리 함수
function resolveFee(action) {
    const currentItem = feeReviewQueue[feeReviewIndex];
    const data = aiExtractedData;
    
    // 심급 결정 (추정된 것이 있으면 그것을, 없으면 순서대로)
    let targetLevel = currentItem.level;
    if (targetLevel === 'common') {
        // 1심부터 비어있는 곳 찾기
        if (!data.startFee1) targetLevel = 1;
        else if (!data.startFee2) targetLevel = 2;
        else targetLevel = 3;
    }

    if (action === 'start') {
        // 착수금으로 등록
        data['startFee' + targetLevel] = currentItem.amount;
    } else if (action === 'success') {
        // 성공보수로 등록
        data['successFee' + targetLevel] = currentItem.amount;
    }
    // 'skip'이면 아무것도 안함

    // 다음 항목으로 이동
    feeReviewIndex++;
    showFeeReviewModal();
}

// --- 6. 신청인 확인 및 데이터 주입 ---
function showApplicantModal(data) {
    let extractedPlaintiff = data.plaintiffName || "원고(미확인)";
    let extractedDefendant = data.defendantName || "피고(미확인)";
    
    document.getElementById('modal-plaintiff-name').innerText = extractedPlaintiff; 
    document.getElementById('modal-defendant-name').innerText = extractedDefendant;
    
    document.getElementById('applicant-selection-modal').classList.remove('hidden');
}

function selectApplicant(selectionSide) {
    document.getElementById('applicant-selection-modal').classList.add('hidden'); 

    const data = aiExtractedData;
    const leftName = document.getElementById('modal-plaintiff-name').innerText;
    const rightName = document.getElementById('modal-defendant-name').innerText;

    let finalAppName = "", finalRespName = "";
    if (selectionSide === 'plaintiff') { 
        finalAppName = leftName; finalRespName = rightName;
    } else { 
        finalAppName = rightName; finalRespName = leftName;
    }

    if(finalAppName && !finalAppName.includes("미확인")) setAndTrigger('applicantName', finalAppName);
    
    if (selectionSide === 'plaintiff') {
        if (data.plaintiffAddr) setAndTrigger('applicantAddr', data.plaintiffAddr);
    } else {
        if (data.defendantAddr) setAndTrigger('applicantAddr', data.defendantAddr);
    }

    if(finalRespName && !finalRespName.includes("미확인")) {
        document.getElementById('step3-area').classList.remove('hidden');
        document.getElementById('btnToCaseInfo').classList.remove('hidden');
        setAndTrigger('respondentName', finalRespName);
    }

    fillRemainingData(data);
    showManualInput();
    alert(`AI 분석 완료!\n신청인: ${finalAppName}\n피신청인: ${finalRespName}\n내용이 반영되었습니다.`);
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
    if(data.rulingDate1) setAndTrigger('rulingDate1', data.rulingDate1);
    if(data.soga1) setAndTrigger('soga1', data.soga1);
    if(data.startFee1) setAndTrigger('startFee1', data.startFee1);
    if(data.successFee1) setAndTrigger('successFee1', data.successFee1);

    if(data.courtName2) setAndTrigger('courtName2', data.courtName2);
    if(data.caseNo2) setAndTrigger('caseNo2', data.caseNo2);
    if(data.rulingDate2) setAndTrigger('rulingDate2', data.rulingDate2);
    if(data.soga2) setAndTrigger('soga2', data.soga2);
    if(data.startFee2) setAndTrigger('startFee2', data.startFee2);
    if(data.successFee2) setAndTrigger('successFee2', data.successFee2);

    if(data.courtName3) setAndTrigger('courtName3', data.courtName3);
    else if(data.caseNo3) setAndTrigger('courtName3', '대법원'); 
    
    if(data.caseNo3) setAndTrigger('caseNo3', data.caseNo3);
    if(data.rulingDate3) setAndTrigger('rulingDate3', data.rulingDate3);
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