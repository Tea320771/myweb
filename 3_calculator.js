/* ==========================================
   3_calculator.js
   - [FIX] goToCalculator 함수: playTransition 부재 시 안전 처리
   - [FIX] '소명 자료 입력하기' 버튼(btnToEvidence) 이벤트 리스너 연결 추가
   - [UPDATE] 'AI 가르치기' 기능을 위한 전용 모달(Large Input) 추가
   ========================================== */

// 전역 변수: 피신청인별 비율 설정 상태 저장
let respondentRatioState = {
    1: [], // 1심
    2: [], // 2심
    3: []  // 3심
};

// [FIX] DOM 로드 시 버튼 이벤트 연결 (누락된 부분 추가)
document.addEventListener('DOMContentLoaded', function() {
    const btnEvidence = document.getElementById('btnToEvidence');
    if (btnEvidence) {
        btnEvidence.addEventListener('click', function() {
            // 4_evidence.js에 정의된 함수 호출
            if (typeof goToEvidence === 'function') {
                goToEvidence();
            } else {
                alert("다음 단계(소명 자료)로 이동하는 함수를 찾을 수 없습니다.");
            }
        });
    }
    
    // 초기 계산 상태 확인
    setTimeout(checkCalculatorCompletion, 500);
});

function goToCalculator() {
    const appName = document.getElementById('applicantName');
    const repName = document.getElementById('repName');
    const noRepCheck = document.getElementById('noRepresentative');
    const respName = document.getElementById('respondentName');

    const appNameVal = (appName && appName.value.trim()) || "입력안함";
    let repNameVal = repName ? repName.value.trim() : "";
    if(noRepCheck && noRepCheck.checked) repNameVal = "없음 (본인 소송)"; else if (!repNameVal) repNameVal = "입력안함";
    const respNameVal = (respName && respName.value.trim()) || "입력안함";
    
    if(document.getElementById('dispAppName')) document.getElementById('dispAppName').innerText = appNameVal;
    if(document.getElementById('dispRepName')) document.getElementById('dispRepName').innerText = repNameVal;
    if(document.getElementById('dispRespName')) document.getElementById('dispRespName').innerText = respNameVal;

    const maxLevel = (typeof getMaxInstanceLevel === 'function') ? getMaxInstanceLevel() : 3;
    let summaryHtml = "";
    const court1 = document.getElementById('courtName1') ? document.getElementById('courtName1').value : "-";
    const caseNo1 = document.getElementById('caseNo1') ? document.getElementById('caseNo1').value : "-";
    summaryHtml += `<div class="case-item"><span>1심</span> <span>${court1} ${caseNo1}</span></div>`;
    
    if (maxLevel >= 2) {
        const court2 = document.getElementById('courtName2') ? document.getElementById('courtName2').value : "-";
        const caseNo2 = document.getElementById('caseNo2') ? document.getElementById('caseNo2').value : "-";
        summaryHtml += `<div class="case-item"><span>2심</span> <span>${court2} ${caseNo2}</span></div>`;
    }
    if (maxLevel >= 3) {
        const court3 = document.getElementById('courtName3') ? document.getElementById('courtName3').value : "대법원";
        const caseNo3 = document.getElementById('caseNo3') ? document.getElementById('caseNo3').value : "-";
        summaryHtml += `<div class="case-item"><span>3심</span> <span>${court3} ${caseNo3}</span></div>`;
    }

    if(document.getElementById('caseSummary')) document.getElementById('caseSummary').innerHTML = summaryHtml;
    
    // [FIX] 페이지 전환 로직을 함수로 분리 (콜백용)
    const performTransition = function() {
        const casePage = document.getElementById('caseInfoPage');
        const calcPage = document.getElementById('calcPage');
        if(casePage) casePage.classList.add('hidden');
        if(calcPage) {
            calcPage.classList.remove('hidden'); 
            calcPage.classList.add('fade-in-section');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        populateFamilyOptions(); 
        updateBackButtonVisibility();
        
        // [NEW] 진입 시 피신청인 비율 UI 초기화
        initRatioUIs();
    };

    // playTransition이 있으면 쓰고, 없으면 바로 전환
    if (typeof playTransition === 'function') {
        try {
            playTransition("법원 및 사건 정보를 확인했어요.<br>이제 소송비용을 계산하도록 할게요.", performTransition);
        } catch(e) {
            console.warn("Transition error, forcing change", e);
            performTransition();
        }
    } else {
        performTransition();
    }
}

const familyCases = { "가류": ["혼인 무효", "이혼 무효", "인지 무효", "친생자관계존부확인", "입양 무효", "파양 무효"], "나류": ["사실상혼인관계존부확인", "혼인 취소", "이혼 취소", "재판상 이혼", "부의 결정", "친생부인", "인지 취소", "인지에 대한 이의", "인지청구", "입양 취소", "파양 취소", "재판상 파양", "친양자 입양 취소", "친양자 파양"], "다류": ["약혼해제/사실혼파기 손해배상", "혼인/이혼 무효/취소 손해배상", "입양/파양 무효/취소 손해배상", "재산분할 관련 사해행위 취소"], "마류": ["재산분할", "상속재산분할"] };
let currentFamilyCategory = "";
function populateFamilyOptions() {
    const select = document.getElementById('familySpecificCase');
    if(!select) return;
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
    const select = document.getElementById('familySpecificCase');
    if(!select) return;
    const selectedCase = select.value;
    const displayDiv = document.getElementById('family-category-display');
    if (!selectedCase) { currentFamilyCategory = ""; if(displayDiv) displayDiv.innerText = ""; calculateAll(); return; }
    let foundCategory = "";
    for (const [category, cases] of Object.entries(familyCases)) { if (cases.includes(selectedCase)) { foundCategory = category; break; } }
    currentFamilyCategory = foundCategory;
    if(displayDiv) {
        if(foundCategory) displayDiv.innerText = `선택하신 사건은 [${foundCategory}] 사건으로 분류됩니다.`; else displayDiv.innerText = "";
    }
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
    const card1 = document.getElementById('card-1'); 
    if(card1) { card1.classList.remove('card-hidden'); card1.style.display = 'flex'; }
    
    const card2 = document.getElementById('card-2');
    if(card2) {
        let showCard2 = (maxLevel >= 2); 
        if (showCard2) {
            if (card2.style.display !== 'flex') { card2.classList.remove('card-hidden'); card2.style.display = 'flex'; card2.classList.add('fade-in'); }
        } else { card2.style.display = 'none'; card2.classList.add('card-hidden'); }
    }
    
    const card3 = document.getElementById('card-3');
    if(card3) {
        if (maxLevel >= 3) {
            card3.classList.remove('card-hidden'); card3.style.display = 'flex';
        } else {
            card3.classList.add('card-hidden'); card3.style.display = 'none';
        }
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
    const nameInput = document.getElementById('respondentName');
    const nameVal = nameInput ? nameInput.value : "";
    if (!nameVal) return ["피신청인"];
    const lines = nameVal.split('\n').filter(line => line.trim() !== "");
    return lines.map(l => l.replace(/^\d+[\.\)]\s*/, '').trim());
}

// AI 데이터 연동 및 동적 비율 UI 관리 로직
function applyAIAnalysisToCalculator(data) {
    if(!data) return;
    initRatioUIs(); 

    for (let i = 1; i <= 3; i++) {
        const rulingText = data['costRulingText' + i]; 
        const details = data['costBurdenDetails' + i]; 

        if (rulingText) {
            const textArea = document.getElementById(`rulingText${i}`);
            if (textArea) textArea.value = rulingText;
        }

        if (details && Array.isArray(details) && details.length > 0) {
            const currentNames = getRespondentNames(); 
            currentNames.forEach((name, idx) => {
                const cleanName = name.replace(/\s+/g, '');
                const matchedItem = details.find(d => {
                    const cleanDName = d.name.replace(/\s+/g, '');
                    return cleanName.includes(cleanDName) || cleanDName.includes(cleanName);
                });

                if (matchedItem) {
                    if (matchedItem.internalShare !== undefined && matchedItem.internalShare !== null) {
                        syncSliderInput(i, idx, matchedItem.internalShare);
                    }
                    if (matchedItem.reimburseRatio !== undefined && matchedItem.reimburseRatio !== null) {
                        const extInput = document.getElementById(`ext-${i}-${idx}`);
                        if (extInput) extInput.value = matchedItem.reimburseRatio;
                    }
                }
            });
        }
    }
    calculateAll();
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

    const oldRatioDiv = document.getElementById('ratio' + instanceIdx)?.closest('.input-group');
    if(oldRatioDiv) oldRatioDiv.style.display = 'none';

    let container = document.getElementById(`ratio-settings-container-${instanceIdx}`);
    if (!container) {
        container = document.createElement('div');
        container.id = `ratio-settings-container-${instanceIdx}`;
        container.className = 'ratio-settings-box';
        const sogaContainer = document.getElementById(`soga-container-${instanceIdx}`);
        if(sogaContainer) {
            const optionsContainer = sogaContainer.querySelector('.options-container');
            sogaContainer.insertBefore(container, optionsContainer);
        }
    }

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
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <button class="btn-manual-trigger" onclick="autoParseRuling(${instanceIdx})" style="flex:1; padding:5px; font-size:0.8rem; margin-right:5px;">
                    🪄 텍스트로 비율 자동 설정하기
                </button>
                <button onclick="openLargeFeedbackModal(${instanceIdx})" 
                        style="background:none; border:none; color:#ef4444; font-size:0.75rem; cursor:pointer; text-decoration:underline; white-space:nowrap;">
                    🚨 결과가 이상한가요? (AI 가르치기)
                </button>
            </div>
        </div>
    `;

    names.forEach((name, idx) => {
        const defaultInternal = Math.floor(100 / count);
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

function syncSliderInput(instanceIdx, respIdx, value) {
    const slider = document.getElementById(`slider-${instanceIdx}-${respIdx}`);
    const input = document.getElementById(`val-${instanceIdx}-${respIdx}`);
    if(slider) slider.value = value;
    if(input) input.value = value;
    calculateAll();
}

function autoParseRuling(instanceIdx) {
    const textEl = document.getElementById(`rulingText${instanceIdx}`);
    const text = textEl ? textEl.value : "";
    if (!text.trim()) { alert("분석할 판결문 내용을 입력해주세요."); return; }

    const names = getRespondentNames(); 
    const appNameInput = document.getElementById('applicantName');
    const appName = appNameInput ? (appNameInput.value.trim() || "원고") : "원고";
    const isApplicantPlaintiff = appName.includes("원고") || appName.includes("신청인");
    
    let internalShares = new Array(names.length).fill(null);
    let externalRatios = new Array(names.length).fill(null); 

    let globalPlaintiffBurden = 0; 
    let globalDefendantBurden = 0; 
    
    const regexPlaintiff = /원고.*?(\d+)\s*분\s*의\s*(\d+).*?부담|원고.*?(\d+)%.*?부담/;
    const matchP = text.match(regexPlaintiff);
    if (matchP) {
        if (matchP[1] && matchP[2]) globalPlaintiffBurden = parseFloat(matchP[2]) / parseFloat(matchP[1]);
        else if (matchP[3]) globalPlaintiffBurden = parseFloat(matchP[3]) / 100.0;
    }

    const regexDefendant = /피고.*?(\d+)\s*분\s*의\s*(\d+).*?부담|피고.*?(\d+)%.*?부담/;
    const matchD = text.match(regexDefendant);
    if (matchD) {
        if (matchD[1] && matchD[2]) globalDefendantBurden = parseFloat(matchD[2]) / parseFloat(matchD[1]);
        else if (matchD[3]) globalDefendantBurden = parseFloat(matchD[3]) / 100.0;
    }

    names.forEach((name, idx) => {
        const directRegex = new RegExp(`${name}[^0-9a-zA-Z가-힣]{0,30}?(\\d+(?:\\/\\d+|%|\\s*분\\s*의\\s*\\d+))`, "i");
        const matchDirect = text.match(directRegex);
        
        if (matchDirect) {
            externalRatios[idx] = matchDirect[1]; 
        } else {
            if (!isApplicantPlaintiff && globalPlaintiffBurden > 0) { 
                externalRatios[idx] = (globalPlaintiffBurden * 100).toFixed(0);
            }
            else if (!isApplicantPlaintiff && globalDefendantBurden > 0) {
                 let reimbursement = 1.0 - globalDefendantBurden;
                 if (reimbursement < 0) reimbursement = 0;
                 externalRatios[idx] = (reimbursement * 100).toFixed(0);
            }
            else if (isApplicantPlaintiff && globalPlaintiffBurden > 0) {
                let reimbursement = 1.0 - globalPlaintiffBurden;
                if (reimbursement < 0) reimbursement = 0;
                externalRatios[idx] = (reimbursement * 100).toFixed(0);
            }
            else if (text.includes("피고들이 부담") || text.includes("피고가 부담")) {
                 if (isApplicantPlaintiff) externalRatios[idx] = "100";
                 else externalRatios[idx] = "0"; 
            }
            else if (text.includes("원고들이 부담") || text.includes("원고가 부담")) {
                 if (!isApplicantPlaintiff) externalRatios[idx] = "100"; 
            }
        }
    });

    const equalShare = Math.floor(100 / names.length);
    let remainder = 100;
    
    internalShares = internalShares.map((_, i) => {
        let share = equalShare;
        if (i === names.length - 1) share = remainder;
        else remainder -= share;
        return share;
    });

    names.forEach((_, idx) => {
        syncSliderInput(instanceIdx, idx, internalShares[idx]);
        const extInput = document.getElementById(`ext-${instanceIdx}-${idx}`);
        if (extInput) {
            if (externalRatios[idx] !== null) {
                let val = externalRatios[idx].toString();
                if (!val.includes('/') && !val.includes('%')) val += "%";
                extInput.value = val;
            } else {
                if(!extInput.value) extInput.value = "100";
            }
        }
    });

    calculateAll();
    alert("판결문 내용을 분석하여 비율을 설정했습니다.\n(신청인이 부담해야 할 부분을 제외한 '상환 비율'이 자동 계산되었습니다)");
}

function parseRatio(ratioStr) {
    if(!ratioStr) return 0;
    let s = ratioStr.toString().trim();
    if (s === "100" || s === "100%") return 1.0;
    
    const koreanFraction = s.match(/(\d+)\s*분\s*의\s*(\d+)/);
    if (koreanFraction) {
        const den = parseFloat(koreanFraction[1]); 
        const num = parseFloat(koreanFraction[2]); 
        return (den !== 0) ? num / den : 0;
    }
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
    const val = parseFloat(s.replace(/[^0-9.]/g, ''));
    if(!isNaN(val)) {
        if(val > 1.0 && val <= 100.0) return val / 100.0; 
        if(val <= 1.0 && val >= 0) return val;
    }
    return 1.0; 
}

function calculateAll() {
    const caseTypeEl = document.getElementById('caseType');
    if (!caseTypeEl) return;
    const caseType = caseTypeEl.value;
    updateNextCardVisibility();
    
    const partyCountEl = document.getElementById('partyCount');
    let partyCount = partyCountEl ? parseInt(partyCountEl.value) : 2;
    if(isNaN(partyCount) || partyCount < 2) partyCount = 2; 

    const respondentNames = getRespondentNames();
    const respondentCount = respondentNames.length;
    let respondentTotals = new Array(respondentCount).fill(0);

    let totalLawyer = 0; let totalScrivener = 0; let totalCourt = 0;

    for (let i = 1; i <= 3; i++) {
        const cardEl = document.getElementById('card-' + i);
        if (i > 1 && (!cardEl || cardEl.classList.contains('card-hidden') || cardEl.style.display === 'none')) continue; 
        
        const soga = getNumberValue('soga' + i);
        const startFee = getNumberValue('startFee' + i);
        const successFee = getNumberValue('successFee' + i);
        const actualLawyerCost = startFee + successFee;
        const withdrawEl = document.getElementById('withdraw' + i);
        const isWithdraw = withdrawEl ? withdrawEl.checked : false;
        
        const scrivenerEl = document.getElementById('useScrivener' + i);
        const useScrivener = scrivenerEl ? scrivenerEl.checked : false;
        
        const paperEl = document.getElementById('isPaper' + i);
        const isPaper = paperEl ? paperEl.checked : false;
        
        let isPayer = false;
        if (i === 1) { let p = document.getElementById('isPlaintiff1'); if(p) isPayer = p.checked; }
        if (i === 2) { let p = document.getElementById('isAppellant2'); if(p) isPayer = p.checked; }
        if (i === 3) { let p = document.getElementById('isPetitioner3'); if(p) isPayer = p.checked; }

        let recognizedFee = 0;
        let limit = calcLawyerFeeLimit(soga);
        if (isWithdraw) limit = Math.floor(limit * 0.5);
        recognizedFee = Math.min(actualLawyerCost, limit);

        let sFee = 0;
        const elScrivener = document.getElementById('scrivener' + i);
        if(elScrivener) {
            if (useScrivener) { sFee = calcScrivenerFee(soga); elScrivener.classList.remove('inactive'); } 
            else { elScrivener.classList.add('inactive'); }
        }

        let stamp = 0; let service = 0;
        const elStamp = document.getElementById('stamp' + i);
        const elService = document.getElementById('service' + i);
        
        if (isPayer) {
            stamp = calcStampDuty(soga, i, caseType, isPaper);
            service = calcServiceFee(i, partyCount, caseType, soga);
            if(elStamp) elStamp.classList.remove('inactive'); 
            if(elService) elService.classList.remove('inactive');
        } else { 
            if(elStamp) elStamp.classList.add('inactive'); 
            if(elService) elService.classList.add('inactive'); 
        }

        if(document.getElementById('lawyer' + i)) document.getElementById('lawyer' + i).innerText = recognizedFee.toLocaleString();
        if(document.getElementById('scrivener' + i)) document.getElementById('scrivener' + i).innerText = sFee.toLocaleString();
        if(document.getElementById('stamp' + i)) document.getElementById('stamp' + i).innerText = stamp.toLocaleString();
        if(document.getElementById('service' + i)) document.getElementById('service' + i).innerText = service.toLocaleString();
        
        totalLawyer += recognizedFee; 
        totalScrivener += sFee; 
        totalCourt += (stamp + service);

        const instanceTotal = recognizedFee + sFee + stamp + service;

        for(let k=0; k<respondentCount; k++) {
            const internalVal = parseFloat(document.getElementById(`val-${i}-${k}`)?.value || 0);
            const externalStr = document.getElementById(`ext-${i}-${k}`)?.value || "100";
            const externalRatio = parseRatio(externalStr);

            const myShare = instanceTotal * (internalVal / 100.0);
            const myPayment = Math.floor(myShare * externalRatio);

            respondentTotals[k] += myPayment;
        }
    }
    
    const grandTotalVal = respondentTotals.reduce((a, b) => a + b, 0);
    if(document.getElementById('grandTotal')) document.getElementById('grandTotal').innerText = grandTotalVal.toLocaleString() + " 원";
    
    if(document.getElementById('totalLawyer')) document.getElementById('totalLawyer').innerText = totalLawyer.toLocaleString();
    if(document.getElementById('totalScrivener')) document.getElementById('totalScrivener').innerText = totalScrivener.toLocaleString();
    if(document.getElementById('totalCourt')) document.getElementById('totalCourt').innerText = totalCourt.toLocaleString();
    
    displayRespondentBreakdown(respondentNames, respondentTotals);
    checkCalculatorCompletion(); 
}

function displayRespondentBreakdown(names, totals) {
    const totalSection = document.querySelector('.total-section');
    if(!totalSection) return;

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
    if(breakdownDiv) totalSection.insertBefore(container, breakdownDiv);
}

function checkCalculatorCompletion() {
    const btn = document.getElementById('btnToEvidence');
    if(!btn) return;
    let isAnyCardComplete = false;
    for(let i=1; i<=3; i++) {
        const card = document.getElementById('card-' + i);
        if(card && !card.classList.contains('card-hidden') && card.style.display !== 'none') {
            const startVal = document.getElementById('startFee' + i)?.value;
            const successVal = document.getElementById('successFee' + i)?.value;
            const sogaVal = document.getElementById('soga' + i)?.value;
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
    const caseTypeEl = document.getElementById('caseType');
    if(!caseTypeEl) return;
    const caseType = caseTypeEl.value;
    
    const mainContent = document.getElementById('main-calc-content');
    const familyContainer = document.getElementById('family-specific-container');
    
    if (caseType === 'family') { if(familyContainer) { familyContainer.classList.remove('hidden'); familyContainer.classList.add('fade-in'); } } 
    else { if(familyContainer) familyContainer.classList.add('hidden'); if(document.getElementById('familySpecificCase')) document.getElementById('familySpecificCase').value = ""; currentFamilyCategory = ""; if(document.getElementById('family-category-display')) document.getElementById('family-category-display').innerText = ""; }
    
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

    if (caseType) { if(mainContent) { mainContent.classList.remove('hidden'); mainContent.classList.add('fade-in-section'); } calculateAll(); }
}

// ==========================================
// [NEW] AI 학습(피드백)을 위한 대형 모달 로직
// ==========================================

// 모달 열기 함수 (버튼 클릭 시 호출)
function openLargeFeedbackModal(instanceIdx) {
    // 1. 기존 분석된 판결문 텍스트 가져오기
    const textEl = document.getElementById(`rulingText${instanceIdx}`);
    const rulingText = textEl ? textEl.value : "";

    // 2. 모달이 DOM에 없으면 동적으로 생성
    let modal = document.getElementById('ai-feedback-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ai-feedback-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header" style="background:var(--color-lawyer); color:white;">
                    <h3 style="margin:0;">🚨 AI 학습시키기 (오류 신고)</h3>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <p style="color:#4b5563; margin-bottom:15px; font-size:0.95rem;">
                        AI가 판결문 주문을 잘못 해석했나요?<br>
                        <strong>올바른 해석 논리를 가르쳐주시면</strong> 즉시 학습하여 다음 분석에 반영합니다.
                    </p>

                    <label style="font-weight:bold; display:block; margin-bottom:5px; color:#1f2937;">분석 대상 (판결문 주문)</label>
                    <textarea id="modal-ruling-text" class="form-input" rows="3" readonly 
                        style="background:#f3f4f6; color:#6b7280; font-size:0.9rem; margin-bottom:15px;"></textarea>

                    <label style="font-weight:bold; display:block; margin-bottom:5px; color:#1d4ed8;">어떻게 해석해야 하나요? (정답 논리)</label>
                    <textarea id="modal-feedback-text" class="form-input" rows="8" 
                        placeholder="예시: '피고 이을녀는 청구가 전부 기각되었으므로 비용을 100% 부담해야 해. 주문에 별도 언급이 없으면 패소자 부담 원칙을 따라야 해.'"
                        style="font-size:1rem; padding:10px; border:2px solid #e5e7eb;"></textarea>
                    
                    <div style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end;">
                        <button onclick="document.getElementById('ai-feedback-modal').classList.add('hidden')" 
                                style="padding:10px 20px; background:#e5e7eb; border:none; border-radius:6px; cursor:pointer; font-weight:bold; color:#374151;">
                            취소
                        </button>
                        <button onclick="submitLargeFeedback()" 
                                style="padding:10px 20px; background:var(--color-lawyer); border:none; border-radius:6px; cursor:pointer; font-weight:bold; color:white;">
                            학습 정보 제출
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // 3. 값 세팅 및 모달 표시
    document.getElementById('modal-ruling-text').value = rulingText || "(주문 내용 없음)";
    document.getElementById('modal-feedback-text').value = ""; // 초기화
    modal.classList.remove('hidden');
}

// 피드백 제출 함수
function submitLargeFeedback() {
    const rulingText = document.getElementById('modal-ruling-text').value;
    const feedback = document.getElementById('modal-feedback-text').value;

    if (!feedback.trim()) {
        alert("AI가 학습할 수 있도록 설명을 입력해주세요.");
        return;
    }

    // 1_intro_analysis.js에 있는 전역 함수 호출
    if (typeof window.processUserFeedback === 'function') {
        document.getElementById('ai-feedback-modal').classList.add('hidden'); // 모달 닫기
        window.processUserFeedback(rulingText, feedback);
    } else {
        alert("오류: 학습 연결 함수(processUserFeedback)를 찾을 수 없습니다.");
    }
}