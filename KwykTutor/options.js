/**
 * Kwyk Tutor - Options Script
 * ===========================
 * Gere la page d'options de l'extension
 */

document.addEventListener('DOMContentLoaded', () => {
    // Elements DOM
    const apiKeyInput = document.getElementById('api-key');
    const modelSelect = document.getElementById('model');
    const optPedagogique = document.getElementById('opt-pedagogique');
    const optTriche = document.getElementById('opt-triche');
    const btnTest = document.getElementById('btn-test');
    const btnSave = document.getElementById('btn-save');
    const btnReset = document.getElementById('btn-reset');
    const testResult = document.getElementById('test-result');
    const toast = document.getElementById('toast');

    // Elements pour les options du mode triche
    const cheatOptionsCard = document.getElementById('cheat-options-card');
    const cheatAutoValidate = document.getElementById('cheat-auto-validate');
    const cheatAutoNext = document.getElementById('cheat-auto-next');

    // Charger la configuration existante
    loadConfig();

    // Evenements
    optPedagogique.addEventListener('click', () => selectMode('pedagogique'));
    optTriche.addEventListener('click', () => selectMode('triche'));
    btnTest.addEventListener('click', testConnection);
    btnSave.addEventListener('click', saveConfig);
    btnReset.addEventListener('click', resetConfig);

    // Event pour activer/desactiver auto-next selon auto-validate
    cheatAutoValidate.addEventListener('change', () => {
        if (cheatAutoValidate.checked) {
            cheatAutoNext.disabled = false;
        } else {
            cheatAutoNext.disabled = true;
            cheatAutoNext.checked = false;
        }
    });

    /**
     * Charge la configuration depuis le storage
     */
    function loadConfig() {
        chrome.storage.sync.get(['mistralApiKey', 'model', 'mode', 'cheatAutoValidate', 'cheatAutoNext'], (result) => {
            if (result.mistralApiKey) {
                apiKeyInput.value = result.mistralApiKey;
            }
            if (result.model) {
                modelSelect.value = result.model;
            }
            if (result.mode) {
                selectMode(result.mode);
            } else {
                selectMode('pedagogique');
            }
            // Charger les options du mode triche
            if (result.cheatAutoValidate) {
                cheatAutoValidate.checked = true;
                cheatAutoNext.disabled = false;
            }
            if (result.cheatAutoNext) {
                cheatAutoNext.checked = true;
            }
        });
    }

    /**
     * Selectionne un mode
     */
    function selectMode(mode) {
        optPedagogique.classList.toggle('selected', mode === 'pedagogique');
        optTriche.classList.toggle('selected', mode === 'triche');
        optPedagogique.querySelector('input').checked = mode === 'pedagogique';
        optTriche.querySelector('input').checked = mode === 'triche';

        // Afficher/masquer les options du mode triche
        if (cheatOptionsCard) {
            cheatOptionsCard.style.display = mode === 'triche' ? 'block' : 'none';
        }
    }

    /**
     * Obtient le mode selectionne
     */
    function getSelectedMode() {
        if (optPedagogique.classList.contains('selected')) return 'pedagogique';
        if (optTriche.classList.contains('selected')) return 'triche';
        return 'pedagogique';
    }

    /**
     * Teste la connexion a l'API Mistral
     */
    async function testConnection() {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showTestResult('Veuillez entrer une cle API', 'error');
            return;
        }

        btnTest.disabled = true;
        btnTest.textContent = 'Test en cours...';
        testResult.className = 'test-result';
        testResult.style.display = 'none';

        try {
            const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelSelect.value,
                    messages: [
                        { role: 'user', content: 'Reponds juste "OK" pour tester la connexion.' }
                    ],
                    max_tokens: 10
                })
            });

            if (response.ok) {
                showTestResult('Connexion reussie ! L\'API fonctionne correctement.', 'success');
            } else {
                const data = await response.json().catch(() => ({}));
                const errorMsg = data.error?.message || `Erreur ${response.status}`;
                showTestResult(`Erreur de connexion: ${errorMsg}`, 'error');
            }
        } catch (error) {
            showTestResult(`Erreur: ${error.message}`, 'error');
        } finally {
            btnTest.disabled = false;
            btnTest.textContent = 'Tester la connexion';
        }
    }

    /**
     * Affiche le resultat du test
     */
    function showTestResult(message, type) {
        testResult.textContent = message;
        testResult.className = `test-result ${type}`;
        testResult.style.display = 'block';
    }

    /**
     * Sauvegarde la configuration
     */
    function saveConfig() {
        const config = {
            mistralApiKey: apiKeyInput.value.trim(),
            model: modelSelect.value,
            mode: getSelectedMode(),
            cheatAutoValidate: cheatAutoValidate.checked,
            cheatAutoNext: cheatAutoNext.checked
        };

        // Validation
        if (!config.mistralApiKey) {
            showToast('Veuillez entrer une cle API', 'error');
            return;
        }

        chrome.storage.sync.set(config, () => {
            showToast('Configuration sauvegardee !', 'success');
            console.log('[Kwyk Tutor] Configuration sauvegardee:', config);
        });
    }

    /**
     * Reinitialise la configuration
     */
    function resetConfig() {
        if (confirm('Etes-vous sur de vouloir reinitialiser tous les parametres ?')) {
            chrome.storage.sync.clear(() => {
                apiKeyInput.value = '';
                modelSelect.value = 'mistral-medium-latest';
                selectMode('pedagogique');
                testResult.style.display = 'none';
                // Reset des options triche
                cheatAutoValidate.checked = false;
                cheatAutoNext.checked = false;
                cheatAutoNext.disabled = true;
                showToast('Configuration reinitialisee', 'success');
            });
        }
    }

    /**
     * Affiche une notification toast
     */
    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = `toast show ${type}`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
});
