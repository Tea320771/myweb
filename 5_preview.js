/* ==========================================
   5_preview.js
   - 신청서 및 계산서 미리보기(PDF/인쇄) 생성 로직
   ========================================== */

function goToPreview() {
    // [FIX] playTransition 함수 존재 여부 확인 후 실행 (없으면 바로 전환)
    const performTransition = function() {
        document.getElementById('evidencePage').classList.add('hidden');
        renderPreview();
        const pvPage = document.getElementById('previewPage'); 
        if(pvPage) {
            pvPage.classList.remove('hidden'); 
            pvPage.classList.add('fade-in-section');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
        if(typeof updateBackButtonVisibility === 'function') updateBackButtonVisibility();
    };

    if (typeof playTransition === 'function') {
        playTransition("입력해주신 내용을 토대로<br>PDF 양식에 맞춘 신청서를 작성합니다.", performTransition);
    } else {
        performTransition();
    }
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