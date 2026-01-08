/* ==========================================
   4_evidence.js
   - 소명 자료 선택 페이지 로직
   ========================================== */

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