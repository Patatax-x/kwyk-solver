/**
 * Kwyk Tutor - Options Script
 * ===========================
 * Gère la page d'options de l'extension
 */

const USERS_GIST_ID = 'b2ab6441fd1de494a4c3b33af765dcac';
const GIST_TOKEN = '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';

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

    // Elements profil
    const userPseudoInput = document.getElementById('user-pseudo');
    const userIdInput = document.getElementById('user-id');
    const pseudoHint = document.getElementById('pseudo-hint');

    // Charger la configuration existante
    loadConfig();
    loadUserProfile();

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
     * Charge le profil utilisateur depuis le storage local
     */
    function loadUserProfile() {
        chrome.storage.local.get(['kwykUserId', 'kwykUserPseudo'], async (result) => {
            // UUID
            if (result.kwykUserId) {
                userIdInput.value = result.kwykUserId;
            } else {
                const newId = crypto.randomUUID();
                chrome.storage.local.set({ kwykUserId: newId });
                userIdInput.value = newId;
            }

            // Pseudo
            if (result.kwykUserPseudo) {
                userPseudoInput.value = result.kwykUserPseudo;
            }

            // Vérifier si le pseudo est verrouillé par l'admin
            await checkPseudoLock(userIdInput.value);
        });
    }

    /**
     * Vérifie si le pseudo est verrouillé par l'admin
     */
    async function checkPseudoLock(userId) {
        try {
            const response = await fetch(`https://api.github.com/gists/${USERS_GIST_ID}`, {
                headers: { 'Authorization': `token ${GIST_TOKEN}` }
            });
            if (!response.ok) return;

            const gist = await response.json();
            const file = gist.files['kwyk-users.json'];
            if (!file) return;

            let usersData;
            try {
                usersData = JSON.parse(file.content);
            } catch (e) {
                console.error('[Kwyk Tutor] JSON corrompu dans Gist users:', e);
                return;
            }
            const userData = usersData[userId];

            if (userData) {
                // Si l'admin a renommé, mettre à jour
                if (userData.name && userData.name !== userPseudoInput.value) {
                    userPseudoInput.value = userData.name;
                    chrome.storage.local.set({ kwykUserPseudo: userData.name });
                }

                // Si verrouillé, désactiver le champ
                if (userData.locked) {
                    userPseudoInput.disabled = true;
                    userPseudoInput.style.background = '#f8f9fa';
                    userPseudoInput.style.color = '#6c757d';
                    pseudoHint.textContent = 'Pseudo verrouillé par l\'administrateur.';
                    pseudoHint.style.color = '#dc3545';
                }
            }
        } catch (error) {
            console.error('[Kwyk Tutor] Erreur vérification pseudo lock:', error);
        }
    }

    /**
     * Enregistre le pseudo dans le Gist
     */
    async function registerPseudo(pseudo, userId) {
        try {
            const response = await fetch(`https://api.github.com/gists/${USERS_GIST_ID}`, {
                headers: { 'Authorization': `token ${GIST_TOKEN}` }
            });
            if (!response.ok) return false;

            const gist = await response.json();
            const file = gist.files['kwyk-users.json'];
            let usersData = {};
            if (file) {
                try {
                    usersData = JSON.parse(file.content);
                } catch (e) {
                    console.error('[Kwyk Tutor] JSON corrompu dans Gist users:', e);
                }
            }

            const existing = usersData[userId] || {};
            usersData[userId] = {
                name: pseudo,
                enabled: existing.enabled !== undefined ? existing.enabled : true,
                locked: existing.locked || false,
                lastSeen: new Date().toISOString()
            };

            const writeResponse = await fetch(`https://api.github.com/gists/${USERS_GIST_ID}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${GIST_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: {
                        'kwyk-users.json': {
                            content: JSON.stringify(usersData, null, 2)
                        }
                    }
                })
            });

            return writeResponse.ok;
        } catch (error) {
            console.error('[Kwyk Tutor] Erreur enregistrement pseudo:', error);
            return false;
        }
    }

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
     * Sélectionne un mode
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
     * Obtient le mode sélectionné
     */
    function getSelectedMode() {
        if (optPedagogique.classList.contains('selected')) return 'pedagogique';
        if (optTriche.classList.contains('selected')) return 'triche';
        return 'pedagogique';
    }

    /**
     * Teste la connexion à l'API Mistral
     */
    async function testConnection() {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showTestResult('Veuillez entrer une clé API', 'error');
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
                showTestResult('Connexion réussie ! L\'API fonctionne correctement.', 'success');
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
     * Affiche le résultat du test
     */
    function showTestResult(message, type) {
        testResult.textContent = message;
        testResult.className = `test-result ${type}`;
        testResult.style.display = 'block';
    }

    /**
     * Sauvegarde la configuration
     */
    async function saveConfig() {
        const pseudo = userPseudoInput.value.trim();
        const currentUserId = userIdInput.value;

        // Sauvegarder le pseudo si modifié et non verrouillé
        if (pseudo && !userPseudoInput.disabled) {
            chrome.storage.local.set({ kwykUserPseudo: pseudo });
            await registerPseudo(pseudo, currentUserId);
        }

        const config = {
            mistralApiKey: apiKeyInput.value.trim(),
            model: modelSelect.value,
            mode: getSelectedMode(),
            cheatAutoValidate: cheatAutoValidate.checked,
            cheatAutoNext: cheatAutoNext.checked
        };

        // Validation
        if (!config.mistralApiKey) {
            showToast('Veuillez entrer une clé API', 'error');
            return;
        }

        chrome.storage.sync.set(config, () => {
            showToast('Configuration sauvegardée !', 'success');
            console.log('[Kwyk Tutor] Configuration sauvegardée:', config);
        });
    }

    /**
     * Réinitialise la configuration
     */
    function resetConfig() {
        if (confirm('Êtes-vous sûr de vouloir réinitialiser tous les paramètres ?')) {
            chrome.storage.sync.clear(() => {
                apiKeyInput.value = '';
                modelSelect.value = 'mistral-medium-latest';
                selectMode('pedagogique');
                testResult.style.display = 'none';
                // Reset des options triche
                cheatAutoValidate.checked = false;
                cheatAutoNext.checked = false;
                cheatAutoNext.disabled = true;
                showToast('Configuration réinitialisée', 'success');
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
