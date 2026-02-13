/**
 * Kwyk Tutor - Popup Script
 * =========================
 * Gere l'interface du popup de l'extension
 */

document.addEventListener('DOMContentLoaded', () => {
    // Elements DOM
    const apiIndicator = document.getElementById('api-indicator');
    const apiStatus = document.getElementById('api-status');
    const apiWarning = document.getElementById('api-warning');
    const btnOptions = document.getElementById('btn-options');
    const modeOptions = document.querySelectorAll('.mode-option');
    const modeRadios = document.querySelectorAll('input[name="mode"]');

    // Charger la configuration
    loadConfig();

    // Evenements
    btnOptions.addEventListener('click', openOptions);

    // Clic sur les cartes de mode
    modeOptions.forEach(option => {
        option.addEventListener('click', () => {
            const radio = option.querySelector('input[type="radio"]');
            radio.checked = true;
            updateModeSelection();
            chrome.storage.sync.set({ mode: radio.value });
        });
    });

    /**
     * Charge la configuration depuis le storage
     */
    function loadConfig() {
        chrome.storage.sync.get(['mistralApiKey', 'mode'], (result) => {
            // Verifier l'API
            if (result.mistralApiKey && result.mistralApiKey.length > 10) {
                apiIndicator.classList.add('ok');
                apiIndicator.classList.remove('error', 'warning');
                apiStatus.textContent = 'Cle API configuree';
                apiWarning.classList.add('hidden');
            } else {
                apiIndicator.classList.add('warning');
                apiIndicator.classList.remove('ok', 'error');
                apiStatus.textContent = 'Cle API non configuree';
                apiWarning.classList.remove('hidden');
            }

            // Charger le mode
            const mode = result.mode || 'pedagogique';
            const radio = document.querySelector(`input[name="mode"][value="${mode}"]`);
            if (radio) radio.checked = true;
            updateModeSelection();
        });
    }

    /**
     * Met a jour le style des cartes de mode
     */
    function updateModeSelection() {
        modeOptions.forEach(option => {
            const radio = option.querySelector('input[type="radio"]');
            option.classList.toggle('selected', radio.checked);
        });
    }

    /**
     * Ouvre la page d'options
     */
    function openOptions() {
        chrome.runtime.openOptionsPage();
    }
});
