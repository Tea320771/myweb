/* ==========================================
   1_intro_analysis.js
   - [UPDATE] 피신청인 개별 입력 UI(동적 카드) 구현
   - [UPDATE] 수동 추가/삭제 및 데이터 동기화(Sync) 기능 추가
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

// 이체내역 검토를 위한 상태 변수
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
    logsContainer.innerHTML = `<div class="log-item log-info">AI 분석 엔진(Gemini) 준비 중...</div>`;

    try {
        let parts = [];
        
const systemPrompt = `
        너는 유능한 법률 사무원이야. 제공된 법률 문서 이미지(판결문, 이체내역 등)를 분석해서 소송비용확정신청에 필요한 정보를 JSON 포맷으로 추출해줘.

        [분석 지침]
        1. **심급 추론**: 파일명에 '1심', '2심' 등이 있으면 해당 심급으로 처리해라.
           
        2. **당사자 개별 추출 (매우 중요)**:
           - 원고와 피고가 여러 명일 수 있다. 뭉뚱그려 "김갑동 외 1"로 하지 말고, **모든 사람의 이름과 주소를 각각 추출해라.**
           - 'plaintiffs' 배열과 'defendants' 배열에 각각 객체 { "name": "...", "addr": "..." } 형태로 담아라.
           - 주소가 없으면 "주소 미상"이라고 적어라.
        
        3. **총 당사자 수 계산**: 'totalPartyCount'에 원고 수 + 피고 수를 담아라.

        4. **판결선고일, 소가**: 각 심급별로 정확히 추출해라.
        
        5. **법원명 표준화**: '제xx민사부' 등은 제거해라.

        6. **소송비용 부담 비율 및 주문 텍스트 (상세 분석)**: 
           - 주문을 보고 패소자가 부담할 비율(문자열)을 'burdenRatio'에 추출해라.
           - **[추가]** 소송비용 부담에 관한 **주문 문장 전체**를 'costRulingText'에 담아라.
           - **[추가]** 피고(피신청인)가 여러 명일 경우, 주문을 해석하여 각 피고별 **'내부 분담 비율(internalShare, 숫자)'**과 **'신청인에게 상환해야 할 비율(reimburseRatio, 문자열)'**을 분석해 'costBurdenDetails' 배열에 담아라.
           - (예: "피고 A는 50% 부담, 피고 B는 나머지" -> A: internal 50, B: internal 50)

        [JSON 구조]
        {
          "plaintiffs": [ { "name": "김갑동", "addr": "서울..." }, { "name": "이을녀", "addr": "..." } ],
          "defendants": [ { "name": "김삼남", "addr": "..." }, ... ],
          "totalPartyCount": 5, 
          
          "courtName1": "...", "caseNo1": "...", "rulingDate1": "...", "startFee1": "...", "successFee1": "...", "soga1": "...", 
          "burdenRatio1": "100", 
          "costRulingText1": "소송비용 중 원고와 피고 김삼남 사이에 생긴 부분은...", 
          "costBurdenDetails1": [ { "name": "김삼남", "internalShare": 75, "reimburseRatio": "3/4" } ],

          "courtName2": "...", "caseNo2": "...", "rulingDate2": "...", "startFee2": "...", "successFee2": "...", 
          "burdenRatio2": "100",
          "costRulingText2": "...",
          "costBurdenDetails2": [],

          "courtName3": "...", "caseNo3": "...", "rulingDate3": "...", "startFee3": "...", "successFee3": "...", 
          "burdenRatio3": "100",
          "costRulingText3": "...",
          "costBurdenDetails3": [],

          "ambiguousAmounts": [ {"amount": "금액", "level": "추정심급"} ]
        }
        반드시 JSON 형식의 텍스트만 응답해.
        `;

        parts.push({ text: systemPrompt });

        for (let i = 0; i < queuedFiles.length; i++) {
            const file = queuedFiles[i];
            logsContainer.innerHTML += `<div class="log-item log-info">📂 파일 읽는 중... (${file.name})</div>`;
            const base64Data = await fileToBase64(file);
            parts.push({ text: `[파일정보: ${file.name}]` });
            parts.push({
                inline_data: { mime_type: file.type, data: base64Data }
            });
        }
        
        logsContainer.innerHTML += `<div class="log-item log-info" style="font-weight:bold;">🤖 Google Gemini가 문서를 분석 중입니다...</div>`;
        logsContainer.scrollTop = logsContainer.scrollHeight;

        aiExtractedData = await callBackendFunction(parts);

        logsContainer.innerHTML += `<div class="log-item log-success" style="font-weight:bold;">✨ AI 분석 완료! 결과 확인</div>`;
        
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
        throw new Error(errorData.error || `서버 통신 오류 (${response.status})`);
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

// --- 5. 데이터 검토 ---
function startDataReview(data) {
    if (data.ambiguousAmounts && data.ambiguousAmounts.length > 0) {
        // ... (이체내역 모달 로직 생략, 기존 유지) ...
        feeReviewQueue = data.ambiguousAmounts; // 간소화
        feeReviewIndex = 0;
        showFeeReviewModal();
    } else {
        showApplicantModal(data);
    }
}

function showFeeReviewModal() {
    if (feeReviewIndex >= feeReviewQueue.length) {
        document.getElementById('fee-check-modal').classList.add('hidden');
        showApplicantModal(aiExtractedData);
        return;
    }
    const currentItem = feeReviewQueue[feeReviewIndex];
    document.getElementById('fee-amount-display').innerText = currentItem.amount;
    document.getElementById('fee-check-modal').classList.remove('hidden');
}

function resolveFee(action) {
    if (action !== 'skip') {
        const currentItem = feeReviewQueue[feeReviewIndex];
        const data = aiExtractedData;
        let selectedLevel = '1';
        const radios = document.getElementsByName('feeLevel');
        for(let r of radios) { if(r.checked) { selectedLevel = r.value; break; } }
        
        if (action === 'start') data['startFee' + selectedLevel] = currentItem.amount;
        else if (action === 'success') data['successFee' + selectedLevel] = currentItem.amount;
    }
    feeReviewIndex++;
    showFeeReviewModal();
}

// --- 6. 당사자 선택 로직 ---
function showApplicantModal(data) {
    const appListContainer = document.getElementById('applicant-list-container');
    const respListContainer = document.getElementById('respondent-list-container');
    
    appListContainer.innerHTML = "";
    respListContainer.innerHTML = "";

    // 원고 목록
    if (data.plaintiffs && Array.isArray(data.plaintiffs)) {
        data.plaintiffs.forEach((p, idx) => {
            const wrapper = document.createElement('div');
            wrapper.style.marginBottom = "8px";
            wrapper.innerHTML = `
                <label style="display:flex; align-items:center; cursor:pointer;">
                    <input type="radio" name="selectedApplicant" value='${JSON.stringify({role:'plaintiff', ...p})}' ${idx===0 ? 'checked' : ''} style="margin-right:8px;">
                    <div><div style="font-weight:bold;">[원고] ${p.name}</div><div style="font-size:0.8em; color:#666;">${p.addr}</div></div>
                </label>`;
            appListContainer.appendChild(wrapper.cloneNode(true));
            
            const wrapperChk = document.createElement('div');
            wrapperChk.style.marginBottom = "8px";
            wrapperChk.innerHTML = `
                <label style="display:flex; align-items:center; cursor:pointer;">
                    <input type="checkbox" name="selectedRespondent" value='${JSON.stringify({role:'plaintiff', ...p})}' style="margin-right:8px;">
                    <div><div style="font-weight:bold;">[원고] ${p.name}</div></div>
                </label>`;
            respListContainer.appendChild(wrapperChk);
        });
    }

    // 피고 목록
    if (data.defendants && Array.isArray(data.defendants)) {
        data.defendants.forEach((d, idx) => {
            const wrapper = document.createElement('div');
            wrapper.style.marginBottom = "8px";
            wrapper.innerHTML = `
                <label style="display:flex; align-items:center; cursor:pointer;">
                    <input type="radio" name="selectedApplicant" value='${JSON.stringify({role:'defendant', ...d})}' style="margin-right:8px;">
                    <div><div style="font-weight:bold;">[피고] ${d.name}</div><div style="font-size:0.8em; color:#666;">${d.addr}</div></div>
                </label>`;
            appListContainer.appendChild(wrapper);

            const wrapperChk = document.createElement('div');
            wrapperChk.style.marginBottom = "8px";
            wrapperChk.innerHTML = `
                <label style="display:flex; align-items:center; cursor:pointer;">
                    <input type="checkbox" name="selectedRespondent" value='${JSON.stringify({role:'defendant', ...d})}' checked style="margin-right:8px;">
                    <div><div style="font-weight:bold;">[피고] ${d.name}</div><div style="font-size:0.8em; color:#666;">${d.addr}</div></div>
                </label>`;
            respListContainer.appendChild(wrapperChk);
        });
    }
    
    document.getElementById('applicant-selection-modal').classList.remove('hidden');
}

// [핵심] 선택 완료 시 호출됨
function confirmPartySelection() {
    document.getElementById('applicant-selection-modal').classList.add('hidden');
    
    // 신청인 (1명)
    const appRadios = document.getElementsByName('selectedApplicant');
    let selectedApp = null;
    for(let r of appRadios) { if(r.checked) { selectedApp = JSON.parse(r.value); break; } }

    // 피신청인 (다수)
    const respCheckboxes = document.getElementsByName('selectedRespondent');
    let selectedResps = [];
    for(let c of respCheckboxes) { if(c.checked) { selectedResps.push(JSON.parse(c.value)); } }

    if(selectedApp) {
        selectedResps = selectedResps.filter(r => r.name !== selectedApp.name); // 본인 제외
        setAndTrigger('applicantName', selectedApp.name);
        setAndTrigger('applicantAddr', selectedApp.addr || "주소 미상");
    }

    // [피신청인 동적 생성 로직]
    if(selectedResps.length > 0) {
        document.getElementById('step3-area').classList.remove('hidden');
        document.getElementById('btnToCaseInfo').classList.remove('hidden');
        
        const container = document.getElementById('respondent-dynamic-list');
        container.innerHTML = ""; // 기존 목록 초기화
        
        // 체크된 사람 수만큼 입력칸 생성
        selectedResps.forEach(r => {
            addRespondentInput(r.name, r.addr || "주소 미상");
        });
    } else {
        document.getElementById('step3-area').classList.remove('hidden');
        addRespondentInput(); // 최소 1개는 생성
    }

fillRemainingData(aiExtractedData);
    
    // [추가] AI가 분석한 '주문 텍스트'와 '피신청인별 상세 비율'을 계산기 페이지로 전달
    if (typeof applyAIAnalysisToCalculator === 'function') {
        // UI가 그려질 시간을 확보하기 위해 약간의 지연 후 실행
        setTimeout(() => {
            applyAIAnalysisToCalculator(aiExtractedData);
        }, 200);
    }

    showManualInput();
    
    const countText = selectedResps.length > 0 ? `${selectedResps.length}명` : "0명";
    // ... (이후 alert 등 기존 코드 유지)
    alert(`설정 완료!\n신청인: ${selectedApp ? selectedApp.name : '미선택'}\n피신청인: ${countText}이 설정되었습니다.`);
}

// [NEW] 피신청인 입력칸(카드) 추가 함수
function addRespondentInput(nameVal = '', addrVal = '') {
    const container = document.getElementById('respondent-dynamic-list');
    const count = container.children.length + 1;
    
    const div = document.createElement('div');
    div.className = 'respondent-row';
    div.style.cssText = "background:#f9fafb; padding:15px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:10px; position:relative;";
    
    const deleteBtn = `<span onclick="removeRespondentRow(this)" style="color:#ef4444; cursor:pointer; font-size:0.85rem; font-weight:bold;">[삭제]</span>`;

    div.innerHTML = `
        <div style="font-weight:bold; color:#4b5563; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>피신청인 <span class="resp-idx">${count}</span></span>
            ${deleteBtn}
        </div>
        <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label" style="font-size:0.85rem;">이름 <span style="color:red">*</span></label>
            <input type="text" class="form-input resp-name-input" value="${nameVal}" placeholder="이름 입력" oninput="syncRespondentData()">
        </div>
        <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="font-size:0.85rem;">주소 <span style="color:red">*</span></label>
            <input type="text" class="form-input resp-addr-input" value="${addrVal}" placeholder="주소 입력" oninput="syncRespondentData()">
        </div>
    `;
    container.appendChild(div);
    syncRespondentData();
}

// [NEW] 피신청인 삭제 함수
function removeRespondentRow(el) {
    el.closest('.respondent-row').remove();
    // 번호 재정렬
    const rows = document.querySelectorAll('.respondent-row');
    rows.forEach((row, idx) => {
        row.querySelector('.resp-idx').innerText = idx + 1;
    });
    syncRespondentData();
}

// [NEW] 동적 입력 데이터를 숨겨진 필드로 동기화 (기존 로직 호환용)
function syncRespondentData() {
    const names = [];
    const addrs = [];
    const rows = document.querySelectorAll('.respondent-row');
    
    rows.forEach((row, idx) => {
        const nameVal = row.querySelector('.resp-name-input').value.trim();
        const addrVal = row.querySelector('.resp-addr-input').value.trim();
        
        if (rows.length === 1) {
            names.push(nameVal);
            addrs.push(addrVal);
        } else {
            names.push(`${idx+1}. ${nameVal}`);
            addrs.push(`${idx+1}. ${addrVal}`);
        }
    });

    // 숨겨진 필드 업데이트 -> 계산기/미리보기에서 이 값을 참조함
    const nameInput = document.getElementById('respondentName');
    const addrInput = document.getElementById('respondentAddr');
    
    if(nameInput) nameInput.value = names.join('\n');
    if(addrInput) addrInput.value = addrs.join('\n');

    checkStep3(); // 다음 단계 버튼 활성화 체크
}

function fillRemainingData(data) {
    if(data.caseNo2 || data.courtName2 || data.startFee2) document.getElementById('case-step-2').classList.remove('hidden');
    if(data.caseNo3 || data.courtName3 || data.startFee3) document.getElementById('case-step-3').classList.remove('hidden');

    if(data.courtName1) setAndTrigger('courtName1', data.courtName1);
    if(data.caseNo1) setAndTrigger('caseNo1', data.caseNo1);
    if(data.rulingDate1) setAndTrigger('date1', data.rulingDate1);
    if(data.soga1) setAndTrigger('soga1', data.soga1);
    if(data.startFee1) setAndTrigger('startFee1', data.startFee1);
    if(data.successFee1) setAndTrigger('successFee1', data.successFee1);
    if(data.burdenRatio1) setAndTrigger('ratio1', data.burdenRatio1);

    if(data.courtName2) setAndTrigger('courtName2', data.courtName2);
    if(data.caseNo2) setAndTrigger('caseNo2', data.caseNo2);
    if(data.rulingDate2) setAndTrigger('date2', data.rulingDate2);
    if(data.soga2) setAndTrigger('soga2', data.soga2);
    if(data.startFee2) setAndTrigger('startFee2', data.startFee2);
    if(data.successFee2) setAndTrigger('successFee2', data.successFee2);
    if(data.burdenRatio2) setAndTrigger('ratio2', data.burdenRatio2);

    if(data.courtName3) setAndTrigger('courtName3', data.courtName3);
    else if(data.caseNo3) setAndTrigger('courtName3', '대법원'); 
    
    if(data.caseNo3) setAndTrigger('caseNo3', data.caseNo3);
    if(data.rulingDate3) setAndTrigger('date3', data.rulingDate3);
    if(data.startFee3) setAndTrigger('startFee3', data.startFee3);
    if(data.successFee3) setAndTrigger('successFee3', data.successFee3);
    if(data.burdenRatio3) setAndTrigger('ratio3', data.burdenRatio3);

    if (data.totalPartyCount && data.totalPartyCount > 0) setAndTrigger('partyCount', data.totalPartyCount);
}

function setAndTrigger(id, value) {
    const el = document.getElementById(id);
    if(id === 'respondentName' || id === 'respondentAddr') return; // 동적 필드는 별도 처리

    if(el && value) {
        el.value = value; 
        el.classList.add('ai-filled'); 
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (id.includes('Fee') || id.includes('soga') || id.includes('ratio') || id === 'partyCount') {
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
    
    // 수동 모드로 처음 열릴 때 피신청인 칸이 없으면 1개 생성
    const list = document.getElementById('respondent-dynamic-list');
    if(list && list.children.length === 0) {
        addRespondentInput();
    }
}

// 이벤트 리스너들
const appName = document.getElementById('applicantName');
const appAddr = document.getElementById('applicantAddr');
const step2Area = document.getElementById('step2-area');
const repName = document.getElementById('repName');
const repAddr = document.getElementById('repAddr');
const noRepCheck = document.getElementById('noRepresentative');
const step3Area = document.getElementById('step3-area');
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
        if (step3Area.classList.contains('hidden')) { 
            step3Area.classList.remove('hidden'); 
            step3Area.classList.add('fade-in-section'); 
            const list = document.getElementById('respondent-dynamic-list');
            if(list && list.children.length === 0) addRespondentInput();
        }
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
    const rows = document.querySelectorAll('.respondent-row');
    let isValid = false;
    if(rows.length > 0) {
        const firstRow = rows[0];
        const name = firstRow.querySelector('.resp-name-input').value.trim();
        const addr = firstRow.querySelector('.resp-addr-input').value.trim();
        if(name !== "" && addr !== "") isValid = true;
    }
    if (isValid) {
        if (btnToCaseInfo.classList.contains('hidden')) { btnToCaseInfo.classList.remove('hidden'); btnToCaseInfo.classList.add('fade-in-section'); }
    }
}