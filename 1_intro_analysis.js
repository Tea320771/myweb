/* ==========================================
   1_intro_analysis.js
   - 기본 설정, 네비게이션, 파일 업로드
   - [UPDATE] OCR.space 제거 -> Google Gemini Vision API 직접 연동
   ========================================== */

// ✅ 사용자가 제공한 Google Gemini API Key 적용
const GEMINI_API_KEY = 'AIzaSyADC1J9RIykkSDbEa4iccPA28-AF04NX7w'; 

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

// --- [핵심] 4. 파일 변환 및 Gemini API 호출 로직 ---
async function startAnalysis() {
    if (queuedFiles.length === 0) { alert("분석할 파일이 없습니다."); return; }
    
    const actionArea = document.getElementById('action-area');
    const logsContainer = document.getElementById('processing-logs');
    
    actionArea.classList.add('hidden'); 
    logsContainer.style.display = 'block';
    logsContainer.innerHTML = `<div class="log-item log-info">AI 분석 엔진(Gemini) 준비 중...</div>`;

    try {
        // AI에게 보낼 데이터 배열 (프롬프트 + 이미지/PDF 데이터)
        let parts = [];
        
        // 시스템 프롬프트 설정
        const systemPrompt = `
        너는 유능한 법률 사무원이야. 제공된 법률 문서 이미지(판결문, 사건위임계약서, 이체내역)들을 종합적으로 분석해서 소송비용확정신청에 필요한 정보를 JSON 포맷으로 추출해줘.
        
        [분석 원칙]
        1. **우선순위:** 정보가 충돌하면 '판결문' > '사건위임계약서' > '이체내역' 순서로 신뢰해라.
        2. **당사자 파악:** 판결문의 당사자 표시(원고, 피고)와 주소를 정확히 찾아라. 주소가 흩어져 있어도 문맥을 보고 합쳐라.
        3. **비용 부담자(승패소):** 판결문 '주문'을 분석하여 소송비용 부담자를 파악하고, 비용을 받는 승소자(권리자)를 'winnerSide'('plaintiff' 또는 'defendant')에 명시해라.
           - 예: "소송비용은 원고가 부담한다" -> 승소자는 피고(defendant)
        4. **판결선고일:** 판결문의 '선고일' 또는 '판결선고' 날짜를 찾아라. (예: 2024. 10. 10.)
        5. **금전 분석:** '법무법인' 등에 송금된 내역 중 착수금/성공보수로 추정되는 금액을 찾아라.
           - 심급(1,2,3심)을 문서 내용으로 추정할 수 있으면 할당하고, 모르면 'ambiguousAmounts'에 넣어라.
        
        [추출할 JSON 필드]
        {
          "plaintiffName": "원고 이름",
          "plaintiffAddr": "원고 주소 (도로명 주소 등)",
          "defendantName": "피고 이름",
          "defendantAddr": "피고 주소 (도로명 주소 등)",
          "winnerSide": "plaintiff" 또는 "defendant",
          
          "courtName1": "1심 법원명", "caseNo1": "1심 사건번호", "rulingDate1": "1심 선고일(YYYY. MM. DD.)",
          "courtName2": "2심 법원명", "caseNo2": "2심 사건번호", "rulingDate2": "2심 선고일",
          "courtName3": "3심 법원명", "caseNo3": "3심 사건번호", "rulingDate3": "3심 선고일",
          
          "startFee1": "1심 착수금(숫자만)", "successFee1": "1심 성공보수(숫자만)",
          "startFee2": "2심 착수금", "successFee2": "2심 성공보수",
          "startFee3": "3심 착수금", "successFee3": "3심 성공보수",
          "soga1": "소가(숫자만)",
          
          "ambiguousAmounts": [ {"amount": "금액", "level": "추정심급(없으면 common)"} ]
        }
        
        반드시 JSON 형식의 텍스트만 응답해줘. 코드블록(\`\`\`) 없이 순수 JSON만 반환해.
        `;

        parts.push({ text: systemPrompt });

        // 파일들을 Base64로 변환하여 parts에 추가
        for (let i = 0; i < queuedFiles.length; i++) {
            const file = queuedFiles[i];
            logsContainer.innerHTML += `<div class="log-item log-info">📂 파일 읽는 중... (${file.name})</div>`;
            
            const base64Data = await fileToBase64(file);
            const mimeType = file.type;
            
            // Gemini API 포맷에 맞춰 데이터 추가
            parts.push({
                inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                }
            });
        }
        
        logsContainer.innerHTML += `<div class="log-item log-info" style="font-weight:bold;">🤖 Google Gemini가 문서를 분석 중입니다...</div>`;
        logsContainer.scrollTop = logsContainer.scrollHeight;

        // Gemini API 호출
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: parts }] })
        });

        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error.message || "Gemini API 오류 발생");
        }
        
        if (!result.candidates || result.candidates.length === 0) {
            throw new Error("AI 분석 결과가 없습니다.");
        }

        // 결과 파싱
        let rawText = result.candidates[0].content.parts[0].text;
        // JSON 마크다운 제거
        rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        console.log("Gemini Raw Response:", rawText); // 디버깅용

        try {
            aiExtractedData = JSON.parse(rawText);
        } catch (e) {
            console.error("JSON Parsing Error:", e);
            throw new Error("AI 응답을 처리하는 데 실패했습니다.");
        }

        logsContainer.innerHTML += `<div class="log-item log-success" style="font-weight:bold;">✨ AI 분석 완료! 결과 확인</div>`;
        setTimeout(() => { confirmApplicantProcess(aiExtractedData); }, 800);

    } catch (error) {
        console.error(error);
        logsContainer.innerHTML += `<div class="log-item log-error">❌ 오류: ${error.message}</div>`;
        alert("분석 중 오류가 발생했습니다.\n" + error.message);
        actionArea.classList.remove('hidden');
    }
}

// Helper: 파일을 Base64 문자열로 변환 (헤더 제거)
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            // "data:image/png;base64,..." 형식을 "..." 부분만 추출
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = (error) => reject(error);
    });
}

// --- 6. 신청인 확인 및 데이터 주입 (AI 데이터 반영) ---
function confirmApplicantProcess(data) {
    processAmbiguousFees(data);

    let extractedPlaintiff = data.plaintiffName || "원고(미확인)";
    let extractedDefendant = data.defendantName || "피고(미확인)";
    
    document.getElementById('modal-plaintiff-name').innerText = extractedPlaintiff; 
    document.getElementById('modal-defendant-name').innerText = extractedDefendant;
    
    if (data.winnerSide) {
        console.log(`AI 분석 결과: 승소자는 ${data.winnerSide} 입니다.`);
    }

    document.getElementById('applicant-selection-modal').classList.remove('hidden');
}

function processAmbiguousFees(data) {
    if (!data.ambiguousAmounts || data.ambiguousAmounts.length === 0) return;
    let handledAmounts = [];
    data.ambiguousAmounts.forEach(item => {
        if (handledAmounts.includes(item.amount)) return;
        let assigned = false;
        const amt = item.amount;
        const levelText = (item.level !== 'common') ? `${item.level}심` : "심급 미상";

        if (item.level !== 'common' && data['startFee' + item.level]) return;

        if (item.level !== 'common') {
            if (confirm(`[AI 분석]\n금액 '${amt}원'이 발견되었습니다 (${levelText} 추정).\n이 금액을 '${item.level}심 착수금'으로 입력하시겠습니까?`)) {
                data['startFee' + item.level] = amt;
                assigned = true;
            }
        } else {
            if (!data.startFee1 && confirm(`금액 '${amt}원'을 '1심 착수금'으로 설정할까요?`)) { data.startFee1 = amt; }
            else if (!data.startFee2 && confirm(`금액 '${amt}원'을 '2심 착수금'으로 설정할까요?`)) { data.startFee2 = amt; }
            else if (!data.startFee3 && confirm(`금액 '${amt}원'을 '3심 착수금'으로 설정할까요?`)) { data.startFee3 = amt; }
        }
        handledAmounts.push(amt);
    });
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
    
    // AI가 추출한 정확한 주소 사용
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