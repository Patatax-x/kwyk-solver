/**
 * Kwyk Tutor - Options Script (Firefox)
 * ======================================
 * Gère la page d'options de l'extension
 * Version Firefox : sans gestion utilisateur
 */

document.addEventListener('DOMContentLoaded', () => {
    // Elements DOM
    const apiKeyInput = document.getElementById('api-key');
    const modelSelect = document.getElementById('model');
    const optPedagogique = document.getElementById('opt-pedagogique');
    const optTriche = document.getElementById('opt-triche');
    const optRevision = document.getElementById('opt-revision');
    const btnTest = document.getElementById('btn-test');
    const btnSave = document.getElementById('btn-save');
    const btnReset = document.getElementById('btn-reset');
    const testResult = document.getElementById('test-result');
    const toast = document.getElementById('toast');

    // Elements pour les options du mode triche
    const cheatOptionsCard = document.getElementById('cheat-options-card');
    const cheatAutoValidate = document.getElementById('cheat-auto-validate');
    const cheatAutoNext = document.getElementById('cheat-auto-next');

    // Elements position panneau
    const optSideLeft = document.getElementById('opt-side-left');
    const optSideRight = document.getElementById('opt-side-right');

    // Elements raccourci
    const shortcutInput = document.getElementById('shortcut-input');
    const btnResetShortcut = document.getElementById('btn-reset-shortcut');
    const btnHelp = document.getElementById('btn-help');
    const helpHint = document.getElementById('help-hint');

    // Charger la configuration existante
    loadConfig();

    // Evenements
    optPedagogique.addEventListener('click', () => selectMode('pedagogique'));
    optTriche.addEventListener('click', () => selectMode('triche'));
    optRevision.addEventListener('click', () => selectMode('revision'));
    optSideLeft.addEventListener('click', () => selectSide('left'));
    optSideRight.addEventListener('click', () => selectSide('right'));
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

    // Capture du raccourci clavier
    shortcutInput.addEventListener('keydown', (e) => {
        e.preventDefault();
        const parts = [];
        if (e.ctrlKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');
        const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
        if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
            parts.push(key);
        }
        if (parts.length >= 2) {
            const shortcut = parts.join('+');
            shortcutInput.value = formatShortcutDisplay(shortcut);
            shortcutInput.dataset.shortcut = shortcut;
        }
    });
    btnResetShortcut.addEventListener('click', () => {
        shortcutInput.value = formatShortcutDisplay('ctrl+enter');
        shortcutInput.dataset.shortcut = 'ctrl+enter';
    });

    // Bouton aide → copie email
    if (btnHelp) {
        btnHelp.addEventListener('click', () => {
            navigator.clipboard.writeText('patatax.contact@gmail.com').then(() => {
                btnHelp.textContent = '✓ Email copié !';
                setTimeout(() => { btnHelp.textContent = '❓ Copier l\'email du support'; }, 2000);
            });
        });
    }

    /**
     * Charge la configuration depuis le storage
     */
    function loadConfig() {
        chrome.storage.sync.get(['mistralApiKey', 'model', 'mode', 'cheatAutoValidate', 'cheatAutoNext', 'panelSide', 'panelShortcut'], (result) => {
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
            // Charger la position du panneau
            if (result.panelSide) {
                selectSide(result.panelSide);
            } else {
                selectSide('right');
            }
            // Charger le raccourci
            const shortcut = result.panelShortcut || 'ctrl+enter';
            shortcutInput.value = formatShortcutDisplay(shortcut);
            shortcutInput.dataset.shortcut = shortcut;
        });
    }

    /**
     * Formate un raccourci pour affichage lisible
     */
    function formatShortcutDisplay(shortcut) {
        return shortcut.split('+').map(k => {
            if (k === 'ctrl') return 'Ctrl';
            if (k === 'alt') return 'Alt';
            if (k === 'shift') return 'Shift';
            if (k === 'enter') return 'Entrée';
            if (k === 'space') return 'Espace';
            return k.toUpperCase();
        }).join(' + ');
    }

    /**
     * Sélectionne un côté
     */
    function selectSide(side) {
        optSideLeft.classList.toggle('selected', side === 'left');
        optSideRight.classList.toggle('selected', side === 'right');
        optSideLeft.querySelector('input').checked = side === 'left';
        optSideRight.querySelector('input').checked = side === 'right';
    }

    /**
     * Obtient le côté sélectionné
     */
    function getSelectedSide() {
        if (optSideLeft.classList.contains('selected')) return 'left';
        return 'right';
    }

    /**
     * Sélectionne un mode
     */
    function selectMode(mode) {
        optPedagogique.classList.toggle('selected', mode === 'pedagogique');
        optTriche.classList.toggle('selected', mode === 'triche');
        optRevision.classList.toggle('selected', mode === 'revision');
        optPedagogique.querySelector('input').checked = mode === 'pedagogique';
        optTriche.querySelector('input').checked = mode === 'triche';
        optRevision.querySelector('input').checked = mode === 'revision';

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
        if (optRevision.classList.contains('selected')) return 'revision';
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
    function saveConfig() {
        const config = {
            mistralApiKey: apiKeyInput.value.trim(),
            model: modelSelect.value,
            mode: getSelectedMode(),
            cheatAutoValidate: cheatAutoValidate.checked,
            cheatAutoNext: cheatAutoNext.checked,
            panelSide: getSelectedSide(),
            panelShortcut: shortcutInput.dataset.shortcut || 'ctrl+enter'
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
                selectSide('right');
                testResult.style.display = 'none';
                // Reset des options triche
                cheatAutoValidate.checked = false;
                cheatAutoNext.checked = false;
                cheatAutoNext.disabled = true;
                // Reset raccourci
                shortcutInput.value = formatShortcutDisplay('ctrl+enter');
                shortcutInput.dataset.shortcut = 'ctrl+enter';
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
