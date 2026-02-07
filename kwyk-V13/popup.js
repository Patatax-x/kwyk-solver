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
    const modePedagogique = document.getElementById('mode-pedagogique');
    const modeDirect = document.getElementById('mode-direct');
    const btnOptions = document.getElementById('btn-options');

    // Charger la configuration
    loadConfig();

    // Evenements
    modePedagogique.addEventListener('click', () => setMode('pedagogique'));
    modeDirect.addEventListener('click', () => setMode('direct'));
    btnOptions.addEventListener('click', openOptions);

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
            const currentMode = result.mode || 'pedagogique';
            updateModeUI(currentMode);
        });
    }

    /**
     * Change le mode d'assistance
     */
    function setMode(mode) {
        chrome.storage.sync.set({ mode: mode }, () => {
            updateModeUI(mode);
            console.log('[Kwyk Tutor] Mode change:', mode);
        });
    }

    /**
     * Met a jour l'interface du mode
     */
    function updateModeUI(mode) {
        modePedagogique.classList.toggle('active', mode === 'pedagogique');
        modeDirect.classList.toggle('active', mode === 'direct');
    }

    /**
     * Ouvre la page d'options
     */
    function openOptions() {
        chrome.runtime.openOptionsPage();
    }
});
