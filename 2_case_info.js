/* ==========================================
   2_case_info.js
   - [UPDATE] AI 자동 입력(setAndTrigger) 호환성 강화
   - [UPDATE] 입력 값 변경 시 즉시 버튼 활성화 체크
   ========================================== */

window.addEventListener('DOMContentLoaded', function() {
    setupAutocomplete("courtName1", "suggestionList1");
    setupAutocomplete("courtName2", "suggestionList2");

    // [NEW] 모든 사건 정보 입력 필드에 감지 리스너 추가 (AI 자동 입력 대응)
    const caseInputs = [
        'courtName1', 'caseNo1', 'date1', 'finalized1',
        'courtName2', 'caseNo2', 'date2', 'finalized2',
        'courtName3', 'caseNo3', 'date3', 'finalDate'
    ];

    caseInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // 키보드 입력, 값 변경, 붙여넣기 등 모든 상황 감지
            el.addEventListener('input', checkCaseInfoStep);
            el.addEventListener('change', checkCaseInfoStep);
            el.addEventListener('keyup', checkCaseInfoStep);
        }
    });

    // 페이지 로드 시, 이미 값이 채워져 있을 경우를 대비해 한 번 체크
    setTimeout(checkCaseInfoStep, 500);
});

function goToCaseInfo() {
    playTransition("인적 사항을 확인했어요.<br>이제 수행하신 소송의 법원명, 사건번호를 기재해주세요.", function() {
        document.getElementById('introPage').classList.add('hidden');
        const casePage = document.getElementById('caseInfoPage');
        casePage.classList.remove('hidden'); casePage.classList.add('fade-in-section');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // [NEW] 페이지 진입 시 다시 한 번 버튼 상태 체크
        checkCaseInfoStep();
        updateBackButtonVisibility(); 
    });
}

function checkCaseInfoStep() {
    // 1심 체크
    const court1 = document.getElementById('courtName1').value.trim();
    const caseNo1 = document.getElementById('caseNo1').value.trim();
    const finalized1 = document.getElementById('finalized1').checked;
    
    const step2Div = document.getElementById('case-step-2');
    const step3Div = document.getElementById('case-step-3');
    const btnCalc = document.getElementById('btnToCalculator');

    const step1Valid = (court1 !== "" && caseNo1 !== "");

    // 1심 완료 & 미확정 -> 2심 표시
    if (step1Valid && !finalized1) {
        if (step2Div.classList.contains('hidden')) { 
            step2Div.classList.remove('hidden'); 
            step2Div.classList.add('fade-in-section'); 
        }
    } else { 
        step2Div.classList.add('hidden'); 
        step3Div.classList.add('hidden'); 
    }

    // 2심 체크
    const court2 = document.getElementById('courtName2').value.trim();
    const caseNo2 = document.getElementById('caseNo2').value.trim();
    const finalized2 = document.getElementById('finalized2').checked;
    
    // 2심 표시 중 & 2심 완료 & 미확정 -> 3심 표시
    if (!step2Div.classList.contains('hidden') && court2 !== "" && caseNo2 !== "" && !finalized2) {
         if (step3Div.classList.contains('hidden')) { 
             step3Div.classList.remove('hidden'); 
             step3Div.classList.add('fade-in-section'); 
         }
    } else { 
        step3Div.classList.add('hidden'); 
    }

    // 최종 버튼 표시 조건
    const caseNo3 = document.getElementById('caseNo3').value.trim();
    
    let isReady = false;
    
    // Case A: 1심에서 확정
    if (step1Valid && finalized1) isReady = true;
    // Case B: 2심에서 확정
    else if (step1Valid && !finalized1 && court2 && caseNo2 && finalized2) isReady = true;
    // Case C: 3심 진행
    else if (step1Valid && !finalized1 && court2 && caseNo2 && !finalized2 && caseNo3) isReady = true;

    if (isReady) {
        if (btnCalc.classList.contains('hidden')) { 
            btnCalc.classList.remove('hidden'); 
            btnCalc.classList.add('fade-in-section'); 
        }
    } else { 
        btnCalc.classList.add('hidden'); 
    }
}

function getMaxInstanceLevel() {
    if (document.getElementById('finalized1').checked) return 1;
    if (document.getElementById('finalized2').checked) return 2;
    return 3; 
}

const courtList = ["서울고등법원", "서울중앙지방법원", "서울남부지방법원", "서울동부지방법원", "서울북부지방법원", "서울서부지방법원", "서울가정법원", "서울행정법원", "서울회생법원", "인천지방법원", "인천지방법원 강화군법원", "인천지방법원 부천지원", "인천지방법원 부천지원 김포시법원", "인천가정법원", "수원고등법원", "수원지방법원", "수원지방법원 성남지원", "수원지방법원 성남지원 광주시법원", "수원지방법원 안산지원", "수원지방법원 안산지원 광명시법원", "수원지방법원 안양지원", "수원지방법원 여주지원", "수원지방법원 여주지원 양평군법원", "수원지방법원 여주지원 이천시법원", "수원지방법원 오산시법원", "수원지방법원 용인시법원", "수원지방법원 평택지원", "수원지방법원 평택지원 안성시법원", "의정부지방법원", "의정부지방법원 고양지원", "의정부지방법원 고양지원 파주시법원", "의정부지방법원 남양주지원", "의정부지방법원 남양주지원 가평군법원", "의정부지방법원 동두천시법원", "의정부지방법원 연천군법원", "의정부지방법원 철원군법원", "의정부지방법원 포천시법원", "춘천지방법원", "춘천지방법원 강릉지원", "춘천지방법원 강릉지원 동해시법원", "춘천지방법원 강릉지원 삼척시법원", "춘천지방법원 속초지원", "춘천지방법원 속초지원 고성군법원", "춘천지방법원 속초지원 양양군법원", "춘천지방법원 양구군법원", "춘천지방법원 영월지원", "춘천지방법원 영월지원 정선군법원", "춘천지방법원 영월지원 태백시법원", "춘천지방법원 영월지원 평창군법원", "춘천지방법원 원주지원", "춘천지방법원 원주지원 횡성군법원", "춘천지방법원 인제군법원", "춘천지방법원 홍천군법원", "춘천지방법원 화천군법원", "청주지방법원", "청주지방법원 괴산군법원", "청주지방법원 보은군법원", "청주지방법원 영동지원", "청주지방법원 영동지원 옥천군법원", "청주지방법원 제천지원", "청주지방법원 제천지원 단양군법원", "청주지방법원 진천군법원", "청주지방법원 충주지원", "청주지방법원 충주지원 음성군법원", "대전고등법원", "대전지방법원", "대전지방법원 공주지원", "대전지방법원 공주지원 청양군법원", "대전지방법원 금산군법원", "대전지방법원 논산지원", "대전지방법원 논산지원 부여군법원", "대전지방법원 서산지원", "대전지방법원 서산지원 당진시법원", "대전지방법원 서산지원 태안군법원", "대전지방법원 세종특별자치시법원", "대전지방법원 천안지원", "대전지방법원 천안지원 아산시법원", "대전지방법원 홍성지원", "대전지방법원 홍성지원 보령시법원", "대전지방법원 홍성지원 서천군법원", "대전지방법원 홍성지원 예산군법원", "대전가정법원", "대전가정법원 공주지원", "대전가정법원 논산지원", "대전가정법원 서산지원", "대전가정법원 천안지원", "대전가정법원 홍성지원", "특허법원", "대구고등법원", "대구지방법원", "대구지방법원 경산시법원", "대구지방법원 경주지원", "대구지방법원 서부지원 고령군법원", "대구지방법원 김천지원", "대구지방법원 김천지원 구미시법원", "대구지방법원 상주지원", "대구지방법원 상주지원 문경시법원", "대구지방법원 상주지원 예천군법원", "대구지방법원 서부지원", "대구지방법원 서부지원 성주군법원", "대구지방법원 안동지원", "대구지방법원 안동지원 봉화군법원", "대구지방법원 안동지원 영주시법원", "대구지방법원 영덕지원", "대구지방법원 영덕지원 영양군법원", "대구지방법원 영덕지원 울진군법원", "대구지방법원 영천시법원", "대구지방법원 의성지원", "대구지방법원 의성지원 군위군법원", "대구지방법원 의성지원 청송군법원", "대구지방법원 청도군법원", "대구지방법원 포항지원", "대구지방법원 칠곡군법원", "대구가정법원", "대구가정법원 경주지원", "대구가정법원 김천지원", "대구가정법원 상주지원", "대구가정법원 안동지원", "대구가정법원 영덕지원", "대구가정법원 의성지원", "대구가정법원 포항지원", "부산고등법원", "부산지방법원", "부산지방법원 동부지원", "부산지방법원 서부지원", "부산가정법원", "울산지방법원", "울산지방법원 양산시법원", "창원지방법원", "창원지방법원 거창지원", "창원지방법원 거창지원 함양군법원", "창원지방법원 거창지원 합천군법원", "창원지방법원 김해시법원", "창원지방법원 마산지원", "창원지방법원 마산지원 의령군법원", "창원지방법원 마산지원 함안군법원", "창원지방법원 밀양지원", "창원지방법원 밀양지원 창녕군법원", "창원지방법원 진주지원", "창원지방법원 진주지원 남해군법원", "창원지방법원 진주지원 사천시법원", "창원지방법원 진주지원 산청군법원", "창원지방법원 진주지원 하동군법원", "창원지방법원 창원남부시법원", "창원지방법원 통영지원", "창원지방법원 통영지원 거제시법원", "창원지방법원 통영지원 고성군법원", "광주고등법원", "광주지방법원", "광주지방법원 목포지원", "광주지방법원 장흥지원", "광주지방법원 순천지원", "광주지방법원 해남지원", "광주가정법원", "광주가정법원 장흥지원", "광주가정법원 순천지원", "광주가정법원 해남지원", "광주가정법원 목포지원", "광주지방법원 곡성군법원", "광주지방법원 영광군법원", "광주지방법원 나주시법원", "광주지방법원 장성군법원", "광주지방법원 화순군법원", "광주지방법원 담양군법원", "광주지방법원 목포지원 함평군법원", "광주지방법원 목포지원 영암군법원", "광주지방법원 목포지원 무안군법원", "광주지방법원 장흥지원 강진군법원", "광주지방법원 순천지원 보성군법원", "광주지방법원 순천지원 고흥군법원", "광주지방법원 순천지원 여수시법원", "광주지방법원 순천지원 구례군법원", "광주지방법원 순천지원 광양시법원", "광주지방법원 해남지원 완도군법원", "광주지방법원 해남지원 진도군법원", "전주지방법원", "전주지방법원 군산지원", "전주지방법원 군산지원 익산시법원", "전주지방법원 김제시법원", "전주지방법원 남원지원", "전주지방법원 남원지원 순창군법원", "전주지방법원 남원지원 장수군법원", "전주지방법원 무주군법원", "전주지방법원 임실군법원", "전주지방법원 정읍지원", "전주지방법원 정읍지원 고창군법원", "전주지방법원 정읍지원 부안군법원", "전주지방법원 진안군법원", "제주지방법원", "제주지방법원 서귀포시법원"];

function setupAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    
    input.addEventListener("input", function() {
        const val = this.value; 
        closeList(); 
        if (!val) return;
        const matches = courtList.filter(court => court.includes(val));
        if (matches.length === 0) return;
        
        matches.forEach(match => {
            const item = document.createElement("li"); 
            item.className = "suggestion-item";
            const regex = new RegExp(`(${val})`, "gi"); 
            item.innerHTML = match.replace(regex, "<strong>$1</strong>");
            item.addEventListener("click", function() { 
                input.value = match; 
                closeList(); 
                checkCaseInfoStep(); // [Check] 선택 시 검증 실행
            });
            list.appendChild(item);
        });
        input.classList.add("input-with-list"); 
        list.style.display = "block";
    });

    function closeList() { 
        list.innerHTML = ""; 
        list.style.display = "none"; 
        input.classList.remove("input-with-list"); 
    }

    document.addEventListener("click", function(e) { 
        if (e.target !== input && e.target !== list) { closeList(); } 
    });
}