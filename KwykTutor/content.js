/**
 * Kwyk Tutor - Version 12 (V12)
 * =============================
 * VERSION MAJEURE - Refonte complète
 *
 * Nouveautés V12:
 * - FIX CRITIQUE: MathQuill utilise write() au lieu de latex() pour préserver le format
 *   (latex() convertissait \mathbb{R} en ℝ Unicode → Kwyk comptait faux)
 * - FEATURE: Sélection du modèle IA (small/medium/large)
 * - FEATURE: Statistiques d'utilisation dans l'UI
 * - FEATURE: Thème sombre (toggle manuel)
 * - FEATURE: Raccourci Ctrl+Enter pour ouvrir/fermer le panneau
 * - FEATURE: Notifications sonores (beep)
 * - FEATURE: Cache des exercices (évite de rappeler l'IA)
 * - FEATURE: Support tableaux de variation (expérimental)
 *
 * Historique:
 * - v24: Polling rapide, vérification bouton Suivant
 * - v23: Désactivation mode triche sur exercices non supportés
 * - v22: Timeouts réduits, auto-skip exercices non supportés
 *
 * v22:
 * - SPEED: Timeouts réduits en mode triche auto (validation + suivant)
 * - SPEED: Délai réduit après détection d'exercice
 * - FEATURE: Auto-skip des exercices non supportés (passe au suivant)
 *
 * v21:
 * - FIX: Pattern checkboxes corrigé (id_answer_X_Y au lieu de id_mcq_answer_X_Y)
 * - FIX: Pattern input text corrigé (id_answer_X global)
 * - FIX: Matching QCM amélioré (exact match, puis mot entier, puis premier mot)
 * - FIX: Support type qcm_multiples de l'IA
 * - FIX: Détection automatique améliorée quand type=unknown
 *
 * v20:
 * - Auto-validation après remplissage (optionnel)
 * - Auto-clic sur Suivant après validation (optionnel)
 * - Gestion du mode triche activé avant détection d'exercice
 *
 * v19:
 * - Détection QCM améliorée : cherche les radios HORS du bloc .exercise_question
 * - Fallback intelligent : si type inconnu, essaye radio avant input
 *
 * v18:
 * - Remplissage de TOUTES les questions d'un coup
 * - Support multi-champs MathQuill (via fieldIndex)
 * - Meilleure détection des QCM par pattern id_mcq_answer_X_Y
 * - Masquage du switch triche pour exercices non supportés
 *
 * v17:
 * - MODE TRICHE: remplissage automatique des réponses
 * - Switch ON/OFF iOS style
 * - Animation highlight vert sur champs remplis
 * - Retry 3x en cas d'erreur API
 *
 * v16:
 * - Mode pédagogique: bouton Réponse masqué
 * - Encadré réponse retiré de l'onglet Explique
 *
 * v15:
 * - Message malicieux pour exercices non supportés
 * - Réponses IA sans explication (valeur seule)
 *
 * v14:
 * - Détection exercices non supportés (tableaux, graphiques)
 */

(function() {
    'use strict';

    console.log('[Kwyk Tutor] === Démarrage V12 - Version majeure ===');

    // Config
    let config = {
        mistralApiKey: '',
        model: 'mistral-medium-latest',
        mode: 'pedagogique',  // 'pedagogique', 'direct' ou 'triche'
        cheatAutoValidate: false,
        cheatAutoNext: false,
        sounds: true,  // V12: Notifications sonores
        theme: 'light' // V12: Thème (light/dark)
    };

    // V12: Notification sonore (beep)
    function playBeep(type = 'success') {
        if (!config.sounds) return;

        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            // Fréquence selon le type
            oscillator.frequency.value = type === 'success' ? 800 : 400;
            oscillator.type = 'sine';

            // Volume faible
            gainNode.gain.value = 0.1;

            oscillator.start();
            setTimeout(() => {
                oscillator.stop();
                ctx.close();
            }, 150);
        } catch (e) {
            console.log('[Kwyk Tutor] Audio non supporté');
        }
    }

    // État
    let currentExercise = null;
    let cachedSolution = null;
    let isLoading = false;
    let lastExerciseHash = '';
    let currentQuestionIndex = 0; // Pour la navigation
    let cheatModeActive = false; // État du switch ON/OFF (toujours OFF au démarrage)
    let pendingCheatMode = false; // Si le mode triche a été activé avant détection d'exercice
    let cheatExecutionId = 0; // ID unique pour chaque exécution du mode triche (évite les races)
    let cheatModeRunning = false; // Verrou pour empêcher les exécutions simultanées

    // ===========================================
    // CONTRÔLE À DISTANCE (blocage par plages horaires)
    // ===========================================

    const GIST_RAW_URL = 'https://gist.githubusercontent.com/Patatax-x/41704ea544bc0e2531d20a0d9c9d592e/raw/kwyk-config.json';
    const LOCAL_VERSION = '13.0.0';

    let extensionBlocked = false;   // true si une plage de blocage est active
    let blockedMessage = '';        // Message à afficher quand bloqué

    /**
     * Vérifie la config distante (Gist) pour bloquer l'extension pendant les contrôles
     * Stocke le résultat dans extensionBlocked (ne bloque PAS Kwyk, seulement l'extension)
     */
    async function checkRemoteConfig() {
        try {
            console.log('[Kwyk Tutor] Vérification config distante...');
            const response = await fetch(GIST_RAW_URL + '?t=' + Date.now(), { cache: 'no-store' });

            if (!response.ok) {
                console.error('[Kwyk Tutor] Erreur fetch config:', response.status);
                extensionBlocked = true;
                blockedMessage = 'Impossible de vérifier la configuration. Vérifiez votre connexion.';
                return;
            }

            const remoteConfig = await response.json();
            console.log('[Kwyk Tutor] Config distante reçue:', remoteConfig);

            // Vérifier les plages horaires bloquées
            if (remoteConfig.blocked_periods && remoteConfig.blocked_periods.length > 0) {
                const now = new Date();
                for (const period of remoteConfig.blocked_periods) {
                    const start = new Date(period.start);
                    const end = new Date(period.end);

                    if (now >= start && now <= end) {
                        console.log('[Kwyk Tutor] ⛔ PÉRIODE BLOQUÉE:', period.label);
                        const endStr = end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        extensionBlocked = true;
                        blockedMessage = `${period.label || 'Contrôle en cours'} - Indisponible jusqu'à ${endStr}`;
                        return;
                    }
                }
            }


            // Vérifier la version (notification, pas blocage)
            if (remoteConfig.version && remoteConfig.version !== LOCAL_VERSION) {
                // Vérifier si l'utilisateur a déjà fait cette mise à jour
                const stored = await new Promise(r => chrome.storage.local.get('kwykLastUpdate', r));
                if (stored.kwykLastUpdate === remoteConfig.version) {
                    console.log('[Kwyk Tutor] ✓ Déjà à jour (v' + remoteConfig.version + ' installée)');
                } else {
                    console.log('[Kwyk Tutor] ℹ️ Mise à jour disponible:', remoteConfig.version);
                    window._kwykUpdateAvailable = remoteConfig.version;
                    window._kwykUpdateConfig = remoteConfig;
                }
            }

            console.log('[Kwyk Tutor] ✓ Aucun blocage actif');

        } catch (error) {
            console.error('[Kwyk Tutor] Erreur vérification config:', error);
            extensionBlocked = true;
            blockedMessage = 'Impossible de vérifier la configuration. Vérifiez votre connexion.';
        }
    }

    // ===========================================
    // MISE À JOUR INLINE
    // ===========================================

    async function performInlineUpdate() {
        const btn = document.getElementById('kwyk-update-link');
        const banner = document.getElementById('kwyk-update-banner');

        try {
            // Re-fetch la config fraîche (évite les problèmes de cache CDN)
            btn.textContent = 'Chargement...';
            btn.disabled = true;
            const freshResponse = await fetch(GIST_RAW_URL + '?t=' + Date.now(), { cache: 'no-store' });
            const config = await freshResponse.json();
            console.log('[Kwyk Tutor] Config fraîche pour update:', config);

            if (!config.update_repo || !config.update_files) {
                alert('Configuration de mise à jour non disponible. Contactez l\'administrateur.');
                btn.textContent = 'Mettre à jour';
                btn.disabled = false;
                return;
            }
            // Étape 1 : Sélectionner le dossier
            btn.textContent = 'Sélectionnez le dossier...';
            btn.disabled = true;

            let dirHandle;
            try {
                dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            } catch (e) {
                if (e.name === 'AbortError') {
                    btn.textContent = 'Mettre à jour';
                    btn.disabled = false;
                    return;
                }
                throw e;
            }

            // Vérifier que c'est le bon dossier
            try {
                await dirHandle.getFileHandle('manifest.json');
            } catch {
                alert('Ce dossier ne contient pas manifest.json. Sélectionnez le dossier de l\'extension.');
                btn.textContent = 'Mettre à jour';
                btn.disabled = false;
                return;
            }

            // Étape 2 : Télécharger et écrire les fichiers
            const files = config.update_files;
            const repo = config.update_repo;
            const branch = config.update_branch || 'main';
            const basePath = config.update_path ? config.update_path + '/' : '';
            let done = 0;

            console.log('[Kwyk Tutor] Update config:', JSON.stringify({ repo, branch, basePath, files }));

            for (const file of files) {
                btn.textContent = `${done}/${files.length} fichiers...`;

                const url = `https://raw.githubusercontent.com/${repo}/${branch}/${basePath}${file}?t=${Date.now()}`;
                console.log(`[Kwyk Tutor] Téléchargement: ${url}`);
                const response = await fetch(url);

                if (!response.ok) {
                    console.error(`[Kwyk Tutor] Erreur téléchargement ${file}: HTTP ${response.status} — URL: ${url}`);
                    continue;
                }

                // Gérer les sous-dossiers
                const parts = file.split('/');
                let currentDir = dirHandle;
                for (let j = 0; j < parts.length - 1; j++) {
                    currentDir = await currentDir.getDirectoryHandle(parts[j], { create: true });
                }

                const fileName = parts[parts.length - 1];
                const isBinary = /\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf)$/i.test(fileName);

                const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();

                if (isBinary) {
                    await writable.write(await response.blob());
                } else {
                    await writable.write(await response.text());
                }
                await writable.close();
                done++;
            }

            // Succès
            banner.innerHTML = `
                <span>v${config.version} installée ! Rechargement...</span>
            `;
            banner.style.borderColor = 'rgba(39, 174, 96, 0.5)';
            banner.style.background = 'rgba(39, 174, 96, 0.1)';
            banner.style.color = '#27ae60';

            console.log(`[Kwyk Tutor] Mise à jour terminée: ${done}/${files.length} fichiers`);

            // Sauvegarder la version installée (pour ne plus afficher la bannière)
            chrome.storage.local.set({ kwykLastUpdate: config.version });

            // Recharger l'extension + la page automatiquement
            setTimeout(() => {
                chrome.runtime.sendMessage({ action: 'reloadExtension' });
            }, 1500);

        } catch (error) {
            console.error('[Kwyk Tutor] Erreur mise à jour:', error);
            btn.textContent = 'Mettre à jour';
            btn.disabled = false;
            alert('Erreur: ' + error.message);
        }
    }

    // ===========================================
    // INIT
    // ===========================================

    async function init() {
        console.log('[Kwyk Tutor] Initialisation...');

        // ÉTAPE 0: Vérifier le blocage distant
        await checkRemoteConfig();

        await loadConfig();
        createUI();

        // Si bloqué : masquer le panneau et afficher le message au clic
        if (extensionBlocked) {
            console.log('[Kwyk Tutor] ⛔ Extension bloquée:', blockedMessage);
            const btn = document.getElementById('kwyk-tutor-btn');
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    // Afficher un mini popup de blocage à côté du bouton
                    let popup = document.getElementById('kwyk-blocked-popup');
                    if (popup) {
                        popup.remove();
                        return;
                    }
                    popup = document.createElement('div');
                    popup.id = 'kwyk-blocked-popup';
                    popup.innerHTML = `
                        <div class="kwyk-blocked-popup-icon">🔒</div>
                        <div class="kwyk-blocked-popup-text">${blockedMessage}</div>
                    `;
                    document.body.appendChild(popup);
                    // Fermer après 4 secondes
                    setTimeout(() => popup?.remove(), 4000);
                }, true); // capture=true pour intercepter AVANT les autres listeners
            }
            return; // Ne PAS initialiser le reste (détection, observer, etc.)
        }

        // Afficher la bannière de mise à jour si disponible
        if (window._kwykUpdateAvailable) {
            const panel = document.getElementById('kwyk-tutor-panel');
            if (panel) {
                const banner = document.createElement('div');
                banner.id = 'kwyk-update-banner';
                banner.innerHTML = `
                    <span>Mise à jour v${window._kwykUpdateAvailable} disponible</span>
                    <button id="kwyk-update-link">Mettre à jour</button>
                `;
                const header = panel.querySelector('.kwyk-tutor-header');
                if (header) {
                    header.after(banner);
                }
                document.getElementById('kwyk-update-link').addEventListener('click', () => {
                    performInlineUpdate();
                });
            }
        }

        updateButtonsForMode();

        setTimeout(() => {
            detectExercise();
        }, 1500);

        // Observer les changements
        setupExerciseObserver();

        // Ecouter les changements de mode en temps réel
        if (chrome?.storage?.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'sync') {
                    if (changes.mode) {
                        config.mode = changes.mode.newValue;
                        updateButtonsForMode();
                        console.log('[Kwyk Tutor] Mode changé en temps réel:', config.mode);
                    }
                    if (changes.cheatAutoValidate !== undefined) {
                        config.cheatAutoValidate = changes.cheatAutoValidate.newValue;
                        console.log('[Kwyk Tutor] Auto-validate changé:', config.cheatAutoValidate);
                    }
                    if (changes.cheatAutoNext !== undefined) {
                        config.cheatAutoNext = changes.cheatAutoNext.newValue;
                        console.log('[Kwyk Tutor] Auto-next changé:', config.cheatAutoNext);
                    }
                }
            });
        }

        console.log('[Kwyk Tutor] Mode:', config.mode);
        console.log('[Kwyk Tutor] Pret !');
    }

    function loadConfig() {
        return new Promise((resolve) => {
            if (chrome?.storage?.sync) {
                chrome.storage.sync.get(['mistralApiKey', 'model', 'mode', 'cheatAutoValidate', 'cheatAutoNext'], (r) => {
                    if (r.mistralApiKey) config.mistralApiKey = r.mistralApiKey;
                    if (r.model) config.model = r.model;
                    if (r.mode) config.mode = r.mode;
                    if (r.cheatAutoValidate !== undefined) config.cheatAutoValidate = r.cheatAutoValidate;
                    if (r.cheatAutoNext !== undefined) config.cheatAutoNext = r.cheatAutoNext;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    // ===========================================
    // OBSERVER
    // ===========================================

    function setupExerciseObserver() {
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;

            for (const mutation of mutations) {
                // Ignorer nos propres elements
                if (mutation.target.id === 'kwyk-tutor-panel' ||
                    mutation.target.closest?.('#kwyk-tutor-panel')) {
                    continue;
                }

                if (mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) {
                            if (node.querySelector?.('mjx-container, math, input[type="radio"], input[type="text"]') ||
                                node.classList?.contains('exercise') ||
                                node.classList?.contains('exercise_question') ||
                                node.classList?.contains('question')) {
                                shouldCheck = true;
                                break;
                            }
                        }
                    }
                }
            }

            if (shouldCheck) {
                // AMÉLIORATION : Réduire le délai de 500ms à 100ms
                setTimeout(checkExerciseChanged, 100);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function checkExerciseChanged() {
        const oldHash = lastExerciseHash;
        const oldExercise = currentExercise;

        detectExercise();

        // Vérifier si l'exercice a changé (comparaison de hash)
        const exerciseChanged = lastExerciseHash !== oldHash;

        // TOUJOURS vider le cache si le hash a changé, même si un des hash était vide
        if (exerciseChanged) {
            console.log('[Kwyk Tutor] === CHANGEMENT DÉTECTÉ ===');
            console.log('[Kwyk Tutor] Ancien hash:', oldHash?.substring(0, 30) || '(vide)');
            console.log('[Kwyk Tutor] Nouveau hash:', lastExerciseHash?.substring(0, 30) || '(vide)');

            // IMPORTANT: Toujours vider le cache quand l'exercice change
            if (cachedSolution) {
                console.log('[Kwyk Tutor] 🗑️ Cache solution VIDÉ (exercice changé)');
                cachedSolution = null;
            }
            // Annuler toute exécution de mode triche en cours
            cheatExecutionId++;
            console.log('[Kwyk Tutor] 🔄 Nouvelle execution ID:', cheatExecutionId);
            currentQuestionIndex = 0;
        }

        // Réinitialiser l'UI seulement si les deux hash sont non-vides (éviter le premier chargement)
        if (exerciseChanged && oldHash !== '' && lastExerciseHash !== '') {
            console.log('[Kwyk Tutor] === NOUVEL EXERCICE ===');
            updateStatus('Nouvel exercice !', 'info');

            // Vider la zone de réponse
            const area = document.getElementById('kwyk-response');
            if (area) {
                area.innerHTML = '<div class="kwyk-bubble">Nouvel exercice détecté ! Clique sur un bouton pour commencer.</div>';
            }

            // Gérer la navigation
            const nav = document.getElementById('kwyk-question-nav');
            if (currentExercise?.questions?.length > 1) {
                // Multi-questions : créer/mettre à jour la navigation
                createQuestionNavigation(currentExercise.questions.length);
            } else {
                // Une seule question : cacher la navigation
                if (nav) {
                    nav.style.display = 'none';
                }
            }

            // Si mode triche actif, remplir automatiquement le nouvel exercice
            // v24: Vérifier d'abord si l'exercice est supporté AVANT de lancer l'IA
            if (config.mode === 'triche' && cheatModeActive) {
                // Vérifier si exercice supporté avant de lancer la résolution
                if (checkUnsupportedExercise(true)) {
                    console.log('[Kwyk Tutor] Exercice non supporté, pas de résolution auto');
                    if (!(config.cheatAutoValidate && config.cheatAutoNext)) {
                        updateCheatStatus('Exercice non supporté', 'error');
                    }
                } else {
                    console.log('[Kwyk Tutor] Mode triche: résolution automatique du nouvel exercice');
                    updateCheatStatus('Résolution...', 'loading');
                    setTimeout(() => executeCheatMode(), 100);
                }
            }
        }
    }

    // ===========================================
    // EXTRACTION MATHML
    // ===========================================

    function mathMLToText(mathElement) {
        if (!mathElement) return '';

        function processNode(node) {
            if (!node) return '';
            if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim();
            if (node.nodeType !== Node.ELEMENT_NODE) return '';

            const tag = node.tagName.toLowerCase();
            const children = Array.from(node.childNodes);

            switch (tag) {
                case 'mn': return node.textContent.trim();
                case 'mi': return node.textContent.trim();
                case 'mo':
                    const op = node.textContent.trim();
                    const opMap = { '−': '-', '×': '*', '÷': '/', '·': '*', '≤': '<=', '≥': '>=', '≠': '!=' };
                    return opMap[op] || op;
                case 'mfrac':
                    return `(${processNode(children[0])})/(${processNode(children[1])})`;
                case 'msup':
                    return `${processNode(children[0])}^${processNode(children[1])}`;
                case 'msub':
                    return `${processNode(children[0])}_${processNode(children[1])}`;
                case 'msqrt':
                    return `sqrt(${children.map(processNode).join('')})`;
                case 'mrow':
                case 'mstyle':
                case 'math':
                    return children.map(processNode).join('');
                default:
                    return children.map(processNode).join('');
            }
        }

        try {
            return processNode(mathElement).trim();
        } catch (e) {
            return mathElement.textContent || '';
        }
    }


    // ===========================================
    // UI - POSITION FIXE
    // ===========================================

    function createUI() {
        document.getElementById('kwyk-tutor-btn')?.remove();
        document.getElementById('kwyk-tutor-panel')?.remove();

        // Bouton flottant - position fixe en bas a droite
        const btn = document.createElement('button');
        btn.id = 'kwyk-tutor-btn';
        btn.title = 'Kwyk Tutor';
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>`;
        document.body.appendChild(btn);

        // Panneau - position fixe au dessus du bouton
        const panel = document.createElement('div');
        panel.id = 'kwyk-tutor-panel';
        panel.innerHTML = `
            <div class="kwyk-tutor-header">
                <h2>Tuteur Maths</h2>
                <button class="kwyk-tutor-close" id="kwyk-close">&times;</button>
            </div>
            <div class="kwyk-exercise-preview" id="kwyk-preview">
                <small>Exercice detecte:</small>
                <div id="kwyk-preview-text">Chargement...</div>
            </div>
            <div class="kwyk-question-nav" id="kwyk-question-nav" style="display:none;"></div>
            <div class="kwyk-status" id="kwyk-status"></div>
            <div class="kwyk-unsupported-warning" id="kwyk-unsupported" style="display:none;">
                <strong>Exercice non supporté</strong>
                <p>Ce type d'exercice (tableau/graphique) ne peut pas être résolu automatiquement.</p>
                <p class="kwyk-unsupported-joke">T'avais qu'à écouter en cours ! ;)</p>
            </div>
            <div class="kwyk-action-buttons" id="kwyk-actions">
                <button class="kwyk-action-btn primary" id="btn-explain">Explique</button>
                <button class="kwyk-action-btn secondary" id="btn-hint">Indice</button>
                <button class="kwyk-action-btn warning" id="btn-answer">Reponse</button>
            </div>
            <div class="kwyk-cheat-mode" id="kwyk-cheat-section" style="display:none;">
                <div class="kwyk-cheat-toggle">
                    <span class="kwyk-cheat-label">Mode Triche</span>
                    <label class="kwyk-switch">
                        <input type="checkbox" id="kwyk-cheat-switch">
                        <span class="kwyk-slider"></span>
                    </label>
                </div>
                <div class="kwyk-cheat-status" id="kwyk-cheat-status">En attente...</div>
            </div>
            <div class="kwyk-response-area" id="kwyk-response">
                <div class="kwyk-bubble">Clique sur un bouton pour que je t'aide !</div>
            </div>
        `;
        document.body.appendChild(panel);

        // Events
        btn.addEventListener('click', togglePanel);
        document.getElementById('kwyk-close').addEventListener('click', () => panel.classList.remove('open'));
        document.getElementById('btn-explain').addEventListener('click', () => handleAction('explain'));
        document.getElementById('btn-hint').addEventListener('click', () => handleAction('hint'));
        document.getElementById('btn-answer').addEventListener('click', () => handleAction('answer'));

        // Event pour le switch du mode triche
        document.getElementById('kwyk-cheat-switch').addEventListener('change', handleCheatToggle);
    }

    function togglePanel() {
        const panel = document.getElementById('kwyk-tutor-panel');
        if (panel) {
            panel.classList.toggle('open');
        }
    }

    // V12: Raccourci clavier Ctrl+Enter pour ouvrir/fermer le panneau
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            togglePanel();
            console.log('[Kwyk Tutor] Raccourci Ctrl+Enter: panneau toggled');
        }
    });

    /**
     * Met à jour l'affichage des boutons selon le mode
     * - Pédagogique: cache le bouton Réponse
     * - Direct: tous les boutons visibles
     * - Triche: cache tous les boutons, affiche le switch
     */
    function updateButtonsForMode() {
        const btnAnswer = document.getElementById('btn-answer');
        const actionsEl = document.getElementById('kwyk-actions');
        const cheatSection = document.getElementById('kwyk-cheat-section');
        const responseEl = document.getElementById('kwyk-response');

        if (config.mode === 'triche') {
            // Mode triche: cacher les boutons, afficher le switch
            if (actionsEl) actionsEl.style.display = 'none';
            if (cheatSection) cheatSection.style.display = 'block';
            if (responseEl) responseEl.style.display = 'none';
            console.log('[Kwyk Tutor] Mode triche: switch activé');
        } else {
            // Modes pédagogique/direct: afficher les boutons, cacher le switch
            if (actionsEl) actionsEl.style.display = 'flex';
            if (cheatSection) cheatSection.style.display = 'none';
            if (responseEl) responseEl.style.display = 'block';

            if (btnAnswer) {
                if (config.mode === 'pedagogique') {
                    btnAnswer.style.display = 'none';
                    console.log('[Kwyk Tutor] Mode pédagogique: bouton Réponse masqué');
                } else {
                    btnAnswer.style.display = 'block';
                    console.log('[Kwyk Tutor] Mode direct: bouton Réponse visible');
                }
            }
        }
    }

    function updateStatus(text, type = '') {
        const statusEl = document.getElementById('kwyk-status');
        if (!statusEl) return;

        if (!text) {
            statusEl.style.display = 'none';
            return;
        }

        statusEl.style.display = 'block';
        statusEl.innerHTML = `<span class="status-${type}">${escapeHtml(text)}</span>`;
    }

    /**
     * Met à jour le status du mode triche
     */
    function updateCheatStatus(text, type = '') {
        const statusEl = document.getElementById('kwyk-cheat-status');
        if (!statusEl) return;

        statusEl.className = 'kwyk-cheat-status';
        if (type) statusEl.classList.add(`status-${type}`);
        statusEl.textContent = text;
    }

    /**
     * Gère le toggle du mode triche
     */
    async function handleCheatToggle(e) {
        cheatModeActive = e.target.checked;

        if (cheatModeActive) {
            console.log('[Kwyk Tutor] Mode triche ACTIVÉ');

            // Vérifier si un exercice est détecté
            if (!currentExercise || currentExercise.questions.length === 0) {
                console.log('[Kwyk Tutor] Aucun exercice détecté, mise en attente...');
                pendingCheatMode = true;
                updateCheatStatus('En attente de l\'exercice...', 'loading');
                return;
            }

            updateCheatStatus('Résolution en cours...', 'loading');

            // Lancer le remplissage automatique
            await executeCheatMode();
        } else {
            console.log('[Kwyk Tutor] Mode triche DÉSACTIVÉ');
            pendingCheatMode = false;
            updateCheatStatus('En attente...', '');
        }
    }

    /**
     * Relance intelligente du mode triche après un abandon
     * Attend que le DOM soit stable (hash exercice différent) avant de relancer
     */
    async function smartRelaunch(oldHash) {
        console.log('[Kwyk Tutor] 🔄 Relance intelligente...');
        updateCheatStatus('Réfléxion...', 'loading');

        // Attendre 800ms minimum pour laisser le DOM se stabiliser
        await new Promise(r => setTimeout(r, 800));

        // Attendre que le hash change vraiment (max 5 secondes)
        const maxWait = 5000;
        const interval = 300;
        let waited = 0;

        while (waited < maxWait) {
            // Re-détecter l'exercice
            detectExercise();

            // Vérifier que le hash a changé
            if (lastExerciseHash !== oldHash && currentExercise && currentExercise.questions.length > 0) {
                console.log('[Kwyk Tutor] ✓ Nouvel exercice détecté, relance !');
                executeCheatMode();
                return;
            }

            await new Promise(r => setTimeout(r, interval));
            waited += interval;
        }

        // Timeout: relancer quand même avec l'exercice actuel
        console.log('[Kwyk Tutor] ⚠️ Timeout attente DOM, relance avec exercice actuel');
        detectExercise();
        executeCheatMode();
    }

    /**
     * Exécute le mode triche avec retry
     */
    async function executeCheatMode(retryCount = 0) {
        const MAX_RETRIES = 3;

        // Capturer l'ID d'exécution au début
        const myExecutionId = cheatExecutionId;
        console.log('[Kwyk Tutor] executeCheatMode démarré (ID:', myExecutionId, ')');

        // Vérifier si une autre exécution est en cours
        if (cheatModeRunning) {
            console.log('[Kwyk Tutor] ⏳ Mode triche déjà en cours, abandon');
            return;
        }
        cheatModeRunning = true;

        if (!currentExercise || currentExercise.questions.length === 0) {
            updateCheatStatus('Aucun exercice détecté', 'error');
            cheatModeRunning = false;
            return;
        }

        // Vérifier si exercice non supporté (avec auto-skip si les options sont activées)
        if (checkUnsupportedExercise(true)) {
            // Si auto-skip est activé, la fonction gère tout
            // Sinon, on désactive le mode triche
            if (!(config.cheatAutoValidate && config.cheatAutoNext)) {
                updateCheatStatus('Exercice non supporté', 'error');
                const switchEl = document.getElementById('kwyk-cheat-switch');
                if (switchEl) switchEl.checked = false;
                cheatModeActive = false;
            }
            cheatModeRunning = false; // Libérer le verrou
            return;
        }

        // Sauvegarder le hash actuel pour vérification
        const currentHash = lastExerciseHash;

        try {
            // SÉCURITÉ: Toujours vérifier que la solution en cache correspond à l'exercice actuel
            if (cachedSolution && cachedSolution._exerciseHash !== currentHash) {
                console.log('[Kwyk Tutor] ⚠️ Solution en cache ne correspond pas à l\'exercice actuel, reset...');
                console.log('[Kwyk Tutor] Hash cache:', cachedSolution._exerciseHash?.substring(0, 20));
                console.log('[Kwyk Tutor] Hash actuel:', currentHash?.substring(0, 20));
                cachedSolution = null;
            }

            // Résoudre le problème si pas encore en cache
            if (!cachedSolution) {
                console.log('[Kwyk Tutor] Pas de solution en cache, appel IA...');
                const result = await solveProblem();

                // VÉRIFICATION: L'exercice a-t-il changé pendant l'appel IA ?
                if (myExecutionId !== cheatExecutionId) {
                    console.log('[Kwyk Tutor] ⛔ Exercice changé pendant l\'appel IA, abandon (ID:', myExecutionId, '→', cheatExecutionId, ')');
                    cheatModeRunning = false;
                    // Relancer intelligemment pour le nouvel exercice
                    smartRelaunch(currentHash);
                    return;
                }

                if (result.error) {
                    throw new Error(result.error);
                }

                cachedSolution = result.solution;

                // Vérifier que la solution a des réponses non-vides
                const hasValidResponse = cachedSolution.reponses?.some(r =>
                    (r.reponse && r.reponse.trim() !== '') ||
                    (r.reponses && r.reponses.length > 0)
                );
                if (!hasValidResponse) {
                    console.error('[Kwyk Tutor] ⚠️ Solution IA vide, pas de mise en cache');
                    cachedSolution = null;
                    throw new Error('L\'IA a retourné une réponse vide');
                }

                // Stocker le hash de l'exercice avec la solution
                cachedSolution._exerciseHash = currentHash;
                console.log('[Kwyk Tutor] Nouvelle solution mise en cache (hash:', currentHash?.substring(0, 20), ')');
            } else {
                console.log('[Kwyk Tutor] ✓ Réutilisation solution en cache (même exercice)');
            }

            // Attendre un peu que le DOM soit prêt
            await new Promise(r => setTimeout(r, 150));

            // VÉRIFICATION: L'exercice a-t-il changé ?
            if (myExecutionId !== cheatExecutionId) {
                console.log('[Kwyk Tutor] ⛔ Exercice changé avant remplissage, abandon');
                cheatModeRunning = false;
                // Relancer automatiquement pour le nouvel exercice
                console.log('[Kwyk Tutor] 🔄 Relance auto pour nouvel exercice...');
                setTimeout(() => executeCheatMode(), 200);
                return;
            }

            // Remplir TOUTES les questions d'un coup
            const numQuestions = currentExercise.questions.length;
            const success = await autoFillAllQuestions();

            // VÉRIFICATION: L'exercice a-t-il changé ?
            if (myExecutionId !== cheatExecutionId) {
                console.log('[Kwyk Tutor] ⛔ Exercice changé après remplissage, abandon validation');
                cheatModeRunning = false;
                // Relancer automatiquement pour le nouvel exercice
                console.log('[Kwyk Tutor] 🔄 Relance auto pour nouvel exercice...');
                setTimeout(() => executeCheatMode(), 200);
                return;
            }

            if (success) {
                const msg = numQuestions > 1
                    ? `✓ ${numQuestions} réponses remplies !`
                    : '✓ Réponse remplie !';
                updateCheatStatus(msg, 'success');

                // Auto-validation si activée
                if (config.cheatAutoValidate) {
                    await autoClickValidate();
                }
            } else {
                throw new Error('Impossible de remplir tous les champs');
            }

            cheatModeRunning = false;

        } catch (error) {
            console.error(`[Kwyk Tutor] Erreur mode triche (tentative ${retryCount + 1}/${MAX_RETRIES}):`, error);

            if (retryCount < MAX_RETRIES - 1) {
                updateCheatStatus(`Erreur, nouvelle tentative (${retryCount + 2}/${MAX_RETRIES})...`, 'loading');
                cachedSolution = null; // Reset pour retenter
                cheatModeRunning = false; // Libérer le verrou avant retry
                await new Promise(r => setTimeout(r, 1000)); // Attendre 1s
                return executeCheatMode(retryCount + 1);
            } else {
                updateCheatStatus(`Erreur: ${error.message}`, 'error');
                const switchEl = document.getElementById('kwyk-cheat-switch');
                if (switchEl) switchEl.checked = false;
                cheatModeActive = false;
                cheatModeRunning = false; // Libérer le verrou
            }
        }
    }

    /**
     * Remplit automatiquement une question spécifique
     * @param {number} questionIndex - L'index de la question à remplir
     */
    async function autoFillQuestion(questionIndex) {
        if (!cachedSolution || !currentExercise) {
            console.error('[Kwyk Tutor] Pas de solution ou exercice en cache');
            return false;
        }

        const question = currentExercise.questions[questionIndex];
        const reponse = cachedSolution.reponses[questionIndex];

        if (!question || !reponse) {
            console.error('[Kwyk Tutor] Pas de réponse pour la question', questionIndex + 1);
            return false;
        }

        console.log('[Kwyk Tutor] Auto-fill Q' + (questionIndex + 1) + ':', reponse);
        console.log('[Kwyk Tutor] Type de question:', question.type);

        const exerciseBlocks = document.querySelectorAll('.exercise_question');
        const block = exerciseBlocks[questionIndex] || exerciseBlocks[0] || null;

        console.log('[Kwyk Tutor] Blocs .exercise_question trouvés:', exerciseBlocks.length);
        console.log('[Kwyk Tutor] Block sélectionné:', block ? 'OK' : 'NULL (fallback global)');

        // Déterminer le type effectif (l'IA peut retourner qcm_multiples)
        const aiType = reponse.type || 'unknown';
        const domType = question.type;

        console.log('[Kwyk Tutor] Type IA:', aiType, '| Type DOM:', domType);

        try {
            // Si l'IA dit qcm_multiples ou si le DOM a des checkboxes -> utiliser autoFillCheckbox
            if (aiType === 'qcm_multiples' || domType === 'checkbox') {
                return await autoFillCheckbox(block, question, reponse, questionIndex);
            } else if (domType === 'qcm') {
                return await autoFillRadio(block, question, reponse, questionIndex);
            } else if (domType === 'input') {
                return await autoFillInput(block, question, reponse, questionIndex);
            } else {
                // Type inconnu - détecter automatiquement
                console.log('[Kwyk Tutor] Type inconnu, détection automatique...');

                // 1. Vérifier s'il y a des checkboxes globales (pattern id_answer_X_Y)
                const globalCheckboxes = document.querySelectorAll(`input[type="checkbox"][id^="id_answer_${questionIndex}_"]`);
                if (globalCheckboxes.length > 0) {
                    console.log('[Kwyk Tutor] Checkboxes globales détectées:', globalCheckboxes.length);
                    return await autoFillCheckbox(block, question, reponse, questionIndex);
                }

                // 2. Vérifier s'il y a des radios globaux
                let globalRadios = document.querySelectorAll(`input[type="radio"][id^="id_answer_${questionIndex}_"]`);
                if (globalRadios.length === 0) {
                    globalRadios = document.querySelectorAll(`input[type="radio"][id^="id_mcq_answer_${questionIndex}_"]`);
                }
                if (globalRadios.length > 0) {
                    console.log('[Kwyk Tutor] Radios globaux détectés:', globalRadios.length);
                    return await autoFillRadio(block, question, reponse, questionIndex);
                }

                // 3. Vérifier s'il y a un input text global
                const globalInput = document.querySelector(`input[type="text"][id="id_answer_${questionIndex}"]`);
                if (globalInput) {
                    console.log('[Kwyk Tutor] Input text global détecté');
                    return await autoFillInput(block, question, reponse, questionIndex);
                }

                // 4. Fallback MathQuill
                console.log('[Kwyk Tutor] Fallback: essai MathQuill/textarea');
                return await autoFillInput(block, question, reponse, questionIndex);
            }
        } catch (e) {
            console.error('[Kwyk Tutor] Erreur auto-fill:', e);
            return false;
        }
    }

    /**
     * Remplit automatiquement la question active (rétrocompatibilité)
     */
    async function autoFillCurrentQuestion() {
        return await autoFillQuestion(currentQuestionIndex);
    }

    /**
     * Remplit TOUTES les questions d'un coup
     */
    async function autoFillAllQuestions() {
        if (!cachedSolution || !currentExercise) {
            console.error('[Kwyk Tutor] Pas de solution ou exercice en cache');
            return false;
        }

        const numQuestions = currentExercise.questions.length;
        console.log('[Kwyk Tutor] === REMPLISSAGE DE TOUTES LES QUESTIONS ===');
        console.log('[Kwyk Tutor] Nombre de questions:', numQuestions);

        let allSuccess = true;

        // Remplir chaque question
        for (let i = 0; i < numQuestions; i++) {
            console.log(`[Kwyk Tutor] Remplissage Q${i + 1}/${numQuestions}...`);
            const success = await autoFillQuestion(i);

            if (!success) {
                console.warn(`[Kwyk Tutor] Échec du remplissage Q${i + 1}`);
                allSuccess = false;
            } else {
                console.log(`[Kwyk Tutor] ✓ Q${i + 1} remplie`);
            }

            // Petit délai entre chaque question pour éviter les problèmes de timing
            if (i < numQuestions - 1) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        console.log('[Kwyk Tutor] === FIN REMPLISSAGE ===', allSuccess ? 'SUCCÈS' : 'PARTIEL');
        return allSuccess;
    }

    /**
     * Clique automatiquement sur le bouton Valider
     * v24: Polling rapide pour vérifier que la validation a fonctionné
     */
    async function autoClickValidate() {
        console.log('[Kwyk Tutor] Auto-validation...');
        updateCheatStatus('Validation...', 'loading');

        // Attendre un peu pour que le DOM soit stable
        await new Promise(r => setTimeout(r, 50));

        // Chercher TOUS les boutons Valider (il peut y en avoir plusieurs)
        const validateBtns = document.querySelectorAll('button.exercise_submit');

        if (validateBtns.length === 0) {
            console.warn('[Kwyk Tutor] Aucun bouton Valider trouvé');
            updateCheatStatus('✓ Rempli (validation manuelle)', 'success');
            return false;
        }

        // Cliquer sur TOUS les boutons Valider
        console.log(`[Kwyk Tutor] ${validateBtns.length} bouton(s) Valider trouvé(s)`);
        validateBtns.forEach((btn, i) => {
            btn.click();
            console.log(`[Kwyk Tutor] Bouton Valider ${i + 1}/${validateBtns.length} cliqué`);
        });
        console.log('[Kwyk Tutor] Tous les boutons Valider cliqués, vérification...');

        // Polling rapide : attendre que le bouton Suivant apparaisse et soit actif
        const validated = await waitForCondition(() => {
            const nextBtn = document.querySelector('button.exercise_next');
            // Le bouton Suivant existe et n'est pas disabled
            return nextBtn && !nextBtn.disabled;
        }, 5000, 100);

        if (validated) {
            console.log('[Kwyk Tutor] ✓ Validation confirmée');

            // Vérifier si auto-next est activé
            if (config.cheatAutoNext) {
                await autoClickNext();
            } else {
                updateCheatStatus('✓ Validé !', 'success');
                playBeep('success'); // V12: Son de succès
            }
            return true;
        } else {
            console.warn('[Kwyk Tutor] ⚠ Timeout validation');
            updateCheatStatus('⚠ Validez manuellement', 'error');
            playBeep('error'); // V12: Son d'erreur
            return false;
        }
    }

    /**
     * Récupère une "empreinte" du contenu actuel de l'exercice
     * Utilisé pour détecter si l'exercice a changé
     */
    function getExerciseFingerprint() {
        const blocks = document.querySelectorAll('.exercise_question');
        if (blocks.length === 0) return null;
        // Utiliser le texte du premier bloc comme empreinte
        return blocks[0]?.textContent?.substring(0, 200) || null;
    }

    /**
     * Attend qu'une condition soit vraie avec polling rapide
     * @param {Function} condition - Fonction qui retourne true quand la condition est remplie
     * @param {number} timeout - Timeout maximum en ms (défaut: 5000)
     * @param {number} interval - Intervalle de polling en ms (défaut: 100)
     * @returns {Promise<boolean>} - true si condition remplie, false si timeout
     */
    async function waitForCondition(condition, timeout = 5000, interval = 100) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (condition()) {
                return true;
            }
            await new Promise(r => setTimeout(r, interval));
        }
        return false;
    }

    /**
     * Clique automatiquement sur le bouton Suivant
     * v24: Polling rapide + retry automatique si échec
     * @param {number} retryCount - Nombre de tentatives (max 3)
     */
    async function autoClickNext(retryCount = 0) {
        const MAX_RETRIES = 3;
        console.log('[Kwyk Tutor] Auto-clic Suivant... (tentative', retryCount + 1, '/', MAX_RETRIES, ')');
        updateCheatStatus(`Passage au suivant...${retryCount > 0 ? ` (retry ${retryCount})` : ''}`, 'loading');

        // Sauvegarder l'empreinte de l'exercice actuel
        const previousFingerprint = getExerciseFingerprint();
        console.log('[Kwyk Tutor] Empreinte exercice actuel:', previousFingerprint?.substring(0, 50));

        // Chercher le bouton Suivant
        const nextBtn = document.querySelector('button.exercise_next');

        if (!nextBtn) {
            console.warn('[Kwyk Tutor] Bouton Suivant non trouvé');
            updateCheatStatus('✓ Validé (suivant manuel)', 'success');
            return false;
        }

        // Cliquer sur Suivant
        nextBtn.click();
        console.log('[Kwyk Tutor] Bouton Suivant cliqué, vérification...');

        // Polling rapide : attendre que l'exercice change (max 2 secondes par tentative)
        const changed = await waitForCondition(() => {
            const newFingerprint = getExerciseFingerprint();
            return newFingerprint !== null && newFingerprint !== previousFingerprint;
        }, 2000, 100);

        if (changed) {
            console.log('[Kwyk Tutor] ✓ Exercice changé avec succès');
            // IMPORTANT: Reset la solution en cache pour forcer une nouvelle résolution
            cachedSolution = null;
            console.log('[Kwyk Tutor] Cache solution vidé pour nouvel exercice');
            updateCheatStatus('✓ Passé au suivant !', 'success');
            playBeep('success'); // V12: Son de succès
            return true;
        } else {
            // Retry si on n'a pas atteint le max
            if (retryCount < MAX_RETRIES - 1) {
                console.log('[Kwyk Tutor] Retry clic Suivant...');
                await new Promise(r => setTimeout(r, 500)); // Petite pause avant retry
                return autoClickNext(retryCount + 1);
            } else {
                console.warn('[Kwyk Tutor] ⚠ Max retries atteint - exercice pas changé');
                updateCheatStatus('⚠ Cliquez manuellement sur Suivant', 'error');
                return false;
            }
        }
    }

    /**
     * Extrait le contenu entre parenthèses en gérant les parenthèses imbriquées
     * @param {string} str - La chaîne commençant par (
     * @returns {object} - {content: string, endIndex: number} ou null si invalide
     */
    function extractParenthesesContent(str) {
        if (str[0] !== '(' && str[0] !== '[') return null;
        const openChar = str[0];
        const closeChar = openChar === '(' ? ')' : ']';

        let depth = 0;
        let i = 0;
        for (; i < str.length; i++) {
            if (str[i] === '(' || str[i] === '[') depth++;
            else if (str[i] === ')' || str[i] === ']') depth--;
            if (depth === 0) break;
        }
        if (depth !== 0) return null;
        return { content: str.substring(1, i), endIndex: i };
    }

    /**
     * Convertit TOUTES les fractions (...)/(...)  en \frac{}{} dans le string
     * Scanne pour chaque '/' et cherche des parenthèses équilibrées de chaque côté
     * Gère les parenthèses imbriquées comme ((x+4)(x-4))
     */
    function convertAllFractionsToLatex(str) {
        let result = str;
        let i = 0;

        while (i < result.length) {
            if (result[i] === '/' && i > 0 && result[i - 1] === ')') {
                // Chercher le numérateur en arrière: )...( avec parenthèses équilibrées
                let depth = 0;
                let numStart = -1;
                for (let j = i - 1; j >= 0; j--) {
                    if (result[j] === ')') depth++;
                    else if (result[j] === '(') depth--;
                    if (depth === 0) { numStart = j; break; }
                }

                // Chercher le dénominateur en avant: (...)  avec parenthèses équilibrées
                if (numStart !== -1 && i + 1 < result.length && (result[i + 1] === '(' || result[i + 1] === '[')) {
                    const denResult = extractParenthesesContent(result.substring(i + 1));

                    if (denResult) {
                        const num = result.substring(numStart + 1, i - 1).replace(/\*/g, '');
                        const den = denResult.content.replace(/\*/g, '');
                        const before = result.substring(0, numStart);
                        const after = result.substring(i + 1 + denResult.endIndex + 1);
                        const frac = `\\frac{${num}}{${den}}`;
                        result = before + frac + after;
                        i = before.length + frac.length; // Continuer après la fraction
                        continue;
                    }
                }
            }
            i++;
        }

        return result;
    }

    /**
     * Convertit une réponse au format (a)/(b) en LaTeX \frac{a}{b}
     */
    function convertToLatex(value) {
        if (!value) return value;

        let latex = value;

        // Convertir les crochets [...] en parenthèses (...) SEULEMENT dans les fractions
        // L'IA utilise parfois /[...] au lieu de /(...)
        // Ex: (x+14)/[(x+2)(x-2)] → (x+14)/((x+2)(x-2))
        // MAIS PAS pour les intervalles comme [-5;7] ou ]-∞;2]
        // Détection: crochets juste après un / = dénominateur de fraction
        latex = latex.replace(/\/\[([^\]]+)\]/g, '/(($1))');

        // CORRECTION FORMAT: (√x)/(y) → (1)/(y)√x (coefficient DEVANT la racine)
        // Exemple: (√757)/(12) → (1)/(12)√757
        latex = latex.replace(/\(√(\d+)\)\/\((\d+)\)/g, '(1)/($2)√$1');
        latex = latex.replace(/\(sqrt\((\d+)\)\)\/\((\d+)\)/g, '(1)/($2)sqrt($1)');

        // IMPORTANT: Supprimer les * de multiplication (Kwyk n'en veut pas)
        // -8*x -> -8x, 3*y -> 3y
        latex = latex.replace(/(\d)\*([a-zA-Z])/g, '$1$2');
        latex = latex.replace(/([a-zA-Z])\*(\d)/g, '$1$2');
        latex = latex.replace(/([a-zA-Z])\*([a-zA-Z])/g, '$1$2');

        // Normaliser les fractions simples a/b en (a)/(b) AVANT conversion
        // Ex: -3/4 → (-3)/(4), 1/3 → (1)/(3)
        // Le lookbehind (?<!\)) évite de re-matcher les fractions déjà au format (a)/(b)
        latex = latex.replace(/(?<!\))(-?\d+)\/(\d+)/g, '($1)/($2)');

        // ÉTAPE 1: Convertir les fractions NUMÉRIQUES simples (-3)/(4) → \frac{-3}{4}
        // AVANT le regex général pour éviter que (3 - (-3)/(4)) soit mal parsé
        // Pattern strict: uniquement chiffres (avec signe optionnel) entre parenthèses
        latex = latex.replace(/\((-?\d+)\)\/\((\d+)\)/g, '\\frac{$1}{$2}');

        // ÉTAPE 2: Convertir TOUTES les fractions (...)/(...)  avec parenthèses imbriquées
        // Ex: -2(x-12)/((x+4)(x-4)) → -2\frac{x-12}{(x+4)(x-4)}
        latex = convertAllFractionsToLatex(latex);

        // Convertir √(...) et sqrt(...) en \sqrt{...}
        // Gère les parenthèses IMBRIQUÉES en comptant la profondeur
        // Ex: √((3 - \frac{-3}{4})^2 + (0 - \frac{-1}{3})^2) → \sqrt{...tout le contenu...}
        function convertSqrt(str, sqrtSymbol) {
            let idx = str.indexOf(sqrtSymbol + '(');
            while (idx !== -1) {
                const parenStart = idx + sqrtSymbol.length;
                let depth = 0;
                let end = -1;
                for (let i = parenStart; i < str.length; i++) {
                    if (str[i] === '(') depth++;
                    else if (str[i] === ')') depth--;
                    if (depth === 0) { end = i; break; }
                }
                if (end !== -1) {
                    const content = str.substring(parenStart + 1, end);
                    str = str.substring(0, idx) + '\\sqrt{' + content + '}' + str.substring(end + 1);
                } else {
                    break; // Parenthèses non équilibrées, abandon
                }
                idx = str.indexOf(sqrtSymbol + '(', idx + 6); // Chercher le suivant
            }
            return str;
        }
        latex = convertSqrt(latex, 'sqrt');
        latex = convertSqrt(latex, '√');

        // Convertir √nombre en \sqrt{nombre} (sans parenthèses)
        // Exemple: √337 → \sqrt{337} (sinon MathQuill affiche √3 puis 37 séparément)
        latex = latex.replace(/√(\d+)/g, '\\sqrt{$1}');

        // Convertir les puissances x^2 en x^{2}
        latex = latex.replace(/\^(\d+)/g, '^{$1}');
        latex = latex.replace(/\^(-\d+)/g, '^{$1}');

        // Convertir notation ensemble ℝ{x} en LaTeX Kwyk: \mathbb{R}\setminus\left\{x\right\}
        // Gère: ℝ{-4}, ℝ{4}, ℝ{-4;2}, etc.
        latex = latex.replace(/ℝ\{([^}]+)\}/g, '\\mathbb{R}\\setminus\\left\\{$1\\right\\}');

        // V12: Convertir ℝ seul en \mathbb{R} (domaine = tous les réels)
        // IMPORTANT: Doit être APRÈS la conversion ℝ{...} pour ne pas interférer
        latex = latex.replace(/ℝ/g, '\\mathbb{R}');

        console.log('[Kwyk Tutor] Conversion LaTeX:', value, '->', latex);
        return latex;
    }

    /**
     * Remplit un input texte ou textarea (avec support MathQuill)
     * @param {Element} block - Le bloc .exercise_question
     * @param {Object} question - L'objet question
     * @param {Object} reponse - L'objet réponse
     * @param {number} fieldIndex - L'index du champ MathQuill à remplir
     */
    async function autoFillInput(block, question, reponse, fieldIndex = 0) {
        console.log('[Kwyk Tutor] autoFillInput - Début recherche... fieldIndex:', fieldIndex);

        const value = reponse.reponse;
        console.log('[Kwyk Tutor] Valeur à insérer:', value);

        // Vérifier que la valeur n'est pas vide
        if (!value || value.trim() === '') {
            console.error('[Kwyk Tutor] ⚠️ Valeur vide, impossible de remplir le champ');
            return false;
        }

        // ============================================
        // STRATÉGIE PRINCIPALE : MathQuill
        // ============================================
        // Deux sélecteurs possibles selon le type d'exercice
        let mqFields = document.querySelectorAll('.mq-editable-field.input-kwyk');
        if (mqFields.length === 0) {
            mqFields = document.querySelectorAll('.mq-math-mode.input-kwyk');
        }

        if (mqFields && mqFields.length > 0) {
            console.log('[Kwyk Tutor] MathQuill détecté:', mqFields.length, 'champ(s), ciblant index:', fieldIndex);

            const mqField = mqFields[fieldIndex];

            if (mqField) {
                // Convertir en LaTeX
                const latex = convertToLatex(value);

                // Envoyer au script injecté via postMessage avec l'index
                const success = await sendToInjectedScript(latex, fieldIndex);

                if (success) {
                    // Animation highlight sur le champ MathQuill
                    highlightElement(mqField);
                    return true;
                } else {
                    console.log('[Kwyk Tutor] Script injecté échoué, fallback textarea');
                }
            } else {
                console.log('[Kwyk Tutor] MathQuill field index', fieldIndex, 'non trouvé');
            }
        }

        // ============================================
        // STRATÉGIE 2 : Input text global (id_answer_X)
        // ============================================
        const globalInput = document.querySelector(`input[type="text"][id="id_answer_${fieldIndex}"]`);
        if (globalInput) {
            console.log('[Kwyk Tutor] Input text global trouvé:', globalInput.id);
            globalInput.focus();
            globalInput.value = value;
            globalInput.dispatchEvent(new Event('input', { bubbles: true }));
            globalInput.dispatchEvent(new Event('change', { bubbles: true }));
            highlightElement(globalInput);
            return true;
        }

        // ============================================
        // FALLBACK : Textarea classique
        // ============================================
        let field = null;

        // Chercher le textarea
        field = document.querySelector('textarea:not(.feedback-input):not([readonly])');

        if (!field) {
            const allTextareas = document.querySelectorAll('textarea');
            for (const ta of allTextareas) {
                if (!ta.classList.contains('feedback-input')) {
                    field = ta;
                    break;
                }
            }
        }

        // Fallback: chercher n'importe quel input text visible
        if (!field) {
            const textInputs = document.querySelectorAll('input[type="text"]:not([readonly]):not([disabled])');
            for (const inp of textInputs) {
                if (inp.offsetParent !== null && !inp.id.includes('kwyk')) {
                    field = inp;
                    console.log('[Kwyk Tutor] Input text trouvé:', inp.id);
                    break;
                }
            }
        }

        if (!field) {
            console.error('[Kwyk Tutor] Aucun champ trouvé');
            return false;
        }

        console.log('[Kwyk Tutor] Fallback:', field.tagName, field.id || '');

        // Convertir en LaTeX pour le fallback aussi
        const latex = convertToLatex(value);

        // Écrire dans le champ
        field.focus();
        field.value = latex;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        highlightElement(field);

        return true;
    }

    /**
     * Envoie une commande au script injecté pour remplir MathQuill
     * @param {string} latex - Le LaTeX à insérer
     * @param {number} fieldIndex - L'index du champ MathQuill à remplir (défaut: 0)
     */
    function sendToInjectedScript(latex, fieldIndex = 0) {
        return new Promise((resolve) => {
            // Créer un ID unique pour cette opération
            const callbackId = 'kwyk_mq_callback_' + Date.now() + '_' + fieldIndex;

            // Écouter la réponse
            const handler = (event) => {
                if (event.data && event.data.type === callbackId) {
                    window.removeEventListener('message', handler);
                    console.log('[Kwyk Tutor] Réponse du script injecté:', event.data);
                    resolve(event.data.success);
                }
            };
            window.addEventListener('message', handler);

            // Timeout de sécurité (3 secondes)
            setTimeout(() => {
                window.removeEventListener('message', handler);
                console.log('[Kwyk Tutor] Timeout - pas de réponse du script injecté');
                resolve(false);
            }, 3000);

            // Envoyer la demande au script injecté
            console.log('[Kwyk Tutor] Envoi au script injecté:', latex, 'fieldIndex:', fieldIndex);
            window.postMessage({
                type: 'KWYK_TUTOR_FILL',
                latex: latex,
                callbackId: callbackId,
                fieldIndex: fieldIndex
            }, '*');
        });
    }

    /**
     * Coche le bon radio button
     * @param {Element} block - Le bloc .exercise_question
     * @param {Object} question - L'objet question
     * @param {Object} reponse - L'objet réponse
     * @param {number} questionIndex - L'index de la question (pour identifier le groupe de radios)
     */
    async function autoFillRadio(block, question, reponse, questionIndex = 0) {
        console.log('[Kwyk Tutor] autoFillRadio - Question', questionIndex + 1);

        // Chercher les radios dans le bloc spécifique d'abord
        let radios = block?.querySelectorAll('input[type="radio"]');

        // Si pas trouvé dans le bloc, chercher globalement
        if (!radios || radios.length === 0) {
            // Nouveau pattern: id_answer_X_Y
            radios = document.querySelectorAll(`input[type="radio"][id^="id_answer_${questionIndex}_"]`);
        }
        if (!radios || radios.length === 0) {
            // Ancien pattern: id_mcq_answer_X_Y
            radios = document.querySelectorAll(`input[type="radio"][id^="id_mcq_answer_${questionIndex}_"]`);
        }
        if (!radios || radios.length === 0) {
            radios = document.querySelectorAll('.exercise_question input[type="radio"], .exercise input[type="radio"]');
        }
        if (radios.length === 0) {
            console.error('[Kwyk Tutor] Aucun radio button trouvé');
            return false;
        }

        console.log('[Kwyk Tutor] Radios trouvés:', radios.length);

        const answer = reponse.reponse.toLowerCase().trim();
        const radioArray = Array.from(radios);

        console.log('[Kwyk Tutor] Réponse à sélectionner:', answer);

        // 1. Essayer par lettre (A, B, C, D) - PRIORITÉ
        if (answer.length === 1 && answer >= 'a' && answer <= 'z') {
            const letterIndex = answer.charCodeAt(0) - 97; // 'a' = 0
            if (letterIndex >= 0 && letterIndex < radioArray.length) {
                const radio = radioArray[letterIndex];
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                radio.dispatchEvent(new Event('click', { bubbles: true }));
                highlightElement(radio.closest('label') || radio.parentElement);
                console.log('[Kwyk Tutor] Radio coché par lettre:', answer.toUpperCase());
                return true;
            }
        }

        // 2. Correspondance EXACTE du label
        for (const radio of radioArray) {
            const label = radio.labels?.[0]?.textContent.trim().toLowerCase() ||
                         radio.parentElement.textContent.trim().toLowerCase();

            if (label === answer) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                radio.dispatchEvent(new Event('click', { bubbles: true }));
                highlightElement(radio.closest('label') || radio.parentElement);
                console.log('[Kwyk Tutor] Radio coché (exact):', label);
                return true;
            }
        }

        // 3. Le label CONTIENT la réponse exacte (avec espaces/ponctuation autour)
        for (const radio of radioArray) {
            const label = radio.labels?.[0]?.textContent.trim().toLowerCase() ||
                         radio.parentElement.textContent.trim().toLowerCase();

            // Vérifier si le label contient la réponse comme mot entier
            const regex = new RegExp(`(^|\\s|\\.|,)${escapeRegex(answer)}($|\\s|\\.|,)`, 'i');
            if (regex.test(label)) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                radio.dispatchEvent(new Event('click', { bubbles: true }));
                highlightElement(radio.closest('label') || radio.parentElement);
                console.log('[Kwyk Tutor] Radio coché (mot entier):', label);
                return true;
            }
        }

        // 4. Fallback: premier mot du label correspond
        for (const radio of radioArray) {
            const label = radio.labels?.[0]?.textContent.trim().toLowerCase() ||
                         radio.parentElement.textContent.trim().toLowerCase();
            const firstWord = label.split(/[\s.,]+/)[0];

            if (firstWord === answer || answer === firstWord) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                radio.dispatchEvent(new Event('click', { bubbles: true }));
                highlightElement(radio.closest('label') || radio.parentElement);
                console.log('[Kwyk Tutor] Radio coché (premier mot):', label);
                return true;
            }
        }

        console.warn('[Kwyk Tutor] Radio non trouvé pour:', answer);
        return false;
    }

    /**
     * Échappe les caractères spéciaux pour une regex
     */
    function escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Coche les bonnes checkboxes
     * @param {Element} block - Le bloc .exercise_question
     * @param {Object} question - L'objet question
     * @param {Object} reponse - L'objet réponse
     * @param {number} questionIndex - L'index de la question
     */
    async function autoFillCheckbox(block, question, reponse, questionIndex = 0) {
        console.log('[Kwyk Tutor] autoFillCheckbox - Question', questionIndex + 1);

        // Chercher les checkboxes avec le bon pattern (id_answer_X_Y)
        let checkboxes = document.querySelectorAll(`input[type="checkbox"][id^="id_answer_${questionIndex}_"]`);

        // Fallback: ancien pattern id_mcq_answer
        if (checkboxes.length === 0) {
            checkboxes = document.querySelectorAll(`input[type="checkbox"][id^="id_mcq_answer_${questionIndex}_"]`);
        }

        // Fallback: dans le bloc
        if (checkboxes.length === 0) {
            checkboxes = block?.querySelectorAll('input[type="checkbox"]') || [];
        }

        if (checkboxes.length === 0) {
            console.error('[Kwyk Tutor] Aucune checkbox trouvée');
            return false;
        }

        console.log('[Kwyk Tutor] Checkboxes trouvées:', checkboxes.length);

        // Les réponses multiples sont séparées par des virgules
        const answers = reponse.reponse.split(',').map(a => a.trim().toLowerCase());
        let filled = false;

        console.log('[Kwyk Tutor] Réponses à cocher:', answers);

        // Construire un map des options avec leur index (A=0, B=1, C=2, D=3)
        const checkboxArray = Array.from(checkboxes);

        for (const answer of answers) {
            let matched = false;

            // 1. Essayer par lettre (A, B, C, D)
            if (answer.length === 1 && answer >= 'a' && answer <= 'z') {
                const letterIndex = answer.charCodeAt(0) - 97; // 'a' = 0
                if (letterIndex >= 0 && letterIndex < checkboxArray.length) {
                    const checkbox = checkboxArray[letterIndex];
                    checkbox.checked = true;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                    checkbox.dispatchEvent(new Event('click', { bubbles: true }));
                    highlightElement(checkbox.closest('label') || checkbox.parentElement);
                    filled = true;
                    matched = true;
                    console.log('[Kwyk Tutor] Checkbox coché par lettre:', answer.toUpperCase());
                }
            }

            // 2. Essayer par correspondance EXACTE du label
            if (!matched) {
                for (const checkbox of checkboxArray) {
                    const label = checkbox.labels?.[0]?.textContent.trim().toLowerCase() ||
                                 checkbox.parentElement.textContent.trim().toLowerCase();

                    // Correspondance exacte
                    if (label === answer) {
                        checkbox.checked = true;
                        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                        checkbox.dispatchEvent(new Event('click', { bubbles: true }));
                        highlightElement(checkbox.closest('label') || checkbox.parentElement);
                        filled = true;
                        matched = true;
                        console.log('[Kwyk Tutor] Checkbox coché (exact):', label);
                        break;
                    }
                }
            }

            // 3. Essayer par correspondance partielle (le label COMMENCE par la réponse)
            if (!matched) {
                for (const checkbox of checkboxArray) {
                    const label = checkbox.labels?.[0]?.textContent.trim().toLowerCase() ||
                                 checkbox.parentElement.textContent.trim().toLowerCase();

                    if (label.startsWith(answer + ' ') || label.startsWith(answer + '.')) {
                        checkbox.checked = true;
                        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                        checkbox.dispatchEvent(new Event('click', { bubbles: true }));
                        highlightElement(checkbox.closest('label') || checkbox.parentElement);
                        filled = true;
                        matched = true;
                        console.log('[Kwyk Tutor] Checkbox coché (startsWith):', label);
                        break;
                    }
                }
            }

            if (!matched) {
                console.warn('[Kwyk Tutor] Checkbox non trouvée pour:', answer);
            }
        }

        return filled;
    }

    /**
     * Ajoute une animation highlight verte sur un élément
     */
    function highlightElement(element) {
        if (!element) return;

        element.classList.add('kwyk-highlight-success');

        setTimeout(() => {
            element.classList.remove('kwyk-highlight-success');
        }, 2000);
    }

    /**
     * Vérifie si l'exercice contient des éléments non supportés
     * (tableaux de valeurs, graphiques, tableaux des signes)
     * v22: Ajout auto-skip si mode triche actif avec auto-next
     * @param {boolean} autoSkip - Si true, skip automatiquement au suivant
     */
    function checkUnsupportedExercise(autoSkip = false) {
        if (!currentExercise) return false;

        // V12: Tableaux de variation/signes maintenant partiellement supportés
        // Seuls les exercices graphiques restent non supportés
        const unsupportedKeywords = [
            'tableau de valeurs',
            'représentation graphique',
            'tracer la courbe',
            'placer les points',
            'lire graphiquement',
            'sur le graphique',
            'glisser-déposer',
            'faire glisser'
        ];

        const exerciseText = currentExercise.texte.toLowerCase();
        const warningEl = document.getElementById('kwyk-unsupported');
        const actionsEl = document.getElementById('kwyk-actions');
        const responseEl = document.getElementById('kwyk-response');
        const cheatSection = document.getElementById('kwyk-cheat-section');

        for (const keyword of unsupportedKeywords) {
            if (exerciseText.includes(keyword)) {
                console.log(`[Kwyk Tutor] Exercice non supporté détecté: "${keyword}"`);

                // v22: Auto-skip si mode triche actif avec auto-validate ET auto-next
                if (autoSkip && cheatModeActive && config.cheatAutoValidate && config.cheatAutoNext) {
                    console.log('[Kwyk Tutor] Auto-skip exercice non supporté...');
                    updateCheatStatus('Exercice non supporté, skip...', 'loading');

                    // Attendre un peu puis passer au suivant
                    setTimeout(async () => {
                        const nextBtn = document.querySelector('button.exercise_next');
                        if (nextBtn) {
                            nextBtn.click();
                            console.log('[Kwyk Tutor] Auto-skip: Bouton Suivant cliqué');
                            updateCheatStatus('Skipped !', 'success');
                        } else {
                            updateCheatStatus('Exercice non supporté', 'error');
                        }
                    }, 200);

                    return true;
                }

                if (warningEl) {
                    warningEl.style.display = 'block';
                    warningEl.querySelector('p:first-of-type').textContent =
                        `Ce type d'exercice (${keyword}) ne peut pas être résolu automatiquement.`;
                }
                // Masquer TOUS les contrôles (boutons ET switch triche)
                if (actionsEl) actionsEl.style.display = 'none';
                if (responseEl) responseEl.style.display = 'none';
                if (cheatSection) cheatSection.style.display = 'none';

                // v24: Désactiver ET bloquer le switch triche pour exercices non supportés
                console.log('[Kwyk Tutor] Désactivation du mode triche (exercice non supporté)');
                cheatModeActive = false;
                const switchEl = document.getElementById('kwyk-cheat-switch');
                if (switchEl) {
                    switchEl.checked = false;
                    switchEl.disabled = true; // Empêcher de réactiver
                }
                updateCheatStatus('Exercice non supporté', 'error');

                return true;
            }
        }

        // Exercice supporté - respecter le mode actuel
        if (warningEl) warningEl.style.display = 'none';

        // v24: Réactiver le switch triche pour exercices supportés
        const switchEl = document.getElementById('kwyk-cheat-switch');
        if (switchEl) {
            switchEl.disabled = false; // Permettre d'activer le mode triche
        }

        // Restaurer l'UI selon le mode
        if (config.mode === 'triche') {
            if (cheatSection) cheatSection.style.display = 'block';
            if (actionsEl) actionsEl.style.display = 'none';
            if (responseEl) responseEl.style.display = 'none';
        } else {
            if (actionsEl) actionsEl.style.display = 'flex';
            if (responseEl) responseEl.style.display = 'block';
            if (cheatSection) cheatSection.style.display = 'none';
        }

        return false;
    }

    // ===========================================
    // DETECTION EXERCICE - V13 MULTI-QUESTIONS
    // ===========================================

    function detectExercise() {
        console.log('[Kwyk Tutor] Detection exercice...');

        // Chercher les blocs .exercise_question
        const exerciseBlocks = document.querySelectorAll('.exercise_question');
        
        if (exerciseBlocks.length === 0) {
            console.log('[Kwyk Tutor] Aucun bloc .exercise_question trouve');
            updatePreview('Aucun exercice trouve sur cette page.');
            currentExercise = null;
            return;
        }

        console.log(`[Kwyk Tutor] ${exerciseBlocks.length} bloc(s) .exercise_question detecte(s)`);

        // Structure de l'exercice
        const exercise = {
            type: 'multi_question',
            questions: [],
            texte: '',
            code: ''
        };

        // Analyser chaque bloc de question
        exerciseBlocks.forEach((block, index) => {
            const question = analyzeQuestionBlock(block, index);
            if (question) {
                exercise.questions.push(question);
            }
        });

        if (exercise.questions.length === 0) {
            console.log('[Kwyk Tutor] Aucune question detectée');
            updatePreview('Impossible de detecter les questions.');
            currentExercise = null;
            return;
        }

        // Construire le texte complet
        exercise.texte = exercise.questions.map((q, i) => 
            `Question ${i + 1}: ${q.label}\n${q.context || ''}`
        ).join('\n\n');

        // Hash pour detecter les changements
        lastExerciseHash = hashCode(exercise.texte);

        currentExercise = exercise;
        updatePreview(`${exercise.questions.length} question(s) detectée(s)`);

        // Vérifier si l'exercice est supporté
        checkUnsupportedExercise();

        // Afficher la navigation si plusieurs questions
        if (exercise.questions.length > 1) {
            createQuestionNavigation(exercise.questions.length);
        } else {
            document.getElementById('kwyk-question-nav').style.display = 'none';
        }

        console.log('[Kwyk Tutor] Exercice detecte:', currentExercise);

        // Si le mode triche était en attente, le lancer maintenant
        // v24: Vérifier d'abord si l'exercice est supporté AVANT de lancer l'IA
        if (pendingCheatMode && cheatModeActive) {
            pendingCheatMode = false;
            // Vérifier si exercice supporté avant de lancer la résolution
            if (checkUnsupportedExercise(true)) {
                console.log('[Kwyk Tutor] Exercice non supporté, pas de résolution auto');
                if (!(config.cheatAutoValidate && config.cheatAutoNext)) {
                    updateCheatStatus('Exercice non supporté', 'error');
                }
            } else {
                console.log('[Kwyk Tutor] Mode triche en attente, lancement...');
                updateCheatStatus('Résolution...', 'loading');
                setTimeout(() => executeCheatMode(), 100);
            }
        }
    }

    /**
     * Analyse un bloc .exercise_question
     */
    function analyzeQuestionBlock(block, index) {
        const question = {
            index: index,
            type: 'unknown',
            label: '',
            context: '',
            options: [],
            inputs: []
        };

        // Extraire le texte avec formules INLINE
        // Cloner le bloc pour manipulation
        const clonedBlock = block.cloneNode(true);
        clonedBlock.querySelectorAll('label').forEach(l => l.remove());

        // Remplacer les éléments MathJax par leur texte DANS le clone
        // Ainsi √2 apparaîtra inline au bon endroit dans le texte
        clonedBlock.querySelectorAll('mjx-container').forEach(container => {
            const assistiveMml = container.querySelector('mjx-assistive-mml');
            if (assistiveMml) {
                const mathEl = assistiveMml.querySelector('math');
                if (mathEl) {
                    const text = mathMLToText(mathEl);
                    if (text) {
                        const textNode = document.createTextNode(text);
                        container.replaceWith(textNode);
                        return;
                    }
                }
            }
            // Fallback: utiliser le textContent du container
            const fallbackText = container.textContent.trim();
            if (fallbackText) {
                container.replaceWith(document.createTextNode(fallbackText));
            }
        });

        const plainText = clonedBlock.textContent.trim()
            .replace(/\s+/g, ' ')
            .substring(0, 500);

        question.context = plainText;
        question.label = plainText.substring(0, 200) || `Question ${index + 1}`;

        // Detecter le type de question
        // D'abord chercher dans le bloc
        let radios = block.querySelectorAll('input[type="radio"]');
        let checkboxes = block.querySelectorAll('input[type="checkbox"]');
        let textInputs = block.querySelectorAll('input[type="text"], input[type="number"], textarea:not(.feedback-input)');

        // Si pas de radios dans le bloc, chercher globalement par pattern d'ID
        // Kwyk met les radios EN DEHORS du bloc .exercise_question
        // Patterns: id_mcq_answer_X_Y (ancien) ou id_answer_X_Y (nouveau)
        if (radios.length === 0) {
            let globalRadios = document.querySelectorAll(`input[type="radio"][id^="id_mcq_answer_${index}_"]`);
            if (globalRadios.length === 0) {
                globalRadios = document.querySelectorAll(`input[type="radio"][id^="id_answer_${index}_"]`);
            }
            if (globalRadios.length > 0) {
                radios = globalRadios;
                console.log(`[Kwyk Tutor] Q${index + 1}: Radios trouvés HORS du bloc`);
            }
        }

        // Pareil pour les checkboxes - Pattern: id_answer_X_Y
        if (checkboxes.length === 0) {
            let globalCheckboxes = document.querySelectorAll(`input[type="checkbox"][id^="id_answer_${index}_"]`);
            if (globalCheckboxes.length === 0) {
                globalCheckboxes = document.querySelectorAll(`input[type="checkbox"][id^="id_mcq_answer_${index}_"]`);
            }
            if (globalCheckboxes.length > 0) {
                checkboxes = globalCheckboxes;
                console.log(`[Kwyk Tutor] Q${index + 1}: Checkboxes trouvés HORS du bloc (${checkboxes.length} options)`);
            }
        }

        // Chercher les inputs text globalement avec pattern id_answer_X (sans underscore final)
        if (textInputs.length === 0) {
            const globalTextInput = document.querySelector(`input[type="text"][id="id_answer_${index}"]`);
            if (globalTextInput) {
                textInputs = [globalTextInput];
                console.log(`[Kwyk Tutor] Q${index + 1}: Input text trouvé HORS du bloc (id_answer_${index})`);
            }
        }

        if (radios.length > 0) {
            question.type = 'qcm';

            // Extraire les options avec leurs labels
            radios.forEach(radio => {
                const label = radio.labels?.[0]?.textContent.trim() ||
                             radio.nextSibling?.textContent?.trim() ||
                             radio.parentElement.textContent.trim();

                question.options.push({
                    value: radio.value,
                    label: label,
                    id: radio.id
                });
            });

            console.log(`[Kwyk Tutor] Q${index + 1}: QCM avec ${question.options.length} options`, question.options);
        }
        else if (checkboxes.length > 0) {
            question.type = 'checkbox';
            
            checkboxes.forEach(checkbox => {
                const label = checkbox.labels?.[0]?.textContent.trim() || 
                             checkbox.parentElement.textContent.trim();
                
                question.options.push({
                    value: checkbox.value,
                    label: label,
                    id: checkbox.id
                });
            });

            console.log(`[Kwyk Tutor] Q${index + 1}: Checkbox avec ${question.options.length} options`);
        }
        else if (textInputs.length > 0) {
            question.type = 'input';
            
            textInputs.forEach(input => {
                question.inputs.push({
                    id: input.id,
                    placeholder: input.placeholder || '',
                    variable: input.getAttribute('data-variable') || ''
                });
            });

            console.log(`[Kwyk Tutor] Q${index + 1}: Input avec ${question.inputs.length} champ(s)`);
        }

        return question;
    }

    /**
     * Cree la navigation entre questions
     */
    function createQuestionNavigation(numQuestions) {
        const nav = document.getElementById('kwyk-question-nav');
        if (!nav) return;

        nav.innerHTML = '';
        nav.style.display = 'flex';

        for (let i = 0; i < numQuestions; i++) {
            const btn = document.createElement('button');
            btn.className = 'kwyk-question-btn';
            btn.textContent = `Q${i + 1}`;
            btn.dataset.questionIndex = i;
            
            if (i === currentQuestionIndex) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', () => {
                currentQuestionIndex = i;
                updateQuestionNavigation();
                
                // Reafficher la solution pour la nouvelle question
                if (cachedSolution) {
                    displaySolutionForQuestion(currentQuestionIndex);
                }
            });

            nav.appendChild(btn);
        }
    }

    /**
     * Met a jour la navigation (bouton actif)
     */
    function updateQuestionNavigation() {
        const buttons = document.querySelectorAll('.kwyk-question-btn');
        buttons.forEach((btn, i) => {
            btn.classList.toggle('active', i === currentQuestionIndex);
        });
    }

    function updatePreview(text) {
        const preview = document.getElementById('kwyk-preview-text');
        if (preview) {
            preview.innerHTML = escapeHtml(text);
        }
    }

    function hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString();
    }

    // ===========================================
    // RESOLUTION VIA MISTRAL API
    // ===========================================

    async function solveProblem() {
        if (!config.mistralApiKey) {
            return { error: 'Cle API manquante. Va dans Options pour la configurer.' };
        }

        const prompt = buildPrompt();

        try {
            const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.mistralApiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        {
                            role: 'system',
                            content: getSystemPrompt()
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 2000
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('[Kwyk Tutor] Erreur API:', errorData);
                return { error: `Erreur API (${response.status}): ${errorData.error?.message || 'Inconnue'}` };
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content;

            if (!content) {
                return { error: 'Reponse vide de l\'API' };
            }

            console.log('[Kwyk Tutor] Reponse brute:', content);

            return parseAIResponse(content);

        } catch (error) {
            console.error('[Kwyk Tutor] Erreur:', error);
            return { error: `Erreur: ${error.message}` };
        }
    }

    function getSystemPrompt() {
        const baseInstructions = `RÈGLES CRITIQUES pour le JSON:
- N'utilise JAMAIS de caractères d'échappement comme \\n, \\t, \\x dans tes réponses
- Écris tout sur une seule ligne si nécessaire
- Structure JSON STRICTE requise

RÈGLES DE FORMATAGE MATHÉMATIQUE (TRÈS IMPORTANT):
- Pour les FRACTIONS: utilise UNIQUEMENT des PARENTHÈSES (), JAMAIS de crochets []
  Correct: (x+14)/((x+2)(x-2))
  INCORRECT: (x+14)/[(x+2)(x-2)]
- Pour les RACINES: utilise √ ou sqrt(). Exemple: √5 ou sqrt(5), JAMAIS "racine carrée de 5"
- Pour FRACTION × RACINE: coefficient DEVANT la racine ! Exemple: (1)/(12)√4097 (JAMAIS √4097/12)
- Pour les PUISSANCES: utilise ^. Exemple: x^2 pour x²
- Pour la MULTIPLICATION: n'utilise PAS le symbole *. Écrire 3x et non 3*x
- TOUJOURS écrire les fractions au format (numérateur)/(dénominateur), MÊME dans les sous-expressions !
  Correct: √((3 - (-3)/(4))^2) ou (1)/(3)
  INCORRECT: √((3 - (-3/4))^2) ou 1/3 ou -3/4

DOMAINES DE DÉFINITION (lis bien l'énoncé !):
- Si l'énoncé demande "sous forme d'ENSEMBLE" ou montre ℝ\\{...} → notation ENSEMBLE: ℝ{4} (accolades SANS backslash)
- Si l'énoncé demande "INTERVALLE" → notation INTERVALLE: ]-∞;4[∪]4;+∞[
- Pour les ensembles, utilise le format ℝ{valeur} - le programme convertira automatiquement

TABLEAUX DE VARIATION / SIGNES (V12):
- Pour les tableaux, donne CHAQUE valeur à remplir dans une réponse séparée
- Utilise + pour positif, - pour négatif, 0 pour nul
- Utilise ↗ pour croissant, ↘ pour décroissant
- Numérote les cases de gauche à droite, haut en bas

`;

        // V12: Un seul prompt pour TOUS les modes (garantit cohérence des réponses)
        // Le mode affecte uniquement l'AFFICHAGE, pas le contenu généré par l'IA
        return baseInstructions + `Tu es un assistant mathématique précis niveau lycée.
Tu donnes les réponses correctes et complètes aux exercices.
IMPORTANT: La réponse doit être PRÊTE À COPIER-COLLER directement dans Kwyk.
Tu dois être capable de renseigner le bon type d'exercice : soit "qcm" (on doit cocher une option) soit "input" (exercices où il faut saisir une réponse)

RÈGLE STRICTE POUR LE CHAMP "reponse":
- Le champ "reponse" doit contenir UNIQUEMENT la valeur à entrer ou l'option à cocher
- Le champ "reponse" doit contenir le RÉSULTAT FINAL du calcul, JAMAIS une étape intermédiaire
- PAS d'explication, PAS de justification, PAS de phrase
- JAMAIS de symbole * pour la multiplication ! Écrire "8x" et non "8*x", "-3ab" et non "-3*a*b"
- Exemples corrects: "42", "(3)/(5)", "A", "√7", "x^2 + 3", "-8x", "3xy"
- Exemples INCORRECTS: "8*x", "3*x*y", "La réponse est 42 car...", une étape intermédiaire

Réponds UNIQUEMENT en JSON valide avec cette structure:

Pour QCM simple (une seule réponse):
{
  "notion": "Concept mathématique",
  "methode": "Formule utilisée. Fractions: (a)/(b). Racines: √ ou sqrt()",
  "etapes": ["Étape 1 du calcul", "Étape 2"],
  "reponses": [
    {
      "question": 1,
      "type": "qcm/input",
      "reponse": "VALEUR SEULE (ex: 42, A, (3)/(5), √7)",
      "explication": "Explication détaillée ici"
    }
  ]
}

Pour QCM multiple (plusieurs cases à cocher):
{
  "notion": "Concept mathématique",
  "methode": "Formule utilisée",
  "etapes": ["Étape 1", "Étape 2"],
  "reponses": [
    {
      "question": 1,
      "type": "qcm_multiples",
      "reponses": ["A", "B", "D"],
      "explication": "Explication détaillée ici"
    }
  ]
}

IMPORTANT: Pour les QCM simples, utilise "reponse" (singulier). Pour les QCM multiples, utilise "reponses" (pluriel) avec un array.
RAPPEL: Le champ "reponse" = VALEUR SEULE. Le champ "explication" = détails et justifications.
RAPPEL FORMAT: Fractions = (a)/(b), Racines = √ ou sqrt(), Puissances = x^2`;
    }

    function buildPrompt() {
        let prompt = `Exercice de maths:\n\n`;

        currentExercise.questions.forEach((q, i) => {
            prompt += `Question ${i + 1}:\n`;
            prompt += `${q.context}\n`;

            if (q.type === 'qcm' && q.options.length > 0) {
                prompt += `Options (QCM):\n`;
                q.options.forEach(opt => {
                    prompt += `- ${opt.label}\n`;
                });
            } else if (q.type === 'checkbox' && q.options.length > 0) {
                prompt += `Options (plusieurs reponses possibles):\n`;
                q.options.forEach(opt => {
                    prompt += `- ${opt.label}\n`;
                });
            } else if (q.type === 'input') {
                prompt += `Reponse a saisir\n`;
            }

            prompt += `\n`;
        });

        return prompt;
    }

    /**
     * Nettoie le JSON de manière ultra-robuste
     */
    function cleanJSON(jsonStr) {
        // 1. Enlever les backticks Markdown
        jsonStr = jsonStr.trim();
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        // 2. SOLUTION SIMPLE : Remplacer TOUS les retours à la ligne par des espaces
        jsonStr = jsonStr.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');

        // 3. Supprimer les backslashes invalides (comme avant)
        let result = '';
        let i = 0;
        
        while (i < jsonStr.length) {
            const char = jsonStr[i];
            const nextChar = i < jsonStr.length - 1 ? jsonStr[i + 1] : '';
            
            if (char === '\\') {
                if (nextChar === '"' || nextChar === '\\' || nextChar === '/') {
                    // Échappements valides : garder
                    result += char + nextChar;
                    i += 2;
                } else {
                    // Échappement invalide : SUPPRIMER
                    result += ' ';
                    i += 2;
                }
            } else {
                result += char;
                i++;
            }
        }

        return result;
    }

    /**
     * Parse la reponse de l'IA (JSON)
     */
    function parseAIResponse(content) {
        const originalContent = content;
        
        try {
            // Essayer directement d'abord
            const cleaned1 = content.trim();
            const test1 = cleaned1.startsWith('```') 
                ? cleaned1.replace(/^```json?\s*/, '').replace(/\s*```$/, '')
                : cleaned1;
            
            const parsed = JSON.parse(test1);
            return formatSolution(parsed);
        } catch (e1) {
            console.log('[Kwyk Tutor] Parsing direct echoue, nettoyage ultra-robuste...');
            
            try {
                // Nettoyer et reessayer
                const cleaned = cleanJSON(content);
                console.log('[Kwyk Tutor] JSON nettoye (premiers 1000 chars):', cleaned.substring(0, 1000));
                
                const parsed = JSON.parse(cleaned);
                return formatSolution(parsed);
            } catch (e2) {
                console.error('[Kwyk Tutor] Erreur parsing JSON apres nettoyage:', e2);
                
                // Dernier essai : supprimer TOUS les retours a la ligne
                try {
                    const ultraCleaned = cleanJSON(content).replace(/[\r\n]+/g, ' ');
                    console.log('[Kwyk Tutor] Tentative ultra-nettoyage (sans retours ligne)...');
                    const parsed = JSON.parse(ultraCleaned);
                    return formatSolution(parsed);
                } catch (e3) {
                    console.error('[Kwyk Tutor] Echec total du parsing JSON');
                    console.log('[Kwyk Tutor] JSON pour debug:', cleanJSON(content).substring(0, 2000));
                    
                    // Fallback: extraire manuellement
                    return parseFallback(originalContent);
                }
            }
        }
    }

    /**
     * Formate la solution parsee
     */

    // V12: Valide et nettoie une réponse pour s'assurer qu'elle ne contient pas d'explication
    function validateReponse(reponse) {
        if (!reponse || typeof reponse !== 'string') return '';

        // Liste de patterns qui indiquent une explication au lieu d'une réponse
        const explanationPatterns = [
            /^voir /i,
            /^la réponse/i,
            /^car /i,
            /^parce que/i,
            /^en effet/i,
            /^donc /i,
            /^ainsi/i,
            /^cela/i,
            /explication/i
        ];

        // Si la réponse ressemble à une explication, retourner vide
        for (const pattern of explanationPatterns) {
            if (pattern.test(reponse.trim())) {
                console.log('[Kwyk Tutor] Réponse invalide détectée (explication):', reponse.substring(0, 50));
                return '';
            }
        }

        // Si la réponse est trop longue (> 100 chars), c'est probablement une explication
        if (reponse.length > 100) {
            console.log('[Kwyk Tutor] Réponse trop longue, probablement une explication:', reponse.substring(0, 50));
            return '';
        }

        return reponse;
    }

    function formatSolution(parsed) {
        const solution = {
            notion: parsed.notion || 'Mathematiques',
            methode: Array.isArray(parsed.methode) ? parsed.methode.join(' ') : (parsed.methode || ''),
            etapes: Array.isArray(parsed.etapes) ? parsed.etapes : [],
            reponses: []
        };

        // Gérer les réponses (simple ou multiple)
        if (Array.isArray(parsed.reponses)) {
            parsed.reponses.forEach(r => {
                // Si "reponses" (pluriel) au lieu de "reponse" (singulier) → QCM multiple
                if (r.reponses && Array.isArray(r.reponses)) {
                    // QCM avec plusieurs réponses : ["A.xxx", "B.yyy", "D.zzz"]
                    // Extraire juste les lettres : "A, B, D"
                    const lettres = r.reponses.map(rep => {
                        const match = rep.match(/^([A-Z])\./);
                        return match ? match[1] : rep;
                    }).join(', ');

                    solution.reponses.push({
                        question: r.question,
                        type: r.type || 'qcm',
                        reponse: validateReponse(lettres),
                        explication: r.explication || ''
                    });
                } else if (r.reponse) {
                    // QCM classique avec une seule réponse - VALIDER la réponse
                    const cleanReponse = validateReponse(r.reponse);
                    solution.reponses.push({
                        question: r.question,
                        type: r.type || 'qcm',
                        reponse: cleanReponse,
                        explication: r.explication || ''
                    });
                }
            });
        }

        console.log('[Kwyk Tutor] Solution parsee:', solution);
        return { solution };
    }

    /**
     * Fallback si le JSON n'est pas valide
     */
    function parseFallback(content) {
        console.log('[Kwyk Tutor] Utilisation du fallback parsing');

        const solution = {
            notion: 'Mathematiques',
            methode: '',
            etapes: [],
            reponses: []
        };

        // Extraire la notion
        const notionMatch = content.match(/"notion"\s*:\s*"([^"]+)"/);
        if (notionMatch) {
            solution.notion = notionMatch[1];
        }

        // Extraire les etapes (lignes commencant par des puces ou nombres)
        const lines = content.split('\n').filter(l => l.trim());
        solution.etapes = lines
            .filter(l => /^\s*[-•\d]/.test(l))
            .map(l => l.replace(/^\s*[-•\d.]+\s*/, '').trim())
            .slice(0, 5);

        // Extraire les reponses pour chaque question
        currentExercise.questions.forEach((q, i) => {
            let reponse = '';

            if (q.type === 'qcm') {
                // Chercher "question": 1, ... "reponse": "xxx"
                const questionPattern = new RegExp(
                    `"question"\\s*:\\s*${i + 1}[^}]*"reponse"\\s*:\\s*"([^"]+)"`,
                    'i'
                );
                const match = content.match(questionPattern);
                
                if (match) {
                    reponse = match[1];
                } else {
                    // Fallback: chercher l'option mentionnee dans le texte autour de "question X"
                    const contextPattern = new RegExp(
                        `question[\"\\s]*:?[\"\\s]*${i + 1}[^}]{0,500}`,
                        'i'
                    );
                    const contextMatch = content.match(contextPattern);
                    
                    if (contextMatch) {
                        const contextText = contextMatch[0].toLowerCase();
                        
                        // Chercher les options dans l'ordre de priorite
                        for (const opt of q.options) {
                            const optLabel = opt.label.toLowerCase().trim();
                            if (contextText.includes(optLabel)) {
                                reponse = opt.label;
                                break;
                            }
                        }
                    }
                }
            } else if (q.type === 'input') {
                // Chercher un nombre ou une expression
                const patterns = [
                    new RegExp(`question[\"\\s]*:?[\"\\s]*${i + 1}[^}]*reponse[\"\\s]*:?[\"\\s]*([\\d.,/-]+)`, 'i'),
                    /reponse["\s:]+([0-9.,/-]+)/i,
                    /=\s*([0-9.,/-]+)\s*$/m
                ];

                for (const p of patterns) {
                    const m = content.match(p);
                    if (m) {
                        reponse = m[1].replace(',', '.');
                        break;
                    }
                }
            }

            solution.reponses.push({
                question: i + 1,
                type: q.type,
                reponse: reponse,
                explication: ''
            });
        });

        console.log('[Kwyk Tutor] Fallback - reponses extraites:', solution.reponses);
        return { solution };
    }

    // ===========================================
    // ACTIONS
    // ===========================================

    async function handleAction(action) {
        console.log('[Kwyk Tutor] Action:', action);

        if (isLoading) return;

        if (!currentExercise || currentExercise.questions.length === 0) {
            showResponse('Aucun exercice detecte sur cette page.', 'error');
            return;
        }

        isLoading = true;
        disableButtons(true);

        if (!cachedSolution) {
            showLoading('Resolution...');
            updateStatus('Calcul...', 'loading');

            const result = await solveProblem();

            if (result.error) {
                isLoading = false;
                disableButtons(false);
                updateStatus('');
                showResponse(result.error, 'error');
                return;
            }

            cachedSolution = result.solution;

            // Vérifier que la solution a des réponses non-vides
            const hasValidResponse = cachedSolution.reponses?.some(r =>
                (r.reponse && r.reponse.trim() !== '') ||
                (r.reponses && r.reponses.length > 0)
            );
            if (!hasValidResponse) {
                cachedSolution = null;
                isLoading = false;
                disableButtons(false);
                updateStatus('');
                showResponse('L\'IA a retourné une réponse vide. Réessayez.', 'error');
                return;
            }

            updateStatus('✓ Resolu', 'success');
        }

        isLoading = false;
        disableButtons(false);

        // Afficher la solution selon le mode
        if (currentExercise.questions.length === 1) {
            // Une seule question: affichage classique
            displaySolution(action);
        } else {
            // Multi-questions: afficher selon la question active
            displaySolutionForQuestion(currentQuestionIndex, action);
        }
    }

    /**
     * Affiche la solution pour UNE question specifique
     */
    function displaySolutionForQuestion(questionIndex, mode = 'answer') {
        if (!cachedSolution) return;

        const s = cachedSolution;
        const question = currentExercise.questions[questionIndex];
        const reponse = s.reponses[questionIndex];

        if (!question || !reponse) {
            showResponse(`Pas de solution pour la question ${questionIndex + 1}`, 'error');
            return;
        }

        let html = '';

        switch (mode) {
            case 'explain':
                html = `
                    <div class="kwyk-section-notion">
                        <span class="kwyk-badge">Notion</span> ${escapeHtml(s.notion)}
                    </div>
                    ${s.methode ? `
                    <div class="kwyk-section-formula">
                        <span class="kwyk-badge formula">Methode</span>
                        <div style="margin-top:8px; line-height:1.5">${formatFractions(escapeHtml(s.methode))}</div>
                    </div>` : ''}
                    ${s.etapes.length > 0 ? `
                    <div class="kwyk-section-title">Raisonnement</div>
                    <div class="kwyk-steps">
                        ${s.etapes.map((e, i) => `<div class="kwyk-step">${i + 1}. ${formatFractions(escapeHtml(String(e)))}</div>`).join('')}
                    </div>` : ''}
                `;
                break;

            case 'hint':
                html = `
                    <div class="kwyk-section-notion">
                        <span class="kwyk-badge">Notion</span> ${escapeHtml(s.notion)}
                    </div>
                    ${s.methode ? `
                    <div class="kwyk-section-formula">
                        <span class="kwyk-badge formula">Methode</span>
                        <div style="margin-top:8px; line-height:1.5">${formatFractions(escapeHtml(s.methode))}</div>
                    </div>` : ''}
                    <div class="kwyk-section-hint">
                        <span class="kwyk-badge hint">Indice</span>
                        ${s.etapes[0] ? formatFractions(escapeHtml(String(s.etapes[0]))) : 'Applique la methode ci-dessus'}
                    </div>
                `;
                break;

            case 'answer':
                html = renderSingleAnswer(reponse, question);
                break;
        }

        const area = document.getElementById('kwyk-response');
        if (area) {
            const bubble = document.createElement('div');
            bubble.className = 'kwyk-bubble';
            bubble.innerHTML = html;
            area.innerHTML = '';
            area.appendChild(bubble);
        }
    }

    /**
     * Affiche la solution complete (une seule question)
     */
    function displaySolution(mode) {
        if (!cachedSolution) return;

        const s = cachedSolution;
        let html = '';

        switch (mode) {
            case 'explain':
                html = `
                    <div class="kwyk-section-notion">
                        <span class="kwyk-badge">Notion</span> ${escapeHtml(s.notion || 'Mathematiques')}
                    </div>
                    ${s.methode ? `
                    <div class="kwyk-section-formula">
                        <span class="kwyk-badge formula">Methode</span>
                        <div style="margin-top:8px; line-height:1.5">${formatFractions(escapeHtml(s.methode))}</div>
                    </div>` : ''}
                    ${s.etapes.length > 0 ? `
                    <div class="kwyk-section-title">Raisonnement</div>
                    <div class="kwyk-steps">
                        ${s.etapes.map((e, i) => `<div class="kwyk-step">${i + 1}. ${formatFractions(escapeHtml(String(e)))}</div>`).join('')}
                    </div>` : ''}
                `;
                break;

            case 'hint':
                html = `
                    <div class="kwyk-section-notion">
                        <span class="kwyk-badge">Notion</span> ${escapeHtml(s.notion || 'Mathematiques')}
                    </div>
                    ${s.methode ? `
                    <div class="kwyk-section-formula">
                        <span class="kwyk-badge formula">Methode</span>
                        <div style="margin-top:8px; line-height:1.5">${formatFractions(escapeHtml(s.methode))}</div>
                    </div>` : ''}
                    <div class="kwyk-section-hint">
                        <span class="kwyk-badge hint">Indice</span>
                        ${s.etapes[0] ? formatFractions(escapeHtml(String(s.etapes[0]))) : 'Applique la methode ci-dessus'}
                    </div>
                `;
                break;

            case 'answer':
                html = renderAllAnswers(s.reponses);
                break;
        }

        const area = document.getElementById('kwyk-response');
        if (area) {
            const bubble = document.createElement('div');
            bubble.className = 'kwyk-bubble';
            bubble.innerHTML = html;
            area.innerHTML = '';
            area.appendChild(bubble);
        }
    }

    /**
     * Affiche UNE seule reponse
     */
    function renderSingleAnswer(reponse, question) {
        if (!reponse) {
            return '<div class="kwyk-answer-box"><span class="kwyk-answer-label">PAS DE REPONSE</span></div>';
        }

        const isQCM = reponse.type === 'qcm' || reponse.type === 'checkbox';
        const label = question?.label || `Question ${reponse.question}`;

        return `
            <div class="kwyk-answer-item-full">
                <div class="kwyk-answer-box ${isQCM ? 'qcm' : ''}">
                    <span class="kwyk-answer-label">${isQCM ? 'COCHER' : 'ENTRER'}</span>
                    <span class="kwyk-answer-value">${formatFractions(escapeHtml(reponse.reponse))}</span>
                </div>
            </div>
        `;
    }

    /**
     * Affiche toutes les reponses (mode une seule question)
     */
    function renderAllAnswers(reponses) {
        if (!reponses || reponses.length === 0) {
            return '<div class="kwyk-answer-box"><span class="kwyk-answer-label">PAS DE REPONSE</span></div>';
        }

        let html = '<div class="kwyk-all-answers">';

        reponses.forEach((r, i) => {
            const question = currentExercise.questions[i];
            const label = question?.label || `Question ${i + 1}`;
            const isQCM = r.type === 'qcm' || r.type === 'checkbox';

            html += `
                <div class="kwyk-answer-item-full">
                    <div class="kwyk-answer-box ${isQCM ? 'qcm' : ''}">
                        <span class="kwyk-answer-label">${isQCM ? 'COCHER' : 'ENTRER'}</span>
                        <span class="kwyk-answer-value">${formatFractions(escapeHtml(r.reponse))}</span>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    // ===========================================
    // AFFICHAGE
    // ===========================================

    function showLoading(text = 'Reflexion...') {
        const area = document.getElementById('kwyk-response');
        if (area) {
            area.innerHTML = `
                <div class="kwyk-loading">
                    <div class="kwyk-loading-dots"><span></span><span></span><span></span></div>
                    ${text}
                </div>
            `;
        }
    }

    function showResponse(text, type = 'normal') {
        const area = document.getElementById('kwyk-response');
        if (!area) return;

        const bubble = document.createElement('div');
        bubble.className = `kwyk-bubble ${type === 'error' ? 'error' : ''}`;
        bubble.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');

        area.innerHTML = '';
        area.appendChild(bubble);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    /**
     * Formate les expressions mathématiques pour affichage visuel
     * - Transforme les fractions (numerateur)/(denominateur) en HTML
     * - Transforme les puissances x^2 en exposants Unicode
     * - Transforme les symboles mathématiques
     */
    function formatFractions(text) {
        if (!text) return '';

        let result = text;

        // 1. PUISSANCES : x^2 → x²
        const superscripts = {
            '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
            '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
            '-': '⁻', '+': '⁺'
        };

        // Remplacer ^2, ^3, etc.
        result = result.replace(/\^(\d+)/g, (match, num) => {
            return num.split('').map(d => superscripts[d] || d).join('');
        });

        // Remplacer ^-2, etc.
        result = result.replace(/\^(-\d+)/g, (match, num) => {
            return num.split('').map(d => superscripts[d] || d).join('');
        });

        // 2. FRACTIONS
        // D'abord normaliser les fractions simples a/b en (a)/(b)
        result = result.replace(/(?<!\))(-?\d+)\/(\d+)/g, '($1)/($2)');

        // Convertir les fractions NUMÉRIQUES simples (-3)/(4) en HTML AVANT le regex général
        // Évite que (3 - (-3)/(4)) soit mal parsé (parenthèse externe captée comme numérateur)
        result = result.replace(/\((-?\d+)\)\/\((\d+)\)/g,
            '<span class="kwyk-fraction"><span class="kwyk-frac-num">$1</span><span class="kwyk-frac-den">$2</span></span>'
        );

        // Puis convertir les fractions algébriques restantes (a)/(b) → HTML
        result = result.replace(/\(([^)]+)\)\/\(([^)]+)\)/g,
            '<span class="kwyk-fraction"><span class="kwyk-frac-num">$1</span><span class="kwyk-frac-den">$2</span></span>'
        );

        // 3. ENSEMBLES: ℝ{4} → ℝ\{4}
        result = result.replace(/ℝ\{([^}]+)\}/g, 'ℝ\\{$1}');

        // 4. SYMBOLES MATHÉMATIQUES
        // √(...) avec parenthèses imbriquées → √̅ avec barre au-dessus du contenu
        function formatSqrtDisplay(str, sqrtSymbol) {
            let idx = str.indexOf(sqrtSymbol + '(');
            while (idx !== -1) {
                const parenStart = idx + sqrtSymbol.length;
                let depth = 0;
                let end = -1;
                for (let i = parenStart; i < str.length; i++) {
                    if (str[i] === '(' || str[i] === '<') {
                        if (str[i] === '(') depth++;
                        // Skip HTML tags
                        if (str[i] === '<') {
                            const closeTag = str.indexOf('>', i);
                            if (closeTag !== -1) i = closeTag;
                            continue;
                        }
                    } else if (str[i] === ')') {
                        depth--;
                        if (depth === 0) { end = i; break; }
                    }
                }
                if (end !== -1) {
                    const content = str.substring(parenStart + 1, end);
                    const replacement = '<span class="kwyk-sqrt">√<span class="kwyk-sqrt-content">' + content + '</span></span>';
                    str = str.substring(0, idx) + replacement + str.substring(end + 1);
                    idx = str.indexOf(sqrtSymbol + '(', idx + replacement.length);
                } else {
                    break;
                }
            }
            return str;
        }
        result = formatSqrtDisplay(result, 'sqrt');
        result = formatSqrtDisplay(result, '√');

        result = result.replace(/<=/g, '≤').replace(/>=/g, '≥');
        result = result.replace(/!=/g, '≠');
        result = result.replace(/\*/g, '×');

        return result;
    }

    function disableButtons(disabled) {
        ['btn-explain', 'btn-hint', 'btn-answer'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = disabled;
        });
    }

    // ===========================================
    // START
    // ===========================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();