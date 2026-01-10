/* ==========================================
   3_calculator.js
   - [FIX] 파일 끝 문법 오류(중괄호 중복) 수정
   - [UPDATE] 피신청인별 '내부 분담 비율' 및 '상환 비율' 개별 제어 (슬라이더 지원)
   - [UPDATE] 판결문 텍스트 기반 자동 비율 파싱 및 적용
   ========================================== */

// 전역 변수: 피신청인별 비율 설정 상태 저장
let respondentRatioState = {
    1: [], // 1심: [{internal: 50, external: "1/2"}, ...]
    2: [], // 2심
    3: []  // 3심
};

function goToCalculator() {
    const appName = document.getElementById('applicantName');
    const repName = document.getElementById('repName');
    const noRepCheck = document.getElementById('noRepresentative');
    const respName = document.getElementById('respondentName');

    const appNameVal = appName.value.trim() || "입력안함";
    let repNameVal = repName.value.trim();
    if(noRepCheck.checked) repNameVal = "없음 (본인 소송)"; else if (!repNameVal) repNameVal = "입력안함";
    const respNameVal = respName.value.trim() || "입력안함";
    document.getElementById('dispAppName').innerText = appNameVal;
    document.getElementById('dispRepName').innerText = repNameVal;
    document.getElementById('dispRespName').innerText = respNameVal;

    const maxLevel = (typeof getMaxInstanceLevel === 'function') ? getMaxInstanceLevel() : 3;
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
        
        // [NEW] 진입 시 피신청인 비율 UI 초기화
        initRatioUIs();
    });
}

const familyCases = { "가류": ["혼인 무효", "이혼 무효", "인지 무효", "친생자관계존부확인", "입양 무효", "파양 무효"], "나류": ["사실상혼인관계존부확인", "혼인 취소", "이혼 취소", "재판상 이혼", "부의 결정", "친생부인", "인지 취소", "인지에 대한 이의", "인지청구", "입양 취소", "파양 취소", "재판상 파양", "친양자 입양 취소", "친양자 파양"], "다류": ["약혼해제/사실혼파기 손해배상", "혼인/이혼 무효/취소 손해배상", "입양/파양 무효/취소 손해배상", "재산분할 관련 사해행위 취소"], "마류": ["재산분할", "상속재산분할"] };
let currentFamilyCategory = "";
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
    calculateAll();
}
function updateNextCardVisibility() {
    const maxLevel = (typeof getMaxInstanceLevel === 'function') ? getMaxInstanceLevel() : 3; 
    const card1 = document.getElementById('card-1'); card1.classList.remove('card-hidden'); card1.style.display = 'flex';
    const card2 = document.getElementById('card-2');
    let showCard2 = false;
    if (maxLevel >= 2) showCard2 = true; 
    if (showCard2) {
        if (card2.style.display !== 'flex') { card2.classList.remove('card-hidden'); card2.style.display = 'flex'; card2.classList.add('fade-in'); }
    } else { card2.style.display = 'none'; card2.classList.add('card-hidden'); }
    const card3 = document.getElementById('card-3');
    if (maxLevel >= 3) {
        card3.classList.remove('card-hidden'); card3.style.display = 'flex';
    } else {
        card3.classList.add('card-hidden'); card3.style.display = 'none';
    }
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

// ==========================================
// [NEW] 동적 비율 UI 관리 및 파싱 로직
// ==========================================

function getRespondentNames() {
    const nameVal = document.getElementById('respondentName').value;
    if (!nameVal) return ["피신청인"];
    // 번호 제거 (예: "1. 홍길동" -> "홍길동")
    const lines = nameVal.split('\n').filter(line => line.trim() !== "");
    return lines.map(l => l.replace(/^\d+[\.\)]\s*/, '').trim());
}

// 각 심급 카드에 비율 설정 UI 생성
function initRatioUIs() {
    for (let i = 1; i <= 3; i++) {
        createRatioUIForCard(i);
    }
}

function createRatioUIForCard(instanceIdx) {
    const card = document.getElementById('card-' + instanceIdx);
    if (!card) return;

    // 기존의 단순 비율 입력칸 숨기기 (또는 제거)
    const oldRatioDiv = document.getElementById('ratio' + instanceIdx)?.closest('.input-group');
    if(oldRatioDiv) oldRatioDiv.style.display = 'none';

    // 비율 설정 컨테이너 찾기 또는 생성
    let container = document.getElementById(`ratio-settings-container-${instanceIdx}`);
    if (!container) {
        container = document.createElement('div');
        container.id = `ratio-settings-container-${instanceIdx}`;
        container.className = 'ratio-settings-box';
        // 소가 입력칸 바로 아래, 옵션 체크박스 위에 삽입
        const sogaContainer = document.getElementById(`soga-container-${instanceIdx}`);
        const optionsContainer = sogaContainer.querySelector('.options-container');
        sogaContainer.insertBefore(container, optionsContainer);
    }

    // 피신청인 목록 기반 UI 렌더링
    const names = getRespondentNames();
    const count = names.length;
    let html = `
        <div style="margin-bottom:10px;">
            <label style="font-weight:bold; color:#1d4ed8; display:block; margin-bottom:5px;">
                피신청인별 분담 비율 설정 (주문 내용 반영)
            </label>
            <textarea id="rulingText${instanceIdx}" class="form-input" rows="2" 
                placeholder="여기에 판결문 주문(소송비용 부분)을 붙여넣으면 비율이 자동 설정됩니다."
                style="font-size:0.85rem; padding:8px; margin-bottom:5px;"></textarea>
            <button class="btn-manual-trigger" onclick="autoParseRuling(${instanceIdx})" style="width:100%; padding:5px; font-size:0.8rem;">
                🪄 텍스트로 비율 자동 설정하기
            </button>
        </div>
    `;

    names.forEach((name, idx) => {
        // 기존 상태가 있으면 유지, 없으면 초기값 (내부 1/N, 외부 100%)
        const defaultInternal = Math.floor(100 / count);
        // 마지막 사람은 나머지 채우기
        const internalVal = (idx === count - 1) ? (100 - (defaultInternal * (count - 1))) : defaultInternal;
        
        html += `
            <div class="respondent-ratio-row" data-idx="${idx}" style="background:#f8fafc; padding:10px; border-radius:6px; margin-bottom:8px; border:1px solid #e2e8f0;">
                <div style="font-weight:bold; margin-bottom:5px;">${name}</div>
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:5px;">
                    <div style="flex:1;">
                        <label style="font-size:0.75rem; color:#64748b;">내부 분담 (${name}의 몫)</label>
                        <div style="display:flex; align-items:center; gap:5px;">
                            <input type="range" min="0" max="100" value="${internalVal}" 
                                class="internal-slider" id="slider-${instanceIdx}-${idx}" 
                                oninput="syncSliderInput(${instanceIdx}, ${idx}, this.value)" style="flex:1;">
                            <input type="number" min="0" max="100" value="${internalVal}" 
                                class="internal-input form-input" id="val-${instanceIdx}-${idx}" 
                                onchange="syncSliderInput(${instanceIdx}, ${idx}, this.value)" style="width:50px; text-align:center; padding:2px;">
                            <span style="%">%</span>
                        </div>
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:0.75rem; color:#64748b;">상환 비율 (신청인에게 줄 %)</label>
                        <input type="text" class="external-ratio form-input" id="ext-${instanceIdx}-${idx}" 
                            value="100" placeholder="예: 100, 1/2" onkeyup="calculateAll()"
                            style="padding:4px; text-align:center;">
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 슬라이더와 숫자 입력 동기화
function syncSliderInput(instanceIdx, respIdx, value) {
    document.getElementById(`slider-${instanceIdx}-${respIdx}`).value = value;
    document.getElementById(`val-${instanceIdx}-${respIdx}`).value = value;
    calculateAll();
}

// [핵심] 판결문 텍스트 자동 파싱 함수
function autoParseRuling(instanceIdx) {
    const text = document.getElementById(`rulingText${instanceIdx}`).value;
    if (!text.trim()) { alert("분석할 판결문 내용을 입력해주세요."); return; }

    const names = getRespondentNames();
    const appName = document.getElementById('applicantName').value.trim() || "원고";
    
    // 파싱 결과 저장소
    let internalShares = new Array(names.length).fill(null); // 내부 분담
    let externalRatios = new Array(names.length).fill("100"); // 상환 비율

    // 1. 기본 전략: "각자"라는 단어가 있으면 내부 분담은 1/N, 상환은 개별 파싱
    // 예: "나머지 피고들은 원고에게... 각자 부담한다"
    
    // 2. 개별 파싱 시도
    // 텍스트 예시: "원고 김갑동과 피고 김삼남 사이는 ... 피고 김삼남 3/4 부담"
    // 전략: 피신청인 이름이 문장에 등장할 때 근처의 비율(숫자 또는 분수)을 찾음
    
    names.forEach((name, idx) => {
        // 이름 뒤 20글자 이내에 비율이 있는지 확인
        const regex = new RegExp(`${name}[^0-9]*([0-9]+(?:\\/[0-9]+|%|분의\\s*[0-9]+))`, "g");
        const match = regex.exec(text); // 이름 + 비율 매칭
        
        // 문맥 분석: "피고 김삼남은... 부담한다" vs "원고가... 부담한다"
        // 신청인이 원고(갑)이고, 텍스트가 "원고가 1/4 부담"이면 -> 피고(을)은 3/4 부담해야 함.
        // 신청인이 피고(을)이고, 텍스트가 "원고가 1/4 부담"이면 -> 피고(을)은 원고에게 1/4 받을 수 있음.

        // 여기서는 단순화하여, 피신청인 이름 옆에 있는 비율을 '상환 비율'로 우선 인식
        if (match) {
            let ratioStr = match[1];
            // "3분의 1" -> "1/3" 변환 등은 parseRatio가 처리
            externalRatios[idx] = ratioStr;
        } else {
            // 이름 옆에 비율이 없으면? 
            // "나머지 피고들에 대한... 원고들이 각자 부담" -> 피신청인(피고)가 부담할 게 없음(0%)
            // "소송비용은 피고들이 부담" -> 100%
            if (text.includes("원고들이 각자 부담") || text.includes("원고가 부담")) {
                if (appName.includes("원고")) externalRatios[idx] = "0"; // 원고가 신청인인데 원고부담이면 받을게 없음
            } else if (text.includes("피고들이 부담") || text.includes("피고가 부담")) {
                 if (!appName.includes("피고")) externalRatios[idx] = "100";
            }
        }
    });

    // 3. 내부 분담 비율 (Internal Shares) 추정
    // 특별히 "피고 A는 30%, 피고 B는 70%"라고 명시되지 않는 한 균등(1/N)으로 설정
    // 만약 텍스트에 "피고 A와 피고 B는 3:7로 부담" 같은 게 있다면 파싱해야 함 (고급 기능)
    // 현재는 균등 분할로 리셋
    const equalShare = Math.floor(100 / names.length);
    internalShares = internalShares.map((_, i) => (i === names.length-1) ? (100 - equalShare*(names.length-1)) : equalShare);

    // UI 반영
    names.forEach((_, idx) => {
        syncSliderInput(instanceIdx, idx, internalShares[idx]);
        document.getElementById(`ext-${instanceIdx}-${idx}`).value = externalRatios[idx];
    });

    alert("판결문 내용을 바탕으로 비율을 설정했습니다.\n정확한 계산을 위해 값을 확인해주세요.");
    calculateAll();
}

function parseRatio(ratioStr) {
    if(!ratioStr) return 0; // 빈 값이면 0 처리 (기존 1.0에서 변경)
    let s = ratioStr.toString().trim();
    if (s === "100" || s === "100%") return 1.0;
    
    // "4분의 1"
    const koreanFraction = s.match(/(\d+)\s*분\s*의\s*(\d+)/);
    if (koreanFraction) {
        const den = parseFloat(koreanFraction[1]); 
        const num = parseFloat(koreanFraction[2]); 
        return (den !== 0) ? num / den : 0;
    }
    // "1/4"
    if(s.includes('/')) {
        const parts = s.split('/');
        if(parts.length >= 2) {
            const numStr = parts[0].match(/(\d+)/);
            const denStr = parts[1].match(/(\d+)/);
            if(numStr && denStr) {
                const den = parseFloat(denStr[0]);
                return (den !== 0) ? parseFloat(numStr[0]) / den : 0;
            }
        }
    }
    // "%" 또는 소수
    const val = parseFloat(s.replace(/[^0-9.]/g, ''));
    if(!isNaN(val)) {
        if(val > 1.0 && val <= 100.0) return val / 100.0; 
        if(val <= 1.0 && val >= 0) return val;
    }
    return 1.0; // 파싱 실패시 기본 100% 가정 (또는 0)
}

function calculateAll() {
    const caseType = document.getElementById('caseType').value;
    if (!caseType) return;
    updateNextCardVisibility();
    
    let partyCount = parseInt(document.getElementById('partyCount').value);
    if(isNaN(partyCount) || partyCount < 2) partyCount = 2; 

    const respondentNames = getRespondentNames();
    const respondentCount = respondentNames.length;
    let respondentTotals = new Array(respondentCount).fill(0);

    let totalLawyer = 0; let totalScrivener = 0; let totalCourt = 0;

    for (let i = 1; i <= 3; i++) {
        const cardEl = document.getElementById('card-' + i);
        if (i > 1 && (!cardEl || cardEl.classList.contains('card-hidden') || cardEl.style.display === 'none')) continue; 
        
        // 1. 전체 인정 비용 계산 (기존 로직)
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
        
        totalLawyer += recognizedFee; 
        totalScrivener += sFee; 
        totalCourt += (stamp + service);

        // 2. [UPDATE] 피신청인별 분담액 정밀 계산
        // 공식: 전체비용 * (내부분담% / 100) * 상환비율
        const instanceTotal = recognizedFee + sFee + stamp + service;

        for(let k=0; k<respondentCount; k++) {
            // UI에서 값 가져오기
            const internalVal = parseFloat(document.getElementById(`val-${i}-${k}`)?.value || 0);
            const externalStr = document.getElementById(`ext-${i}-${k}`)?.value || "100";
            const externalRatio = parseRatio(externalStr);

            // 내부분담액 (전체 비용 중 이 사람이 책임져야 할 몫)
            // 예: 전체 1000만원 중 피고A의 몫이 50%라면 500만원
            const myShare = instanceTotal * (internalVal / 100.0);
            
            // 상환액 (내부분담액 중 신청인에게 줘야 할 비율)
            // 예: 피고A가 500만원 책임인데, 판결에서 3/4만 부담하라고 했으면 375만원
            const myPayment = Math.floor(myShare * externalRatio);

            respondentTotals[k] += myPayment;
        }
    }
    
    // 3. 결과 출력
    const grandTotalVal = respondentTotals.reduce((a, b) => a + b, 0);
    document.getElementById('grandTotal').innerText = grandTotalVal.toLocaleString() + " 원";
    
    document.getElementById('totalLawyer').innerText = totalLawyer.toLocaleString();
    document.getElementById('totalScrivener').innerText = totalScrivener.toLocaleString();
    document.getElementById('totalCourt').innerText = totalCourt.toLocaleString();
    
    displayRespondentBreakdown(respondentNames, respondentTotals);
    checkCalculatorCompletion(); 
}

function displayRespondentBreakdown(names, totals) {
    const totalSection = document.querySelector('.total-section');
    const oldBreakdown = document.getElementById('respondent-breakdown-list');
    if(oldBreakdown) oldBreakdown.remove();

    if (names.length < 1) return; 

    const container = document.createElement('div');
    container.id = 'respondent-breakdown-list';
    container.style.marginTop = "15px";
    container.style.paddingTop = "15px";
    container.style.borderTop = "1px dashed #cbd5e1";
    container.style.width = "100%";

    let html = `<div style="font-size:0.9rem; font-weight:bold; color:#4b5563; margin-bottom:10px;">[피신청인별 청구 내역]</div>`;
    
    names.forEach((name, idx) => {
        let cleanName = name.replace(/^\d+[\.\)]\s*/, '');
        let amount = totals[idx] || 0;
        html += `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.95rem;">
                <span>${cleanName}</span>
                <span style="font-weight:bold; color:var(--color-lawyer);">${amount.toLocaleString()} 원</span>
            </div>
        `;
    });
    container.innerHTML = html;
    
    const breakdownDiv = document.querySelector('.breakdown');
    totalSection.insertBefore(container, breakdownDiv);
}

function checkCalculatorCompletion() {
    const btn = document.getElementById('btnToEvidence');
    let isAnyCardComplete = false;
    for(let i=1; i<=3; i++) {
        const card = document.getElementById('card-' + i);
        if(card && !card.classList.contains('card-hidden') && card.style.display !== 'none') {
            const startVal = document.getElementById('startFee' + i).value;
            const successVal = document.getElementById('successFee' + i).value;
            const sogaVal = document.getElementById('soga' + i).value;
            if(startVal !== "" && successVal !== "" && sogaVal !== "") {
                isAnyCardComplete = true; break; 
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
    
    let txt1_withdraw = "소취하"; 
    let txt2_title = "2심 (항소심)";
    let txt2_party = "항소인일 경우 체크";
    let txt2_withdraw = "항소취하";
    let txt3_title = "3심 (상고심)";
    let txt3_party = "상고인일 경우 체크";
    let txt3_withdraw = "상고취하";

    if (caseType === 'civil_app') {
         txt1_withdraw = "심문기일 중/후 신청취하"; 
         txt2_title = "2심 (항고심)";
         txt2_party = "항고인일 경우 체크";
         txt2_withdraw = "항고 취하"; 
         txt3_title = "3심 (재항고심)";
         txt3_party = "재항고인일 경우 체크";
         txt3_withdraw = "재항고 취하"; 
    }
    const lblW1 = document.querySelector('#withdraw1 + span'); if(lblW1) lblW1.innerText = txt1_withdraw;
    const elInst2 = document.getElementById('txt-inst-2'); if(elInst2) elInst2.innerText = txt2_title;
    const lblApp2 = document.querySelector('#isAppellant2 + span'); if(lblApp2) lblApp2.innerText = txt2_party;
    const lblW2 = document.querySelector('#withdraw2 + span'); if(lblW2) lblW2.innerText = txt2_withdraw;
    const elInst3 = document.getElementById('txt-inst-3'); if(elInst3) elInst3.innerText = txt3_title;
    const lblPet3 = document.querySelector('#isPetitioner3 + span'); if(lblPet3) lblPet3.innerText = txt3_party;
    const lblW3 = document.querySelector('#withdraw3 + span'); if(lblW3) lblW3.innerText = txt3_withdraw;

    if (caseType) { mainContent.classList.remove('hidden'); mainContent.classList.add('fade-in-section'); calculateAll(); }
/* ==========================================
   [추가됨] AI 데이터 연동 및 동적 비율 UI 관리 로직
   ========================================== */

// 1. 피신청인 이름 목록 가져오기
function getRespondentNames() {
    const nameVal = document.getElementById('respondentName').value;
    if (!nameVal) return ["피신청인"];
    return nameVal.split('\n').filter(l => l.trim() !== "").map(l => l.replace(/^\d+[\.\)]\s*/, '').trim());
}

// 2. AI 분석 데이터 적용 (1_intro_analysis.js에서 호출)
function applyAIAnalysisToCalculator(data) {
    initRatioUIs(); // UI 강제 생성

    for (let i = 1; i <= 3; i++) {
        const rulingText = data['costRulingText' + i]; // 프롬프트에서 요청한 필드명
        const details = data['costBurdenDetails' + i]; // 프롬프트에서 요청한 배열

        if (rulingText) {
            const textArea = document.getElementById(`rulingText${i}`);
            if (textArea) textArea.value = rulingText;
        }

        if (details && Array.isArray(details)) {
            const currentNames = getRespondentNames();
            currentNames.forEach((name, idx) => {
                // 이름 매칭 (부분 일치)
                const matchedItem = details.find(d => name.includes(d.name) || d.name.includes(name));
                if (matchedItem) {
                    if (matchedItem.internalShare !== undefined) syncSliderInput(i, idx, matchedItem.internalShare);
                    if (matchedItem.reimburseRatio !== undefined) document.getElementById(`ext-${i}-${idx}`).value = matchedItem.reimburseRatio;
                }
            });
        }
    }
    calculateAll();
}

// 3. 비율 UI 생성 (슬라이더 + 입력창 + 텍스트영역)
function initRatioUIs() {
    for (let i = 1; i <= 3; i++) createRatioUIForCard(i);
}

function createRatioUIForCard(instanceIdx) {
    const card = document.getElementById('card-' + instanceIdx);
    if (!card) return;

    // 기존 비율 입력칸 숨김 (중복 방지)
    const oldRatioDiv = document.getElementById('ratio' + instanceIdx)?.closest('.input-group');
    if(oldRatioDiv) oldRatioDiv.style.display = 'none';

    let container = document.getElementById(`ratio-settings-container-${instanceIdx}`);
    if (!container) {
        container = document.createElement('div');
        container.id = `ratio-settings-container-${instanceIdx}`;
        container.style.marginTop = "15px";
        container.style.padding = "10px";
        container.style.border = "1px solid #e5e7eb";
        container.style.borderRadius = "8px";
        container.style.backgroundColor = "#fff";

        // 소가 입력칸 아래에 삽입
        const sogaContainer = document.getElementById(`soga-container-${instanceIdx}`);
        const optionsContainer = sogaContainer.querySelector('.options-container');
        sogaContainer.insertBefore(container, optionsContainer);
    } else {
        if(container.innerHTML.trim() !== "") return; // 이미 있으면 패스
    }

    const names = getRespondentNames();
    const count = names.length;

    let html = `
        <div style="margin-bottom:10px;">
            <label style="font-weight:bold; color:#1d4ed8; font-size:0.9rem;">피신청인별 분담 비율 설정 (주문 반영)</label>
            <textarea id="rulingText${instanceIdx}" class="form-input" rows="2" 
                placeholder="여기에 판결문 주문(비용 부분)이 들어갑니다. 수정 후 아래 버튼을 누르세요."
                style="font-size:0.85rem; margin:5px 0; background:#f0fdf4; border:1px solid #16a34a;"></textarea>
            <button class="btn-manual-trigger" onclick="autoParseRuling(${instanceIdx})" 
                style="width:100%; padding:6px; font-size:0.8rem; border:1px solid #16a34a; color:#166534; background:#fff;">
                🔄 텍스트로 비율 자동 재설정
            </button>
        </div>
    `;

    names.forEach((name, idx) => {
        // 기본값: 1/N 균등 분할
        const defaultInternal = Math.floor(100 / count);
        const internalVal = (idx === count - 1) ? (100 - (defaultInternal * (count - 1))) : defaultInternal;
        
        html += `
            <div style="background:#f8fafc; padding:8px; border-radius:6px; margin-bottom:6px; border:1px solid #e2e8f0;">
                <div style="font-weight:bold; font-size:0.9rem; margin-bottom:4px;">${name}</div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <div style="flex:1;">
                        <label style="font-size:0.75rem; color:#64748b;">내부 분담(%)</label>
                        <div style="display:flex; align-items:center; gap:4px;">
                            <input type="range" min="0" max="100" value="${internalVal}" 
                                id="slider-${instanceIdx}-${idx}" 
                                oninput="syncSliderInput(${instanceIdx}, ${idx}, this.value)" style="flex:1;">
                            <input type="number" value="${internalVal}" 
                                id="val-${instanceIdx}-${idx}" 
                                onchange="syncSliderInput(${instanceIdx}, ${idx}, this.value)" 
                                style="width:40px; text-align:center; font-size:0.8rem; border:1px solid #ccc;">
                        </div>
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:0.75rem; color:#64748b;">상환 비율(신청인에게)</label>
                        <input type="text" id="ext-${instanceIdx}-${idx}" value="100" 
                            onkeyup="calculateAll()" placeholder="예: 1/2"
                            style="width:100%; padding:4px; font-size:0.8rem; border:1px solid #ccc; border-radius:4px;">
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// 4. 슬라이더/숫자 동기화
function syncSliderInput(instanceIdx, respIdx, value) {
    const slider = document.getElementById(`slider-${instanceIdx}-${respIdx}`);
    const input = document.getElementById(`val-${instanceIdx}-${respIdx}`);
    if(slider) slider.value = value;
    if(input) input.value = value;
    calculateAll();
}

// 5. 텍스트 수정 후 재분석 로직
function autoParseRuling(instanceIdx) {
    const textEl = document.getElementById(`rulingText${instanceIdx}`);
    const text = textEl ? textEl.value : "";
    if (!text.trim()) { alert("분석할 텍스트가 없습니다."); return; }

    const names = getRespondentNames();
    
    // 단순 파싱 로직 (이름 옆의 분수/퍼센트 추출)
    names.forEach((name, idx) => {
        // 이름 뒤 30자 이내의 비율 찾기
        const regex = new RegExp(`${name}[^0-9a-zA-Z가-힣]{0,30}?(\\d+[./]\\d+|\\d+%)`, "i");
        const match = text.match(regex);
        if (match) {
            document.getElementById(`ext-${instanceIdx}-${idx}`).value = match[1];
        }
    });
    
    // 내부 분담은 텍스트 파싱이 어려우므로 균등(1/N)으로 리셋하되 알림 제공
    const equalShare = Math.floor(100 / names.length);
    names.forEach((_, idx) => {
        const val = (idx === names.length - 1) ? (100 - equalShare * (names.length - 1)) : equalShare;
        syncSliderInput(instanceIdx, idx, val);
    });

    calculateAll();
    alert("텍스트를 분석하여 비율을 갱신했습니다.\n(내부 분담 비율은 균등하게 초기화되었습니다)");
}

// 6. 상세 내역 표시
function displayRespondentBreakdown(names, totals) {
    const totalSection = document.querySelector('.total-section');
    const oldBreakdown = document.getElementById('respondent-breakdown-list');
    if(oldBreakdown) oldBreakdown.remove();

    if (names.length < 1) return;

    const container = document.createElement('div');
    container.id = 'respondent-breakdown-list';
    container.style.marginTop = "10px";
    container.style.paddingTop = "10px";
    container.style.borderTop = "1px dashed #ccc";
    
    let html = `<div style="font-size:0.85rem; font-weight:bold; color:#555; margin-bottom:5px;">[피신청인별 청구 내역]</div>`;
    names.forEach((name, idx) => {
        const amount = totals[idx] || 0;
        html += `<div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:3px;">
                    <span>${name}</span>
                    <span style="font-weight:bold;">${amount.toLocaleString()} 원</span>
                 </div>`;
    });
    container.innerHTML = html;
    
    const bd = document.querySelector('.breakdown');
    if(bd) totalSection.insertBefore(container, bd);
}
}