/* ==========================================
   4_evidence.js
   - [FIX] '작성 완료(미리보기)' 버튼 이벤트 리스너 추가
   - 소명 자료 선택 페이지 로직
   ========================================== */

document.addEventListener('DOMContentLoaded', function() {
    // 5_preview.js로 넘어가는 버튼(btnToPreview)에 이벤트 연결
    const btnPreview = document.getElementById('btnToPreview');
    if (btnPreview) {
        btnPreview.addEventListener('click', function() {
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
        });
    }
});

function goToEvidence() {
    playTransition("이제 거의 다 왔습니다.<br>지출한 소송 비용을 소명할 수 있는 자료를 선택해주세요.", function() {
        document.getElementById('calcPage').classList.add('hidden');
        const maxLevel = getMaxInstanceLevel();
        if (maxLevel >= 2) document.getElementById('ev-group-2').classList.remove('hidden'); else document.getElementById('ev-group-2').classList.add('hidden');
        if (maxLevel >= 3) document.getElementById('ev-group-3').classList.remove('hidden'); else document.getElementById('ev-group-3').classList.add('hidden');
        const evPage = document.getElementById('evidencePage'); evPage.classList.remove('hidden'); evPage.classList.add('fade-in-section');
        window.scrollTo({ top: 0, behavior: 'smooth' }); updateBackButtonVisibility();
    });
}