/* ==========================================
   4_evidence.js
   - [FIX] '작성 완료(미리보기)' 버튼 이벤트 리스너 강화 (readyState 체크)
   - [FIX] goToEvidence 함수: playTransition 부재 시 안전 처리 (페이지 전환 보장)
   - 소명 자료 선택 페이지 로직
   ========================================== */

function initEvidencePage() {
    // 5_preview.js로 넘어가는 버튼(btnToPreview)에 이벤트 연결
    const btnPreview = document.getElementById('btnToPreview');
    if (btnPreview) {
        btnPreview.onclick = function() {
            // 5_preview.js에 있는 함수 호출
            if (typeof goToPreview === 'function') {
                goToPreview();
            } else {
                // goToPreview 함수가 없을 경우 강제 전환 (안전 장치)
                const evPage = document.getElementById('evidencePage');
                const pvPage = document.getElementById('previewPage');
                if(evPage) evPage.classList.add('hidden');
                if(pvPage) {
                    pvPage.classList.remove('hidden');
                    pvPage.classList.add('fade-in-section');
                    // 미리보기 렌더링 함수가 있다면 호출
                    if(typeof renderPreview === 'function') renderPreview();
                }
                window.scrollTo(0, 0);
            }
        };
    }
}

// DOM 로드 상태 체크 후 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEvidencePage);
} else {
    initEvidencePage();
}

function goToEvidence() {
    // [FIX] 페이지 전환 로직을 함수로 분리 (콜백 및 Fallback용)
    const performTransition = function() {
        document.getElementById('calcPage').classList.add('hidden');
        
        // 심급별 증빙 자료 그룹 가시성 처리
        const maxLevel = (typeof getMaxInstanceLevel === 'function') ? getMaxInstanceLevel() : 3;
        
        const g2 = document.getElementById('ev-group-2');
        const g3 = document.getElementById('ev-group-3');
        
        if (g2) { 
            if (maxLevel >= 2) g2.classList.remove('hidden'); 
            else g2.classList.add('hidden'); 
        }
        if (g3) { 
            if (maxLevel >= 3) g3.classList.remove('hidden'); 
            else g3.classList.add('hidden'); 
        }
        
        const evPage = document.getElementById('evidencePage'); 
        if (evPage) {
            evPage.classList.remove('hidden'); 
            evPage.classList.add('fade-in-section');
        }
        
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
        
        if (typeof updateBackButtonVisibility === 'function') updateBackButtonVisibility();
    };

    // playTransition 함수 존재 여부 확인 후 실행 (없으면 바로 전환)
    if (typeof playTransition === 'function') {
        playTransition("이제 거의 다 왔습니다.<br>지출한 소송 비용을 소명할 수 있는 자료를 선택해주세요.", performTransition);
    } else {
        performTransition();
    }
}