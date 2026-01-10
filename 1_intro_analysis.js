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
let queuedFiles = [];       
let aiExtractedData = {};   
const pageOrder = ['introPage', 'caseInfoPage', 'calcPage', 'evidencePage', 'previewPage'];
const LOGIC_GUIDE_URL = 'guideline.json';       // 해석/논리 지침
const READING_GUIDE_URL = 'reading_guide.json'; // 추출/읽기/포맷 지침
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
    
    // 파일 배열에 추가
    for (let i = 0; i < files.length; i++) {
        queuedFiles.push(files[i]);
    }
    
    updateFileQueueUI();
}

function updateFileQueueUI() {
    const list = document.getElementById('file-queue-list');
    const actionArea = document.getElementById('action-area');
    const uploadContent = document.getElementById('upload-content');
    
    list.innerHTML = "";
    
    if (queuedFiles.length > 0) {
        list.classList.remove('hidden');
        actionArea.classList.remove('hidden');
        uploadContent.style.display = 'none'; 
    } else {
        list.classList.add('hidden');
        actionArea.classList.add('hidden');
        uploadContent.style.display = 'block';
    }

    queuedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-queue-item';
        // 스타일은 style.css에 정의된 것을 따름
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
    queuedFiles.splice(index, 1);
    updateFileQueueUI();
    // input value 초기화 (같은 파일 재업로드 가능하게)
    const input = document.getElementById('docInput');
    if(input) input.value = ''; 
}
/* ========================================== */
async function startAnalysis() {
    if (queuedFiles.length === 0) { alert("분석할 파일이 없습니다."); return; }
    
    const actionArea = document.getElementById('action-area');
    const logsContainer = document.getElementById('processing-logs');
    
    actionArea.classList.add('hidden'); 
    logsContainer.style.display = 'block';
    logsContainer.innerHTML = `<div class="log-item log-info">AI 분석 엔진 준비 중...</div>`;

    try {
        // [수정] 두 개의 가이드라인 파일을 로드
        let readingGuideStr = "";
        let logicGuideStr = "";
        
        try {
            logsContainer.innerHTML += `<div class="log-item log-info">📚 분석 지침(Reading & Logic) 불러오는 중...</div>`;
            
            const [readingResp, logicResp] = await Promise.all([
                fetch(READING_GUIDE_URL),
                fetch(LOGIC_GUIDE_URL)
            ]);

            if (readingResp.ok) {
                const rJson = await readingResp.json();
                readingGuideStr = JSON.stringify(rJson, null, 2);
            }
            if (logicResp.ok) {
                const lJson = await logicResp.json();
                logicGuideStr = JSON.stringify(lJson, null, 2);
            }

            logsContainer.innerHTML += `<div class="log-item log-success">✅ 가이드라인 로드 완료</div>`;
        } catch (e) {
            console.warn("가이드라인 로드 중 일부 실패(기본값으로 진행):", e);
        }

        let parts = [];
        
        // [최종 수정] 프롬프트 개선: reading_guide.json의 특정 필드(rules, strategies)를 강제로 따르도록 지시 강화
        const systemPrompt = `
        너는 유능한 법률 사무원이야. 제공된 법률 문서 이미지(판결문, 이체내역 등)를 분석해서 소송비용확정신청에 필요한 정보를 JSON 포맷으로 추출해야 해.
        
        작업은 반드시 아래 [STEP 1] -> [STEP 2] -> [STEP 3] 순서로 진행해라.

        === [STEP 1: 문서 읽기 및 텍스트 추출 (Reading Phase)] ===
        아래 제공된 **'Reading Guide Data'** 내부의 **"basic_extraction_rules"**와 **"strategies"**를 철저히 준수하여 데이터를 추출해라.
        1. **"basic_extraction_rules"**에 따라 원고/피고 전원의 이름과 주소, 심급 정보 등을 빠짐없이 추출해라.
        2. **"strategies"** 항목을 참조하여, 문서 내 줄바꿈이나 노이즈가 있더라도 **'주문 텍스트(costRulingText)'**를 완벽한 문장으로 복원해라.
        
        [Reading Guide Data]
        ${readingGuideStr}

        === [STEP 2: 데이터 해석 및 논리 적용 (Logic Phase)] ===
        위에서 추출한 텍스트(특히 costRulingText)를 바탕으로, 아래 **'Logic Guide Data'**의 논리를 적용하여 '내부 분담 비율(internalShare)'과 '상환 비율(reimburseRatio)'을 계산해라.
        
        [Logic Guide Data]
        ${logicGuideStr}

        === [STEP 3: 최종 출력] ===
        위 'Reading Guide Data'에 명시된 **"output_format_guide"**의 JSON 구조를 엄격히 준수하여 결과를 출력해라.
        오직 JSON 형식의 텍스트만 응답해.
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
        
        logsContainer.innerHTML += `<div class="log-item log-info" style="font-weight:bold;">AI가 문서를 분석 중입니다...</div>`;
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
    
    // [유지] AI가 분석한 '주문 텍스트'와 '피신청인별 상세 비율'을 계산기 페이지로 전달
    if (typeof applyAIAnalysisToCalculator === 'function') {
        setTimeout(() => {
            applyAIAnalysisToCalculator(aiExtractedData);
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

// [추가된 Fix] 버튼 클릭 시 페이지 전환 이벤트 추가
if(btnToCaseInfo) {
    btnToCaseInfo.addEventListener('click', function() {
        // [수정] 2_case_info.js에 정의된 전환 함수 호출 (로직 연동)
        if (typeof goToCaseInfo === 'function') {
            goToCaseInfo();
        } else {
            document.getElementById('introPage').classList.add('hidden');
            document.getElementById('caseInfoPage').classList.remove('hidden');
            window.scrollTo(0, 0);
        }
    });
}

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
/* ==========================================
   [NEW] AI 학습(피드백) 및 가이드라인 업데이트 로직
   (1_intro_analysis.js 파일의 맨 마지막에 붙여넣으세요)
   ========================================== */

// 1. 피드백 입력창 띄우기 (3_calculator.js에서 호출됨)
function openFeedbackModal(rulingText) {
    // 텍스트가 너무 길면 앞부분만 잘라서 보여줌
    const shortText = rulingText.length > 50 ? rulingText.substring(0, 50) + "..." : rulingText;
    
    const feedback = prompt(
        `[AI 학습시키기]\n판결문 주문: "${shortText}"\n\nAI가 이 주문을 어떻게 해석했어야 하나요?\n(예: "피고 이을녀는 청구가 기각되었으니 비용을 100% 부담해야 해")`
    );

    if (feedback && feedback.trim() !== "") {
        processUserFeedback(rulingText, feedback);
    }
}

// 2. AI에게 '사용자 피드백'을 'JSON 규칙'으로 변환 요청 -> 서버 저장 요청
async function processUserFeedback(rulingText, userExplanation) {
    const logsContainer = document.getElementById('processing-logs');
    
    // 로그 UI가 보이지 않는 경우(계산기 화면 등)를 대비해 알림 표시
    const isLogVisible = logsContainer && logsContainer.offsetParent !== null;
    if (isLogVisible) {
        logsContainer.innerHTML += `<div class="log-item log-info">🧠 사용자 피드백을 학습 데이터로 변환 중...</div>`;
        logsContainer.scrollTop = logsContainer.scrollHeight;
    } else {
        alert("AI가 새로운 규칙을 학습하고 있습니다... 잠시만 기다려주세요.");
    }

    // [메타 프롬프트] Gemini에게 '판결문'과 '사용자 해석'을 주고 'JSON 규칙'을 만들라고 지시
    const metaPrompt = `
    역할: 너는 법률 AI 학습 데이터 생성기다.
    목표: 사용자가 제공한 '판결문 주문'과 '올바른 해석 논리'를 바탕으로, 시스템이 앞으로 참고할 'guideline.json' 규칙 객체를 생성하라.

    [입력 데이터]
    1. 판결 주문 텍스트: "${rulingText}"
    2. 사용자의 정답 논리: "${userExplanation}"

    [생성해야 할 JSON 포맷]
    {
      "type": "user_feedback_rule",
      "description": "사용자 피드백에 기반한 동적 생성 규칙",
      "example_case": {
        "ruling_text": "${rulingText.replace(/"/g, "'").substring(0, 80)}...", 
        "user_logic": "${userExplanation.replace(/"/g, "'")}"
      },
      "step_by_step_reasoning": [
        "1단계: [주문 분석] 주문 텍스트 내의 키워드(예: '각자 부담', '4분의 1' 등)를 식별한다.",
        "2단계: [사용자 논리 적용] '${userExplanation}'의 논리에 따라, 특정 피고의 내부 분담 비율이나 상환 비율을 도출한다.",
        "3단계: [결론 도출] 따라서 해당 피고의 비용 부담 비율을 확정한다."
      ],
      "ideal_output_structure": {
         "note": "향후 유사한 주문 패턴(키워드 포함)이 발견되면 위 논리를 우선 적용할 것."
      }
    }

    제약사항:
    - 오직 유효한 JSON 객체 1개만 출력할 것.
    - 마크다운(backticks) 없이 순수 텍스트로 출력할 것.
    `;

    try {
        // 기존 callBackendFunction 재사용 (텍스트만 전송)
        const parts = [{ text: metaPrompt }];
        const newRuleJson = await callBackendFunction(parts); 

        console.log("[AI 학습] 생성된 새 규칙:", newRuleJson);
        
        // 생성된 규칙을 GitHub(또는 DB)에 저장
        await saveToGitHub(newRuleJson);
        
        if (isLogVisible) {
            logsContainer.innerHTML += `<div class="log-item log-success">✨ 학습 완료! 가이드라인이 업데이트되었습니다.</div>`;
        }
        alert("학습 완료!\nAI가 당신의 가르침을 저장소(guideline.json)에 기록했습니다.\n다음 분석부터는 이 규칙이 적용됩니다.");

    } catch (e) {
        console.error(e);
        const errorMsg = "학습 처리 중 오류가 발생했습니다: " + e.message;
        if (isLogVisible) logsContainer.innerHTML += `<div class="log-item log-error">❌ ${errorMsg}</div>`;
        else alert(errorMsg);
    }
}

// 3. 서버 API(/api/update-guideline)를 호출하여 JSON 저장
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
window.openFeedbackModal = openFeedbackModal;
window.processUserFeedback = processUserFeedback;
window.saveToGitHub = saveToGitHub;