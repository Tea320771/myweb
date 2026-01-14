/* ==========================================
   1_intro_analysis.js
   - [UPDATE] 프롬프트 수정: 기존 지시사항 유지 + 금액 오인식 방지(7번) 및 상세 비용 분석(6번) 추가
   - [UPDATE] 외부 가이드라인(guideline.json) 연동 기능 추가
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
// [수정] 어디서든 접근 가능하도록 window 객체에 할당
window.queuedFiles = [];       
window.aiExtractedData = {};   

const pageOrder = ['introPage', 'caseInfoPage', 'calcPage', 'evidencePage', 'previewPage'];
const LOGIC_GUIDE_URL = 'guideline.json';       
const READING_GUIDE_URL = 'reading_guide.json';
/* ==========================================
   [추가됨] 드래그 앤 드롭 및 파일 처리 로직
   ========================================== */
function setupDragAndDrop() {
    const dropZone = document.getElementById('smartUploadZone');
    if (!dropZone) return;

    // 드래그 진입/이동
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        }, false);
    });

    // 드래그 나감/드롭
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        }, false);
    });

    // 드롭 이벤트 처리
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        queueFiles(files);
    }, false);
}

function queueFiles(files) {
    if (!files || files.length === 0) return;
    
    // [수정] window.queuedFiles에 추가
    for (let i = 0; i < files.length; i++) {
        window.queuedFiles.push(files[i]);
    }
    
    updateFileQueueUI();
}

function updateFileQueueUI() {
    const list = document.getElementById('file-queue-list');
    const actionArea = document.getElementById('action-area');
    const uploadContent = document.getElementById('upload-content');
    
    list.innerHTML = "";
    
    // [수정] window.queuedFiles 참조
    if (window.queuedFiles.length > 0) {
        list.classList.remove('hidden');
        actionArea.classList.remove('hidden');
        uploadContent.style.display = 'none'; 
    } else {
        list.classList.add('hidden');
        actionArea.classList.add('hidden');
        uploadContent.style.display = 'block';
    }

    window.queuedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-queue-item';
        item.innerHTML = `
            <div style="display:flex; align-items:center;">
                <span style="margin-right:8px;">📄</span>
                <span>${file.name} (${(file.size/1024).toFixed(1)} KB)</span>
            </div>
            <span class="remove-btn" onclick="removeFile(${index})" style="cursor:pointer; color:#ef4444; font-weight:bold; margin-left:10px;">✕</span>
        `;
        list.appendChild(item);
    });
}

function removeFile(index) {
    window.queuedFiles.splice(index, 1);
    updateFileQueueUI();
    // input value 초기화 (같은 파일 재업로드 가능하게)
    const input = document.getElementById('docInput');
    if(input) input.value = ''; 
}
/* ========================================== */

async function startAnalysis() {
    if (window.queuedFiles.length === 0) { alert("분석할 파일이 없습니다."); return; }
    
    // [추가] 분석 시작 시 모달 띄우기
    const loadingModal = document.getElementById('analysis-loading-modal');
    if(loadingModal) loadingModal.classList.remove('hidden');

    const actionArea = document.getElementById('action-area');
    const logsContainer = document.getElementById('processing-logs');
    
    actionArea.classList.add('hidden'); 
    logsContainer.style.display = 'block';
    logsContainer.innerHTML = `<div class="log-item log-info">AI 분석 엔진 및 지식 베이스(RAG) 로드 중...</div>`;

    try {
        let readingGuideStr = "";
        let logicGuideStr = "";
        let ragDataStr = ""; 

        try {
            // 1. 가이드라인 및 RAG 데이터 로드
            const [readingResp, logicResp, ragResp] = await Promise.all([
                fetch(READING_GUIDE_URL),
                fetch(LOGIC_GUIDE_URL),
                fetch('/api/get-rag-rules').catch(() => ({ ok: false })) 
            ]);

            if (readingResp.ok) readingGuideStr = JSON.stringify(await readingResp.json(), null, 2);
            if (logicResp.ok) logicGuideStr = JSON.stringify(await logicResp.json(), null, 2);
            
            if (ragResp && ragResp.ok) {
                const ragJson = await ragResp.json();
                ragDataStr = JSON.stringify(ragJson, null, 2);
                logsContainer.innerHTML += `<div class="log-item log-success">🧠 RAG 학습 데이터 로드 완료</div>`;
            } else {
                ragDataStr = "No specific RAG data found.";
            }

        } catch (e) {
            console.warn("데이터 로드 실패:", e);
        }

        let parts = [];
        
        // [핵심 수정] 프롬프트: RAG 데이터 우선순위 '절대적' 강제
        const systemPrompt = `
        너는 대한민국 법원의 '소송비용액 확정 신청'을 처리하는 AI다.
        제공된 판결문 이미지들을 분석하여 **최종 확정된 비용 부담 내용**을 JSON으로 출력하라.

        === [판단 기준 및 우선순위] ===
        1순위 (절대적): **[RAG Learned Data]** (사용자 피드백 및 유사 판례)
        2순위: **[Logic Guide]** (기본 해석 규칙)
        3순위: **[Reading Guide]** (단순 텍스트 추출)

        === [Step-by-Step 작업 지시] ===
        
        1. **[Reading]**: 판결문에서 텍스트(주문, 당사자, 사건번호)를 추출하라.
        
        2. **[RAG Check & Overwrite] (매우 중요)**:
           - [RAG Learned Data]에 이번 사건과 유사한 패턴(예: "상급심에서 취소됨", "피고가 전부 부담")이 있는지 확인하라.
           - **만약 RAG 데이터가 "피고 부담(reimburseRatio: 100)"이라고 결론 내렸다면, 문서에 뭐라고 적혀있든 무조건 RAG의 결론을 따라라.**
           - 특히 "1심 판결이 취소된 경우"에는 1심 주문 텍스트를 무시하고, **최종 확정된(2심/3심) 부담 비율**을 1심 데이터(burdenRatio1)에도 똑같이 적용하라.

        3. **[Calculation]**:
           - 피신청인(피고)의 'reimburseRatio'(상환 비율)를 계산하라.
           - 공식: (100 - 원고 부담 비율) = 피고 부담 비율.
           - 예: "소송비용은 피고가 부담한다" -> reimburseRatio: 100
           - 예: "소송비용 중 30%는 원고가 부담한다" -> reimburseRatio: 70

        === [Output Format] ===
        반드시 아래 JSON 구조를 엄격히 준수하라. (주석은 제거하고 출력)
        
        {
            "courtName1": "...",
            "caseNo1": "...",
            "soga1": 50000000, 
            
            // [중요] RAG가 '피고 부담'이라고 했다면 여기는 무조건 "100"이어야 함. "0" 금지.
            "burdenRatio1": "100", 
            "burdenRatio2": "100",

            "costRulingText1": "주문 텍스트 원문",
            
            "plaintiffs": [...],
            "defendants": [...],

            "costBurdenDetails1": [
                {
                    "name": "김삼남",
                    "role": "피신청인",
                    "internalShare": 100,
                    "reimburseRatio": 100  <-- 여기도 100 확인 필수
                }
            ]
        }

        ---
        [Reading Guide Data]
        ${readingGuideStr}

        [Logic Guide Data]
        ${logicGuideStr}

        [RAG Learned Data (High Priority)]
        ${ragDataStr}
        ---

        오직 JSON 형식의 텍스트만 응답하라.
        `;

        parts.push({ text: systemPrompt });

        for (let i = 0; i < window.queuedFiles.length; i++) {
            const file = window.queuedFiles[i];
            const base64Data = await fileToBase64(file);
            parts.push({
                inline_data: { mime_type: file.type, data: base64Data }
            });
        }
        
        logsContainer.innerHTML += `<div class="log-item log-info" style="font-weight:bold;">AI가 RAG 데이터를 최우선으로 적용하여 분석 중입니다...</div>`;
        
        // API 호출
        window.aiExtractedData = await callBackendFunction(parts);

        // [추가] 분석 성공 시 모달 숨김
        if(loadingModal) loadingModal.classList.add('hidden');

        logsContainer.innerHTML += `<div class="log-item log-success">✨ 분석 완료! (RAG 적용됨)</div>`;
        
        setTimeout(() => { startDataReview(window.aiExtractedData); }, 800);

    } catch (error) {
        // [추가] 에러 발생 시에도 모달 숨김
        if(loadingModal) loadingModal.classList.add('hidden');

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
        feeReviewQueue = data.ambiguousAmounts; 
        feeReviewIndex = 0;
        showFeeReviewModal();
    } else {
        showApplicantModal(data);
    }
}

function showFeeReviewModal() {
    if (feeReviewIndex >= feeReviewQueue.length) {
        document.getElementById('fee-check-modal').classList.add('hidden');
        showApplicantModal(window.aiExtractedData);
        return;
    }
    const currentItem = feeReviewQueue[feeReviewIndex];
    document.getElementById('fee-amount-display').innerText = currentItem.amount;
    document.getElementById('fee-check-modal').classList.remove('hidden');
}

function resolveFee(action) {
    if (action !== 'skip') {
        const currentItem = feeReviewQueue[feeReviewIndex];
        const data = window.aiExtractedData;
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

    fillRemainingData(window.aiExtractedData);
    
    // [유지] AI가 분석한 '주문 텍스트'와 '피신청인별 상세 비율'을 계산기 페이지로 전달
    if (typeof applyAIAnalysisToCalculator === 'function') {
        setTimeout(() => {
            applyAIAnalysisToCalculator(window.aiExtractedData);
        }, 200);
    }

    showManualInput();
    
    const countText = selectedResps.length > 0 ? `${selectedResps.length}명` : "0명";
    alert(`설정 완료!\n신청인: ${selectedApp ? selectedApp.name : '미선택'}\n피신청인: ${countText}이 설정되었습니다.`);
}

// [피신청인 입력칸 추가]
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

function removeRespondentRow(el) {
    el.closest('.respondent-row').remove();
    const rows = document.querySelectorAll('.respondent-row');
    rows.forEach((row, idx) => {
        row.querySelector('.resp-idx').innerText = idx + 1;
    });
    syncRespondentData();
}

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

    const nameInput = document.getElementById('respondentName');
    const addrInput = document.getElementById('respondentAddr');
    
    if(nameInput) nameInput.value = names.join('\n');
    if(addrInput) addrInput.value = addrs.join('\n');

    checkStep3(); 
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
    if(id === 'respondentName' || id === 'respondentAddr') return; 

    if(el && value) {
        // [수정] 금액 데이터(소가, 수수료)일 경우 숫자만 남기고 할당 후 포맷팅 함수 호출
        if (id.includes('soga') || id.includes('Fee')) {
            // "금 50,000,000원" 같은 텍스트에서 숫자만 추출
            const cleanVal = String(value).replace(/[^0-9]/g, ''); 
            el.value = cleanVal;
            
            // 3_calculator.js에 있는 formatCurrency가 전역에 있다면 호출하여 콤마(,) 적용
            if (typeof window.formatCurrency === 'function') {
                // id에서 숫자 추출 (예: soga1 -> 1)
                const instanceNum = id.replace(/[^0-9]/g, '');
                window.formatCurrency(el, instanceNum);
            }
        } else {
            el.value = value; 
        }

        el.classList.add('ai-filled'); 
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        
        // 키보드 이벤트도 트리거하여 formatCurrency나 calculateAll이 확실히 돌게 함
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

// [FIXED] 버튼 클릭 이벤트: DOMContentLoaded 내부에서 안전하게 바인딩
document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('btnToCaseInfo');
    if (btn) {
        btn.addEventListener('click', function() {
            // 1. 강제 화면 전환 (외부 함수 의존 제거)
            const intro = document.getElementById('introPage');
            const caseInfo = document.getElementById('caseInfoPage');

            if (intro) intro.style.display = 'none';
            if (caseInfo) {
                caseInfo.style.display = 'block';
                caseInfo.classList.remove('hidden');
                caseInfo.classList.add('fade-in-section');
            }
            window.scrollTo(0, 0);

            // 2. 2_case_info.js 초기화 함수 호출 (존재 시)
            if (typeof checkCaseInfoStep === 'function') {
                checkCaseInfoStep();
            } else if (typeof window.checkCaseInfoStep === 'function') {
                window.checkCaseInfoStep();
            }
        });
    }
});

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
/* ==========================================
   [추가] 1_intro_analysis.js 맨 아래에 붙여넣으세요
   ========================================== */

// 1. 피드백 입력창 띄우기
function openFeedbackModal(rulingText) {
    const feedback = prompt(
        "AI 분석이 틀렸나요?\n올바른 해석 방법을 문장으로 설명해주시면 AI가 즉시 학습합니다.\n\n" +
        "[예시]\n'피고 이을녀는 전부 패소했으니 비용도 100% 부담해야 해.'"
    );

    if (feedback) {
        processUserFeedback(rulingText, feedback);
    }
}

// 2. AI에게 규칙 생성 요청 -> 서버 저장 요청
async function processUserFeedback(rulingText, userExplanation) {
    const logsContainer = document.getElementById('processing-logs');
    if(logsContainer) {
        logsContainer.style.display = 'block';
        logsContainer.innerHTML += `<div class="log-item log-info">🧠 사용자 피드백을 학습 데이터로 변환 중...</div>`;
    }

    // 메타 프롬프트: Gemini에게 JSON 생성을 시킴
    const metaPrompt = `
    너는 'AI 학습 데이터 생성기'야. 
    사용자가 법률 문서(판결문 주문)에 대한 AI의 오분석을 지적했어.
    이 내용을 바탕으로 'guideline.json'에 추가할 규칙을 JSON으로 만들어.

    [상황]
    - 판결 주문: "${rulingText}"
    - 사용자 정답 논리: "${userExplanation}"

    [생성할 JSON 포맷]
    {
      "type": "user_feedback_rule",
      "description": "사용자 피드백 기반 규칙",
      "example_case": {
        "ruling_text": "${rulingText.substring(0, 50)}...",
        "logic": "${userExplanation}"
      },
      "step_by_step_reasoning": [
        "1단계: (사용자 논리 상세 분해)",
        "2단계: (사용자 논리 상세 분해)"
      ],
      "ideal_output_structure": {
         "note": "이와 유사한 패턴이 나오면 위 논리를 적용할 것"
      }
    }
    오직 JSON 객체 1개만 출력해.
    `;

    try {
        // 1) Gemini에게 규칙 생성 요청 (기존 함수 재사용)
        // 주의: callBackendFunction이 텍스트만 보낼 수 있도록 되어 있어야 합니다.
        // 만약 파일이 필수라면, 빈 이미지를 보내거나 callBackendFunction을 조금 수정해야 합니다.
        // 여기서는 기존 함수가 텍스트만으로도 동작한다고 가정합니다.
        const parts = [{ text: metaPrompt }];
        const newRuleJson = await callBackendFunction(parts); 

        console.log("생성된 규칙:", newRuleJson);
        
        // 2) Vercel 서버로 저장 요청
        await saveToGitHub(newRuleJson);
        
        if(logsContainer) logsContainer.innerHTML += `<div class="log-item log-success">✨ 학습 완료! 가이드라인이 업데이트되었습니다.</div>`;
        alert("감사합니다. AI가 새로운 규칙을 학습하여 저장소에 기록했습니다.");

    } catch (e) {
        console.error(e);
        alert("학습 처리 중 오류: " + e.message);
    }
}

// 3. Vercel API 호출 (실제 저장)
async function saveToGitHub(jsonRule) {
    const response = await fetch('/api/update-guideline', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newRule: jsonRule })
    });

    if (!response.ok) {
        throw new Error("서버 저장 실패");
    }
}

// 서버 API(/api/update-guideline)를 호출하여 JSON 저장
async function saveToGitHub(jsonRule) {
    const response = await fetch('/api/update-guideline', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newRule: jsonRule })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error("서버 저장 실패: " + errText);
    }
}

// [중요] 3_calculator.js 등 다른 스크립트에서 호출할 수 있도록 전역 객체(window)에 등록
window.saveToGitHub = saveToGitHub;
/* ==========================================
   [DEBUG] 디버그 모드 및 가이드라인 수정 기능
   - 분석 결과 확인 및 Extraction/Logic 오류 수정 요청
   - reading_guide.json / guideline.json 타겟 지정 학습
   ========================================== */

// 1. 디버그 UI 초기화 (DOM 로드 시 실행)
window.addEventListener('DOMContentLoaded', function() {
    createDebugUI();
});

// 1_intro_analysis.js 내부의 createDebugUI 함수를 이걸로 교체하세요.

function createDebugUI() {
    // 1-1. 디버그 플로팅 버튼 생성 (기존과 동일)
    const existingBtn = document.getElementById('debug-analysis-btn');
    if (existingBtn) existingBtn.remove(); // 중복 방지

    const debugBtn = document.createElement('button');
    debugBtn.id = 'debug-analysis-btn';
    debugBtn.innerHTML = '🐞 Debug Analysis';
    debugBtn.style.cssText = `
        position: fixed; bottom: 20px; left: 20px; z-index: 9999;
        background-color: #4b5563; color: white; border: none;
        padding: 10px 15px; border-radius: 30px; font-weight: bold;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3); cursor: pointer;
        font-size: 0.85rem; transition: transform 0.2s;
    `;
    debugBtn.onmouseover = () => debugBtn.style.transform = 'scale(1.05)';
    debugBtn.onmouseout = () => debugBtn.style.transform = 'scale(1)';
    debugBtn.onclick = openDebugModal;
    document.body.appendChild(debugBtn);

    // 1-2. 디버그 모달 생성 (UI 확장됨)
    const modalHtml = `
    <div id="debug-modal" class="modal hidden" style="z-index: 10000;">
        <div class="modal-content" style="max-width: 95%; width: 1000px; max-height: 95vh; overflow-y: auto; display:flex; flex-direction:column;">
            
            <div class="modal-header" style="background: #374151; color: white; display:flex; justify-content:space-between; align-items:center; padding: 15px;">
                <h3 style="margin:0;">🐞 AI 심층 디버깅 (Extraction & Logic Check)</h3>
                <button onclick="document.getElementById('debug-modal').classList.add('hidden')" style="background:none; border:none; color:white; font-size:1.5rem; cursor:pointer;">✕</button>
            </div>

            <div class="modal-body" style="padding: 20px; flex:1;">
                
                <div style="margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px;">
                    <label style="font-weight:bold; display:block; margin-bottom:5px; color:#1f2937;">🔍 현재 UI에 적용된 데이터 (window.aiExtractedData)</label>
                    <textarea id="debug-json-viewer" class="form-input" rows="6" readonly 
                        style="font-family: monospace; font-size: 0.85rem; background: #f3f4f6; color: #1f2937; border:1px solid #d1d5db;"></textarea>
                </div>
                
                <div style="background: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <h4 style="margin:0; color: #4f46e5;">⚖️ 논리 검증 (Logic Comparison)</h4>
                        <button onclick="runLogicComparison()" id="btn-run-debug" class="btn-start" style="margin:0; padding: 8px 16px; font-size: 0.9rem; background-color: #4f46e5;">
                            ▶️ 비교 분석 실행 (Baseline vs RAG)
                        </button>
                    </div>
                    <p style="font-size:0.85rem; color:#6b7280; margin-bottom:10px;">
                        서버의 최신 규칙(Guideline)과 RAG DB를 사용하여 문서를 다시 해석합니다. (약 5~10초 소요)
                    </p>

                    <div style="display:flex; gap: 15px;">
                        <div style="flex:1;">
                            <div style="font-weight:bold; color:#475569; margin-bottom:5px;">🧩 [Baseline] 규칙만 적용</div>
                            <div id="debug-baseline-result" style="height: 250px; overflow-y:auto; background:white; border:1px solid #cbd5e1; padding:10px; border-radius:4px; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; color:#334155;">(분석 실행 버튼을 눌러주세요)</div>
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:bold; color:#7c3aed; margin-bottom:5px;">🔮 [RAG Enhanced] 규칙 + DB 적용</div>
                            <div id="debug-rag-result" style="height: 250px; overflow-y:auto; background:#f5f3ff; border:1px solid #8b5cf6; padding:10px; border-radius:4px; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; color:#4c1d95;">(분석 실행 버튼을 눌러주세요)</div>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 20px; border-top: 2px solid #e5e7eb; padding-top: 20px;">
                    <h4 style="color: #dc2626; margin-bottom: 10px;">🚨 교정 및 학습 (Feedback)</h4>
                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                        <select id="debug-target-file" style="padding: 8px; border-radius: 4px; border: 1px solid #ccc; flex:1;">
                            <option value="rag_db">💾 RAG Database (해석 논리 저장)</option>
                            <option value="guideline.json">🧠 Logic Guide (계산 공식 수정)</option>
                            <option value="reading_guide.json">📂 Reading Guide (오타/추출 수정)</option>
                        </select>
                    </div>
                    <textarea id="debug-instruction" class="form-input" rows="3" 
                        placeholder="위 비교 결과를 보고, 올바른 해석 방법을 문장으로 적어주세요. (예: '이런 주문 패턴은 피고들이 연대하여 지급하는 것이므로 비율은 1/n이다.')"></textarea>
                    
                    <button onclick="submitDebugFeedback()" class="btn-start" style="margin-top: 10px; background-color: #dc2626; width: 100%;">
                        🛠️ 지침 적용 및 학습시키기
                    </button>
                </div>

            </div>
        </div>
    </div>
    `;
    
    // 기존 모달 제거 후 새로 추가
    const existingModal = document.getElementById('debug-modal');
    if (existingModal) existingModal.parentElement.remove();

    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div.firstElementChild);
}

// 2. 비교 분석 실행 함수 (다중 파일 지원 & 에러 핸들링 강화)
async function runLogicComparison() {
    // 1. 파일 확인
    if (!window.queuedFiles || window.queuedFiles.length === 0) {
        alert("업로드된 파일이 없습니다. 파일을 먼저 추가해주세요.");
        return;
    }

    const btn = document.getElementById('btn-run-debug');
    const baselineArea = document.getElementById('debug-baseline-result');
    const ragArea = document.getElementById('debug-rag-result');

    // 2. 로딩 UI 설정
    btn.disabled = true;
    btn.innerText = "⏳ 서버 분석 중... (최대 30초)";
    if(baselineArea) { baselineArea.innerText = "분석 요청 중..."; baselineArea.style.opacity = "0.5"; }
    if(ragArea) { ragArea.innerText = "분석 요청 중..."; ragArea.style.opacity = "0.5"; }

    try {
        // 3. [핵심] 모든 파일을 Base64로 변환하여 '배열'로 준비
        const filesPayload = await Promise.all(window.queuedFiles.map(async (file) => {
            const base64 = await fileToBase64(file);
            return {
                fileBase64: base64, // 백엔드가 기대하는 키 이름
                mimeType: file.type,
                fileName: file.name
            };
        }));

        console.log(`🚀 전송할 파일 수: ${filesPayload.length}개`);

        // 4. 백엔드 API 호출
        // [주의] rag-train.js가 배포된 실제 Vercel 주소를 입력하세요.
        // 예: "https://your-backend-project.vercel.app/api/rag-train"
        // 같은 프로젝트라면 "/api/rag-train" 사용 가능
        const BACKEND_URL = "https://legal-rag-system-five.vercel.app/api/rag-train"; 

        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                step: 'analyze',
                files: filesPayload, // [중요] 단일 파일 대신 배열 전송
                docType: 'judgment'  // 필요 시 UI에서 선택한 값으로 변경 가능
            })
        });

        // 5. 응답 처리
        const responseText = await response.text();

        if (!response.ok) {
            // 서버 에러 메시지 추출 (HTML일 경우 태그 제거)
            let errMsg = responseText;
            if (responseText.includes("<!DOCTYPE html>")) {
                errMsg = "서버 경로를 찾을 수 없거나(404) 내부 오류(500)가 발생했습니다.";
            }
            throw new Error(`서버 오류 (${response.status}): ${errMsg.substring(0, 100)}...`);
        }

        const result = JSON.parse(responseText);

        if (!result.success) throw new Error(result.error || "분석에 실패했습니다.");

        // 6. 결과 표시
        const formatJSON = (data) => {
             if (typeof data === 'string') return data;
             return JSON.stringify(data, null, 2);
        };

        if(baselineArea) baselineArea.innerText = formatJSON(result.data.analysis_baseline);
        if(ragArea) ragArea.innerText = formatJSON(result.data.analysis_rag);

    } catch (e) {
        console.error("Debug Error:", e);
        if(baselineArea) baselineArea.innerText = "❌ 오류 발생:\n" + e.message;
        if(ragArea) ragArea.innerText = "❌ 오류 발생:\n" + e.message;
    } finally {
        // UI 복구
        btn.disabled = false;
        btn.innerText = "▶️ 비교 분석 실행 (Baseline vs RAG)";
        if(baselineArea) baselineArea.style.opacity = "1";
        if(ragArea) ragArea.style.opacity = "1";
    }
}

// 3. 디버그 모달 열기 (기존 함수 교체)
function openDebugModal() {
    // 1. 현재 데이터 표시
    const jsonViewer = document.getElementById('debug-json-viewer');
    const data = window.aiExtractedData || { message: "아직 분석된 데이터가 없습니다." };
    jsonViewer.value = JSON.stringify(data, null, 2);

    // 2. [추가됨] 비교 분석 결과창 초기화 (창을 열 때마다 깨끗하게 비워줌)
    const baselineArea = document.getElementById('debug-baseline-result');
    const ragArea = document.getElementById('debug-rag-result');
    
    // 요소가 존재할 때만 초기화 (에러 방지)
    if (baselineArea) {
        baselineArea.innerText = "(분석 실행 버튼을 눌러주세요)";
        baselineArea.style.opacity = "1";
    }
    if (ragArea) {
        ragArea.innerText = "(분석 실행 버튼을 눌러주세요)";
        ragArea.style.opacity = "1";
    }

    // 4. 모달 보여주기
    document.getElementById('debug-modal').classList.remove('hidden');
}

// 5. 디버그 피드백 제출 및 AI 처리
async function submitDebugFeedback() {
    const targetFile = document.getElementById('debug-target-file').value;
    const instruction = document.getElementById('debug-instruction').value; // 사용자의 수정 지시
    const currentData = document.getElementById('debug-json-viewer').value; // 현재 분석된 전체 데이터

    if (!instruction.trim()) { alert("수정할 내용을 입력하세요."); return; }

    document.getElementById('debug-modal').classList.add('hidden');
    
    // 로그 UI 표시
    const logsContainer = document.getElementById('processing-logs');
    if (logsContainer) {
        logsContainer.style.display = 'block';
        logsContainer.innerHTML += `<div class="log-item log-info">🧠 피드백 분석 및 저장소 업데이트 중... (${targetFile})</div>`;
    }

    try {
        // [CASE 1] RAG 데이터베이스 업데이트 (신규 기능)
        if (targetFile === 'rag_db') {
            // 1. Gemini에게 사용자의 모호한 말을 "검색 가능한 상황(Context)"과 "명확한 논리(Logic)"로 정리시킴
            const metaPrompt = `
            역할: RAG 데이터 생성기.
            목표: 사용자의 피드백을 분석하여 'Vector DB'에 저장할 핵심 정보를 추출하라.
            
            [입력 데이터]
            - 전체 분석 결과 중 일부: ${currentData.substring(0, 500)}...
            - 사용자 지적 사항: "${instruction}"
            
            [지시사항]
            사용자가 지적한 문제는 특정 문구(주문 내용 등)를 잘못 해석한 것이다.
            1. 'trigger_text': 향후 AI가 유사한 상황을 만났을 때 검색할 수 있는 '핵심 문구'나 '상황 요약'을 추출해라.
            2. 'logic_rule': 그 상황에서 적용해야 할 올바른 '해석 논리'를 한 문장으로 정리해라.

            [출력 포맷 - JSON Only]
            {
                "trigger_text": "피고들이 연대하여 금 500원을 지급하라",
                "logic_rule": "연대 지급 문구가 있으면 분담 비율을 1:1(균등)로 계산한다."
            }
            `;
            
            const parts = [{ text: metaPrompt }];
            const extracted = await callBackendFunction(parts); // Gemini가 정리한 JSON 받기
            
            console.log("[RAG] 추출된 학습 데이터:", extracted);

            // 2. 정리된 데이터를 RAG 저장 API로 전송
            const response = await fetch('/api/update-rag', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    textToEmbed: extracted.trigger_text, // 이 문장이 벡터화되어 검색 키가 됨
                    logicToStore: extracted.logic_rule   // 이 논리가 검색 결과로 나옴
                })
            });

            if (!response.ok) throw new Error(await response.text());
            
            alert(`[RAG 저장 완료]\n유사한 판례가 나오면 다음 논리를 참고합니다:\n"${extracted.logic_rule}"`);

        } 
        // [CASE 2] 기존 JSON 파일(guideline.json 등) 업데이트
        else {
            let metaPrompt = "";
            if (targetFile === 'reading_guide.json') {
                metaPrompt = `
                역할: OCR 추출 규칙 생성기. 목표: 'reading_guide.json' 수정용 JSON 생성.
                상황: ${currentData.substring(0, 200)}...
                사용자 지시: "${instruction}"
                출력: {"type": "reading_correction", "new_strategy": { ... }} 형태의 JSON 1개.
                `;
            } else {
                metaPrompt = `
                역할: 법률 논리 규칙 생성기. 목표: 'guideline.json' 수정용 JSON 생성.
                상황: ${currentData.substring(0, 200)}...
                사용자 지시: "${instruction}"
                출력: {"type": "logic_correction", "action": "..." } 형태의 JSON 1개.
                `;
            }

            const parts = [{ text: metaPrompt }];
            const newRuleJson = await callBackendFunction(parts);
            await saveToGitHub(newRuleJson, targetFile); // 기존 함수 재사용
            alert(`[파일 업데이트 완료] ${targetFile}에 규칙이 추가되었습니다.`);
        }

        if (logsContainer) logsContainer.innerHTML += `<div class="log-item log-success">✅ 학습 완료!</div>`;

    } catch (e) {
        console.error(e);
        alert("업데이트 실패: " + e.message);
        if (logsContainer) logsContainer.innerHTML += `<div class="log-item log-error">❌ 실패: ${e.message}</div>`;
    }
}

// 4. 특정 파일(guideline.json 또는 reading_guide.json)에 저장 요청
async function saveToSpecificFile(jsonRule, filename) {
    // 기존 api/update-guideline을 활용하되, targetFile 파라미터를 추가 전송
    // (Backend에서 targetFile을 처리하도록 구현되어 있다고 가정하거나, 
    //  기존 로직이 newRule만 받더라도 최소한 기존 기능은 수행됨)
    const response = await fetch('/api/update-guideline', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            newRule: jsonRule,
            targetFile: filename // 서버 사이드에서 이 값을 보고 분기 처리 필요
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error("서버 저장 실패: " + errText);
    }
}
// ==========================================
// [NEW] 뒤로가기 버튼 기능 (전역 함수)
// ==========================================

// 1. 뒤로가기 실행 함수
window.goBackStep = function() {
    const pages = ['introPage', 'caseInfoPage', 'calcPage', 'evidencePage', 'previewPage'];
    let visibleIndex = -1;

    // 현재 보이는 페이지 찾기
    for (let i = 0; i < pages.length; i++) {
        const el = document.getElementById(pages[i]);
        if (el && !el.classList.contains('hidden') && el.style.display !== 'none') {
            visibleIndex = i;
            break;
        }
    }

    // 첫 페이지(introPage)거나 페이지를 못 찾으면 중단
    if (visibleIndex <= 0) return;

    // 현재 페이지 숨기고, 이전 페이지 보이기
    const currentId = pages[visibleIndex];
    const prevId = pages[visibleIndex - 1];

    document.getElementById(currentId).classList.add('hidden');
    
    const prevEl = document.getElementById(prevId);
    if (prevEl) {
        prevEl.classList.remove('hidden');
        prevEl.classList.add('fade-in-section');
        
        // 만약 이전 페이지가 '계산기'라면 비율 UI 등이 깨지지 않게 flex 설정 강제
        if (prevId === 'calcPage') prevEl.style.display = 'block';
    }

    // 스크롤 최상단으로 이동
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 버튼 상태 업데이트 (Intro로 돌아가면 버튼 숨김)
    updateBackButtonVisibility();
};

// 2. 버튼 보이기/숨기기 관리 함수
window.updateBackButtonVisibility = function() {
    const btn = document.getElementById('globalBackBtn');
    const intro = document.getElementById('introPage');
    if (!btn) return;

    // Intro 페이지가 보이면 버튼 숨김, 아니면 보임
    if (intro && !intro.classList.contains('hidden') && intro.style.display !== 'none') {
        btn.classList.remove('visible'); // 스타일 클래스로 제어
    } else {
        btn.classList.add('visible');
    }
};