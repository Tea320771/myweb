/* ==========================================
   3_calculator.js
   - [UPDATE] 피신청인별 부담액 개별 계산 및 출력 기능 추가
   - 입력값은 '통합'으로 유지하되, 결과값은 '개별'로 보여주는 로직 구현
   ========================================== */

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

// 기본 비율 파싱 (단일 값)
function parseRatio(ratioStr) {
    if(!ratioStr) return 1.0;
    let s = ratioStr.toString().trim();
    
    // "4분의 1"
    const koreanFraction = s.match(/(\d+)\s*분\s*의\s*(\d+)/);
    if (koreanFraction) {
        const den = parseFloat(koreanFraction[1]); 
        const num = parseFloat(koreanFraction[2]); 
        if (den !== 0) return num / den;
    }
    // "1/4"
    if(s.includes('/')) {
        const parts = s.split('/');
        if(parts.length >= 2) {
            const numStr = parts[0].match(/(\d+)/);
            const denStr = parts[1].match(/(\d+)/);
            if(numStr && denStr) {
                const num = parseFloat(numStr[0]);
                const den = parseFloat(denStr[0]);
                if(den !== 0) return num / den;
            }
        }
    }
    // "%"
    if(s.includes('%')) {
        const val = parseFloat(s.replace(/[^0-9.]/g, ''));
        if(!isNaN(val)) return val / 100.0;
    }
    // 숫자만
    const val = parseFloat(s);
    if(!isNaN(val)) {
        if(val > 1.0 && val <= 100.0) return val / 100.0; 
        if(val <= 1.0 && val >= 0) return val;
    }
    return 1.0; 
}

// 다중 비율 파싱 (콤마 구분)
function parseComplexRatios(rawText, respondentCount) {
    if (!rawText.includes(',')) return null; 
    
    const parts = rawText.split(',');
    const ratios = parts.map(p => parseRatio(p.trim()));
    
    while (ratios.length < respondentCount) {
        ratios.push(1.0); // 입력 부족 시 100%로 채움
    }
    return ratios;
}

// [NEW] 피신청인 이름 목록 가져오기 (배열 반환)
function getRespondentNames() {
    const nameVal = document.getElementById('respondentName').value;
    if (!nameVal) return ["피신청인"];
    const lines = nameVal.split('\n').filter(line => line.trim() !== "");
    return lines.length > 0 ? lines : ["피신청인"];
}

// [UPDATE] 핵심 계산 로직
function calculateAll() {
    const caseType = document.getElementById('caseType').value;
    if (!caseType) return;
    updateNextCardVisibility();
    
    // 전체 인원수(원고+피고) - 송달료 계산용
    let partyCount = parseInt(document.getElementById('partyCount').value);
    if(isNaN(partyCount) || partyCount < 2) partyCount = 2; 

    // 피신청인 이름 목록 및 수
    const respondentNames = getRespondentNames();
    const respondentCount = respondentNames.length;
    
    // 피신청인별 합계 누적용 배열 (초기값 0)
    let respondentTotals = new Array(respondentCount).fill(0);

    let totalLawyer = 0; let totalScrivener = 0; let totalCourt = 0;

    for (let i = 1; i <= 3; i++) {
        const cardEl = document.getElementById('card-' + i);
        if (i > 1 && (!cardEl || cardEl.classList.contains('card-hidden') || cardEl.style.display === 'none')) continue; 
        
        // 1. 해당 심급의 전체 인정 비용 계산 (신청인 입장에서의 총액)
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

        // 화면 표시 (각 항목별 총액)
        document.getElementById('lawyer' + i).innerText = recognizedFee.toLocaleString();
        document.getElementById('scrivener' + i).innerText = sFee.toLocaleString();
        document.getElementById('stamp' + i).innerText = stamp.toLocaleString();
        document.getElementById('service' + i).innerText = service.toLocaleString();
        
        totalLawyer += recognizedFee; 
        totalScrivener += sFee; 
        totalCourt += (stamp + service);

        // 2. 피신청인별 분담액 계산
        const instanceTotal = recognizedFee + sFee + stamp + service;
        const ratioInput = document.getElementById('ratio' + i);
        const ratioText = ratioInput ? ratioInput.value : "";
        
        // 일단 전체 비용을 피신청인 수로 나눈 '1인당 기준액' 산출
        const baseAmountPerPerson = Math.floor(instanceTotal / respondentCount);

        let multipliers = [];

        if (ratioText.includes(',')) {
            // A. 다중 비율 입력 (예: "1/4, 100") -> 각각의 비율 적용
            multipliers = parseComplexRatios(ratioText, respondentCount);
        } else {
            // B. 단일 비율 입력
            let r = parseRatio(ratioText);
            let isEach = (ratioText.includes("각자") || ratioText.includes("각"));
            
            // "각자"인 경우: (전체비용 / N) * N * 비율 = 전체비용 * 비율 (즉, 기준액 * N * r)
            // "공동"인 경우: (전체비용 / N) * 비율 (즉, 기준액 * 1 * r)
            let val = isEach ? (r * respondentCount) : r;
            
            // 모든 피신청인에게 동일 비율 적용
            for(let k=0; k<respondentCount; k++) multipliers.push(val);
        }

        // 각 피신청인별 누적
        for(let k=0; k<respondentCount; k++) {
            let amount = Math.floor(baseAmountPerPerson * (multipliers[k] || 1.0));
            respondentTotals[k] += amount;
        }
    }
    
    // 3. 결과 출력
    // 전체 합계 (모든 피신청인 부담액의 합)
    const grandTotalVal = respondentTotals.reduce((a, b) => a + b, 0);
    document.getElementById('grandTotal').innerText = grandTotalVal.toLocaleString() + " 원";
    
    // 하단 상세 내역 (비용 종류별 합계)
    document.getElementById('totalLawyer').innerText = totalLawyer.toLocaleString();
    document.getElementById('totalScrivener').innerText = totalScrivener.toLocaleString();
    document.getElementById('totalCourt').innerText = totalCourt.toLocaleString();
    
    // 4. [NEW] 피신청인별 개별 청구액 표시 (2명 이상일 때만)
    displayRespondentBreakdown(respondentNames, respondentTotals);
    
    checkCalculatorCompletion(); 
}

// [NEW] 피신청인별 내역을 화면에 그리는 함수
function displayRespondentBreakdown(names, totals) {
    const totalSection = document.querySelector('.total-section');
    
    // 기존 내역 삭제
    const oldBreakdown = document.getElementById('respondent-breakdown-list');
    if(oldBreakdown) oldBreakdown.remove();

    if (names.length < 2) return; // 1명이면 표시 안 함

    const container = document.createElement('div');
    container.id = 'respondent-breakdown-list';
    container.style.marginTop = "15px";
    container.style.paddingTop = "15px";
    container.style.borderTop = "1px dashed #cbd5e1";
    container.style.width = "100%";

    let html = `<div style="font-size:0.9rem; font-weight:bold; color:#4b5563; margin-bottom:10px;">[피신청인별 청구 내역]</div>`;
    
    names.forEach((name, idx) => {
        // 이름에 "1. 김철수" 처럼 번호가 있으면 제거하고 이름만 깔끔하게
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
    
    // '총 예상 소송비용 합계' 바로 아래에 추가
    // .total-amount 요소 뒤에 넣기 위해 insertBefore 사용
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

    const lblW1 = document.querySelector('#withdraw1 + span');
    if(lblW1) lblW1.innerText = txt1_withdraw;

    const elInst2 = document.getElementById('txt-inst-2');
    if(elInst2) elInst2.innerText = txt2_title;
    
    const lblApp2 = document.querySelector('#isAppellant2 + span');
    if(lblApp2) lblApp2.innerText = txt2_party;
    
    const lblW2 = document.querySelector('#withdraw2 + span');
    if(lblW2) lblW2.innerText = txt2_withdraw;

    const elInst3 = document.getElementById('txt-inst-3');
    if(elInst3) elInst3.innerText = txt3_title;

    const lblPet3 = document.querySelector('#isPetitioner3 + span');
    if(lblPet3) lblPet3.innerText = txt3_party;

    const lblW3 = document.querySelector('#withdraw3 + span');
    if(lblW3) lblW3.innerText = txt3_withdraw;

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