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

    // Charger la configuration
    loadConfig();

    // Evenements
    btnOptions.addEventListener('click', openOptions);

    /**
     * Charge la configuration depuis le storage
     */
    function loadConfig() {
        chrome.storage.sync.get(['mistralApiKey'], (result) => {
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
        });
    }

    /**
     * Ouvre la page d'options
     */
    function openOptions() {
        chrome.runtime.openOptionsPage();
    }
});
