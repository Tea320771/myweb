/* ==========================================
   3_calculator.js
   - 소송비용 통합 계산기 로직
   - 계산 수식, 포맷팅, 가사 사건 처리
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
    // 값이 바뀔 때마다 계산 및 버튼 상태 체크
    calculateAll();
}

function updateNextCardVisibility() {
    const maxLevel = (typeof getMaxInstanceLevel === 'function') ? getMaxInstanceLevel() : 3; 
    const card1 = document.getElementById('card-1'); card1.classList.remove('card-hidden'); card1.style.display = 'flex';
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
    
    // 가사 사건 처리
    if (caseType === 'family') { familyContainer.classList.remove('hidden'); familyContainer.classList.add('fade-in'); } 
    else { familyContainer.classList.add('hidden'); document.getElementById('familySpecificCase').value = ""; currentFamilyCategory = ""; document.getElementById('family-category-display').innerText = ""; }
    
    // [문구 설정]
    // 기본값 (민사/가사/행정/특허)
    let txt1_withdraw = "소취하"; // 일반 소송 기본값
    let txt2_title = "2심 (항소심)";
    let txt2_party = "항소인일 경우 체크";
    let txt2_withdraw = "항소취하";
    let txt3_title = "3심 (상고심)";
    let txt3_party = "상고인일 경우 체크";
    let txt3_withdraw = "상고취하";

    // 민사 신청 사건 (가압류/가처분)일 경우 덮어쓰기
    if (caseType === 'civil_app') {
         txt1_withdraw = "심문기일 중/후 신청취하"; // 신청 사건은 신청취하
         txt2_title = "2심 (항고심)";
         txt2_party = "항고인일 경우 체크";
         txt2_withdraw = "항고 취하"; // 띄어쓰기 반영
         txt3_title = "3심 (재항고심)";
         txt3_party = "재항고인일 경우 체크";
         txt3_withdraw = "재항고 취하"; // 띄어쓰기 반영
    }

    // [DOM 적용]
    // 중요: HTML 구조가 input + span 형제 관계이므로 형제 선택자(+) 사용
    // 1심 라벨
    const lblW1 = document.querySelector('#withdraw1 + span');
    if(lblW1) lblW1.innerText = txt1_withdraw;

    // 2심 라벨 및 헤더
    const elInst2 = document.getElementById('txt-inst-2');
    if(elInst2) elInst2.innerText = txt2_title;
    
    const lblApp2 = document.querySelector('#isAppellant2 + span');
    if(lblApp2) lblApp2.innerText = txt2_party;
    
    const lblW2 = document.querySelector('#withdraw2 + span');
    if(lblW2) lblW2.innerText = txt2_withdraw;

    // 3심 라벨 및 헤더
    const elInst3 = document.getElementById('txt-inst-3');
    if(elInst3) elInst3.innerText = txt3_title;

    const lblPet3 = document.querySelector('#isPetitioner3 + span');
    if(lblPet3) lblPet3.innerText = txt3_party;

    const lblW3 = document.querySelector('#withdraw3 + span');
    if(lblW3) lblW3.innerText = txt3_withdraw;

    // 메인 컨텐츠 표시
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