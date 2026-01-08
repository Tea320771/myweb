/* ==========================================
   1_intro_analysis.js
   - 기본 설정, 네비게이션, 파일 업로드
   - [UPDATE] Tesseract.js 제거 -> OCR.space API 연동 (인식률 향상)
   ========================================== */

// ⚠️ 중요: OCR.space에서 발급받은 API 키를 아래에 입력하세요.
const OCR_API_KEY = 'K82202390688957'

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
        // PDF 또는 이미지 허용
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
    
    // 심급별 텍스트 저장용 (1:1심, 2:2심, 3:3심, common:전체)
    let categorizedText = { 1: "", 2: "", 3: "", common: "" };

    try {
        for (let i = 0; i < queuedFiles.length; i++) {
            const file = queuedFiles[i];
            logsContainer.innerHTML += `<div class="log-item log-info">📡 서버 전송 및 분석 중... (${file.name})</div>`;
            logsContainer.scrollTop = logsContainer.scrollHeight;

            // FormData 생성
            let formData = new FormData();
            formData.append("file", file);
            formData.append("language", "kor"); // 한글 설정
            formData.append("isOverlayRequired", "false");
            formData.append("OCREngine", "2"); // Engine 2가 한글/숫자 인식률이 더 좋음
            formData.append("scale", "true");

            // API 호출
            const response = await fetch("https://api.ocr.space/parse/image", {
                method: "POST",
                headers: {
                    "apikey": OCR_API_KEY
                },
                body: formData
            });

            const result = await response.json();

            if (result.IsErroredOnProcessing) {
                console.error(result);
                throw new Error(result.ErrorMessage?.[0] || "OCR 처리 중 오류 발생");
            }

            // 결과 텍스트 추출
            let extractedText = "";
            if (result.ParsedResults && result.ParsedResults.length > 0) {
                result.ParsedResults.forEach(page => {
                    extractedText += " " + page.ParsedText;
                });
            }

            // 줄바꿈 및 다중 공백 처리
            const normalizedText = extractedText.replace(/\r\n|\n|\r/g, ' ').replace(/\s+/g, ' ');

            // 파일명 또는 내용 기반 심급 추정
            let targetInstance = 'common';
            if (file.name.includes("1심") || file.name.includes("지방")) targetInstance = 1;
            else if (file.name.includes("2심") || file.name.includes("항소") || file.name.includes("고등")) targetInstance = 2;
            else if (file.name.includes("3심") || file.name.includes("상고") || file.name.includes("대법")) targetInstance = 3;
            else {
                if (normalizedText.includes("지방 법원") || normalizedText.includes("지방법원") || normalizedText.includes("지원")) targetInstance = 1;
                else if (normalizedText.includes("고등 법원") || normalizedText.includes("고등법원")) targetInstance = 2;
                else if (normalizedText.includes("대법원")) targetInstance = 3;
            }

            categorizedText[targetInstance] += ` ${normalizedText}`;
            categorizedText['common'] += ` ${normalizedText}`;
            
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
        alert("분석 중 오류가 발생했습니다.\n(무료 API 키 제한이거나 파일 문제일 수 있습니다.)\nAPI 키를 확인하거나 잠시 후 다시 시도하세요.");
        actionArea.classList.remove('hidden');
    }
}

// --- [핵심] 5. 데이터 추출 알고리즘 (정규식 강화 - 기존과 동일) ---
function analyzeLegalDocuments(categorizedText) {
    const result = {
        courtName1: null, caseNo1: null,
        courtName2: null, caseNo2: null,
        courtName3: null, caseNo3: null,
        plaintiffName: null, defendantName: null, 
        contractClientName: null, contractOpponentName: null,
        clientAddress: null,
        soga1: null, soga2: null, soga3: null,
        startFee1: null, successFee1: null,
        startFee2: null, successFee2: null,
        startFee3: null, successFee3: null
    };

    const allText = categorizedText.common + categorizedText[1] + categorizedText[2] + categorizedText[3];

    // 당사자(원고/피고) 추출
    const clientPatterns = [
        /위\s*임\s*인\s*\(?갑\)?\s*[:;]?\s*([가-힣]{2,5})(?!\s*변호사)/,
        /당\s*사\s*자\s*[:;]?\s*([가-힣]{2,5})/, 
        /원\s*고\s*\(?신\s*청\s*인\)?\s*[:;]?\s*([가-힣]{2,5})/
    ];
    result.contractClientName = findBestMatch(allText, clientPatterns);

    const opponentPatterns = [
        /상\s*대\s*방\s*[:;]?\s*([가-힣]{2,5})/, 
        /피\s*고\s*\(?피\s*신\s*청\s*인\)?\s*[:;]?\s*([가-힣]{2,5})/
    ];
    result.contractOpponentName = findBestMatch(allText, opponentPatterns);

    const addrRegex = /주\s*소\s*[:;]?\s*([가-힣0-9\s,\-\(\)로길층호]+(?:시|도|구|군|동|면|읍)\s*[가-힣0-9\s,\-\(\)로길층호]*)(?=\s주\s*민|\s전\s*화)/;
    const addrMatch = allText.match(addrRegex);
    if (addrMatch) result.clientAddress = addrMatch[1].trim();

    function extractFromText(text, level) {
        if (!text) return;

        const courtRegex = /([가-힣]{2,}(?:지방|고등|가정|행정|회생)법원(?:[가-힣]*지원)?|대법원)/g;
        let cMatch;
        while ((cMatch = courtRegex.exec(text)) !== null) {
            const name = cMatch[1];
            if (level === 3 && name === "대법원") { result.courtName3 = name; break; }
            if (level === 2 && (name.includes("고등") || name.includes("지방"))) { result.courtName2 = name; if(name.includes("고등")) break; }
            if (level === 1 && !name.includes("고등") && !name.includes("대법원")) { result.courtName1 = name; break; }
        }

        const caseNoRegex = /(20\d{2})\s*([가-힣]{1,3})\s*(\d+)/;
        const caseMatch = text.match(caseNoRegex);
        if (caseMatch) {
            result['caseNo' + level] = caseMatch[1] + caseMatch[2] + caseMatch[3];
        }

        const feeRegexStart = /(?:착\s*수\s*금|착\s*수\s*보\s*수)[^0-9]*?금\s*([0-9,]+)\s*원/;
        const startMatch = text.match(feeRegexStart);
        if (startMatch) result['startFee' + level] = startMatch[1];

        const feeRegexSuccess = /(?:성\s*공\s*보\s*수|성\s*과\s*보\s*수)[^0-9]*?금\s*([0-9,]+)\s*원/;
        const successMatch = text.match(feeRegexSuccess);
        if (successMatch) result['successFee' + level] = successMatch[1];

        const sogaMatch = text.match(/(?:소\s*가|소송목적의\s*값)[^0-9]*([0-9,]+)/);
        if (sogaMatch) result['soga' + level] = sogaMatch[1];
    }

    if (categorizedText[1]) extractFromText(categorizedText[1], 1);
    if (categorizedText[2]) extractFromText(categorizedText[2], 2);
    if (categorizedText[3]) extractFromText(categorizedText[3], 3);
    
    if (!result.courtName1 && !result.courtName2 && !result.courtName3) {
        extractFromText(categorizedText.common, 1);
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

// --- 6. 신청인 확인 및 데이터 주입 ---
function confirmApplicantProcess(data) {
    let candidateAppName = data.contractClientName || "원고(미확인)";
    let candidateRespName = data.contractOpponentName || "피고(미확인)";

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
    if (selectionSide === 'plaintiff') { 
        finalAppName = leftName; finalRespName = rightName;
    } else { 
        finalAppName = rightName; finalRespName = leftName;
    }

    if(finalAppName && !finalAppName.includes("미확인")) setAndTrigger('applicantName', finalAppName);
    if(data.clientAddress && finalAppName === data.contractClientName) {
        setAndTrigger('applicantAddr', data.clientAddress);
    }
    if(finalRespName && !finalRespName.includes("미확인")) {
        document.getElementById('step3-area').classList.remove('hidden');
        document.getElementById('btnToCaseInfo').classList.remove('hidden');
        setAndTrigger('respondentName', finalRespName);
    }

    fillRemainingData(data);
    showManualInput();
    alert(`분석 완료!\n신청인: ${finalAppName}\n피신청인: ${finalRespName}\n1심, 2심, 3심 문서 분석이 반영되었습니다.`);
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