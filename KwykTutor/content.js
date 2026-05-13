/**
 * Copyright © 2025 Patatax. Tous droits réservés.
 * Toute reproduction, modification ou distribution sans autorisation écrite est interdite.
 * Ce code est protégé par le droit d'auteur français et les conventions internationales.
 */

/**
 * Kwyk Tutor - Version 16 (V16)
 * =============================
 * Multi-questions, contexte partagé, tableau de variations amélioré
 *
 * Nouveautés V16:
 * - FEATURE: Classification par question — chaque question a son propre type et appel API séparé
 * - FEATURE: Contexte partagé — Q2+ reçoit le contexte de Q1 (graphique, fonction) dans son prompt
 * - FEATURE: Affichage par question — chaque onglet affiche la réponse de sa propre question
 * - FEATURE: Tableau de variations simple — values contient uniquement ↗/↘/|| (jamais de valeurs numériques)
 * - FEATURE: renderSimpleVariationTable() — colonnes bornes + intervalles correctement intercalées
 * - FIX: Heartbeat 60s + protection rate limit (429/403 → suspension 5min)
 *
 * Historique V15:
 * - FEATURE: Classification automatique du type d'exercice (DOM + texte)
 *   Types: qcm_simple, qcm_multiple, input, tableau_signes, tableau_variations, tableau_valeurs, graphique
 * - FEATURE: Prompts modulaires — base + module type spécifique avec few-shot example
 * - FEATURE: L'IA reçoit uniquement les instructions pertinentes au type détecté
 * - AMÉLIORATION: Meilleure précision des réponses IA grâce à des prompts ciblés
 *
 * Historique V14:
 * - FEATURE: Support des tableaux de valeurs (prettytable) - formatage pour l'IA
 * - FEATURE: Tableaux de valeurs retirés de la liste des exercices non supportés
 * - FEATURE: Prompt IA amélioré pour les calculs sur tableaux
 * - FIX: MutationObserver amélioré - détecte les changements d'exercice graphiques/tableaux
 *   (ajout node.matches + sélecteurs table/canvas/svg/jxgbox)
 *
 * Historique V12:
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
 * - Mode pédagogique: tous les boutons visibles
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

    // Système de logs à niveaux — debug masqué en production (config.debugMode)
    const LOG = {
        info:  (msg, ...a) => console.log(`[KT] ${msg}`, ...a),
        warn:  (msg, ...a) => console.warn(`[KT ⚠] ${msg}`, ...a),
        error: (msg, ...a) => console.error(`[KT ✗] ${msg}`, ...a),
        debug: (msg, ...a) => { if (config.debugMode) console.log(`[KT·] ${msg}`, ...a); },
    };

    /**
     * Telemetry locale (stats compteurs dans localStorage).
     * Lecture via kwykDebug() ou directement: localStorage.getItem('kwyk_telemetry_v1')
     */
    const TELEMETRY_KEY = 'kwyk_telemetry_v1';
    const Telemetry = {
        load() {
            try { return JSON.parse(localStorage.getItem(TELEMETRY_KEY)) || {}; }
            catch { return {}; }
        },
        save(data) { try { localStorage.setItem(TELEMETRY_KEY, JSON.stringify(data)); } catch {} },
        incr(field) {
            const t = this.load();
            t[field] = (t[field] || 0) + 1;
            t.lastUpdate = new Date().toISOString();
            this.save(t);
        },
        reset() { try { localStorage.removeItem(TELEMETRY_KEY); } catch {} }
    };

    /**
     * Rate limiter client-side pour les appels Mistral.
     * Max N appels par seconde glissante, queue sinon.
     */
    const RATE_LIMIT = { maxPerSec: 4, recent: [], backoffUntil: 0 };
    async function rateLimitGate() {
        // Backoff actif après 429/403 reçu
        const now0 = Date.now();
        if (RATE_LIMIT.backoffUntil > now0) {
            const wait = RATE_LIMIT.backoffUntil - now0;
            LOG.debug(`Rate limit backoff: attente ${wait}ms`);
            await new Promise(r => setTimeout(r, wait));
        }
        const now = Date.now();
        RATE_LIMIT.recent = RATE_LIMIT.recent.filter(t => now - t < 1000);
        if (RATE_LIMIT.recent.length >= RATE_LIMIT.maxPerSec) {
            const wait = 1000 - (now - RATE_LIMIT.recent[0]) + 50;
            LOG.debug(`Rate limit: attente ${wait}ms (${RATE_LIMIT.recent.length} calls/s)`);
            await new Promise(r => setTimeout(r, wait));
            return rateLimitGate();
        }
        RATE_LIMIT.recent.push(now);
    }
    // Set backoff après 429/403 — honore Retry-After header sinon défaut 30s
    function applyRateLimitBackoff(response) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
        const waitMs = (retryAfter > 0 ? retryAfter : 30) * 1000;
        RATE_LIMIT.backoffUntil = Date.now() + waitMs;
        LOG.warn(`Mistral ${response.status} → backoff ${waitMs / 1000}s`);
    }

    // Valeurs invalides pour auto-fill (refusées par toutes les fonctions autoFill*)
    const INVALID_VALUES = ['', 'null', 'undefined', 'nan', 'ignore', 'auto'];
    function isInvalidAnswer(value) {
        const trimmed = (value ?? '').toString().trim();
        if (!trimmed) return true;
        return INVALID_VALUES.includes(trimmed.toLowerCase());
    }

    /**
     * Vérifie qu'une solution IA contient au moins une réponse non-vide.
     * Utilisée pour le retry automatique en cas de réponse vide.
     */
    function isValidSolution(solution) {
        return !!solution?.reponses?.some(r =>
            (r.reponse && r.reponse.trim() !== '') ||
            (r.reponses && r.reponses.length > 0)
        );
    }

    /**
     * fetch() avec timeout configurable. Combine un signal externe optionnel
     * avec un AbortController interne qui déclenche après timeoutMs.
     * Évite les requêtes Mistral qui pendent indéfiniment.
     */
    async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
        const isMistral = url.includes('api.mistral.ai');
        // Rate limit pour Mistral uniquement (évite 429)
        if (isMistral) {
            await rateLimitGate();
            Telemetry.incr('apiCalls');
        }

        const timeoutCtrl = new AbortController();
        const timeoutId = setTimeout(() => timeoutCtrl.abort(new Error(`Timeout ${timeoutMs}ms`)), timeoutMs);

        // Combiner signal externe (ex: cheatAbortController) + signal timeout
        const externalSignal = options.signal;
        const onExternalAbort = () => timeoutCtrl.abort(externalSignal?.reason);
        if (externalSignal) {
            if (externalSignal.aborted) timeoutCtrl.abort(externalSignal.reason);
            else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }

        try {
            const res = await fetch(url, { ...options, signal: timeoutCtrl.signal });
            if (isMistral) {
                if (res.ok) Telemetry.incr('apiSuccesses');
                else {
                    Telemetry.incr('apiHttpErrors');
                    if (res.status === 429 || res.status === 403) applyRateLimitBackoff(res);
                }
            }
            return res;
        } catch (err) {
            if (isMistral) {
                if (timeoutCtrl.signal.aborted && !externalSignal?.aborted) Telemetry.incr('apiTimeouts');
                else Telemetry.incr('apiErrors');
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
            if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
        }
    }

    // Config
    let config = {
        mistralApiKey: '',
        model: 'mistral-medium-latest',
        mode: 'pedagogique',  // 'pedagogique', 'triche' ou 'revision'
        cheatAutoValidate: false,
        cheatAutoNext: false,
        sounds: true,   // Notifications sonores
        theme: 'light', // Thème (light/dark)
        panelSide: null, // 'left' ou 'right' — null = pas encore choisi
        debugMode: false // true = affiche LOG.debug dans la console
    };

    // Notification sonore (beep)
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
            LOG.debug('Audio non supporté');
        }
    }

    // État
    let currentExercise = null;

    // ── DEBUG STATE (accessible depuis la console via kwykDebug()) ──
    window._kwykLastExchange = {};
    window._kwykGetState = () => ({
        exercise:    currentExercise,
        cached:      cachedSolution,
        cheatActive: cheatModeActive,
        prefetch:    prefetchCache,
        exchange:    window._kwykLastExchange
    });
    let cachedSolution = null;
    let isLoading = false;
    let lastExerciseHash = '';
    let currentQuestionIndex = 0; // Pour la navigation
    let panelUserClosed = false;  // true si l'utilisateur a fermé le panel manuellement (empêche rouvrir auto)
    let cheatModeActive = false; // État du switch ON/OFF (toujours OFF au démarrage)
    let pendingCheatMode = false; // Si le mode triche a été activé avant détection d'exercice
    let cheatExecutionId = 0; // ID unique pour chaque exécution du mode triche (évite les races)
    let cheatModeRunning = false; // Verrou pour empêcher les exécutions simultanées
    let revisionData = []; // Exercices collectés pendant la révision
    let cheatAbortController = null; // AbortController pour annuler l'appel IA en cours

    // Prefetch system — prépare les exercices du devoir à l'avance
    let prefetchCache = {}; // {exerciseId: {solution, exerciseType, questions}}
    let prefetchInProgress = false; // Verrou pour éviter les lancements multiples
    let prefetchAbortController = null; // Pour annuler le prefetch en cours


    // ===========================================
    // CONTRÔLE À DISTANCE (désactivé dans la version Firefox)
    // ===========================================

    let extensionBlocked = false;   // true si une plage de blocage est active
    let blockedMessage = '';        // Message à afficher quand bloqué
    let remoteConfig = {};          // Config distante (vide dans la version Firefox)

    /**
     * Version Firefox : pas de config distante, pas de gestion utilisateurs.
     * Retourne immédiatement sans bloquer.
     */
    async function checkRemoteConfig() {
        extensionBlocked = false;
        return;
    }

    // Stubs — fonctions supprimées dans la version Firefox (pas de gestion utilisateurs)
    async function checkUserAccess() { return; }
    async function registerUser(pseudo) { return; }
    function showPseudoPrompt() { return; }
    function showSidePrompt() { return; }
    async function performInlineUpdate() { return; }

    // ===========================================
    // INIT
    // ===========================================

    async function init() {
        LOG.info('Initialisation...');

        // Version Firefox : pas de config distante, pas de gestion utilisateurs
        await checkRemoteConfig();

        await loadConfig();
        createUI();

        // Si côté non encore choisi : utiliser "right" par défaut
        if (!config.panelSide) {
            config.panelSide = 'right';
            chrome.storage.sync.set({ panelSide: 'right' });
        }

        applyPanelSide(config.panelSide);

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
                        updateStatus('', '');
                        updateCheatStatus('', '');
                        updateButtonsForMode();
                        checkUnsupportedExercise();
                        LOG.info('Mode changé:', config.mode);

                        // Lancer le prefetch en arrière-plan si on passe en péda/triche sur un devoir
                        if ((config.mode === 'pedagogique' || config.mode === 'triche') &&
                            !prefetchInProgress && Object.keys(prefetchCache).length === 0) {
                            prefetchAllHomework();
                        }
                    }
                    if (changes.cheatAutoValidate !== undefined) {
                        config.cheatAutoValidate = changes.cheatAutoValidate.newValue;
                        LOG.debug('Auto-validate changé:', config.cheatAutoValidate);
                    }
                    if (changes.cheatAutoNext !== undefined) {
                        config.cheatAutoNext = changes.cheatAutoNext.newValue;
                        LOG.debug('Auto-next changé:', config.cheatAutoNext);
                    }
                    if (changes.panelSide) {
                        config.panelSide = changes.panelSide.newValue;
                        applyPanelSide(config.panelSide);
                    }
                    if (changes.panelShortcut) {
                        config.panelShortcut = changes.panelShortcut.newValue;
                        LOG.debug('Raccourci changé:', config.panelShortcut);
                    }
                }
            });
        }

        LOG.debug('Mode:', config.mode);

        // Lancer le prefetch après le premier detectExercise (laisse le temps au DOM de se charger)
        if (config.mode === 'pedagogique' || config.mode === 'triche') {
            setTimeout(() => {
                if (!prefetchInProgress && Object.keys(prefetchCache).length === 0) {
                    prefetchAllHomework();
                }
            }, 3000); // 3s après init pour laisser le temps au DOM
        }

    }


    function loadConfig() {
        return new Promise((resolve) => {
            if (chrome?.storage?.sync) {
                chrome.storage.sync.get(['mistralApiKey', 'model', 'mode', 'cheatAutoValidate', 'cheatAutoNext', 'panelSide', 'panelShortcut'], (r) => {
                    if (r.mistralApiKey) config.mistralApiKey = r.mistralApiKey;
                    if (r.model) config.model = r.model;
                    if (r.mode) config.mode = r.mode;
                    if (r.cheatAutoValidate !== undefined) config.cheatAutoValidate = r.cheatAutoValidate;
                    if (r.cheatAutoNext !== undefined) config.cheatAutoNext = r.cheatAutoNext;
                    if (r.panelSide) config.panelSide = r.panelSide;
                    if (r.panelShortcut) config.panelShortcut = r.panelShortcut;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Applique la position du panneau (gauche ou droite)
     * null → droite (comportement par défaut)
     */
    function applyPanelSide(side) {
        if (side === 'left') {
            document.body.classList.add('kwyk-side-left');
        } else {
            document.body.classList.remove('kwyk-side-left');
        }
        LOG.debug('Position panneau:', side || 'right (défaut)');
    }

    // ===========================================
    // OBSERVER
    // ===========================================

    let exerciseObserver = null;

    function setupExerciseObserver() {
        if (exerciseObserver) exerciseObserver.disconnect();

        exerciseObserver = new MutationObserver((mutations) => {
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
                            if (node.matches?.('mjx-container, math, table, canvas, svg, .exercise_question') ||
                                node.querySelector?.('mjx-container, math, input[type="radio"], input[type="text"], table, canvas, svg, .jxgbox, .exercise_question') ||
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

        exerciseObserver.observe(document.body, { childList: true, subtree: true });

        // Cleanup au déchargement de la page (évite leak observer)
        window.addEventListener('beforeunload', () => {
            if (exerciseObserver) {
                exerciseObserver.disconnect();
                exerciseObserver = null;
            }
        }, { once: true });
    }

    function checkExerciseChanged() {
        const oldHash = lastExerciseHash;
        const oldExercise = currentExercise;

        detectExercise();

        // Vérifier si l'exercice a changé (comparaison de hash)
        const exerciseChanged = lastExerciseHash !== oldHash;

        // TOUJOURS vider le cache si le hash a changé, même si un des hash était vide
        if (exerciseChanged) {
            panelUserClosed = false; // Nouvel exercice → autoriser la réouverture auto
            LOG.debug('=== CHANGEMENT DÉTECTÉ ===');
            LOG.debug('Ancien hash:', oldHash?.substring(0, 30) || '(vide)');
            LOG.debug('Nouveau hash:', lastExerciseHash?.substring(0, 30) || '(vide)');

            // IMPORTANT: Toujours vider le cache quand l'exercice change
            if (cachedSolution) {
                LOG.debug('🗑️ Cache solution VIDÉ (exercice changé)');
                cachedSolution = null;
            }
            // Annuler toute exécution de mode triche en cours
            cheatExecutionId++;
            LOG.debug('🔄 Nouvelle execution ID:', cheatExecutionId);
            if (cheatAbortController) {
                cheatAbortController.abort();
                cheatAbortController = null;
            }
            cheatModeRunning = false;
            currentQuestionIndex = 0;
        }

        // Réinitialiser l'UI seulement si les deux hash sont non-vides (éviter le premier chargement)
        if (exerciseChanged && oldHash !== '' && lastExerciseHash !== '') {
            LOG.debug('=== NOUVEL EXERCICE ===');
            updateStatus('Nouvel exercice !', 'info');
            updateCheatStatus('', ''); // Reset badge troll du cycle précédent

            // Vider la zone de réponse (sauf en mode révision)
            if (config.mode !== 'revision') {
                const area = document.getElementById('kwyk-response');
                if (area) area.innerHTML = '';
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

            // Si mode triche actif, tenter la résolution auto
            // Attendre que la page soit complètement chargée et stable
            if (config.mode === 'triche' && cheatModeActive) {
                (async () => {
                    // Attendre DOM prêt (bouton Valider + inputs)
                    await waitForCondition(() => {
                        const submitBtn = document.querySelector('button.exercise_submit');
                        const hasInputs = document.querySelector('.exercise_question input, .exercise_question .mq-editable-field, input[id^="id_answer_"]');
                        return submitBtn && !submitBtn.disabled && hasInputs;
                    }, 8000, 200);
                    // Laisser MathQuill et les scripts Kwyk s'initialiser
                    await new Promise(r => setTimeout(r, 1500));
                    LOG.debug('Page stable, lancement mode triche');
                    executeCheatMode();
                })();
            }

            // Mode révision: pas de collecte automatique, l'analyse se fait via le bouton "Analyser tout le devoir"
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
            return processNode(mathElement).trim().replace(/−/g, '-').replace(/×/g, '*');
        } catch (e) {
            return (mathElement.textContent || '').replace(/−/g, '-').replace(/×/g, '*');
        }
    }


    /**
     * V15: Extrait le texte d'un label en convertissant les formules MathJax en notation lisible.
     * Utilisé pour les labels de QCM (radios) et QCM multiples (checkboxes).
     */
    function extractLabelWithMath(element) {
        if (!element) return '';
        const clone = element.cloneNode(true);

        // Convertir chaque conteneur MathJax en texte mathématique lisible
        clone.querySelectorAll('mjx-container').forEach(container => {
            const assistiveMml = container.querySelector('mjx-assistive-mml');
            if (assistiveMml) {
                const mathEl = assistiveMml.querySelector('math');
                if (mathEl) {
                    const text = mathMLToText(mathEl);
                    if (text) {
                        container.replaceWith(document.createTextNode(text));
                        return;
                    }
                }
            }
            // Fallback: textContent brut
            const fallback = container.textContent.trim();
            if (fallback) {
                container.replaceWith(document.createTextNode(fallback));
            }
        });

        return clone.textContent.trim();
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
                <h2>Kwyk Tutor</h2>
                <button class="kwyk-tutor-close" id="kwyk-close">&times;</button>
            </div>
            <div class="kwyk-exercise-preview" id="kwyk-preview">
                <small>Exercice détecté :</small>
                <div id="kwyk-preview-text">Chargement...</div>
            </div>
            <div class="kwyk-question-nav" id="kwyk-question-nav" style="display:none;"></div>
            <div class="kwyk-action-buttons" id="kwyk-actions">
                <button class="kwyk-action-btn primary" id="btn-explain">Explique</button>
                <button class="kwyk-action-btn secondary" id="btn-hint">Règle</button>
                <button class="kwyk-action-btn warning" id="btn-answer">Réponse</button>
            </div>
            <div class="kwyk-status" id="kwyk-status"></div>
            <div class="kwyk-cheat-status" id="kwyk-cheat-status" style="display:none;"></div>
            <div class="kwyk-cheat-mode" id="kwyk-cheat-section" style="display:none;">
                <div class="kwyk-cheat-toggle">
                    <span class="kwyk-cheat-label">Mode Troll</span>
                    <label class="kwyk-switch">
                        <input type="checkbox" id="kwyk-cheat-switch">
                        <span class="kwyk-slider"></span>
                    </label>
                </div>
            </div>
            <div class="kwyk-revision-section" id="kwyk-revision-section" style="display:none;">
                <button class="kwyk-revision-analyze-btn" id="kwyk-revision-analyze">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    Analyser tout le devoir
                </button>
                <div class="kwyk-revision-status" id="kwyk-revision-status"></div>
            </div>
            <div class="kwyk-response-area" id="kwyk-response">
                <div class="kwyk-bubble">Clique sur un bouton pour que je t'aide !</div>
            </div>
        `;
        document.body.appendChild(panel);

        // Events
        btn.addEventListener('click', togglePanel);
        document.getElementById('kwyk-close').addEventListener('click', () => {
            panel.classList.remove('open');
            panelUserClosed = true;
        });
        document.getElementById('btn-explain').addEventListener('click', () => handleAction('explain'));
        document.getElementById('btn-hint').addEventListener('click', () => handleAction('hint'));
        document.getElementById('btn-answer').addEventListener('click', () => handleAction('answer'));

        // Event pour le switch du mode triche
        document.getElementById('kwyk-cheat-switch').addEventListener('change', handleCheatToggle);

        // Event pour le mode révision
        document.getElementById('kwyk-revision-analyze').addEventListener('click', analyzeFullHomework);

        // Appliquer la position sauvegardée
        applyPanelSide(config.panelSide);
    }

    // Clic sur le bouton : ouvre/ferme le panel uniquement
    function togglePanel() {
        const panel = document.getElementById('kwyk-tutor-panel');
        if (panel) panel.classList.toggle('open');
    }

    // Ctrl+Enter : masque bouton ET panel (si visibles) → réaffiche le bouton seul au second appui
    function toggleVisibility() {
        const panel = document.getElementById('kwyk-tutor-panel');
        const btn = document.getElementById('kwyk-tutor-btn');
        if (!btn) return;

        if (btn.style.display === 'none') {
            // Tout est caché → réafficher le bouton + ouvrir le panel + lancer expliquer
            btn.style.display = '';
            if (panel) panel.classList.add('open');
            handleAction('explain');
            LOG.debug('Bouton réaffiché + panel ouvert + explain lancé');
        } else {
            // Tout est visible → fermer le panel ET cacher le bouton
            if (panel) panel.classList.remove('open');
            btn.style.display = 'none';
            LOG.debug('Bouton et panel masqués');
        }
    }

    // Raccourci clavier configurable pour masquer/afficher bouton + panel
    document.addEventListener('keydown', (e) => {
        const shortcut = (config.panelShortcut || 'ctrl+enter').split('+');
        const key = shortcut[shortcut.length - 1];
        const needCtrl = shortcut.includes('ctrl');
        const needAlt = shortcut.includes('alt');
        const needShift = shortcut.includes('shift');
        const pressedKey = e.key === ' ' ? 'space' : e.key.toLowerCase();
        const keyMatch = pressedKey === key || (key === 'enter' && e.key === 'Enter');
        if (keyMatch && e.ctrlKey === needCtrl && e.altKey === needAlt && e.shiftKey === needShift) {
            e.preventDefault();
            toggleVisibility();
        }
    });

    /**
     * Met à jour l'affichage des boutons selon le mode
     * - Pédagogique: tous les boutons visibles
     * - Triche: cache tous les boutons, affiche le switch
     */
    function updateButtonsForMode() {
        const actionsEl = document.getElementById('kwyk-actions');
        const cheatSection = document.getElementById('kwyk-cheat-section');
        const revisionSection = document.getElementById('kwyk-revision-section');
        const responseEl = document.getElementById('kwyk-response');
        const previewEl = document.getElementById('kwyk-preview');
        const statusEl = document.getElementById('kwyk-status');
        const navEl = document.getElementById('kwyk-question-nav');
        const cheatStatusEl = document.getElementById('kwyk-cheat-status');

        // Reset commun : nettoyer les résidus de tous les modes
        if (responseEl) { responseEl.innerHTML = ''; responseEl.style.display = 'none'; }
        if (statusEl) { statusEl.style.display = 'none'; statusEl.innerHTML = ''; }
        if (cheatStatusEl) cheatStatusEl.textContent = '';
        if (navEl) navEl.style.display = 'none';
        if (actionsEl) actionsEl.style.display = 'none';
        if (cheatSection) cheatSection.style.display = 'none';
        if (revisionSection) revisionSection.style.display = 'none';
        if (previewEl) previewEl.style.display = 'none';
        cachedSolution = null;

        if (config.mode === 'triche') {
            if (cheatSection) cheatSection.style.display = 'block';
        } else if (config.mode === 'revision') {
            if (revisionSection) revisionSection.style.display = 'block';
        } else {
            if (actionsEl) actionsEl.style.display = 'flex';
            if (responseEl) responseEl.style.display = 'block';
            if (previewEl) previewEl.style.display = '';
        }
    }

    function updateStatus(text, type = '') {
        const statusEl = document.getElementById('kwyk-status');
        if (!statusEl) return;

        if (!text) {
            statusEl.style.display = 'none';
            statusEl.className = 'kwyk-status';
            return;
        }

        statusEl.style.display = '';
        statusEl.className = `kwyk-status${type ? ' status-' + type : ''}`;
        statusEl.textContent = text;
    }

    /**
     * Met à jour le status du mode triche
     * - type: 'loading' | 'success' | 'error' | ''
     * - Spinner animé en mode loading
     * - Ouvre le panneau automatiquement si fermé (loading/error)
     * - Toast de notification si panneau fermé (success/error)
     */
    function updateCheatStatus(text, type = '') {
        const statusEl = document.getElementById('kwyk-cheat-status');
        if (!statusEl) return;

        statusEl.className = 'kwyk-cheat-status';
        if (type) statusEl.classList.add(`status-${type}`);

        if (type === 'loading') {
            statusEl.innerHTML = `<span class="kwyk-spinner"></span><span>${escapeHtml(text)}</span>`;
        } else {
            statusEl.textContent = text;
        }

        // Masquer si pas de statut actif (état idle)
        statusEl.style.display = (type || text) ? '' : 'none';

        // Ouvre le panneau automatiquement si fermé et état important (sauf si l'utilisateur l'a fermé manuellement)
        const panel = document.getElementById('kwyk-tutor-panel');
        if (panel && !panel.classList.contains('open') && !panelUserClosed && (type === 'error' || type === 'loading')) {
            panel.classList.add('open');
        }

        // Toast si panneau fermé pour succès et erreur
        if (panel && !panel.classList.contains('open') && (type === 'success' || type === 'error')) {
            showCheatToast(text, type);
        }
    }

    /**
     * Toast de notification temporaire hors panneau
     */
    function showCheatToast(text, type) {
        document.getElementById('kwyk-toast')?.remove();
        const toast = document.createElement('div');
        toast.id = 'kwyk-toast';
        toast.style.background = type === 'success' ? '#2e7d32' : '#c62828';
        toast.innerHTML = `${type === 'success' ? '✓' : '✕'} ${escapeHtml(text)}`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    /**
     * Affiche un avertissement obligatoire avant la 1ère activation du mode Troll.
     * Retourne true si l'utilisateur accepte, false sinon.
     */
    function showTrollWarning() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,sans-serif;';

            const modal = document.createElement('div');
            modal.style.cssText = 'background:white;border-radius:12px;max-width:520px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,0.3);white-space:normal;';
            modal.innerHTML = '<h2 style="color:#c62828;margin-bottom:16px;font-size:20px;white-space:normal;">⚠️ Avertissement — Mode Troll</h2>'
                + '<p style="color:#333;margin-bottom:12px;line-height:1.5;font-size:14px;white-space:normal;">Le mode <strong>Troll</strong> remplit automatiquement les réponses générées par l\'IA. Son objectif principal est de <strong>démontrer la fiabilité</strong> de l\'assistant avant d\'utiliser les explications pédagogiques.</p>'
                + '<div style="background:#ffebee;border-left:4px solid #ef5350;padding:12px;margin:16px 0;border-radius:4px;">'
                + '<div style="color:#b71c1c;font-weight:600;margin:0 0 6px 0;font-size:13px;white-space:normal;">L\'utilisation de ce mode lors de :</div>'
                + '<div style="color:#b71c1c;font-size:13px;line-height:1.6;white-space:normal;margin:0 0 10px 0;"><div style="margin:0;padding:0;">— une évaluation notée, contrôle, examen</div><div style="margin:0;padding:0;">— un devoir surveillé en classe</div><div style="margin:0;padding:0;">— tout contexte où une aide extérieure est interdite</div></div>'
                + '<div style="color:#b71c1c;margin:0;font-size:13px;white-space:normal;">constitue une violation des règles scolaires et des CGU de la plateforme. <strong>Toute conséquence (sanction disciplinaire, désactivation du compte) est sous ta seule responsabilité.</strong></div>'
                + '</div>'
                + '<p style="color:#666;font-size:12px;margin-bottom:18px;white-space:normal;">En activant ce mode, tu reconnais avoir lu et compris cet avertissement. Voir les <a href="https://patatax-formulaire.notion.site/Conditions-d-Utilisation-Kwyk-Tutor-35cc3ccd8936818f8306d0374eaaf9d6" target="_blank" style="color:#667eea;">conditions d\'utilisation complètes</a>.</p>'
                + '<div style="display:flex;gap:10px;justify-content:flex-end;"><button id="kwyk-troll-refuse" style="padding:10px 20px;border:1px solid #ccc;background:white;border-radius:6px;cursor:pointer;font-size:14px;">Annuler</button><button id="kwyk-troll-accept" style="padding:10px 20px;border:none;background:#c62828;color:white;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">J\'ai compris et j\'accepte</button></div>';
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            modal.querySelector('#kwyk-troll-accept').onclick = () => {
                document.body.removeChild(overlay);
                resolve(true);
            };
            modal.querySelector('#kwyk-troll-refuse').onclick = () => {
                document.body.removeChild(overlay);
                resolve(false);
            };
        });
    }

    /**
     * Gère le toggle du mode triche
     */
    async function handleCheatToggle(e) {
        // 1ère activation : avertissement obligatoire
        if (e.target.checked) {
            const stored = await chrome.storage.sync.get('trollWarningAcknowledged');
            if (!stored.trollWarningAcknowledged) {
                const accepted = await showTrollWarning();
                if (!accepted) {
                    e.target.checked = false;
                    return;
                }
                await chrome.storage.sync.set({ trollWarningAcknowledged: true });
            }
        }

        cheatModeActive = e.target.checked;

        if (cheatModeActive) {
            LOG.debug('Mode triche ACTIVÉ');

            // Lancer le prefetch en arrière-plan (si sur un devoir)
            if (!prefetchInProgress && Object.keys(prefetchCache).length === 0) {
                prefetchAllHomework(); // Fire and forget — ne bloque pas
            }

            // Vérifier si un exercice est détecté
            if (!currentExercise || currentExercise.questions.length === 0) {
                LOG.debug('Aucun exercice détecté, mise en attente...');
                pendingCheatMode = true;
                updateCheatStatus('En attente de l\'exercice...', 'loading');
                return;
            }

            updateCheatStatus('Appel IA en cours...', 'loading');

            // Lancer le remplissage automatique
            await executeCheatMode();
        } else {
            LOG.debug('Mode triche DÉSACTIVÉ');
            pendingCheatMode = false;
            updateCheatStatus('En attente...', '');
        }
    }

    /**
     * Relance intelligente du mode triche après un abandon
     * Attend que le DOM soit stable (hash exercice différent) avant de relancer
     */
    async function smartRelaunch(oldHash) {
        LOG.debug('🔄 Relance intelligente...');
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
                LOG.debug('✓ Nouvel exercice détecté, relance !');
                executeCheatMode();
                return;
            }

            await new Promise(r => setTimeout(r, interval));
            waited += interval;
        }

        // Timeout: relancer quand même avec l'exercice actuel
        LOG.debug('⚠️ Timeout attente DOM, relance avec exercice actuel');
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
        LOG.debug('executeCheatMode démarré (ID:', myExecutionId, ')');

        // Vérifier EN TOUT PREMIER si bloqué/non supporté — avant même d'acquérir le verrou
        if (!currentExercise || currentExercise.questions.length === 0) {
            updateCheatStatus('Aucun exercice détecté', 'error');
            return;
        }
        if (checkUnsupportedExercise(true)) {
            LOG.debug('Exercice bloqué/non supporté, abandon avant verrou');
            return;
        }

        // Vérifier si une autre exécution est en cours
        if (cheatModeRunning) {
            LOG.debug('⏳ Mode triche déjà en cours, abandon');
            return;
        }
        cheatModeRunning = true;
        cheatAbortController = new AbortController();

        // Bloquer le mode triche pour tableaux signes/variations (pas valeurs — autoFillInput gère)
        const exerciseType = currentExercise?.exerciseType;
        if (exerciseType === 'tableau_signes' || exerciseType === 'tableau_variations') {
            LOG.debug(`Mode triche bloqué pour type: ${exerciseType}`);
            updateCheatStatus('Tableaux signes/variations non supportés en mode troll.', 'error');

            // Auto-skip si les options sont activées
            if (config.cheatAutoValidate && config.cheatAutoNext) {
                setTimeout(() => {
                    const nextBtn = document.querySelector('button.exercise_next');
                    if (nextBtn) {
                        nextBtn.click();
                        LOG.debug('Auto-skip tableau');
                    }
                }, 200);
            }

            cheatModeRunning = false;
            return;
        }

        // Sauvegarder le hash actuel pour vérification
        const currentHash = lastExerciseHash;

        try {
            // SÉCURITÉ: Toujours vérifier que la solution en cache correspond à l'exercice actuel
            if (cachedSolution && cachedSolution._exerciseHash !== currentHash) {
                LOG.debug('⚠️ Solution en cache ne correspond pas à l\'exercice actuel, reset...');
                LOG.debug('Hash cache:', cachedSolution._exerciseHash?.substring(0, 20));
                LOG.debug('Hash actuel:', currentHash?.substring(0, 20));
                cachedSolution = null;
            }

            // Résoudre le problème si pas encore en cache
            if (!cachedSolution) {
                // 0. Solvers directs (priorité max — override tout cache IA)
                const directSolution = tryDirectSolve();
                if (directSolution) {
                    LOG.info('Résolution directe (triche) — bypass cache');
                    cachedSolution = directSolution;
                    cachedSolution._exerciseHash = currentHash;
                } else {
                // Vérifier le prefetch cache d'abord
                const exId = extractExerciseIdFromUrl();
                const prefetched = exId ? getPrefetchedSolution(exId) : null;

                if (prefetched) {
                    LOG.info('Utilisation solution prefetchée (triche)');
                    // Petit délai pour laisser la page se charger
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    cachedSolution = prefetched.solution;
                    cachedSolution._exerciseHash = currentHash;
                } else {
                LOG.debug('Pas de solution en cache, appel IA...');
                let result = await solveProblem();

                // VÉRIFICATION: L'exercice a-t-il changé pendant l'appel IA ?
                if (myExecutionId !== cheatExecutionId) {
                    LOG.debug('⛔ Exercice changé pendant l\'appel IA, abandon (ID:', myExecutionId, '→', cheatExecutionId, ')');
                    cheatModeRunning = false;
                    // Relancer intelligemment pour le nouvel exercice
                    smartRelaunch(currentHash);
                    return;
                }

                if (result.error === 'aborted') {
                    cheatModeRunning = false;
                    return; // Annulation propre, pas d'erreur affichée
                }
                if (result.error) {
                    throw new Error(result.error);
                }

                // Retry silencieux si réponse vide (R1)
                if (!isValidSolution(result.solution)) {
                    LOG.warn('Réponse IA vide en triche, retry silencieux...');
                    result = await solveProblem();
                    if (myExecutionId !== cheatExecutionId) {
                        cheatModeRunning = false;
                        smartRelaunch(currentHash);
                        return;
                    }
                    if (result.error === 'aborted') { cheatModeRunning = false; return; }
                    if (result.error) throw new Error(result.error);
                }

                cachedSolution = result.solution;

                if (!isValidSolution(cachedSolution)) {
                    LOG.error('⚠️ Solution IA vide même après retry, pas de mise en cache');
                    cachedSolution = null;
                    throw new Error('L\'IA a retourné une réponse vide');
                }

                // Stocker le hash de l'exercice avec la solution
                cachedSolution._exerciseHash = currentHash;
                LOG.debug('Nouvelle solution mise en cache (hash:', currentHash?.substring(0, 20), ')');
                } // fin else (prefetch miss → appel IA normal)
                } // fin else (direct solver miss → prefetch / IA)
            } else {
                LOG.debug('✓ Réutilisation solution en cache (même exercice)');
            }

            // Attendre un peu que le DOM soit prêt
            await new Promise(r => setTimeout(r, 150));

            // VÉRIFICATION: L'exercice a-t-il changé ?
            if (myExecutionId !== cheatExecutionId) {
                LOG.debug('⛔ Exercice changé avant remplissage, abandon');
                cheatModeRunning = false;
                // Relancer automatiquement pour le nouvel exercice
                LOG.debug('🔄 Relance auto pour nouvel exercice...');
                setTimeout(() => executeCheatMode(), 200);
                return;
            }

            // Remplir TOUTES les questions d'un coup
            updateCheatStatus('Remplissage des réponses...', 'loading');
            const numQuestions = currentExercise.questions.length;
            const success = await autoFillAllQuestions();

            // VÉRIFICATION: L'exercice a-t-il changé ?
            if (myExecutionId !== cheatExecutionId) {
                LOG.debug('⛔ Exercice changé après remplissage, abandon validation');
                cheatModeRunning = false;
                // Relancer automatiquement pour le nouvel exercice
                LOG.debug('🔄 Relance auto pour nouvel exercice...');
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
            LOG.error(`Erreur mode triche (tentative ${retryCount + 1}/${MAX_RETRIES}):`, error);

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
            LOG.error('Pas de solution ou exercice en cache');
            return false;
        }

        const question = currentExercise.questions[questionIndex];
        const reponse = cachedSolution.reponses[questionIndex];

        if (!question || !reponse) {
            LOG.error('Pas de réponse pour la question', questionIndex + 1);
            return false;
        }

        LOG.debug('Auto-fill Q' + (questionIndex + 1) + ':', reponse);
        LOG.debug('Type de question:', question.type);

        const exerciseBlocks = document.querySelectorAll('.exercise_question');
        const block = exerciseBlocks[questionIndex] || exerciseBlocks[0] || null;

        LOG.debug('Blocs .exercise_question trouvés:', exerciseBlocks.length);
        LOG.debug('Block sélectionné:', block ? 'OK' : 'NULL (fallback global)');

        // Déterminer le type effectif (l'IA peut retourner qcm_multiples)
        const aiType = reponse.type || 'unknown';
        const domType = question.type;

        LOG.debug('Type IA:', aiType, '| DOM:', domType, '| answerFormat:', question.answerFormat || '?');

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
                LOG.debug('Type inconnu, détection automatique...');

                // 1. Vérifier s'il y a des checkboxes globales (pattern id_answer_X_Y)
                const globalCheckboxes = document.querySelectorAll(`input[type="checkbox"][id^="id_answer_${questionIndex}_"]`);
                if (globalCheckboxes.length > 0) {
                    LOG.debug('Checkboxes globales détectées:', globalCheckboxes.length);
                    return await autoFillCheckbox(block, question, reponse, questionIndex);
                }

                // 2. Vérifier s'il y a des radios globaux
                let globalRadios = document.querySelectorAll(`input[type="radio"][id^="id_answer_${questionIndex}_"]`);
                if (globalRadios.length === 0) {
                    globalRadios = document.querySelectorAll(`input[type="radio"][id^="id_mcq_answer_${questionIndex}_"]`);
                }
                if (globalRadios.length > 0) {
                    LOG.debug('Radios globaux détectés:', globalRadios.length);
                    return await autoFillRadio(block, question, reponse, questionIndex);
                }

                // 3. Vérifier s'il y a un input text global
                const globalInput = document.querySelector(`input[type="text"][id="id_answer_${questionIndex}"]`);
                if (globalInput) {
                    LOG.debug('Input text global détecté');
                    return await autoFillInput(block, question, reponse, questionIndex);
                }

                // 4. Fallback MathQuill
                LOG.debug('Fallback: essai MathQuill/textarea');
                return await autoFillInput(block, question, reponse, questionIndex);
            }
        } catch (e) {
            LOG.error('Erreur auto-fill:', e);
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
            LOG.error('Pas de solution ou exercice en cache');
            return false;
        }

        const numQuestions = currentExercise.questions.length;
        LOG.debug('=== REMPLISSAGE DE TOUTES LES QUESTIONS ===');
        LOG.debug('Nombre de questions:', numQuestions);

        let allSuccess = true;

        // Remplir chaque question
        for (let i = 0; i < numQuestions; i++) {
            LOG.debug(`Remplissage Q${i + 1}/${numQuestions}...`);
            const success = await autoFillQuestion(i);

            if (!success) {
                LOG.warn(`Échec du remplissage Q${i + 1}`);
                allSuccess = false;
            } else {
                LOG.debug(`✓ Q${i + 1} remplie`);
            }

            // Petit délai entre chaque question pour éviter les problèmes de timing
            if (i < numQuestions - 1) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        LOG.debug('=== FIN REMPLISSAGE ===', allSuccess ? 'SUCCÈS' : 'PARTIEL');
        return allSuccess;
    }

    /**
     * Clique automatiquement sur le bouton Valider
     * v24: Polling rapide pour vérifier que la validation a fonctionné
     */
    async function autoClickValidate() {
        LOG.debug('Auto-validation...');
        updateCheatStatus('Validation...', 'loading');

        // Laisser le temps à MathQuill de traiter l'écriture (write/latex)
        await new Promise(r => setTimeout(r, 800));

        // Attendre que le bouton Valider soit prêt (pas disabled, pas en cours de soumission)
        const submitReady = await waitForCondition(() => {
            const btn = document.querySelector('button.exercise_submit');
            return btn && !btn.disabled && !btn.classList.contains('loading');
        }, 5000, 200);

        if (!submitReady) {
            LOG.warn('⚠ Bouton Valider pas prêt après 5s');
        }

        // Chercher TOUS les boutons Valider (il peut y en avoir plusieurs)
        const validateBtns = document.querySelectorAll('button.exercise_submit');

        if (validateBtns.length === 0) {
            LOG.warn('Aucun bouton Valider trouvé');
            updateCheatStatus('✓ Rempli (validation manuelle)', 'success');
            return false;
        }

        // Cliquer sur TOUS les boutons Valider
        LOG.debug(`${validateBtns.length} bouton(s) Valider trouvé(s)`);
        validateBtns.forEach((btn, i) => {
            btn.click();
            LOG.debug(`Bouton Valider ${i + 1}/${validateBtns.length} cliqué`);
        });
        LOG.debug('Tous les boutons Valider cliqués, vérification...');

        // Polling rapide : attendre que le bouton Suivant apparaisse et soit actif
        const validated = await waitForCondition(() => {
            const nextBtn = document.querySelector('button.exercise_next');
            // Le bouton Suivant existe et n'est pas disabled
            return nextBtn && !nextBtn.disabled;
        }, 5000, 100);

        if (validated) {
            LOG.debug('✓ Validation confirmée');

            // Vérifier si auto-next est activé
            if (config.cheatAutoNext) {
                await autoClickNext();
            } else {
                updateCheatStatus('✓ Validé !', 'success');
                playBeep('success'); // Son de succès
            }
            return true;
        } else {
            LOG.warn('⚠ Timeout validation');
            updateCheatStatus('⚠ Validez manuellement', 'error');
            playBeep('error'); // Son d'erreur
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
        LOG.debug('Auto-clic Suivant... (tentative', retryCount + 1, '/', MAX_RETRIES, ')');
        updateCheatStatus(`Passage au suivant...${retryCount > 0 ? ` (retry ${retryCount})` : ''}`, 'loading');

        // Sauvegarder l'empreinte de l'exercice actuel
        const previousFingerprint = getExerciseFingerprint();
        LOG.debug('Empreinte exercice actuel:', previousFingerprint?.substring(0, 50));

        // Chercher le bouton Suivant
        const nextBtn = document.querySelector('button.exercise_next');

        if (!nextBtn) {
            LOG.warn('Bouton Suivant non trouvé');
            updateCheatStatus('✓ Validé (suivant manuel)', 'success');
            return false;
        }

        // Cliquer sur Suivant
        nextBtn.click();
        LOG.debug('Bouton Suivant cliqué, vérification...');

        // Polling rapide : attendre que l'exercice change (max 2 secondes par tentative)
        const changed = await waitForCondition(() => {
            const newFingerprint = getExerciseFingerprint();
            return newFingerprint !== null && newFingerprint !== previousFingerprint;
        }, 2000, 100);

        if (changed) {
            LOG.debug('✓ Exercice changé, attente chargement complet de la page...');
            updateCheatStatus('Chargement exercice suivant...', 'loading');

            // Phase 1 : Attendre que le bouton Valider + inputs soient dans le DOM
            const domReady = await waitForCondition(() => {
                const submitBtn = document.querySelector('button.exercise_submit');
                if (!submitBtn || submitBtn.disabled) return false;
                const hasInputs = document.querySelector('.exercise_question input, .exercise_question .mq-editable-field, input[id^="id_answer_"]');
                return !!hasInputs;
            }, 8000, 200);

            if (!domReady) {
                LOG.debug('⚠ Timeout chargement DOM nouvel exercice');
            }

            // Phase 2 : Attendre que MathQuill soit initialisé (les champs .mq-editable-field deviennent interactifs)
            // + que les scripts Kwyk aient fini de s'exécuter
            await new Promise(r => setTimeout(r, 1500));

            // Phase 3 : Vérifier que la page est stable (pas de requêtes AJAX en cours)
            const stable = await waitForCondition(() => {
                // Le bouton submit doit toujours être là et actif
                const submitBtn = document.querySelector('button.exercise_submit');
                return submitBtn && !submitBtn.disabled;
            }, 3000, 300);

            LOG.debug('✓ Page stable, prêt pour le prochain exercice');

            // IMPORTANT: Reset la solution en cache pour forcer une nouvelle résolution
            cachedSolution = null;
            LOG.debug('Cache solution vidé pour nouvel exercice');
            updateCheatStatus('✓ Passé au suivant !', 'success');
            playBeep('success'); // Son de succès
            return true;
        } else {
            // Retry si on n'a pas atteint le max
            if (retryCount < MAX_RETRIES - 1) {
                LOG.debug('Retry clic Suivant...');
                await new Promise(r => setTimeout(r, 500)); // Petite pause avant retry
                return autoClickNext(retryCount + 1);
            } else {
                LOG.warn('⚠ Max retries atteint - exercice pas changé');
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
     * Construit l'intervalle solution à partir des données structurées de l'IA.
     * critiques: valeurs critiques triées (strings au format (a)/(b))
     * interdites: valeurs où le dénominateur s'annule (toujours exclues)
     * signes: signe dans chaque intervalle ["-", "+", "-"] (N+1 pour N critiques)
     * comparaison: ">=", ">", "<=", "<"
     */
    /**
     * Parse une valeur critique (string) en nombre pour le tri.
     * Gère: "-2", "(3)/(2)", "(-4)/(5)", "+∞", "-∞"
     */
    function parseCriticalValue(val) {
        if (val.includes('∞')) return val.startsWith('-') ? -Infinity : Infinity;
        // Format (a)/(b) ou -(a)/(b)
        const fracMatch = val.match(/^(-?)\((-?\d+)\)\/\((-?\d+)\)$/);
        if (fracMatch) {
            const sign = fracMatch[1] === '-' ? -1 : 1;
            return sign * parseInt(fracMatch[2]) / parseInt(fracMatch[3]);
        }
        // Nombre simple (entier ou décimal)
        const num = parseFloat(val);
        if (!isNaN(num)) return num;
        // Fallback pour expressions comme -2√3 : on ne peut pas parser exactement,
        // on retourne NaN et le tri sera ignoré
        LOG.warn('⚠️ Impossible de parser la valeur critique:', val);
        return NaN;
    }

    /**
     * Corrige les bornes inversées dans un intervalle (gauche > droite → swap).
     * Ex: ]-(9)/(7);-(3)/(2)[ → ]-(3)/(2);-(9)/(7)[
     */
    function fixIntervalBounds(text) {
        // Matcher chaque intervalle individuel : ]...;...[  ou [...;...]  etc.
        return text.replace(/([\[\]])([^;[\]]+);([^;[\]]+)([\[\]])/g, (match, lb, left, right, rb) => {
            const leftVal = parseCriticalValue(left.trim());
            const rightVal = parseCriticalValue(right.trim());
            if (!isNaN(leftVal) && !isNaN(rightVal) && leftVal > rightVal) {
                // Swap bornes. Les types de crochets (inclus/exclu) suivent leur valeur.
                // Exclu gauche = ], exclu droite = [. Inclus gauche = [, inclus droite = ].
                // Quand A (exclu ]) passe à droite → [. Quand B (exclu [) passe à gauche → ].
                const flipBracket = b => b === '[' ? ']' : '[';
                LOG.debug('🔧 Bornes inversées corrigées:', left.trim(), '>', right.trim());
                return flipBracket(rb) + right + ';' + left + flipBracket(lb);
            }
            return match;
        });
    }

    function buildIntervalFromSigns(critiques, interdites, signes, comparaison) {
        const wantPositive = comparaison.includes('>');
        const wantSign = wantPositive ? '+' : '-';
        const isLarge = comparaison.includes('='); // ≥ ou ≤

        // Normaliser les signes non standard
        signes = signes.map(s => {
            if (s === '+' || s === '-') return s;
            const lower = (s || '').toLowerCase();
            if (lower === 'valide' || lower === 'positif' || lower === 'pos') return '+';
            if (lower === 'invalide' || lower === 'négatif' || lower === 'negatif' || lower === 'neg') return '-';
            return '+';
        });

        // Trier les valeurs critiques par ordre croissant (l'IA se trompe parfois sur les fractions négatives)
        // Si l'ordre change → recalculer les signes par alternance (fiable pour facteurs linéaires, niveau Seconde)
        const numericValues = critiques.map(parseCriticalValue);
        const allParseable = numericValues.every(v => !isNaN(v));
        if (allParseable && critiques.length >= 2) {
            const sorted = [...critiques].sort((a, b) => parseCriticalValue(a) - parseCriticalValue(b));
            const orderChanged = sorted.some((v, i) => v !== critiques[i]);
            if (orderChanged) {
                LOG.warn('⚠️ Critiques mal ordonnées par l\'IA:', critiques, '→ tri + recalcul signes par alternance');
                critiques = sorted;
                // Le signe à +∞ (dernier) est fiable (indépendant de l'ordre des critiques)
                const lastSign = signes[signes.length - 1];
                const n = critiques.length;
                signes = [];
                for (let i = n; i >= 0; i--) {
                    signes[i] = ((n - i) % 2 === 0) ? lastSign : (lastSign === '+' ? '-' : '+');
                }
                LOG.debug('🔧 Critiques triées:', critiques, '| Signes recalculés:', signes);
            }
        }

        // Validation simple : N+1 signes pour N critiques. Sinon → null (fallback réponse IA)
        if (signes.length !== critiques.length + 1) {
            LOG.warn('⚠️ Signes/critiques incompatibles:', signes.length, 'signes pour', critiques.length, 'critiques');
            return null;
        }

        const n = critiques.length;
        const interditesSet = new Set(interdites);

        // Cas sans valeur critique
        if (n === 0) {
            if (signes[0] === wantSign) return ']-∞;+∞[';
            return '∅';
        }

        // Cas spécial : TOUS les signes sont le bon et large (≤/≥) → ℝ entier
        const allMatch = signes.every(s => s === wantSign);
        if (allMatch && isLarge) {
            return ']-∞;+∞[';
        }
        // Si tous les signes matchent et strict (>/<), on continue vers la construction
        // normale qui produira ]-∞;c1[∪]c1;c2[∪]c2;+∞[ (racines exclues)

        // Construire la liste des intervalles satisfaisants
        const intervals = [];

        for (let i = 0; i <= n; i++) {
            if (signes[i] !== wantSign) continue;

            // Borne gauche
            let left, leftBracket;
            if (i === 0) {
                left = '-∞';
                leftBracket = ']';
            } else {
                left = critiques[i - 1];
                const isInterdite = interditesSet.has(left);
                leftBracket = (isLarge && !isInterdite) ? '[' : ']';
            }

            // Borne droite
            let right, rightBracket;
            if (i === n) {
                right = '+∞';
                rightBracket = '[';
            } else {
                right = critiques[i];
                const isInterdite = interditesSet.has(right);
                rightBracket = (isLarge && !isInterdite) ? ']' : '[';
            }

            intervals.push(`${leftBracket}${left};${right}${rightBracket}`);
        }

        // Cas spéciaux pour ≤/≥ : ajouter les racines isolées (où expression = 0)
        // Si un intervalle adjacent est déjà inclus avec crochet fermé, c'est déjà couvert
        // On collecte les singletons séparément pour les grouper en un seul ensemble {v1;v2}
        const singletons = [];
        if (isLarge) {
            for (let i = 0; i < n; i++) {
                const val = critiques[i];
                if (interditesSet.has(val)) continue;
                const coveredLeft = (signes[i] === wantSign);
                const coveredRight = (signes[i + 1] === wantSign);
                if (!coveredLeft && !coveredRight) {
                    singletons.push(val);
                }
            }
        }

        // Grouper les singletons en un seul ensemble {v1;v2;...} au lieu de {v1}∪{v2}
        // Évite le bug regex dans convertToLatex où {a}∪{b} est mal parsé
        if (singletons.length > 0) {
            intervals.push(`{${singletons.join(';')}}`);
        }

        if (intervals.length === 0) return '∅';

        return intervals.join('∪');
    }

    /**
     * Convertit une réponse au format (a)/(b) en LaTeX \frac{a}{b}
     */
    function convertToLatex(value) {
        if (!value) return value;
        value = value.trim();

        // Vecteurs : AB→ ou u→ → \overrightarrow{AB} ou \overrightarrow{u}
        // Doit être EN PREMIER (avant toute autre transformation)
        value = value.replace(/([A-Z]{1,2}|[a-z])\u2192/g, '\\overrightarrow{$1}');

        // Normaliser les caractères Unicode vers ASCII (ex: tiret long U+2212 → tiret ASCII)
        value = value.replace(/−/g, '-');
        // Supprimer les espaces autour des ; dans les ensembles/intervalles : { -2 ; 3 } → {-2;3}
        value = value.replace(/\s*;\s*/g, ';');

        // Nettoyer les parenthèses inutiles autour de nombres seuls : -(2) → -2, (3) → 3, (-2) → -2
        // Ne touche PAS aux fractions (a)/(b) car le / suit la parenthèse fermante
        value = value.replace(/-\((\d+)\)(?!\/)/g, '-$1');
        value = value.replace(/(?<!\/)\((-?\d+)\)(?!\/)/g, '$1');

        // Ensemble solution : {contenu} → \left\{contenu\right\}
        // Doit être EN PREMIER avant les conversions de fractions qui introduisent des {} imbriquées
        // Ex: {(-5)/(4)} → \left\{\frac{-5}{4}\right\}  (pas {\frac{-5}{4}} qui est un groupement invisible)
        const ensembleMatch = value.match(/^\{\s*(.+?)\s*\}$/);
        if (ensembleMatch) {
            let innerConverted = convertToLatex(ensembleMatch[1].trim());
            // Strip parenthèses superflues autour d'un nombre seul : (-1) → -1, (-5) → -5
            // Ne s'applique pas aux fractions \frac{...} ni aux expressions avec parens imbriquées
            innerConverted = innerConverted.replace(/^\((-?[^()]+)\)$/, '$1');
            LOG.debug('Conversion LaTeX:', value, '->', `\\left\\{${innerConverted}\\right\\}`);
            return `\\left\\{${innerConverted}\\right\\}`;
        }

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

        // Convertir ℝ seul en \mathbb{R} (domaine = tous les réels)
        // IMPORTANT: Doit être APRÈS la conversion ℝ{...} pour ne pas interférer
        latex = latex.replace(/ℝ/g, '\\mathbb{R}');

        // Symboles Unicode → LaTeX (MathQuill stocke en LaTeX, Kwyk valide en LaTeX)
        latex = latex.replace(/∞/g, '\\infty');
        latex = latex.replace(/∪/g, '\\cup');
        latex = latex.replace(/∅/g, '\\varnothing');

        // Note: la conversion {contenu} → \left\{contenu\right\} est gérée en début de fonction

        // NOTE: \left] et \right[ (crochets inversés) ne sont PAS supportés par MathQuill.
        // MathQuill exige \left avec un délimiteur ouvrant et \right avec un fermant.
        // Les crochets restent en taille normale — c'est cosmétique, mais au moins le champ est rempli.

        // Supprimer les parenthèses superflues autour de \frac : (\frac{a}{b}) → \frac{a}{b}
        // Se produit quand (7/4) est normalisé en ((7)/(4)) puis converti en (\frac{7}{4})
        latex = latex.replace(/\(\\frac\{([^}]*)\}\{([^}]*)\}\)/g, '\\frac{$1}{$2}');

        LOG.debug('Conversion LaTeX:', value, '->', latex);
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
        LOG.debug('autoFillInput - Début recherche... fieldIndex:', fieldIndex);

        const value = reponse.reponse;
        LOG.debug('Valeur à insérer:', value);

        if (isInvalidAnswer(value)) {
            LOG.warn('Valeur invalide pour auto-fill input:', JSON.stringify(value));
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
            LOG.debug('MathQuill détecté:', mqFields.length, 'champ(s), ciblant index:', fieldIndex);

            const mqField = mqFields[fieldIndex];

            if (mqField) {
                // Convertir en LaTeX
                const latex = convertToLatex(value);

                // Envoyer au script injecté via postMessage avec l'index
                let success = await sendToInjectedScript(latex, fieldIndex);

                if (!success) {
                    // Retry avec LaTeX simplifié : supprimer les commandes problématiques
                    // (ex: \left]/\right[ que MathQuill ne supporte pas)
                    const simplified = latex
                        .replace(/\\left([[\]])/g, '$1')
                        .replace(/\\right([[\]])/g, '$1');
                    if (simplified !== latex) {
                        LOG.debug('Retry avec LaTeX simplifié:', simplified);
                        success = await sendToInjectedScript(simplified, fieldIndex);
                    }
                }

                if (success) {
                    // Animation highlight sur le champ MathQuill
                    highlightElement(mqField);
                    return true;
                } else {
                    LOG.debug('Script injecté échoué, fallback textarea');
                }
            } else {
                LOG.debug('MathQuill field index', fieldIndex, 'non trouvé');
            }
        }

        // ============================================
        // STRATÉGIE 2 : Input text global (id_answer_X)
        // ============================================
        const globalInput = document.querySelector(`input[type="text"][id="id_answer_${fieldIndex}"]`);

        if (globalInput) {
            LOG.debug('Input text global trouvé:', globalInput.id);
            globalInput.focus();
            globalInput.value = value;
            globalInput.dispatchEvent(new Event('input', { bubbles: true }));
            globalInput.dispatchEvent(new Event('change', { bubbles: true }));
            highlightElement(globalInput);
            return true;
        }

        // ============================================
        // STRATÉGIE 2b : input[data-kwyk="multifrench"] (exercices figure+panels)
        // ============================================
        const multifrenchInputs = document.querySelectorAll('input[data-kwyk="multifrench"]');
        if (multifrenchInputs.length > 0) {
            const targetInput = multifrenchInputs[fieldIndex] || multifrenchInputs[0];
            LOG.debug('multifrench input trouvé (index ' + fieldIndex + ')');
            targetInput.focus();
            targetInput.value = value;
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            highlightElement(targetInput);
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
                    LOG.debug('Input text trouvé:', inp.id);
                    break;
                }
            }
        }

        if (!field) {
            LOG.error('Aucun champ trouvé');
            return false;
        }

        LOG.debug('Fallback:', field.tagName, field.id || '');

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
                    LOG.debug('Réponse du script injecté:', event.data);
                    resolve(event.data.success);
                }
            };
            window.addEventListener('message', handler);

            // Timeout de sécurité (3 secondes)
            setTimeout(() => {
                window.removeEventListener('message', handler);
                LOG.debug('Timeout - pas de réponse du script injecté');
                resolve(false);
            }, 3000);

            // Envoyer la demande au script injecté
            LOG.debug('Envoi au script injecté:', latex, 'fieldIndex:', fieldIndex);
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
        LOG.debug('autoFillRadio - Question', questionIndex + 1);

        if (isInvalidAnswer(reponse?.reponse)) {
            LOG.warn('Valeur invalide pour auto-fill radio:', JSON.stringify(reponse?.reponse));
            return false;
        }

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
            LOG.error('Aucun radio button trouvé');
            return false;
        }

        LOG.debug('Radios trouvés:', radios.length);

        const answer = reponse.reponse.toLowerCase().trim();
        const radioArray = Array.from(radios);

        LOG.debug('Réponse à sélectionner:', answer);

        // 1. Essayer par lettre (A, B, C, D) - PRIORITÉ
        if (answer.length === 1 && answer >= 'a' && answer <= 'z') {
            const letterIndex = answer.charCodeAt(0) - 97; // 'a' = 0
            if (letterIndex >= 0 && letterIndex < radioArray.length) {
                const radio = radioArray[letterIndex];
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                radio.dispatchEvent(new Event('click', { bubbles: true }));
                highlightElement(radio.closest('label') || radio.parentElement);
                LOG.debug('Radio coché par lettre:', answer.toUpperCase());
                return true;
            }
        }

        // 2. Correspondance EXACTE du label (V15: support MathJax)
        for (const radio of radioArray) {
            const labelEl = radio.labels?.[0] || radio.parentElement;
            const label = extractLabelWithMath(labelEl).toLowerCase();

            if (label === answer) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                radio.dispatchEvent(new Event('click', { bubbles: true }));
                highlightElement(radio.closest('label') || radio.parentElement);
                LOG.debug('Radio coché (exact):', label);
                return true;
            }
        }

        // 3. Le label CONTIENT la réponse exacte (avec espaces/ponctuation autour)
        for (const radio of radioArray) {
            const labelEl = radio.labels?.[0] || radio.parentElement;
            const label = extractLabelWithMath(labelEl).toLowerCase();

            // Vérifier si le label contient la réponse comme mot entier
            const regex = new RegExp(`(^|\\s|\\.|,)${escapeRegex(answer)}($|\\s|\\.|,)`, 'i');
            if (regex.test(label)) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                radio.dispatchEvent(new Event('click', { bubbles: true }));
                highlightElement(radio.closest('label') || radio.parentElement);
                LOG.debug('Radio coché (mot entier):', label);
                return true;
            }
        }

        // 4. Fallback: premier mot du label correspond
        for (const radio of radioArray) {
            const labelEl = radio.labels?.[0] || radio.parentElement;
            const label = extractLabelWithMath(labelEl).toLowerCase();
            const firstWord = label.split(/[\s.,]+/)[0];

            if (firstWord === answer || answer === firstWord) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                radio.dispatchEvent(new Event('click', { bubbles: true }));
                highlightElement(radio.closest('label') || radio.parentElement);
                LOG.debug('Radio coché (premier mot):', label);
                return true;
            }
        }

        LOG.warn('Radio non trouvé pour:', answer);
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
        LOG.debug('autoFillCheckbox - Question', questionIndex + 1);

        // Pour QCM multiple : vérifier reponse.reponse OU reponse.reponses (array)
        const hasArrayResponses = Array.isArray(reponse?.reponses) && reponse.reponses.length > 0;
        if (!hasArrayResponses && isInvalidAnswer(reponse?.reponse)) {
            LOG.warn('Valeur invalide pour auto-fill checkbox:', JSON.stringify(reponse?.reponse));
            return false;
        }

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
            LOG.error('Aucune checkbox trouvée');
            return false;
        }

        LOG.debug('Checkboxes trouvées:', checkboxes.length);

        // Construire la liste de réponses à cocher
        // D'abord essayer de matcher le texte complet comme un seul label (ex: "Ni constante, ni linéaire")
        // Si aucun match exact, alors splitter sur les virgules
        const fullAnswer = reponse.reponse.trim().toLowerCase();
        const checkboxLabels = Array.from(checkboxes).map(cb =>
            extractLabelWithMath(cb.labels?.[0] || cb.parentElement).toLowerCase()
        );
        const hasExactFullMatch = checkboxLabels.some(label => label === fullAnswer);
        const answers = hasExactFullMatch
            ? [fullAnswer]
            : reponse.reponse.split(',').map(a => a.trim().toLowerCase());
        let filled = false;

        LOG.debug('Réponses à cocher:', answers, hasExactFullMatch ? '(match exact complet)' : '(split virgule)');

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
                    LOG.debug('Checkbox coché par lettre:', answer.toUpperCase());
                }
            }

            // 2. Essayer par correspondance EXACTE du label (V15: support MathJax)
            if (!matched) {
                for (const checkbox of checkboxArray) {
                    const label = extractLabelWithMath(checkbox.labels?.[0] || checkbox.parentElement).toLowerCase();

                    // Correspondance exacte
                    if (label === answer) {
                        checkbox.checked = true;
                        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                        checkbox.dispatchEvent(new Event('click', { bubbles: true }));
                        highlightElement(checkbox.closest('label') || checkbox.parentElement);
                        filled = true;
                        matched = true;
                        LOG.debug('Checkbox coché (exact):', label);
                        break;
                    }
                }
            }

            // 3. Essayer par correspondance partielle (le label COMMENCE par la réponse)
            if (!matched) {
                for (const checkbox of checkboxArray) {
                    const label = extractLabelWithMath(checkbox.labels?.[0] || checkbox.parentElement).toLowerCase();

                    if (label.startsWith(answer + ' ') || label.startsWith(answer + '.')) {
                        checkbox.checked = true;
                        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                        checkbox.dispatchEvent(new Event('click', { bubbles: true }));
                        highlightElement(checkbox.closest('label') || checkbox.parentElement);
                        filled = true;
                        matched = true;
                        LOG.debug('Checkbox coché (startsWith):', label);
                        break;
                    }
                }
            }

            if (!matched) {
                LOG.warn('Checkbox non trouvée pour:', answer);
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
    /**
     * V16: Extrait l'ID de l'exercice depuis l'URL
     * Format Kwyk: /devoirs/781733/?id=35850955
     * @returns {number|null} L'ID de l'exercice ou null si non trouvé
     */
    function extractExerciseIdFromUrl() {
        // Extraire depuis le lien actif de navigation: <a class="active" href="?id=XXXXX">
        const activeLink = document.querySelector('a.active[href^="?id="]');
        if (activeLink) {
            const match = activeLink.getAttribute('href').match(/\?id=(\d+)/);
            if (match) {
                const id = parseInt(match[1], 10);
                LOG.debug(`ID exercice extrait (DOM actif): ${id}`);
                return id;
            }
        }

        // Fallback: URL query parameter
        const urlParams = new URLSearchParams(window.location.search);
        const idParam = urlParams.get('id');
        if (idParam) {
            const id = parseInt(idParam, 10);
            if (!isNaN(id)) {
                LOG.debug(`ID exercice extrait (URL): ${id}`);
                return id;
            }
        }

        return null;
    }

    // ===========================================
    // DÉTECTION RÉSULTAT EXERCICE (correct/incorrect)
    // ===========================================

    // ===========================================
    // MODE RÉVISION — FETCH BATCH
    // ===========================================

    /**
     * Parse la sidebar pour extraire tous les IDs d'exercices et leur statut
     */
    function parseSidebarExercises() {
        const links = document.querySelectorAll('#sequence_left a[href*="id="]');
        const exercises = [];
        links.forEach(a => {
            const m = a.href.match(/id=(\d+)/);
            if (!m) return;
            const id = m[1];
            const icon = a.querySelector('i');
            let status = 'unanswered';
            if (icon) {
                if (icon.classList.contains('incorrect')) status = 'incorrect';
                else if (icon.classList.contains('correct')) status = 'correct';
            }
            const nameMatch = a.textContent.trim().match(/Exo\s+(\S+)/);
            const name = nameMatch ? nameMatch[1] : id;
            exercises.push({ id, status, name });
        });
        return exercises;
    }

    /**
     * Détecte l'URL de base du devoir (devoirs ou anciens_devoirs)
     */
    function detectHomeworkBaseUrl() {
        const path = window.location.pathname;
        // Formats possibles :
        // /devoirs/785206/
        // /exercices/devoirs/123456/
        // /exercices/anciens_devoirs/785534/
        const match = path.match(/(\/(?:exercices\/)?(?:anciens_devoirs|devoirs)\/\d+)\/?/);
        if (match) return match[1] + '/';
        return null;
    }

    /**
     * Fetch un exercice via AJAX et extrait l'énoncé + correction
     */
    async function fetchExerciseData(baseUrl, exerciseId) {
        const url = `${baseUrl}?id=${exerciseId}&_=${Date.now()}`;
        const response = await fetch(url, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const html = data.templates?.[0] || '';
        const parsed = parseExerciseFromHTML(html, exerciseId);
        parsed._rawHtml = html; // Conserver le HTML brut pour le prefetch
        return parsed;
    }

    /**
     * Parse le HTML d'un exercice pour extraire énoncé, correction, type
     */
    function parseExerciseFromHTML(html, exerciseId) {
        const div = document.createElement('div');
        div.innerHTML = html;

        // Extraire l'exercise_id et shown_id
        const container = div.querySelector('[exercise_id]');
        const templateId = container ? container.getAttribute('exercise_id') : '';
        const shownId = container ? container.getAttribute('shown_id') : '';

        // Extraire l'énoncé
        const questionEl = div.querySelector('.exercise_question');
        let enonce = '';
        if (questionEl) {
            // Nettoyer : supprimer les éléments de formulaire et boutons
            const clone = questionEl.cloneNode(true);
            clone.querySelectorAll('form, .exercise_right_panel, .exercise_buttons, .exercise_answer').forEach(el => el.remove());
            enonce = clone.textContent.trim();
            // Garder aussi le HTML brut pour le LaTeX
            const enonceHTML = clone.innerHTML.trim();
            // Si l'énoncé contient du LaTeX (\(...\) ou \[...\]), utiliser le HTML brut
            if (/\\\(|\\\[|\\dfrac|\\mathbb/.test(enonceHTML)) {
                enonce = enonceHTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }
        }

        // Extraire la correction depuis le QCM (label.correct)
        let correction = null;
        const correctLabel = div.querySelector('label.correct');
        if (correctLabel) {
            correction = correctLabel.textContent.trim();
        }

        // Extraire le statut (correct/incorrect) depuis exercise_free_correct ou exercise_answer
        let resultStatus = null;
        const freeCorrect = div.querySelector('.exercise_free_correct');
        const answerDiv = div.querySelector('.exercise_answer');
        if (freeCorrect && freeCorrect.querySelector('.incorrect')) resultStatus = 'incorrect';
        else if (answerDiv && answerDiv.querySelector('.incorrect')) resultStatus = 'incorrect';
        else if (freeCorrect && freeCorrect.querySelector('.correct')) resultStatus = 'correct';
        else if (answerDiv && answerDiv.querySelector('.correct')) resultStatus = 'correct';

        return {
            id: exerciseId,
            templateId,
            shownId,
            enonce,
            correction,
            resultStatus
        };
    }

    // ===========================================
    // PREFETCH SYSTEM — Prépare les exercices à l'avance
    // ===========================================

    /**
     * Prépare tous les exercices non-répondus du devoir en arrière-plan.
     * Appelée au premier allumage du mode péda/triche sur un devoir.
     */
    async function prefetchAllHomework() {
        // Vérifier les prérequis
        if (!config.apiKey) {
            LOG.debug('Prefetch: pas de clé API, abandon');
            return;
        }
        const sidebarExercises = parseSidebarExercises();
        if (sidebarExercises.length === 0) {
            LOG.debug('Prefetch: pas de sidebar, abandon');
            return;
        }
        const baseUrl = detectHomeworkBaseUrl();
        if (!baseUrl) {
            LOG.debug('Prefetch: pas d\'URL de devoir détectée, abandon');
            return;
        }

        // Filtrer : garder uniquement les exercices non-répondus (Kwyk saute les répondus)
        const MAX_PREFETCH = 10; // Cap pour éviter les 429 sur les gros devoirs
        const toFetchAll = sidebarExercises.filter(e => e.status === 'unanswered');
        if (toFetchAll.length === 0) {
            LOG.debug('Prefetch: tous les exercices sont déjà répondus');
            return;
        }
        const toFetch = toFetchAll.slice(0, MAX_PREFETCH);
        if (toFetchAll.length > MAX_PREFETCH) {
            LOG.debug(`Prefetch: ${toFetchAll.length} exercices non-répondus, limité à ${MAX_PREFETCH}`);
        }

        // Éviter les lancements multiples
        if (prefetchInProgress) {
            LOG.debug('Prefetch: déjà en cours, abandon');
            return;
        }
        prefetchInProgress = true;
        prefetchAbortController = new AbortController();

        LOG.info(`Prefetch: lancement pour ${toFetch.length} exercices non-répondus`);

        try {
            // Phase 1 : Fetch batch AJAX (par lots de 4)
            const fetchedExercises = [];
            for (let i = 0; i < toFetch.length; i += 4) {
                if (prefetchAbortController.signal.aborted) break;
                const batch = toFetch.slice(i, i + 4);
                const results = await Promise.all(
                    batch.map(e => fetchExerciseData(baseUrl, e.id).catch(err => {
                        LOG.warn(`Prefetch: échec fetch exercice ${e.id}:`, err.message);
                        return null;
                    }))
                );
                results.forEach((data, j) => {
                    if (data) fetchedExercises.push({ ...data, sidebarId: batch[j].id });
                });
            }

            LOG.debug(`Prefetch: ${fetchedExercises.length}/${toFetch.length} exercices récupérés`);

            // Phase 2 : Pour chaque exercice, analyser + appeler IA (séquentiel + délai pour éviter 429)
            const PREFETCH_DELAY_MS = 350; // ~3 req/s — sous le rate limit Mistral
            for (let i = 0; i < fetchedExercises.length; i++) {
                if (prefetchAbortController.signal.aborted) break;
                await prefetchSolveExercise(fetchedExercises[i]);
                if (i < fetchedExercises.length - 1) {
                    await new Promise(r => setTimeout(r, PREFETCH_DELAY_MS));
                }
            }

            LOG.info(`Prefetch: terminé. ${Object.keys(prefetchCache).length} exercices en cache`);
        } catch (err) {
            LOG.error('Prefetch: erreur globale:', err.message);
        } finally {
            prefetchInProgress = false;
            prefetchAbortController = null;
        }
    }

    /**
     * Analyse un exercice fetchè et appelle l'IA pour le résoudre.
     * Stocke le résultat dans prefetchCache[exerciseId].
     */
    async function prefetchSolveExercise(exData) {
        const exerciseId = exData.sidebarId || exData.id;

        // Déjà en cache ?
        if (prefetchCache[exerciseId]) {
            LOG.debug(`Prefetch: exercice ${exerciseId} déjà en cache, skip`);
            return;
        }

        try {
            // Créer un conteneur temporaire caché avec le HTML brut de l'exercice
            const tempDiv = document.createElement('div');
            tempDiv.style.display = 'none';
            tempDiv.innerHTML = exData._rawHtml || exData.enonce || '';

            // Ajouter temporairement au DOM pour que les sélecteurs fonctionnent
            document.body.appendChild(tempDiv);

            // Analyser les blocs exercise_question
            const blocks = tempDiv.querySelectorAll('.exercise_question');
            const questions = [];
            let figureContext = '';

            // Détecter layout "figure + panels" (exercise_right_panel avec input[data-kwyk="multifrench"])
            const multifrenchPanels = [...tempDiv.querySelectorAll('.exercise_right_panel')]
                .filter(p => p.querySelector('input[data-kwyk="multifrench"]'));

            if (multifrenchPanels.length > 0) {
                // Extraire figureContext depuis le premier .exercise_question (contient la figure géométrique)
                if (blocks.length > 0) {
                    const figQ = analyzeQuestionBlock(blocks[0], -1);
                    figureContext = figQ?.context || '';
                }
                // Construire les vraies questions depuis les panels (comme detectFigureExercise)
                multifrenchPanels.forEach((panel, index) => {
                    const clone = panel.cloneNode(true);
                    clone.querySelectorAll('.exercise_buttons, input, .exercise_answer, .exercise_free_correct').forEach(el => el.remove());
                    clone.querySelectorAll('mjx-container').forEach(container => {
                        const mathEl = container.querySelector('mjx-assistive-mml math');
                        if (mathEl) { const t = mathMLToText(mathEl); if (t) { container.replaceWith(document.createTextNode(t)); return; } }
                        const fallback = container.textContent.trim();
                        if (fallback) container.replaceWith(document.createTextNode(fallback));
                    });
                    const text = clone.textContent.replace(/\s+/g, ' ').trim();
                    const q = { index, type: 'input', questionType: 'input', label: text.substring(0, 200) || `Question ${index + 1}`, context: text, options: [], inputs: [] };
                    q.questionType = classifyQuestion(q);
                    q.answerFormat = classifyAnswerFormat(q);
                    q.promptType = detectPromptType(q);
                    questions.push(q);
                });
            } else {
                blocks.forEach((block, idx) => {
                    const q = analyzeQuestionBlock(block, idx);
                    if (q) questions.push(q);
                });
            }

            if (questions.length === 0) {
                document.body.removeChild(tempDiv);
                LOG.warn(`Prefetch: exercice ${exerciseId} — aucune question détectée`);
                return;
            }

            // Construire l'exercice comme detectExercise() le fait
            const exercise = {
                type: multifrenchPanels.length > 0 ? 'figure_fillin' : 'multi_question',
                questions: questions,
                texte: questions.map((q, i) => `Question ${i + 1}: ${q.label}\n${q.context || ''}`).join('\n\n'),
                exerciseId: exerciseId,
                figureContext: figureContext
            };
            exercise.exerciseType = classifyExercise(exercise.questions, blocks);

            // Retirer du DOM (après classifyExercise qui peut chercher des éléments)
            document.body.removeChild(tempDiv);

            // Construire le prompt
            let prompt = `Exercice de maths (type détecté: ${exercise.exerciseType}):\n\n`;
            if (exercise.figureContext) {
                prompt += `Figure géométrique de l'exercice:\n${exercise.figureContext}\n\n`;
            }
            exercise.questions.forEach((q, i) => {
                const promptType = q.promptType || detectPromptType(q);
                prompt += `Question ${i + 1} [type: ${promptType}]:\n`;
                prompt += `${q.context}\n`;
                if (q.type === 'qcm' && q.options.length > 0) {
                    prompt += `Options (QCM):\n`;
                    q.options.forEach(opt => prompt += `- ${opt.label}\n`);
                } else if (q.type === 'checkbox' && q.options.length > 0) {
                    prompt += `Options (plusieurs reponses possibles):\n`;
                    q.options.forEach(opt => prompt += `- ${opt.label}\n`);
                } else if (q.type === 'input') {
                    prompt += `Reponse a saisir\n`;
                }
                prompt += `\n`;
            });

            // Déterminer le type de prompt
            const promptType = questions.length > 0 ? (questions[0].promptType || detectPromptType(questions[0])) : exercise.exerciseType;
            const systemPrompt = getSystemPrompt(promptType, questions[0]?.answerFormat || 'input');

            // Tentative de résolution directe (sans IA) — swap temporaire de currentExercise
            // try/finally : garantie restore même si tryDirectSolve throw
            const savedExercise = currentExercise;
            let directSolution;
            try {
                currentExercise = exercise;
                directSolution = tryDirectSolve();
            } finally {
                currentExercise = savedExercise;
            }
            if (directSolution) {
                prefetchCache[exerciseId] = {
                    solution: directSolution,
                    exerciseType: exercise.exerciseType,
                    questions: questions,
                    exercise: exercise
                };
                LOG.debug(`Prefetch: résolution directe (sans IA) pour exercice ${exerciseId}`);
                return;
            }

            // Appel IA
            LOG.debug(`Prefetch: appel IA pour exercice ${exerciseId} (type: ${promptType})`);
            const response = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.mistralApiKey}`
                },
                signal: prefetchAbortController?.signal,
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 2000
                })
            });

            if (!response.ok) {
                LOG.warn(`Prefetch: erreur API pour ${exerciseId}: ${response.status}`);
                return;
            }

            const aiData = await response.json();
            const content = aiData.choices[0]?.message?.content;
            if (!content) {
                LOG.warn(`Prefetch: réponse vide pour ${exerciseId}`);
                return;
            }

            const result = parseAIResponse(content);
            if (result.error) {
                LOG.warn(`Prefetch: parse échoué pour ${exerciseId}:`, result.error);
                return;
            }

            // Stocker en cache
            prefetchCache[exerciseId] = {
                solution: result.solution,
                exerciseType: exercise.exerciseType,
                questions: questions,
                exercise: exercise
            };
            LOG.debug(`Prefetch: exercice ${exerciseId} ✓ en cache`);

        } catch (err) {
            if (err.name === 'AbortError') return;
            LOG.debug(`Prefetch: erreur pour ${exerciseId}:`, err.message);
        }
    }

    /**
     * Vérifie si l'exercice courant est dans le prefetch cache.
     * Retourne la solution cachée ou null.
     */
    function getPrefetchedSolution(exerciseId) {
        const cached = prefetchCache[exerciseId] || prefetchCache[String(exerciseId)];
        if (cached) {
            LOG.debug(`Prefetch cache HIT pour exercice ${exerciseId}`);
            return cached;
        }
        return null;
    }

    /**
     * Annule le prefetch en cours (changement de mode, changement de devoir)
     */
    /**
     * Analyse tout le devoir : fetch batch + extraction corrections + IA pour la pédagogie
     */
    async function analyzeFullHomework() {
        const statusEl = document.getElementById('kwyk-revision-status');
        const analyzeBtn = document.getElementById('kwyk-revision-analyze');

        // Détecter l'URL de base
        const baseUrl = detectHomeworkBaseUrl();
        if (!baseUrl) {
            if (statusEl) statusEl.textContent = 'Erreur : impossible de détecter l\'URL du devoir.';
            LOG.error('Révision: URL du devoir non détectée');
            return;
        }

        // Parser la sidebar
        const sidebarExercises = parseSidebarExercises();
        if (sidebarExercises.length === 0) {
            if (statusEl) statusEl.textContent = 'Aucun exercice trouvé dans la sidebar.';
            return;
        }

        if (analyzeBtn) analyzeBtn.disabled = true;
        if (statusEl) statusEl.innerHTML = '<span class="kwyk-spinner"></span> Récupération des exercices (0/' + sidebarExercises.length + ')...';

        LOG.debug('Révision: fetch batch de', sidebarExercises.length, 'exercices depuis', baseUrl);

        try {
            // Phase 1 : Fetch tous les exercices en parallèle (par lots de 4)
            const exerciseDataList = [];
            const batchSize = 4;
            for (let i = 0; i < sidebarExercises.length; i += batchSize) {
                const batch = sidebarExercises.slice(i, i + batchSize);
                const results = await Promise.all(
                    batch.map(ex => fetchExerciseData(baseUrl, ex.id).catch(err => {
                        LOG.warn('Révision: erreur fetch exercice', ex.id, err);
                        return null;
                    }))
                );
                results.forEach((data, j) => {
                    if (data) {
                        data.sidebarStatus = batch[j].status;
                        data.sidebarName = batch[j].name;
                        exerciseDataList.push(data);
                    }
                });
                if (statusEl) statusEl.innerHTML = '<span class="kwyk-spinner"></span> Récupération des exercices (' + exerciseDataList.length + '/' + sidebarExercises.length + ')...';
            }

            LOG.debug('Révision:', exerciseDataList.length, 'exercices récupérés');

            // Compter ceux avec/sans correction
            const withCorrection = exerciseDataList.filter(e => e.correction);
            const withoutCorrection = exerciseDataList.filter(e => !e.correction);
            LOG.debug('Révision:', withCorrection.length, 'avec correction,', withoutCorrection.length, 'sans correction');

            // Phase 2 : Construire revisionData
            revisionData = exerciseDataList.map(ex => ({
                id: ex.id,
                enonce: cleanEnonceForRevision(ex.enonce),
                correction: ex.correction || null,
                correct: ex.resultStatus ? ex.resultStatus : (ex.sidebarStatus === 'correct' ? 'correct' : ex.sidebarStatus === 'incorrect' ? 'incorrect' : null),
                shownId: ex.shownId,
                sidebarName: ex.sidebarName,
                // Champs remplis par l'IA plus tard
                regle: '',
                etapes: [],
                reponses: [],
                typeExercice: 'autre',
                timestamp: Date.now()
            }));

            // Phase 3 : Appel IA pour la synthèse et les explications pédagogiques
            if (statusEl) statusEl.innerHTML = '<span class="kwyk-spinner"></span> Analyse IA en cours...';

            const exerciseSummaries = revisionData.map((e, i) => {
                const resultTag = e.correct === 'correct' ? ' [RÉUSSI]' : e.correct === 'incorrect' ? ' [RATÉ]' : '';
                const reponse = e.correction ? `Réponse correcte: ${e.correction}` : 'Réponse non disponible';
                return `[index=${i}]${resultTag}: ${e.enonce.substring(0, 300)}\n${reponse}`;
            }).join('\n---\n');

            const synthesisPrompt = `Tu es un professeur de maths niveau Seconde. Voici les exercices d'un devoir Kwyk.

EXERCICES:
${exerciseSummaries}

JSON attendu:
{
  "resume": "",
  "formules": [
    {"nom": "Produit nul", "latex": "A \\\\times B = 0 \\\\Leftrightarrow A = 0 \\\\text{ ou } B = 0"},
    {"nom": "Identité remarquable", "latex": "(a+b)^2 = a^2 + 2ab + b^2"}
  ],
  "notions": [
    {
      "titre": "Résolution d'équations produit nul",
      "propriete": "Si un produit de facteurs est nul, alors au moins un des facteurs est nul. Pour résoudre A × B = 0, on résout A = 0 ou B = 0 séparément.",
      "exemple": "Résoudre (2x - 4)(x + 3) = 0 : soit 2x - 4 = 0 donc x = 2, soit x + 3 = 0 donc x = -3",
      "formule": "A \\\\times B = 0 \\\\Leftrightarrow A = 0 \\\\text{ ou } B = 0",
      "point_important": "Pense à toujours factoriser l'équation AVANT d'appliquer la règle du produit nul. Cherche un facteur commun ou une identité remarquable.",
      "exercices_indices": [0, 2, 5]
    }
  ]
}

REGLES:
- "formules": liste des formules ESSENTIELLES du devoir. Max 6. Nom court + LaTeX KaTeX PURE (UNIQUEMENT l'équation/formule, JAMAIS de texte français dans le latex). Ce sont les formules que l'élève doit ABSOLUMENT connaître.
- Regroupe les exercices par MEME notion mathematique
- "propriete": la propriete/theoreme du COURS, 2-3 phrases max
- "exemple": un PETIT exemple concret de la methode avec des nombres simples (pas un exercice du devoir). 1-2 lignes max.
- "formule": formule cle en LaTeX KaTeX. Chaine vide "" si pas pertinent
- "point_important": une ASTUCE concrète et actionnable pour éviter le piège le plus courant. Commence par un verbe d'action (ex: "Pense à...", "Vérifie toujours...", "Attention à ne pas..."). 1-2 phrases max.
- Maximum 6 notions, minimum 1
- "exercices_indices" : utilise les indices des exercices (le nombre N dans [index=N]). Commence à 0.
- Regroupe les exercices de CONSTRUCTION/TRACÉ (tracer un vecteur, représenter, construire) dans une notion "Constructions géométriques".
- NIVEAU SECONDE UNIQUEMENT : JAMAIS de discriminant Delta, JAMAIS de formule quadratique. Utilise factorisation, produit nul, identités remarquables.
- Utilise les accents français normaux (é, è, ê, à, ù, etc.) dans le texte`;

            const aiResponse = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.mistralApiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        { role: 'system', content: 'Réponds UNIQUEMENT en JSON valide.' },
                        { role: 'user', content: synthesisPrompt }
                    ],
                    max_tokens: 2000,
                    temperature: 0.3
                })
            });

            let synthesis = { resume: '', notions: [] };
            if (aiResponse.ok) {
                const data = await aiResponse.json();
                const raw = data.choices?.[0]?.message?.content || '';
                LOG.debug('Révision: synthèse brute (200 premiers chars):', raw.substring(0, 200));
                LOG.debug('Révision: synthèse finish_reason:', data.choices?.[0]?.finish_reason);
                const parsed = sanitizeAIJson(raw);
                if (parsed) {
                    synthesis = parsed;
                    LOG.debug('Révision: synthèse parsée,', (synthesis.notions || []).length, 'notions');
                } else {
                    LOG.warn('Révision: échec parsing synthèse IA, brut complet:', raw);
                }
            }

            // Phase 3b : Appel IA pour les explications détaillées par exercice
            if (statusEl) statusEl.innerHTML = '<span class="kwyk-spinner"></span> Génération des explications détaillées...';

            const exerciseDetails = revisionData.map((e, i) => {
                const reponse = e.correction
                    || (e.reponses && e.reponses.length > 0 ? e.reponses.map(r => r.reponse || r).join('; ') : null)
                    || 'Non disponible';
                return `[Exercice ${i}] Enonce: ${e.enonce.substring(0, 400)}\nReponse: ${reponse}`;
            }).join('\n---\n');

            const explanationPrompt = `Professeur de maths SECONDE. Pour CHAQUE exercice, explique la resolution.

NIVEAU SECONDE OBLIGATOIRE:
- JAMAIS de discriminant Delta ni formule quadratique (c'est Premiere/Terminale)
- Equations 2nd degre : FACTORISATION uniquement (identites remarquables, facteur commun, produit nul)
- La "Reponse" est LA bonne reponse, utilise-la dans ta conclusion
- Pour les exercices sur les VECTEURS : explique la methode geometrique (egalite, colinearite, relation de Chasles, translation). Si la reponse est "Non disponible", explique la methode generale sans donner de valeur specifique.

FORMAT REPONSE FINALE (derniere etape):
- Si l'enonce dit "ensemble des solutions" ou "determiner l'ensemble" : S = {valeur} ou S = {v1 ; v2}
- Si l'enonce dit "resoudre" sans precision : ecrire juste x = valeur ou x = v1 ou x = v2
- Toujours separer les solutions par " ; " (point-virgule) dans les ensembles
- Fractions : (a)/(b). Exemple : S = {(2)/(3) ; -(5)/(8)}

EXERCICES:
${exerciseDetails}

JSON:
{"explanations": [
  {"index": 0, "type_exercice": "identite_remarquable",
   "regle": "(a-b)^2 = a^2 - 2ab + b^2. Si (a-b)^2 = 0 alors a = b.",
   "etapes": [
     {"titre": "On reconnait l'identite remarquable", "calculs": ["(9x)^2 - 2 * 9x * 6 + 6^2 = (9x - 6)^2"]},
     {"titre": "On applique : carre nul", "calculs": ["(9x - 6)^2 = 0", "9x - 6 = 0"]},
     {"titre": "On isole x", "calculs": ["9x = 6", "x = (6)/(9) = (2)/(3)"]},
     {"titre": "Reponse", "calculs": ["S = {(2)/(3)}"]}
  ]}
]}

REGLES STRICTES:
- "calculs" : UNIQUEMENT des expressions mathématiques pures. ZERO mot français. Chaque élément = 1 SEULE ligne de calcul.
  INTERDIT dans calculs : "Donc", "On a", "Car", "Soit", "Or", "D'où"
  BON : ["9x = 6", "x = (2)/(3)"]  ← 2 éléments séparés
  MAUVAIS : ["9x = 6 donc x = (2)/(3)"]  ← tout collé sur 1 élément
  MAUVAIS : ["(2x-2)(-2x+9) = -4x^2+18x+4x-18 = -4x^2+22x-18"]  ← TROP LONG, découper !
  BON : ["(2x-2)(-2x+9)", "-4x^2 + 18x + 4x - 18", "-4x^2 + 22x - 18"]  ← 1 calcul par ligne
- "titre" : phrase courte en français, explique POURQUOI (max 60 car)
- "regle" : propriété de cours, 1 phrase (max 120 car)
- 2 à 5 étapes par exercice
- (a)/(b) pour fractions, ^ pour puissances
- Utilise les accents français normaux (é, è, ê, à, ù, etc.)
- NIVEAU SECONDE : JAMAIS de discriminant Delta ni formule quadratique`;

            const explResponse = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.mistralApiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        { role: 'system', content: 'Réponds UNIQUEMENT en JSON valide.' },
                        { role: 'user', content: explanationPrompt }
                    ],
                    max_tokens: 16000,
                    temperature: 0.3
                })
            });

            if (explResponse.ok) {
                const explData = await explResponse.json();
                const explRaw = explData.choices?.[0]?.message?.content || '';
                const finishReason = explData.choices?.[0]?.finish_reason || '';
                LOG.debug('Révision: finish_reason explications:', finishReason);
                LOG.debug('Révision: explications brutes (200 premiers chars):', explRaw.substring(0, 200));
                const explResult = sanitizeAIJson(explRaw);
                if (explResult) {
                    LOG.debug('Révision: clés parsées:', Object.keys(explResult));
                    // L'IA peut retourner les explications sous différentes clés
                    const explanations = explResult.explanations || explResult.explications || explResult.exercises || explResult.exercices ||
                        (Array.isArray(explResult) ? explResult : []);
                    explanations.forEach(expl => {
                        const idx = expl.index;
                        if (idx >= 0 && idx < revisionData.length) {
                            revisionData[idx].regle = expl.regle || '';
                            revisionData[idx].etapes = expl.etapes || [];
                            revisionData[idx].typeExercice = expl.type_exercice || 'autre';
                        }
                    });
                    LOG.debug('Révision:', explanations.length, 'explications générées sur', revisionData.length, 'exercices');
                } else {
                    LOG.error('Révision: échec parsing explications IA, réponse brute:', explRaw.substring(0, 300));
                }
            } else {
                LOG.error('Révision: erreur API explications, status:', explResponse.status);
            }

            // Phase 4 : Générer et ouvrir la fiche HTML
            const html = buildRevisionHTML(synthesis, revisionData);
            const blob = new Blob([html], { type: 'text/html' });
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, '_blank');

            if (statusEl) statusEl.textContent = `Fiche générée ! (${withCorrection.length} corrections Kwyk + ${withoutCorrection.length} via IA)`;
            if (analyzeBtn) analyzeBtn.disabled = false;

            LOG.debug('Révision: fiche générée avec succès');

        } catch (e) {
            LOG.error('Révision: erreur analyse', e);
            if (statusEl) statusEl.textContent = 'Erreur lors de l\'analyse.';
            if (analyzeBtn) analyzeBtn.disabled = false;
        }
    }

    /**
     * Nettoie un JSON brut retourné par l'IA : supprime les caractères de contrôle,
     * et tente de récupérer un JSON tronqué en fermant les structures ouvertes.
     */
    function sanitizeAIJson(raw) {
        // Extraire le bloc JSON
        const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*)/);
        if (!jsonMatch) return null;
        let json = jsonMatch[1].trim();

        // Nettoyage agressif caractère par caractère :
        // 1. Caractères de contrôle dans les strings → échappés
        // 2. Backslashes LaTeX invalides en JSON (\q, \D, \f etc.) → doublés
        const validJsonEscapes = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
        let cleaned = '';
        let inStr = false, esc = false;
        for (let i = 0; i < json.length; i++) {
            const ch = json[i];
            const code = json.charCodeAt(i);
            if (esc) {
                // On vient de voir un \ dans une string
                // Cas spécial : \n, \t, \b, \f, \r suivis d'une lettre = LaTeX (\neq, \times, \text, \binom, \frac, \rho)
                // En JSON pur, \n \t etc. ne sont JAMAIS suivis d'une lettre
                const isJsonEscape = validJsonEscapes.has(ch);
                const nextCh = i + 1 < json.length ? json[i + 1] : '';
                const isLatexCmd = isJsonEscape && /[a-zA-Z]/.test(ch) && /[a-zA-Z]/.test(nextCh);
                if (!isJsonEscape || isLatexCmd) {
                    // Échappement invalide OU LaTeX cmd commençant par lettre d'échappement JSON
                    // → doubler le backslash pour que JSON parse correctement
                    cleaned += '\\' + ch;
                } else {
                    cleaned += ch;
                }
                esc = false;
                continue;
            }
            if (ch === '\\' && inStr) {
                esc = true;
                cleaned += ch;
                continue;
            }
            if (ch === '"') {
                inStr = !inStr;
                cleaned += ch;
                continue;
            }
            if (inStr && code < 0x20) {
                if (code === 0x0A) cleaned += '\\n';
                else if (code === 0x0D) cleaned += '\\r';
                else if (code === 0x09) cleaned += '\\t';
                else cleaned += ' ';
                continue;
            }
            cleaned += ch;
        }
        json = cleaned;

        // Supprimer les trailing commas (erreur IA courante)
        json = json.replace(/,\s*([\]}])/g, '$1');

        // Essai direct
        try { return JSON.parse(json); } catch (e) {
            LOG.debug('sanitizeAIJson: essai direct échoué:', e.message);
        }

        // JSON probablement tronqué — essayer plusieurs points de coupure
        // Stratégie : couper au dernier }, puis à l'avant-dernier, etc.
        let searchFrom = json.length;
        for (let tries = 0; tries < 10; tries++) {
            const lastBrace = json.lastIndexOf('}', searchFrom - 1);
            if (lastBrace <= 0) break;
            searchFrom = lastBrace;

            let attempt = json.substring(0, lastBrace + 1);
            let braces = 0, brackets = 0;
            let inS = false, es = false;
            for (const c of attempt) {
                if (es) { es = false; continue; }
                if (c === '\\' && inS) { es = true; continue; }
                if (c === '"') { inS = !inS; continue; }
                if (inS) continue;
                if (c === '{') braces++;
                else if (c === '}') braces--;
                else if (c === '[') brackets++;
                else if (c === ']') brackets--;
            }
            // Si on est dans une string ouverte, fermer d'abord
            if (inS) attempt += '"';
            attempt += ']'.repeat(Math.max(0, brackets)) + '}'.repeat(Math.max(0, braces));
            // Nettoyer trailing comma avant fermeture
            attempt = attempt.replace(/,\s*([\]}])/g, '$1');
            try {
                const result = JSON.parse(attempt);
                LOG.debug(`sanitizeAIJson: récupéré JSON tronqué (coupé à position ${lastBrace})`);
                return result;
            } catch (e2) { /* essayer le } précédent */ }
        }
        LOG.warn('sanitizeAIJson: impossible de parser le JSON');
        return null;
    }

    /**
     * Formate un énoncé mixte texte+maths pour la fiche de révision.
     * Détecte les tokens mathématiques et les entoure de $...$ pour KaTeX.
     */
    // Supprime tous les blocs JSON commençant par {"clé" dans un texte (bracket-counting).
    function stripJsonBlobs(text, ...keys) {
        for (const key of keys) {
            const marker = '{"' + key + '"';
            let idx = text.indexOf(marker);
            while (idx >= 0) {
                let depth = 0, i = idx;
                for (; i < text.length; i++) {
                    const c = text[i];
                    if (c === '{' || c === '[') depth++;
                    else if (c === '}' || c === ']') { depth--; if (depth === 0) break; }
                }
                text = text.slice(0, idx) + text.slice(i + 1);
                idx = text.indexOf(marker);
            }
        }
        return text;
    }

    function cleanEnonceForRevision(text) {
        if (!text) return '';
        // Supprimer les blocs JSON de graphes (toutes variantes Kwyk) via bracket-counting
        text = stripJsonBlobs(text, 'init', 'graphInit');
        // Supprimer les instructions de format ("On donnera...", "On écrira...", "S'il n'y pas...")
        text = text.replace(/\n?\s*On donnera[^\n]*/gi, '');
        text = text.replace(/\n?\s*On écrira[^\n]*/gi, '');
        text = text.replace(/\n?\s*S'il n'y\s*a?\s*pas[^\n]*/gi, '');
        text = text.replace(/\n?\s*On arrondira[^\n]*/gi, '');
        text = text.replace(/\n?\s*On mettra[^\n]*/gi, '');
        text = text.replace(/\n?\s*Donner (la|le|les)[^\n]*sous la forme[^\n]*/gi, '');
        // Supprimer les marqueurs internes injectés par l'extraction
        text = text.replace(/\[Graphique[^\]]*\]/g, '');
        text = text.replace(/\[Vecteur\s+[^\]]+\]/g, '');
        text = text.replace(/\[Figure géométrique\s*:[^\]]*\]/g, '');
        // Nettoyer les sauts de ligne multiples
        text = text.replace(/\n{3,}/g, '\n\n').trim();
        return text;
    }

    function formatEnonceForRevision(text) {
        if (!text) return '';
        text = cleanEnonceForRevision(text);

        let result;
        // Si l'énoncé contient du LaTeX formaté, wrapper les tokens LaTeX en $...$
        // pour que KaTeX auto-render les traite correctement
        if (/\\\(|\\\[|\\dfrac|\\mathbb|\\left|\\right|\\frac|\\sqrt|\\overrightarrow|\\vec/.test(text)) {
            // Remplacer \(...\) et \[...\] par $...$
            result = text
                .replace(/\\\[([^]*?)\\\]/g, (_, m) => `$$${m.trim()}$$`)
                .replace(/\\\(([^]*?)\\\)/g, (_, m) => `$${m.trim()}$`);
            // Wrapper les tokens LaTeX nus (sans délimiteurs) en $...$
            // en utilisant des placeholders pour éviter de double-wrapper
            const mathTokens = [];
            result = result.replace(
                /\\(?:overrightarrow|vec|frac|dfrac|sqrt|mathbb|left|right|times|cdot|neq|leq|geq|Rightarrow|Leftrightarrow|infty|text)\{[^}]*\}(?:\{[^}]*\})?|\\(?:times|cdot|neq|leq|geq|Rightarrow|Leftrightarrow|infty)/g,
                match => {
                    // Ne pas re-wrapper si déjà dans $...$
                    mathTokens.push(match);
                    return `\x00${mathTokens.length - 1}\x00`;
                }
            );
            result = escapeHtmlStatic(result);
            result = result.replace(/\x00(\d+)\x00/g, (_, i) => `$${mathTokens[parseInt(i)]}$`);
            result = result.replace(/\$\$([^$]+)\$\$/g, (_, m) => `$$${m}$$`);
            result = result.replace(/\n/g, '<br>');
        } else {
            // Sinon, détecter les tokens math bruts (25x^2-49=0) et les entourer de $...$
            result = text.replace(/\n/g, '<br>').split(/(\s+)/).map(token => {
                // Token math : contient une variable (x,y,z) + chiffre/^ + opérateur, min 3 chars
                if (/[xyz]/i.test(token) && /[\d^(]/.test(token) && token.length >= 3) {
                    const m = token.match(/^(.+?)([.,;:!?]*)$/);
                    if (m) {
                        let math = m[1];
                        math = math.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
                        return `$${math}$${escapeHtmlStatic(m[2])}`;
                    }
                }
                return escapeHtmlStatic(token);
            }).join('');
        }
        // Convertir **bold** markdown en <strong>
        return result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }

    /**
     * Formate une expression mathématique (étape, réponse) pour KaTeX.
     * Gère le contenu mixte français+maths : sépare le texte des expressions math.
     */
    function formatMathForRevision(text) {
        if (!text) return '';
        // Supprimer les délimiteurs math externes \(...\), \[...\], $...$
        let t = text.trim()
            .replace(/^\\\(/, '').replace(/\\\)$/, '')
            .replace(/^\\\[/, '').replace(/\\\]$/, '')
            .replace(/^\$+/, '').replace(/\$+$/, '')
            .trim();

        // Si c'est déjà du LaTeX formaté (\frac, \neq, etc.), tout wrapper en $...$
        if (/\\(frac|dfrac|sqrt|mathbb|neq|geq|leq|times|text|left|right|Rightarrow|Leftrightarrow|infty|setminus|emptyset|quad|cdot|overrightarrow|vec)/.test(t)) {
            return `$${t}$`;
        }

        // Détecter si c'est du pur math (pas de mots français de 3+ lettres consécutives)
        const hasFrenchWords = /[a-zA-ZÀ-ÿ]{3,}/.test(t.replace(/sqrt|frac|mathbb|setminus|left|right|infty|times|text|geq|leq|neq|Rightarrow|Leftrightarrow|quad|cdot|emptyset/gi, ''));
        const hasMath = /[xyz=+\-*/^]/.test(t) && /\d/.test(t);

        if (!hasFrenchWords && (hasMath || /\([^)]+\)\/\([^)]+\)/.test(t) || /^[\d;,\s+\-.()\/^{}=*×÷S]+$/.test(t))) {
            // Pur math — tout en $...$
            let latex = t;
            latex = latex.replace(/([A-Z]{1,2}|[a-z])\u2192/g, '\\overrightarrow{$1}');
            latex = latex.replace(/\u2192/g, ' \\rightarrow ');
            latex = latex.replace(/\*\*/g, '^');
            latex = latex.replace(/\*/g, ' \\times ');
            latex = latex.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
            return `$${latex}$`;
        }

        if (hasFrenchWords && hasMath) {
            // Mixte — strip le préfixe français, afficher le math
            // Ex: "Donc 81x^2 - 108x + 36 = (9x - 6)^2"
            const match = t.match(/^([a-zA-ZÀ-ÿ',\s]+?)(\d.+|[xyz].+|\(.+|S\s*=.+)$/i);
            if (match) {
                const frPart = match[1].trim();
                let mathPart = match[2].trim();
                mathPart = mathPart.replace(/→/g, ' \\rightarrow ');
                mathPart = mathPart.replace(/\*\*/g, '^');
                mathPart = mathPart.replace(/\*/g, ' \\times ');
                mathPart = mathPart.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
                return `${escapeHtmlStatic(frPart)} $${mathPart}$`;
            }
        }

        // Fallback : texte brut
        return escapeHtmlStatic(t);
    }

    /**
     * Formate les étapes pour le HTML de révision.
     * Gère les strings simples ET les objets {titre, calculs[]}.
     * Filtre les séparateurs "---".
     */
    function formatRevisionEtapes(etapes) {
        if (!etapes || etapes.length === 0) return '';
        const blocks = [];
        let stepNum = 0;
        for (const e of etapes) {
            if (typeof e === 'string') {
                if (e.trim() === '---') continue;
                stepNum++;
                blocks.push(`<div class="revision-step">
                    <div class="revision-step-num">${stepNum}</div>
                    <div class="revision-step-content">${formatMathForRevision(e)}</div>
                </div>`);
            } else if (e && typeof e === 'object') {
                stepNum++;
                let calculsHTML = '';
                if (Array.isArray(e.calculs)) {
                    calculsHTML = e.calculs
                        .filter(c => typeof c !== 'string' || c.trim() !== '---')
                        .map(c => `<div class="revision-step-calc">${formatMathForRevision(String(c))}</div>`)
                        .join('');
                }
                blocks.push(`<div class="revision-step">
                    <div class="revision-step-num">${stepNum}</div>
                    <div class="revision-step-content">
                        ${e.titre ? `<div class="revision-step-titre">${formatEnonceForRevision(e.titre)}</div>` : ''}
                        ${calculsHTML ? `<div class="revision-step-calculs">${calculsHTML}</div>` : ''}
                    </div>
                </div>`);
            }
        }
        return blocks.length > 0 ? `<div class="revision-etapes-container">${blocks.join('')}</div>` : '';
    }

    /**
     * Construit le HTML d'un exercice (exemple) dans une carte notion
     */
    const TYPE_EXERCICE_LABELS = {
        equation_1er_degre: 'Équation 1er degré', equation_2nd_degre: 'Équation 2nd degré',
        inequation_1er_degre: 'Inéquation 1er degré', inequation_2nd_degre: 'Inéquation 2nd degré',
        inequation_produit_quotient: 'Inéquation produit/quotient', systeme_equations: 'Système d\'équations',
        factorisation: 'Factorisation', developpement: 'Développement',
        identite_remarquable: 'Identité remarquable', calcul_litteral: 'Calcul littéral',
        fonction_affine: 'Fonction affine', fonction_carree: 'Fonction carrée',
        fonction_inverse: 'Fonction inverse', fonction_reference: 'Fonction de référence',
        lecture_graphique: 'Lecture graphique', tableau_signes: 'Tableau de signes',
        tableau_variations: 'Tableau de variations', intervalle_ensemble: 'Intervalles / Ensembles',
        calcul_numerique: 'Calcul numérique', fraction: 'Fractions',
        puissance_racine: 'Puissances / Racines', proportionnalite: 'Proportionnalité',
        pourcentage: 'Pourcentages', probabilite: 'Probabilités',
        statistiques: 'Statistiques', geometrie: 'Géométrie',
        vecteurs: 'Vecteurs', reperage: 'Repérage', autre: 'Autre'
    };

    function buildRevisionExerciseHTML(ex, index) {
        // Utiliser la correction Kwyk si disponible, sinon les réponses IA
        const reponse = ex.correction || (ex.reponses || []).map(r => r.reponse).join(', ') || '';
        const etapesHTML = formatRevisionEtapes(ex.etapes);
        const correctBadge = ex.correct === 'correct' ? ' <span class="revision-result-badge correct">Réussi</span>'
            : ex.correct === 'incorrect' ? ' <span class="revision-result-badge incorrect">Raté</span>' : '';
        const topicLabel = TYPE_EXERCICE_LABELS[ex.typeExercice] || ex.typeExercice || '';
        const topicBadge = topicLabel ? `<span class="revision-topic-badge">${escapeHtmlStatic(topicLabel)}</span>` : '';
        const regleHTML = ex.regle ? `<div class="revision-exercise-regle"><strong>Propriété :</strong> ${formatEnonceForRevision(ex.regle)}</div>` : '';
        const exLabel = ex.shownId ? `Exo ${escapeHtmlStatic(ex.shownId)}` : `Exemple ${index + 1}`;
        const sourceTag = ex.correction ? '<span class="revision-source-badge kwyk">Kwyk</span>' : '';

        return `
            <div class="revision-exemple" id="exercise-${index}">
                <div class="revision-exemple-header">
                    <span class="revision-exemple-label">${exLabel}</span>${topicBadge}${correctBadge}${sourceTag}
                </div>
                ${regleHTML}
                <div class="revision-exercise-enonce">${formatEnonceForRevision(ex.enonce)}</div>
                <button class="revision-reveal-btn" id="reveal-btn-${index}" onclick="toggleReveal(${index})">Voir la solution</button>
                <div class="revision-solution" id="solution-${index}" style="display:none;">
                    ${etapesHTML}
                    <div class="revision-self-eval" id="eval-${index}">
                        <button class="revision-eval-btn compris" onclick="markExercise(${index}, 'compris')">Compris</button>
                        <button class="revision-eval-btn a-revoir" onclick="markExercise(${index}, 'a_revoir')">À revoir</button>
                    </div>
                </div>
                <div class="revision-marked" id="marked-${index}" style="display:none;"></div>
            </div>`;
    }

    function buildRevisionHTML(synthesis, exercises) {
        const resume = synthesis.resume || '';
        const notions = synthesis.notions || [];
        const formules = synthesis.formules || [];

        // Exercices non couverts par une notion → section "Autres"
        // Dédupliquer : chaque exercice n'apparaît que dans la PREMIÈRE notion qui le réclame
        const usedIndices = new Set();

        let notionsHTML = '';
        notions.forEach((notion, ni) => {
            const rawIndices = notion.exercices_indices || [];
            const indices = rawIndices.filter(idx => !usedIndices.has(idx) && idx < exercises.length);
            indices.forEach(idx => usedIndices.add(idx));
            let exemplesHTML = '';
            indices.forEach(idx => {
                const ex = exercises[idx];
                if (!ex) return;
                exemplesHTML += buildRevisionExerciseHTML(ex, idx);
            });

            const propriete = notion.propriete || '';
            const exemple = notion.exemple || '';
            const formule = notion.formule || '';
            const pointImportant = notion.point_important || '';

            notionsHTML += `
                <div class="revision-notion-card">
                    <div class="revision-notion-header" onclick="toggleNotion(${ni})" style="cursor:pointer;">
                        <span class="revision-notion-chevron" id="chevron-notion-${ni}">▶</span>
                        <span class="revision-notion-label">Notion</span>
                        <span class="revision-notion-name">${escapeHtmlStatic(notion.titre)}</span>
                        <span class="revision-badge">${indices.length} ex.</span>
                    </div>
                    <div class="revision-notion-content" id="notion-content-${ni}" style="display:none;">
                        ${propriete ? `<div class="revision-propriete"><strong>Propriété :</strong> ${formatEnonceForRevision(propriete)}</div>` : ''}
                        ${exemple ? `<div class="revision-exemple-cours"><strong>Exemple :</strong> ${formatEnonceForRevision(exemple)}</div>` : ''}
                        ${formule ? `<div class="revision-formule">$$${formule}$$</div>` : ''}
                        <div class="revision-exemples">
                            ${exemplesHTML}
                        </div>
                        ${pointImportant ? `<div class="revision-point-important">
                            <div class="revision-tip-icon">💡</div>
                            <div class="revision-tip-content">
                                <strong>À retenir</strong>
                                <p>${formatEnonceForRevision(pointImportant)}</p>
                            </div>
                        </div>` : ''}
                    </div>
                </div>`;
        });

        // Exercices non classés
        let autresHTML = '';
        exercises.forEach((ex, idx) => {
            if (usedIndices.has(idx)) return;
            autresHTML += buildRevisionExerciseHTML(ex, idx);
        });
        const autresIndex = notions.length;
        if (autresHTML) {
            notionsHTML += `
                <div class="revision-notion-card">
                    <div class="revision-notion-header" onclick="toggleNotion(${autresIndex})" style="cursor:pointer;">
                        <span class="revision-notion-chevron" id="chevron-notion-${autresIndex}">▶</span>
                        <span class="revision-notion-name">Autres exercices</span>
                    </div>
                    <div class="revision-notion-content" id="notion-content-${autresIndex}" style="display:none;">
                        <div class="revision-exemples">${autresHTML}</div>
                    </div>
                </div>`;
        }

        const exercicesHTML = notionsHTML;

        // Carte Formulaire mémo
        let formulaireHTML = '';
        if (formules.length > 0) {
            const formulesItems = formules.map(f => `
                <div class="formulaire-item">
                    <div class="formulaire-nom">${escapeHtmlStatic(f.nom || '')}</div>
                    <div class="formulaire-latex">$$${f.latex || ''}$$</div>
                </div>`).join('');
            formulaireHTML = `
                <div class="formulaire-card">
                    <div class="formulaire-header">
                        <span class="formulaire-icon">📐</span>
                        <span class="formulaire-title">Récap</span>
                    </div>
                    <div class="formulaire-grid">
                        ${formulesItems}
                    </div>
                </div>`;
        }

        return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fiche de Révision — Kwyk Tutor</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"><\/script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"><\/script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: #f0f2f5;
            color: #1a1a2e;
            line-height: 1.6;
            padding: 40px 20px;
        }
        .container { max-width: 800px; margin: 0 auto; }
        .header {
            text-align: center;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 30px;
            border-radius: 16px;
            margin-bottom: 30px;
        }
        .header h1 { font-size: 24px; margin-bottom: 8px; }
        .header p { opacity: 0.9; font-size: 14px; }
        .revision-notion-card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 20px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        }
        .revision-notion-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f4ff;
            user-select: none;
        }
        .revision-notion-header:hover {
            background: #f8f9ff;
            border-radius: 8px;
            margin: -4px;
            padding: 4px 4px 10px 4px;
        }
        .revision-notion-chevron {
            font-size: 12px;
            color: #667eea;
            transition: transform 0.3s ease;
            flex-shrink: 0;
        }
        .revision-notion-chevron.open {
            transform: rotate(90deg);
        }
        .revision-notion-content {
            margin-top: 16px;
        }
        .revision-notion-label {
            background: #667eea;
            color: white;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            flex-shrink: 0;
        }
        .revision-notion-name {
            font-size: 16px;
            font-weight: 600;
            color: #1a1a2e;
            flex: 1;
        }
        .revision-badge {
            background: #e9ecef;
            color: #495057;
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 500;
            flex-shrink: 0;
        }
        .revision-propriete {
            background: #f0f4ff;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 14px;
            color: #495057;
            margin-bottom: 14px;
            border-left: 3px solid #667eea;
        }
        .revision-exemple-cours {
            background: #f0faf0;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 13px;
            color: #2e7d32;
            margin-bottom: 14px;
            border-left: 3px solid #4caf50;
            line-height: 1.6;
        }
        .revision-formule {
            background: linear-gradient(135deg, #e0f7ef 0%, #e3f2fd 100%);
            padding: 14px;
            border-radius: 8px;
            text-align: center;
            font-size: 15px;
            margin-bottom: 14px;
        }
        .revision-exemples {
            margin-bottom: 14px;
        }
        .revision-exemple {
            background: #fafafa;
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 10px;
            border: 1px solid #e9ecef;
            transition: border-color 0.3s;
        }
        .revision-exemple-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        .revision-exemple-label {
            font-size: 11px;
            font-weight: 700;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .revision-topic-badge {
            font-size: 10px;
            font-weight: 600;
            color: #00897b;
            background: #e0f2f1;
            padding: 2px 8px;
            border-radius: 10px;
        }
        .revision-point-important {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            background: linear-gradient(135deg, #fff8e1, #fff3e0);
            padding: 16px;
            border-radius: 12px;
            border: 1px solid #ffe0b2;
            margin-top: 12px;
        }
        .revision-tip-icon {
            font-size: 22px;
            flex-shrink: 0;
            margin-top: 2px;
        }
        .revision-tip-content strong {
            display: block;
            font-size: 13px;
            color: #e65100;
            margin-bottom: 4px;
        }
        .revision-tip-content p {
            font-size: 13px;
            color: #bf360c;
            margin: 0;
            line-height: 1.5;
        }
        .revision-exercise-regle {
            font-size: 13px;
            color: #5a6fd6;
            background: #f0f4ff;
            padding: 8px 12px;
            border-radius: 6px;
            margin-bottom: 10px;
            border-left: 3px solid #667eea;
        }
        .revision-exercise-enonce {
            font-size: 14px;
            color: #212529;
            margin-bottom: 8px;
            font-weight: 500;
            flex: 1;
        }
        .revision-result-badge {
            font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; white-space: nowrap;
        }
        .revision-result-badge.correct { background: #d4edda; color: #28a745; }
        .revision-result-badge.incorrect { background: #f8d7da; color: #dc3545; }
        .revision-source-badge { font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .revision-source-badge.kwyk { background: #e3f2fd; color: #1565c0; }
        .revision-etapes-container {
            margin-bottom: 12px;
        }
        .revision-step {
            display: flex;
            gap: 12px;
            margin-bottom: 10px;
            align-items: flex-start;
        }
        .revision-step-num {
            width: 24px;
            height: 24px;
            min-width: 24px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            margin-top: 2px;
        }
        .revision-step-content {
            flex: 1;
            font-size: 14px;
            color: #212529;
        }
        .revision-step-titre {
            font-weight: 600;
            color: #495057;
            margin-bottom: 4px;
            font-size: 13px;
        }
        .revision-step-calculs {
            background: #f8f9fa;
            border-radius: 6px;
            padding: 8px 12px;
            border-left: 3px solid #e9ecef;
        }
        .revision-step-calc {
            font-size: 14px;
            color: #212529;
            padding: 2px 0;
            font-family: 'Segoe UI', system-ui, sans-serif;
        }
        .revision-reveal-btn {
            background: #667eea; color: white; border: none; border-radius: 8px;
            padding: 8px 16px; cursor: pointer; font-size: 13px; margin: 8px 0;
            transition: background 0.2s;
        }
        .revision-reveal-btn:hover { background: #5a6fd6; }
        .revision-reveal-btn.revealed { background: #6c757d; }
        .revision-self-eval { display: flex; gap: 10px; margin-top: 12px; }
        .revision-eval-btn {
            padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer;
            font-size: 13px; font-weight: 600; transition: transform 0.1s;
        }
        .revision-eval-btn:hover { transform: scale(1.05); }
        .revision-eval-btn.compris { background: #d4edda; color: #28a745; }
        .revision-eval-btn.a-revoir { background: #f8d7da; color: #dc3545; }
        .revision-compris { color: #28a745; font-weight: 600; font-size: 14px; }
        .revision-a-revoir { color: #dc3545; font-weight: 600; font-size: 14px; }
        .revision-compris-border { border-left: 4px solid #28a745 !important; }
        .revision-a-revoir-border { border-left: 4px solid #dc3545 !important; }
        .revision-mark { font-weight: 600; font-size: 13px; padding: 4px 0; }
        .revision-mark.compris { color: #28a745; }
        .revision-mark.a-revoir { color: #dc3545; }
        .revision-progress-bar {
            background: white; border-radius: 12px; padding: 16px 24px;
            margin-bottom: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);
            text-align: center; font-size: 14px; color: #495057;
        }
        .revision-progress-bar .bar {
            height: 8px; background: #e9ecef; border-radius: 4px; margin-top: 10px; overflow: hidden;
            display: flex;
        }
        .revision-progress-bar .bar-compris { background: #28a745; transition: width 0.3s; }
        .revision-progress-bar .bar-revoir { background: #dc3545; transition: width 0.3s; }
        .export-toolbar {
            display: flex; gap: 10px; justify-content: center;
            margin-top: 24px; margin-bottom: 16px;
        }
        .export-btn {
            padding: 10px 20px; border: none; border-radius: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; font-size: 13px; font-weight: 600;
            cursor: pointer; transition: box-shadow 0.2s;
        }
        .export-btn:hover { box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }
        .formulaire-card {
            background: linear-gradient(135deg, #e8f5e9 0%, #e3f2fd 100%);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 20px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
            border: 2px solid #b2dfdb;
        }
        .formulaire-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 18px;
            padding-bottom: 10px;
            border-bottom: 2px solid rgba(0,0,0,0.08);
        }
        .formulaire-icon { font-size: 22px; }
        .formulaire-title {
            font-size: 18px;
            font-weight: 700;
            color: #1a1a2e;
        }
        .formulaire-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 12px;
        }
        .formulaire-item {
            background: white;
            border-radius: 10px;
            padding: 14px 18px;
            text-align: center;
            box-shadow: 0 1px 4px rgba(0,0,0,0.06);
            overflow: hidden;
        }
        .formulaire-nom {
            font-size: 12px;
            font-weight: 700;
            color: #667eea;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }
        .formulaire-latex {
            font-size: 16px;
            color: #1a1a2e;
            overflow-x: auto;
            overflow-y: hidden;
        }
        .formulaire-latex .katex-display {
            margin: 4px 0;
            overflow-x: auto;
            overflow-y: hidden;
            padding-bottom: 4px;
        }
        .footer {
            text-align: center;
            margin-top: 16px;
            font-size: 12px;
            color: #adb5bd;
        }
        @media print {
            body { background: white; padding: 10px; }
            .header { background: #667eea !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 16px; margin-bottom: 16px; }
            .revision-exemple, .revision-step, .formulaire-item { break-inside: avoid; }
            .revision-notion-card { break-inside: auto; }
            .revision-formule, .formulaire-card, .formulaire-item { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .revision-reveal-btn, .revision-self-eval, .revision-marked, .revision-progress-bar, .export-toolbar { display: none !important; }
            .revision-solution { display: block !important; }
            .revision-notion-content { display: block !important; }
            .revision-notion-chevron { display: none !important; }
            .revision-notion-header { border-bottom: 2px solid #667eea; margin-bottom: 12px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Fiche de Révision</h1>
            ${config.pseudo ? `<p style="font-size:14px;opacity:0.9;margin-bottom:4px;">${escapeHtmlStatic(config.pseudo)}</p>` : ''}
            <p>${exercises.length} exercice${exercises.length > 1 ? 's' : ''} analysé${exercises.length > 1 ? 's' : ''} — ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>

        <div class="revision-progress-bar" id="revision-summary">Clique sur "Voir la solution" pour commencer la révision</div>

        ${exercicesHTML}

        ${formulaireHTML}

        <div class="export-toolbar" id="export-toolbar">
            <button class="export-btn" onclick="downloadHTML()">Télécharger HTML</button>
        </div>

        <div class="footer">
            Généré par Kwyk Tutor — ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
    </div>

    <script>
        const totalExercises = ${exercises.length};
        const exerciseStatus = {};

        function toggleNotion(index) {
            const content = document.getElementById('notion-content-' + index);
            const chevron = document.getElementById('chevron-notion-' + index);
            if (content.style.display === 'none') {
                content.style.display = 'block';
                chevron.classList.add('open');
                chevron.textContent = '▶';
            } else {
                content.style.display = 'none';
                chevron.classList.remove('open');
                chevron.textContent = '▶';
            }
        }

        function toggleReveal(index) {
            const solution = document.getElementById('solution-' + index);
            const btn = document.getElementById('reveal-btn-' + index);
            if (solution.style.display === 'none') {
                solution.style.display = 'block';
                btn.textContent = 'Masquer la solution';
                btn.classList.add('revealed');
            } else {
                solution.style.display = 'none';
                btn.textContent = 'Voir la solution';
                btn.classList.remove('revealed');
            }
        }

        function markExercise(index, status) {
            exerciseStatus[index] = status;
            const evalDiv = document.getElementById('eval-' + index);
            const markedDiv = document.getElementById('marked-' + index);
            const exerciseDiv = document.getElementById('exercise-' + index);

            evalDiv.style.display = 'none';
            markedDiv.style.display = 'block';

            if (status === 'compris') {
                markedDiv.innerHTML = '<span class="revision-compris">Compris ✓</span>';
                exerciseDiv.classList.add('revision-compris-border');
                exerciseDiv.classList.remove('revision-a-revoir-border');
            } else {
                markedDiv.innerHTML = '<span class="revision-a-revoir">À revoir ✗</span>';
                exerciseDiv.classList.add('revision-a-revoir-border');
                exerciseDiv.classList.remove('revision-compris-border');
            }

            updateSummary();
        }

        function updateSummary() {
            const values = Object.values(exerciseStatus);
            const compris = values.filter(v => v === 'compris').length;
            const aRevoir = values.filter(v => v === 'a_revoir').length;
            const restant = totalExercises - compris - aRevoir;
            const bar = document.getElementById('revision-summary');

            let parts = [];
            if (compris > 0) parts.push(compris + ' compris');
            if (aRevoir > 0) parts.push(aRevoir + ' à revoir');
            if (restant > 0) parts.push(restant + ' restant' + (restant > 1 ? 's' : ''));

            bar.textContent = 'Progression : ' + parts.join(', ');

            if (aRevoir > 0 && compris === 0) {
                bar.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)';
            } else if (compris > 0 && aRevoir === 0) {
                bar.style.background = 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)';
            } else {
                bar.style.background = 'linear-gradient(135deg, #fdcb6e 0%, #e17055 100%)';
            }
        }

        function downloadHTML() {
            const html = document.documentElement.outerHTML;
            const blob = new Blob([html], { type: 'text/html' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'fiche-revision-kwyk.html';
            a.click();
            URL.revokeObjectURL(a.href);
        }

        // Rendu KaTeX au chargement
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof renderMathInElement !== 'undefined') {
                renderMathInElement(document.body, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\\\(', right: '\\\\)', display: false},
                        {left: '\\\\[', right: '\\\\]', display: true}
                    ],
                    throwOnError: false
                });
            }
        });
    </script>
</body>
</html>`;
    }

    /**
     * Version statique d'escapeHtml pour le HTML généré (hors DOM)
     */
    function escapeHtmlStatic(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Comme escapeHtmlStatic mais convertit **bold** → <strong>bold</strong>
    /**
     * Vérifie si l'exercice est bloqué via l'admin (remoteConfig.blocked_exercises).
     * Fonction pure — aucun effet de bord UI.
     * @returns {{ blockedMode: string, message: string } | null}
     */
    function getAdminBlock(exerciseId, currentMode) {
        if (!exerciseId || !remoteConfig.blocked_exercises) return null;
        // Normaliser l'ID en Number pour comparaison stricte (gère IDs string dans le Gist)
        const targetId = Number(exerciseId);
        if (Number.isNaN(targetId)) return null;
        const entry = remoteConfig.blocked_exercises.find(e => {
            const eId = Number(typeof e === 'object' ? e.id : e);
            return eId === targetId;
        });
        if (!entry) return null;
        const isBlocked = typeof entry === 'number'
            || entry.mode === 'both'
            || entry.mode === currentMode;
        if (!isBlocked) return null;
        const blockedMode = typeof entry === 'object' ? entry.mode : 'both';
        const message = blockedMode === 'both'
            ? '🚫 Exercice bloqué !'
            : blockedMode === 'triche'
                ? '🚫 Exercice bloqué en mode troll. Passe en mode pédagogique !'
                : '🚫 Exercice bloqué en mode pédagogique. Passe en mode troll !';
        return { blockedMode, message };
    }

    /**
     * Vérifie si l'exercice contient un mot-clé non supporté.
     * Fonction pure — aucun effet de bord UI.
     * Retourne le mot-clé déclencheur ou null si supporté.
     * Les types tableau_signes/variations sont toujours supportés
     * même si leur texte contient 'tracer ' (ex: "Tracer le tableau de signes de f").
     */

    /**
     * Détecte si l'exercice courant a déjà été répondu.
     * Signaux DOM Kwyk (confirmés) :
     *   - button.exercise_submit[disabled] + button.exercise_next sans disabled → validé
     *   - #sequence_left a.active i.correct → sidebar marque l'exo comme correct
     * Retourne true si au moins un signal fort est présent.
     */
    function isExerciseAlreadyAnswered() {
        const submitBtn = document.querySelector('button.exercise_submit');
        const nextBtn   = document.querySelector('button.exercise_next');

        // Signal 1 (le plus fiable) : submit disabled + next actif
        if (submitBtn && nextBtn) {
            if (submitBtn.hasAttribute('disabled') && !nextBtn.hasAttribute('disabled')) {
                return true;
            }
        }

        // Signal 2 : icône correct dans la sidebar pour l'exercice actif
        if (document.querySelector('#sequence_left a.active i.correct')) {
            return true;
        }

        return false;
    }

    function isExerciseUnsupported(exercise) {
        if (!exercise) return null;
        const unsupportedKeywords = [
            'tracer ',           // constructions graphiques (avec espace, catch-all)
            'placer les points',
            'glisser-déposer',
            'faire glisser',
            'construire ',       // constructions géométriques (avec espace, catch-all)
            // '[tableau]' retiré — tableau_valeurs a un prompt dédié (cheat bloqué séparément)
        ];
        const exType = exercise.exerciseType || exercise.questions?.[0]?.questionType;
        if (exType === 'tableau_signes' || exType === 'tableau_variations' || exType === 'tableau_valeurs') return null;
        // Fallback DOM direct : q.label peut remplacer le texte par [Figure géométrique] → "construire" perdu
        const domText = Array.from(document.querySelectorAll('.exercise_question'))
            .map(el => el.textContent).join(' ');
        const text = ((exercise.texte || '') + ' ' + domText).toLowerCase();
        return unsupportedKeywords.find(kw => text.includes(kw)) || null;
    }

    function checkUnsupportedExercise(autoSkip = false) {
        if (!currentExercise) return false;

        const actionsEl = document.getElementById('kwyk-actions');
        const responseEl = document.getElementById('kwyk-response');
        const cheatSection = document.getElementById('kwyk-cheat-section');

        // --- 1. Blocage admin ---
        const exerciseId = extractExerciseIdFromUrl();
        const currentMode = config.mode === 'revision' ? 'revision'
            : (config.mode === 'triche' && cheatModeActive) ? 'triche'
            : 'pedagogique';
        const adminBlock = getAdminBlock(exerciseId, currentMode);

        if (adminBlock) {
            LOG.warn(`Exercice bloqué par admin (ID: ${exerciseId}, mode: ${currentMode})`);
            if (config.mode === 'triche') {
                if (actionsEl) actionsEl.style.display = 'none';
                if (responseEl) responseEl.style.display = 'none';
                if (cheatSection) cheatSection.style.display = 'block';
                const switchEl = document.getElementById('kwyk-cheat-switch');
                if (switchEl) { switchEl.checked = false; switchEl.disabled = true; }
                cheatModeActive = false;
                updateCheatStatus(adminBlock.message, 'error');
            } else if (config.mode !== 'revision') {
                if (actionsEl) actionsEl.style.display = 'none';
                if (cheatSection) cheatSection.style.display = 'none';
                if (responseEl) {
                    responseEl.style.display = 'block';
                    responseEl.innerHTML = `<div class="kwyk-bubble error">${adminBlock.message}</div>`;
                }
            }
            return true;
        }

        // --- 2. Exercice non supporté (keywords) ---
        const unsupportedKw = isExerciseUnsupported(currentExercise);
        if (unsupportedKw) {
            LOG.warn(`Exercice non supporté détecté: "${unsupportedKw}"`);

            if (autoSkip && cheatModeActive && config.cheatAutoValidate && config.cheatAutoNext) {
                LOG.debug('Auto-skip exercice non supporté...');
                updateCheatStatus('Exercice non supporté, skip...', 'loading');
                setTimeout(async () => {
                    const nextBtn = document.querySelector('button.exercise_next');
                    if (nextBtn) {
                        nextBtn.click();
                        LOG.debug('Auto-skip: Bouton Suivant cliqué');
                        updateCheatStatus('Skipped !', 'success');
                    } else {
                        updateCheatStatus('Exercice non supporté', 'error');
                    }
                }, 200);
                return true;
            }

            if (actionsEl) actionsEl.style.display = 'none';
            if (cheatSection) cheatSection.style.display = 'none';
            if (config.mode !== 'revision' && responseEl) {
                responseEl.style.display = 'none';
                responseEl.innerHTML = '';
            }
            LOG.warn('Désactivation du mode triche (exercice non supporté)');
            cheatModeActive = false;
            const switchEl = document.getElementById('kwyk-cheat-switch');
            if (switchEl) { switchEl.checked = false; switchEl.disabled = true; }
            updateStatus('⚠️ Exercice non supporté', 'error'); // Remplace "Nouvel exercice !"
            updateCheatStatus('', ''); // Reset badge troll
            return true;
        }

        // --- 3. Exercice supporté — restaurer l'UI ---
        const switchEl = document.getElementById('kwyk-cheat-switch');
        if (switchEl) switchEl.disabled = false;

        if (config.mode === 'triche') {
            if (cheatSection) cheatSection.style.display = 'block';
            if (actionsEl) actionsEl.style.display = 'none';
            if (responseEl) responseEl.style.display = 'none';
        } else if (config.mode === 'revision') {
            // Ne pas toucher à l'UI en mode révision (géré par updateButtonsForMode)
        } else {
            if (actionsEl) actionsEl.style.display = 'flex';
            if (responseEl) responseEl.style.display = 'block';
            if (cheatSection) cheatSection.style.display = 'none';
        }

        return false;
    }

    /**
     * Affiche un encadré "Exercice déjà répondu" si l'exercice courant a déjà été validé.
     * - Désactive le mode triche (switch + section cachés)
     * - Garde les boutons pédagogiques accessibles
     * - Retourne true si détecté (permet au flow amont de court-circuiter le pendingCheatMode)
     */
    function checkAlreadyAnswered() {
        if (!isExerciseAlreadyAnswered()) return false;

        LOG.info('[Kwyk Tutor] Exercice déjà répondu détecté');

        const actionsEl    = document.getElementById('kwyk-actions');
        const responseEl   = document.getElementById('kwyk-response');
        const cheatSection = document.getElementById('kwyk-cheat-section');
        const switchEl     = document.getElementById('kwyk-cheat-switch');

        // Désactiver le mode triche
        if (switchEl) { switchEl.checked = false; switchEl.disabled = true; }
        cheatModeActive = false;
        if (cheatSection) cheatSection.style.display = 'none';
        updateCheatStatus('', '');

        // Cacher les boutons d'action, afficher encadré visible dans responseEl
        if (config.mode !== 'revision') {
            if (actionsEl) actionsEl.style.display = 'none';
            if (responseEl) {
                responseEl.style.display = 'block';
                responseEl.innerHTML = '<div class="kwyk-bubble success" style="text-align:center;padding:16px;">✅ <strong>Exercice déjà répondu</strong><br><span style="font-size:12px;opacity:0.8;">Tu as déjà validé cet exercice.</span></div>';
            }
        }

        updateStatus('✅ Exercice déjà répondu', 'success');
        return true;
    }

    // ===========================================
    // CLASSIFICATION DU TYPE D'EXERCICE
    // ===========================================

    /**
     * Classifie l'exercice en analysant le DOM et le texte des questions.
     * Retourne un type parmi : qcm_simple, qcm_multiple, input, tableau_signes,
     * tableau_variations, tableau_valeurs, graphique, unknown
     */
    /**
     * Classifie le type de chaque question individuellement
     */
    function classifyQuestion(question) {
        const text = (question.context || '').toLowerCase();

        // Mots-clés textuels (priorité haute)
        if (text.includes('[graphique')) return 'graphique';

        // Tableaux : uniquement si pas d'input DOM standard.
        // "signe de f sur [a;b]" avec un input = valeur demandée, pas tableau à remplir.
        if (question.type !== 'input') {
            const signesKeywords = ['tableau de signes', 'tableau de signe', 'tableaux de signes', 'tableaux de signe', 'compléter le tableau de signes', 'signe de'];
            for (const kw of signesKeywords) {
                if (text.includes(kw)) return 'tableau_signes';
            }

            const variationsKeywords = ['tableau de variations', 'tableau de variation', 'tableaux de variations', 'tableaux de variation', 'compléter le tableau de variations', 'variations de'];
            for (const kw of variationsKeywords) {
                if (text.includes(kw)) return 'tableau_variations';
            }
        }

        if (text.includes('[tableau]')) return 'tableau_valeurs';

        // Vecteurs: texte prime sur le DOM (s'applique aussi aux QCM/checkbox)
        if (text.includes('vecteur') || text.includes('colinéar') ||
            (text.includes('→') && text.includes('...'))) return 'vecteurs';

        // Fallback : type générique selon le DOM
        if (question.type === 'input') return 'input';

        return 'unknown';
    }

    /**
     * Retourne le format de réponse attendu (comment remplir), dérivé du DOM.
     * Distinct du type d'exercice (classifyQuestion).
     */
    function classifyAnswerFormat(question) {
        if (question.type === 'checkbox') return 'qcm_multiple';
        if (question.type === 'qcm') return 'qcm_simple';
        return 'input';
    }

    /**
     * Détecte le type de prompt à utiliser pour une question.
     * Peut retourner un type spécialisé (ex: 'inequation') même si le type DOM est 'input'.
     * Utilisé uniquement pour la sélection du prompt IA, PAS pour le type de réponse.
     */
    function detectPromptType(question) {
        const baseType = question.questionType || 'input';

        // Si c'est un type d'exercice spécialisé, le garder tel quel
        if (baseType !== 'input' && baseType !== 'unknown') return baseType;

        // Détection inéquations FACTORISÉES (produit ou quotient avec facteurs)
        // Ex: (3x+2)(x-1)>=0, (4x-6)/(-2x+8)<=0, (-5x-4)^2(x+2)^2>0, 6x(x²+5)<=0
        // NE PAS matcher: x²>12, x³>125, 2x+3>0 (inéquations simples → prompt input)
        const ctx = question.context || '';
        if (/[<>≤≥]|[<>]=/.test(ctx) && /ensemble des solutions|résoudre|résous|inéquation|signe/i.test(ctx)) {
            if (/\)\s*\(|\)\s*\/\s*\(|\)\s*\^|[x\d]\s*\(|\)\s*[x\d]/.test(ctx)) {
                return 'inequation';
            }
        }

        return baseType;
    }

    function classifyExercise(questions, exerciseBlocks) {
        // Classifier chaque question individuellement
        const types = new Set();
        questions.forEach((q, i) => {
            q.questionType = classifyQuestion(q);
            q.answerFormat = classifyAnswerFormat(q);
            types.add(q.questionType);
        });

        // Fallback global si toutes les questions sont unknown
        if (types.size === 1 && types.has('unknown')) {
            // Chercher globalement sur la page
            const globalCheckboxes = document.querySelectorAll('input[type="checkbox"][id^="id_answer_"]');
            if (globalCheckboxes.length > 0) {
                if (questions.length > 0 && questions[0].type === 'unknown') {
                    questions[0].type = 'checkbox';
                    questions[0].answerFormat = 'qcm_multiple';
                    questions[0].questionType = 'qcm_multiple';
                    globalCheckboxes.forEach(cb => {
                        const label = extractLabelWithMath(cb.labels?.[0] || cb.parentElement);
                        questions[0].options.push({ value: cb.value, label: label, id: cb.id });
                    });
                }
                return 'qcm_multiple';
            }
            const globalRadios = document.querySelectorAll('input[type="radio"][id^="id_answer_"], input[type="radio"][id^="id_mcq_answer_"]');
            if (globalRadios.length > 0) {
                if (questions.length > 0 && questions[0].type === 'unknown') {
                    questions[0].type = 'qcm';
                    questions[0].answerFormat = 'qcm_simple';
                    questions[0].questionType = 'qcm_simple';
                    globalRadios.forEach(radio => {
                        const label = extractLabelWithMath(radio.labels?.[0] || radio.parentElement);
                        questions[0].options.push({ value: radio.value, label: label, id: radio.id });
                    });
                }
                return 'qcm_simple';
            }
            const globalInputs = document.querySelectorAll('input[type="text"][id^="id_answer_"], .mq-editable-field.input-kwyk');
            if (globalInputs.length > 0) {
                if (questions.length > 0) {
                    questions[0].type = 'input';
                    questions[0].answerFormat = 'input';
                    questions[0].questionType = 'input'; // Fix: classifyQuestion a déjà tourné, mettre à jour manuellement
                }
                return 'input';
            }
            LOG.debug('Type non identifié — fallback unknown');
            return 'unknown';
        }

        // Retourner le type de la première question non-unknown
        const nonUnknownTypes = [...types].filter(t => t !== 'unknown');
        if (nonUnknownTypes.length === 0) return 'unknown';

        // Le type global = type de la première question (pour l'affichage initial)
        const globalType = questions[0].questionType || nonUnknownTypes[0];

        // Propager tableau_signes/variations aux questions unknown — fire dès qu'UNE question est tableau
        // (ex: Q1=input, Q2=tableau_signes, Q3=unknown → Q3 doit hériter de Q2)
        const tableauType = nonUnknownTypes.find(t => t === 'tableau_signes' || t === 'tableau_variations');
        if (tableauType) {
            questions.forEach(q => {
                if (q.questionType === 'unknown') q.questionType = tableauType;
            });
        }

        // Stocker promptType après propagation (questionType est final à ce stade)
        questions.forEach(q => { q.promptType = detectPromptType(q); });

        return globalType;
    }

    // ===========================================
    // DETECTION EXERCICE - V13 MULTI-QUESTIONS
    // ===========================================

    /**
     * Détecte les exercices "figure géométrique + fill-in-blank" (exercise_right_panel)
     * Chaque .exercise_right_panel contient un input[data-kwyk="multifrench"]
     */
    function detectFigureExercise(figureBlocks, panels) {
        const exercise = {
            type: 'figure_fillin',
            questions: [],
            texte: '',
            code: '',
            figureContext: ''
        };

        // Extraire le contexte figure depuis le premier .exercise_question (contient figure-data)
        if (figureBlocks.length > 0) {
            const figQ = analyzeQuestionBlock(figureBlocks[0], -1);
            exercise.figureContext = figQ.context || '';
        }

        // Créer une question par panel
        panels.forEach((panel, index) => {
            const clone = panel.cloneNode(true);
            // Supprimer buttons, inputs, messages d'alerte, éléments cachés
            clone.querySelectorAll('.exercise_buttons, input, .exercise_answer, .exercise_free_correct').forEach(el => el.remove());

            // Convertir MathJax en texte lisible
            clone.querySelectorAll('mjx-container').forEach(container => {
                const mathEl = container.querySelector('mjx-assistive-mml math');
                if (mathEl) {
                    const text = mathMLToText(mathEl);
                    if (text) { container.replaceWith(document.createTextNode(text)); return; }
                }
                const fallback = container.textContent.trim();
                if (fallback) container.replaceWith(document.createTextNode(fallback));
            });

            const text = clone.textContent.replace(/\s+/g, ' ').trim();
            const q = {
                index:        index,
                type:         'input',
                questionType: 'input',
                label:        text.substring(0, 200) || `Question ${index + 1}`,
                context:      text,
                options:      [],
                inputs:       []
            };
            // Détecter le type sémantique (ex: vecteurs si le texte contient "vecteur")
            q.questionType = classifyQuestion(q);
            q.answerFormat = classifyAnswerFormat(q);
            exercise.questions.push(q);
        });

        if (exercise.questions.length === 0) {
            LOG.debug('detectFigureExercise: aucune question extraite');
            currentExercise = null;
            return;
        }

        exercise.texte = exercise.questions.map((q, i) => `Question ${i + 1}: ${q.label}`).join('\n\n');
        exercise.exerciseId = extractExerciseIdFromUrl() || hashCode(exercise.texte);
        exercise.exerciseType = 'input';
        lastExerciseHash = hashCode(exercise.texte);
        currentExercise = exercise;

        updatePreview(`${exercise.questions.length} question(s) [figure géométrique]`);
        checkUnsupportedExercise();
        checkAlreadyAnswered();

        if (exercise.questions.length > 1) {
            createQuestionNavigation(exercise.questions.length);
        } else {
            document.getElementById('kwyk-question-nav').style.display = 'none';
        }

        LOG.debug('Exercice figure+panels:', currentExercise);

        if (pendingCheatMode && cheatModeActive) {
            pendingCheatMode = false;
            if (checkUnsupportedExercise(true)) {
                LOG.debug('Exercice bloqué/non supporté');
            } else {
                updateCheatStatus('Chargement...', 'loading');
                (async () => {
                    await waitForCondition(() => {
                        const submitBtn = document.querySelector('button.exercise_submit');
                        const hasInputs = document.querySelector('input[data-kwyk="multifrench"]');
                        return submitBtn && !submitBtn.disabled && hasInputs;
                    }, 8000, 200);
                    await new Promise(r => setTimeout(r, 1500));
                    updateCheatStatus('Appel IA en cours...', 'loading');
                    executeCheatMode();
                })();
            }
        }
    }

    // ===========================================

    function detectExercise() {
        LOG.debug('Detection exercice...');

        // Chercher les blocs .exercise_question
        const exerciseBlocks = document.querySelectorAll('.exercise_question');
        
        if (exerciseBlocks.length === 0) {
            LOG.debug('Aucun bloc .exercise_question trouve');
            updatePreview('Aucun exercice trouve sur cette page.');
            currentExercise = null;
            return;
        }

        LOG.debug(`${exerciseBlocks.length} bloc(s) .exercise_question detecte(s)`);

        // Détecter structure "figure + exercise_right_panel" (fill-in-blank avec figure géométrique)
        const multifrenchPanels = [...document.querySelectorAll('.exercise_right_panel')]
            .filter(p => p.querySelector('input[data-kwyk="multifrench"]'));
        if (multifrenchPanels.length > 0) {
            LOG.debug('Structure figure+panels détectée:', multifrenchPanels.length, 'question(s)');
            detectFigureExercise(exerciseBlocks, multifrenchPanels);
            return;
        }

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
            LOG.debug('Aucune question detectée');
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

        // Assigner un ID stable (URL > hash de l'énoncé)
        exercise.exerciseId = extractExerciseIdFromUrl() || hashCode(exercise.texte);

        // Classifier le type d'exercice
        exercise.exerciseType = classifyExercise(exercise.questions, exerciseBlocks);
        LOG.info(`Classification: ${exercise.exerciseType} | ${exercise.questions.map((q,i) => `Q${i+1}=${q.questionType}`).join(' ')}`);

        currentExercise = exercise;
        window._kwykGetState; // keep reference live (state reads directly from closure)
        const currentQ = exercise.questions[currentQuestionIndex] || exercise.questions[0];
        updatePreview(`${exercise.questions.length} question(s) détectée(s) [${getAnswerFormatLabel(currentQ, exercise.exerciseType)}]`);

        // Vérifier si l'exercice est supporté
        checkUnsupportedExercise();
        checkAlreadyAnswered();

        // Afficher la navigation si plusieurs questions
        if (exercise.questions.length > 1) {
            createQuestionNavigation(exercise.questions.length);
        } else {
            document.getElementById('kwyk-question-nav').style.display = 'none';
        }

        LOG.debug('Exercice detecte:', currentExercise);

        // Si le mode triche était en attente, le lancer maintenant
        // Vérifier d'abord si l'exercice est supporté AVANT de lancer l'IA
        if (pendingCheatMode && cheatModeActive) {
            pendingCheatMode = false;
            // Vérifier si exercice bloqué, non supporté ou déjà répondu avant de lancer l'IA
            if (checkUnsupportedExercise(true) || checkAlreadyAnswered()) {
                LOG.debug('Exercice bloqué/non supporté/déjà répondu, pas de résolution auto');
            } else {
                LOG.debug('Mode triche en attente, attente page complète...');
                updateCheatStatus('Chargement...', 'loading');
                (async () => {
                    await waitForCondition(() => {
                        const submitBtn = document.querySelector('button.exercise_submit');
                        const hasInputs = document.querySelector('.exercise_question input, .exercise_question .mq-editable-field, input[id^="id_answer_"], input[data-kwyk="multifrench"]');
                        return submitBtn && !submitBtn.disabled && hasInputs;
                    }, 8000, 200);
                    await new Promise(r => setTimeout(r, 1500));
                    updateCheatStatus('Appel IA en cours...', 'loading');
                    executeCheatMode();
                })();
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

        // Formater les tableaux prettytable pour l'IA
        clonedBlock.querySelectorAll('table.prettytable').forEach(table => {
            const rows = [...table.querySelectorAll('tr')];
            const formattedRows = rows.map(row => {
                const cells = [...row.querySelectorAll('th, td')];
                return cells.map(cell => cell.textContent.trim()).join(' | ');
            });
            const tableText = '\n[Tableau]\n' + formattedRows.join('\n') + '\n[/Tableau]\n';
            table.replaceWith(document.createTextNode(tableText));
        });

        // Extraire les fonctions des graphiques Raphaël (représentations graphiques)
        // Les graphes Raphaël contiennent un JSON avec "plot": [["function(x){ return ...}", [min, max]]]
        // On remplace tout le bloc SVG + JSON par un texte lisible "Graphique X : y = ..."
        // Extraction de TOUTES les courbes du plot (pas seulement plot[0])
        //      Nommage via config.label (ex: \mathcal{C}_f → "f") en faisant correspondre les couleurs
        const graphSpans = clonedBlock.querySelectorAll('span, div.figure-data');
        let graphLetterIndex = 0;
        const graphLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        graphSpans.forEach(span => {
            const text = span.textContent || '';
            const jsonMatch = text.match(/\{"init"\s*:\s*\{.*?"plot"\s*:\s*\[.*?\]\s*\}/s);
            if (jsonMatch) {
                try {
                    const config = JSON.parse(jsonMatch[0]);
                    if (config.plot && config.plot.length > 0) {
                        // Construire un mapping couleur → nom depuis config.label
                        const colorToName = {};
                        if (Array.isArray(config.label)) {
                            config.label.forEach(lbl => {
                                const labelText = String(lbl[1] || '');
                                const color = (lbl[3] && lbl[3].color) ? lbl[3].color.toLowerCase() : '';
                                // Extraire la lettre de \mathcal{C}_f → "f"
                                const nameMatch = labelText.match(/\\mathcal\{C\}_(\w+)/);
                                const name = nameMatch ? nameMatch[1] : labelText.replace(/\\/g, '').trim();
                                if (color && name) colorToName[color] = name;
                            });
                        }
                        // Extraire toutes les courbes
                        const graphLines = [];
                        config.plot.forEach((plotEntry, pi) => {
                            const funcStr = plotEntry[0] || '';
                            const exprMatch = funcStr.match(/return\s+(.+?)\s*;?\s*\}/);
                            if (exprMatch) {
                                const cleanExpr = exprMatch[1].replace(/\s+/g, ' ').trim();
                                const stroke = (plotEntry[2] && plotEntry[2].stroke) ? plotEntry[2].stroke.toLowerCase() : '';
                                const name = colorToName[stroke] || graphLetters[graphLetterIndex + pi] || String(pi + 1);
                                graphLines.push(`[Graphique ${name} : y = ${cleanExpr}]`);
                            }
                        });
                        if (graphLines.length > 0) {
                            span.textContent = `\n${graphLines.join('\n')}\n`;
                            // Supprimer les spans de labels Raphaël (position:absolute) dans le parent
                            // Ces spans contiennent les numéros d'axes (0, 5, -5...) et les labels (Cf, Cg)
                            // Ils ne sont PAS dans le SVG → non supprimés par svg.remove()
                            const parent = span.parentElement;
                            if (parent) {
                                Array.from(parent.querySelectorAll('span[style*="position"]')).forEach(s => {
                                    if (s !== span) s.remove();
                                });
                            }
                            graphLetterIndex++;
                        }
                    }
                } catch(e) {
                    // JSON invalide, on laisse tel quel
                }
            } else if (text.includes('"line"') && (text.includes('"init"') || text.includes('"graphInit"'))) {
                // Format "line" (vecteurs sur quadrillage)
                // V18.7+: Format "graphInit" (droite graduée — points nommés, pas de vecteurs)
                // {"init":{...},"line":[...],"label":[...]} ou {"graphInit":{...},"line":[...],"label":[...]}
                try {
                    // Bracket-counting pour extraire le JSON même si du texte (labels) précède
                    let jsonStart = text.indexOf('{"init"');
                    if (jsonStart < 0) jsonStart = text.indexOf('{"graphInit"');
                    if (jsonStart < 0) throw new Error('no JSON');
                    let depth = 0, jsonEnd = -1;
                    for (let i = jsonStart; i < text.length; i++) {
                        if (text[i] === '{') depth++;
                        else if (text[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
                    }
                    if (jsonEnd < 0) throw new Error('unclosed JSON');
                    // Kwyk stocke les labels LaTeX avec un seul backslash (\vec{u}) — invalide JSON strict
                    // On double les backslashes isolés avant JSON.parse
                    const rawJson = text.slice(jsonStart, jsonEnd + 1);
                    const fixedJson = rawJson.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
                    const parsed = JSON.parse(fixedJson);
                    if (parsed.line && Array.isArray(parsed.line)) {
                        // Mapping couleur → nom via config.label
                        const colorToName = {};
                        if (Array.isArray(parsed.label)) {
                            parsed.label.forEach(lbl => {
                                const labelText = String(lbl[1] || '');
                                const color = (lbl[3] && lbl[3].color) ? lbl[3].color.toLowerCase() : '';
                                const nameMatch = labelText.match(/\\vec\{(\w+)\}/) ||
                                                  labelText.match(/\\overrightarrow\{(\w+)\}/);
                                const name = nameMatch ? nameMatch[1] :
                                    labelText.replace(/\\/g, '').trim();
                                if (color && name) colorToName[color] = name;
                            });
                        }

                        // Extraire les entrées subtype:"vector"
                        const vectorLines = [];
                        parsed.line.forEach((entry) => {
                            if (!entry[2] || entry[2].subtype !== 'vector') return;
                            const dx = Math.round((entry[1][0] - entry[0][0]) * 100) / 100;
                            const dy = Math.round((entry[1][1] - entry[0][1]) * 100) / 100;
                            const stroke = (entry[2].stroke || '').toLowerCase();
                            const name = colorToName[stroke] || '?';
                            vectorLines.push(`[Vecteur ${name}→ : (${dx} ; ${dy})]`);
                        });

                        if (vectorLines.length > 0) {
                            span.textContent = '\n' + vectorLines.join('\n') + '\n';
                            const parent = span.parentElement;
                            if (parent) {
                                Array.from(parent.querySelectorAll('span[style*="position"]')).forEach(s => {
                                    if (s !== span) s.remove();
                                });
                            }
                            graphLetterIndex++;
                        } else if (parsed.graphInit !== undefined && Array.isArray(parsed.label)) {
                            // Format "graphInit" (droite graduée) : labels = [[x,y], "A", "above"]
                            // Extraire les points nommés (lettres majuscules uniquement)
                            const pointParts = [];
                            parsed.label.forEach(lbl => {
                                const name = String(lbl[1] || '').trim();
                                if (/^[A-Z]$/.test(name) && Array.isArray(lbl[0])) {
                                    const x = lbl[0][0], y = lbl[0][1] || 0;
                                    pointParts.push(`${name}(${x};${y})`);
                                }
                            });
                            if (pointParts.length > 0) {
                                span.textContent = `\n[Figure géométrique : ${pointParts.join(', ')}]\n`;
                                const parent = span.parentElement;
                                if (parent) {
                                    Array.from(parent.querySelectorAll('span[style*="position"]')).forEach(s => {
                                        if (s !== span) s.remove();
                                    });
                                }
                                graphLetterIndex++;
                            }
                        }
                    }
                } catch(e) {
                    // JSON invalide ou tronqué, on laisse tel quel
                }
            }
        });
        // Nettoyer les résidus Raphaël (numéros d'axes, "Created with Raphaël X.X.X")
        // S'applique seulement si des graphiques ont été détectés
        if (graphLetterIndex > 0) {
            clonedBlock.querySelectorAll('svg').forEach(svg => svg.remove());
        }

        // Extraction figure géométrique (div[data-kwyk="figure-data"] avec label + segments)
        const figureDataEl = clonedBlock.querySelector('[data-kwyk="figure-data"]');
        if (figureDataEl) {
            try {
                const figJson = JSON.parse(figureDataEl.textContent);
                if (figJson.label && figJson.label.length > 0) {
                    // Collecter les sommets des VRAIS segments (subtype:"segment") pour recaler les labels
                    // Les coords du label JSON sont la position du texte, pas toujours le point exact
                    // (ex: C label à (11;5.75) mais point géométrique réel à l'intersection (10;6))
                    // IMPORTANT : exclure les traits de graduation (pas de subtype) qui corrompent les coordonnées
                    const endpoints = [];
                    if (figJson.line) {
                        const seen = new Set();
                        figJson.line.forEach(seg => {
                            // Ignorer les traits sans subtype (graduations, ticks)
                            if (!seg[2] || seg[2].subtype !== 'segment') return;
                            [[seg[0][0], seg[0][1]], [seg[1][0], seg[1][1]]].forEach(([x, y]) => {
                                const key = `${x},${y}`;
                                if (!seen.has(key)) { seen.add(key); endpoints.push({x, y}); }
                            });
                        });
                    }
                    const points = figJson.label.map(lbl => {
                        let [x, y] = lbl[0];
                        const name = lbl[1];
                        // Recaler vers le sommet le plus proche si distance < 2 unités
                        let nearest = null, nearestDist = Infinity;
                        endpoints.forEach(ep => {
                            const d = Math.sqrt((ep.x - x) ** 2 + (ep.y - y) ** 2);
                            if (d < nearestDist) { nearestDist = d; nearest = ep; }
                        });
                        if (nearest && nearestDist < 2) { x = nearest.x; y = nearest.y; }
                        return `${name}(${x};${y})`;
                    }).join(', ');
                    figureDataEl.replaceWith(document.createTextNode(`[Figure géométrique : ${points}]`));
                    clonedBlock.querySelectorAll('.figure').forEach(f => f.remove());
                }
            } catch(e) { /* JSON invalide, laisser tel quel */ }
        }

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
            .replace(/Created with Raphaël \d+\.\d+\.\d+/g, '') // Nettoyer résidus Raphaël
            .replace(/\d+-\d+-\d+-\d+/g, '') // Nettoyer numéros d'axes concaténés
            .replace(/\s+/g, ' ')
            .substring(0, 1000);

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
                LOG.debug(`Q${index + 1}: Radios trouvés HORS du bloc`);
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
                LOG.debug(`Q${index + 1}: Checkboxes trouvés HORS du bloc (${checkboxes.length} options)`);
            }
        }

        // Chercher les inputs text globalement avec pattern id_answer_X (sans underscore final)
        if (textInputs.length === 0) {
            const globalTextInput = document.querySelector(`input[type="text"][id="id_answer_${index}"]`);
            if (globalTextInput) {
                textInputs = [globalTextInput];
                LOG.debug(`Q${index + 1}: Input text trouvé HORS du bloc (id_answer_${index})`);
            }
        }

        if (radios.length > 0) {
            question.type = 'qcm';

            // Extraire les options avec leurs labels (V15: support MathJax)
            radios.forEach(radio => {
                const labelEl = radio.labels?.[0] || radio.parentElement;
                const label = extractLabelWithMath(labelEl);

                question.options.push({
                    value: radio.value,
                    label: label,
                    id: radio.id
                });
            });

            LOG.debug(`Q${index + 1}: QCM avec ${question.options.length} options`, question.options);
        }
        else if (checkboxes.length > 0) {
            question.type = 'checkbox';

            checkboxes.forEach(checkbox => {
                const labelEl = checkbox.labels?.[0] || checkbox.parentElement;
                const label = extractLabelWithMath(labelEl);

                question.options.push({
                    value: checkbox.value,
                    label: label,
                    id: checkbox.id
                });
            });

            LOG.debug(`Q${index + 1}: Checkbox avec ${question.options.length} options`);
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

            LOG.debug(`Q${index + 1}: Input avec ${question.inputs.length} champ(s)`);
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

                // Mettre à jour le preview avec le type de la question sélectionnée
                const q = currentExercise.questions[i];
                if (q) {
                    updatePreview(`${currentExercise.questions.length} question(s) détectée(s) [${getAnswerFormatLabel(q, currentExercise.exerciseType)}]`);
                }

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

    /**
     * Retourne le label lisible du format de réponse attendu (affiché dans le panel).
     * Le questionType (graphique, vecteurs…) est réservé à l'IA — l'utilisateur voit le format.
     */
    function getAnswerFormatLabel(question, fallbackExerciseType) {
        const af = question?.answerFormat;
        const qt = question?.questionType || fallbackExerciseType || '';
        if (af === 'qcm_simple')    return 'QCM';
        if (af === 'qcm_multiple')  return 'QCM multiple';
        // Signes/variations : pas d'input DOM standard → label spécial
        if (qt === 'tableau_signes')     return 'Tableau de signes';
        if (qt === 'tableau_variations') return 'Tableau de variations';
        // tableau_valeurs a answerFormat='input' → tombe dans 'Saisie' ci-dessous
        return 'Saisie';
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

    let solveProblemPending = null;
    let solveProblemHash = null;

    /**
     * Extrait le contexte partagé entre toutes les questions.
     * Dans un exercice multi-questions, Q1 contient souvent le graphique/intro commun.
     * Ce contexte est inclus dans chaque appel API séparé pour que Q2 connaisse la fonction.
     */
    function extractSharedContext(questions) {
        if (questions.length < 2) return '';
        // Le contexte de Q1 sert de base partagée pour toutes les autres questions
        return questions[0].context || '';
    }

    /**
     * Envoie une requête API pour une question spécifique avec son propre type/prompt
     * @param {object} question - La question à résoudre
     * @param {number} questionIndex - Index de la question (0-based)
     * @param {string} sharedContext - Contexte commun à toutes les questions (graphiques, etc.)
     */
    async function solveOneQuestion(question, questionIndex, sharedContext = '') {
        const promptType = question.promptType || detectPromptType(question);
        const systemPrompt = getSystemPrompt(promptType, question.answerFormat || 'input');

        let prompt = `Exercice de maths (type détecté: ${promptType}):\n\n`;

        // Inclure la figure géométrique pour TOUS les index (exercices figure+panels)
        if (currentExercise?.figureContext) {
            prompt += `Figure géométrique de l'exercice:\n${currentExercise.figureContext}\n`;
            prompt += `IMPORTANT: si le résultat d'un calcul correspond aux coordonnées d'un point nommé de la figure, retourner le NOM du point (lettre unique, ex: "K"), pas les coordonnées.\n\n`;
        }

        // Inclure le contexte partagé pour Q2+ (pas Q1 qui est la source du contexte partagé)
        if (sharedContext && questionIndex > 0) {
            prompt += `Contexte commun à l'exercice (question précédente):\n${sharedContext}\n\n`;
        }

        // Extraire et mettre en avant les consignes de format présentes dans l'énoncé
        const ctx = question.context || '';
        const formatLines = [];
        const mOnDonnera = ctx.match(/on donnera[^.]*\./i);
        if (mOnDonnera) formatLines.push(mOnDonnera[0].trim());
        const mSiPas = ctx.match(/s'il n[''][^.]*\./i);
        if (mSiPas) formatLines.push(mSiPas[0].trim());
        if (formatLines.length > 0) {
            prompt += `CONSIGNE DE FORMAT (à respecter EXACTEMENT pour le champ "reponse"):\n`;
            formatLines.forEach(l => prompt += `- ${l}\n`);
            prompt += `\n`;
        }

        prompt += `Question 1:\n`;
        prompt += `${question.context}\n`;

        if (question.type === 'qcm' && question.options.length > 0) {
            prompt += `Options (QCM):\n`;
            question.options.forEach(opt => {
                prompt += `- ${opt.label}\n`;
            });
        } else if (question.type === 'checkbox' && question.options.length > 0) {
            prompt += `Options (plusieurs reponses possibles):\n`;
            question.options.forEach(opt => {
                prompt += `- ${opt.label}\n`;
            });
        } else if (question.type === 'input') {
            prompt += `Reponse a saisir\n`;
        }

        LOG.debug(`Appel API pour Q${questionIndex + 1} [type: ${promptType}]${sharedContext ? ' + contexte partagé' : ''}`);
        LOG.debug('=== SYSTEM PROMPT ===\n' + systemPrompt);
        LOG.debug('=== USER PROMPT ===\n' + prompt);

        // ── DEBUG: capturer l'échange pour kwykDebug() ──
        window._kwykLastExchange = { type: promptType, systemPrompt, userPrompt: prompt, rawResponse: null };

        const response = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.mistralApiKey}`
            },
            signal: cheatAbortController?.signal,
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API (${response.status}): ${errorData.error?.message || 'Inconnue'}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) throw new Error('Réponse vide');

        LOG.debug(`Réponse brute Q${questionIndex + 1}:`, content);
        window._kwykLastExchange.rawResponse = content; // ── DEBUG ──
        return parseAIResponse(content);
    }

    /**
     * Fusionne les résultats de plusieurs appels API (un par question)
     */
    function mergeResults(results) {
        const merged = {
            solution: {
                regle: '',
                exemple: null,
                etapes: [],
                reponses: []
            }
        };

        let questionOffset = 0;
        results.forEach((result, i) => {
            if (result.error) return;
            const s = result.solution;
            if (!s) return; // Guard : éviter crash si résultat malformé sans .solution
            if (s.regle) merged.solution.regle += (merged.solution.regle ? ' | ' : '') + s.regle;
            if (s.type_exercice && !merged.solution.type_exercice) merged.solution.type_exercice = s.type_exercice;
            if (s.exemple && !merged.solution.exemple) merged.solution.exemple = s.exemple;
            if (s.etapes) merged.solution.etapes.push(...s.etapes.map(e => {
                if (typeof e === 'string') return { titre: `Q${i + 1}: ${e}`, calculs: [] };
                return { titre: `Q${i + 1}: ${e.titre || ''}`, calculs: e.calculs || [] };
            }));

            // Renuméroter les réponses
            if (s.reponses) {
                s.reponses.forEach(r => {
                    merged.solution.reponses.push({
                        ...r,
                        question: questionOffset + (r.question || 1)
                    });
                });
                questionOffset += s.reponses.length;
            }

            // Garder le tableau si présent
            if (s.tableau) {
                merged.solution.tableau = s.tableau;
            }
        });

        return merged;
    }

    /**
     * Pour une question "AB→ = ... CD→", calcule le facteur k = AB→ / CD→
     * directement depuis les coordonnées du figureContext.
     * Retourne la valeur formatée ("3", "(1)/(3)", etc.) ou null si non applicable.
     */
    function tryComputeVectorRatio(questionContext, figureContext) {
        if (!figureContext) return null;
        // Pattern: deux noms de points 2 lettres entourant "= ... "
        const match = questionContext.match(/([A-Z]{2})→\s*=\s*\.+\s*([A-Z]{2})→/);
        if (!match) return null;
        const vec1Name = match[1]; // ex: "XY"
        const vec2Name = match[2]; // ex: "WZ"

        // Parser les coordonnées depuis "[Figure géométrique : W(3;0), X(4;0), ...]"
        const coords = {};
        const re = /([A-Z])\(([^;)]+);([^)]+)\)/g;
        let m;
        while ((m = re.exec(figureContext)) !== null) {
            coords[m[1]] = { x: parseFloat(m[2]), y: parseFloat(m[3]) };
        }

        const [a, b] = [vec1Name[0], vec1Name[1]]; // AB → de A vers B
        const [c, d] = [vec2Name[0], vec2Name[1]]; // CD → de C vers D
        if (!coords[a] || !coords[b] || !coords[c] || !coords[d]) return null;

        const v1x = coords[b].x - coords[a].x;
        const v1y = coords[b].y - coords[a].y;
        const v2x = coords[d].x - coords[c].x;
        const v2y = coords[d].y - coords[c].y;

        // Calculer k tel que v1 = k * v2
        const eps = 1e-9;
        let k;
        if (Math.abs(v2x) > eps) {
            k = v1x / v2x;
            if (Math.abs(v2y) > eps && Math.abs(v1y - k * v2y) > eps) return null; // non colinéaires
        } else if (Math.abs(v2y) > eps) {
            if (Math.abs(v1x) > eps) return null;
            k = v1y / v2y;
        } else {
            return null; // vecteur nul
        }

        // Réduire k en fraction p/q avec |q| ≤ 100
        const gcd = (a, b) => b === 0 ? a : gcd(b, Math.abs(a % b));
        let bestNum = Math.round(k), bestDen = 1, bestErr = Math.abs(k - Math.round(k));
        for (let den = 2; den <= 100; den++) {
            const num = Math.round(k * den);
            const err = Math.abs(k - num / den);
            if (err < bestErr) { bestErr = err; bestNum = num; bestDen = den; }
        }
        if (bestErr > 1e-6) return null;
        const g = gcd(Math.abs(bestNum), bestDen);
        bestNum /= g; bestDen /= g;

        if (bestDen === 1) return String(bestNum);
        if (bestNum < 0) return `-(${-bestNum})/(${bestDen})`;
        return `(${bestNum})/(${bestDen})`;
    }

    /**
     * Tente de résoudre TOUTES les questions d'un exercice colinéarité (sans IA).
     * Gère deux patterns par question :
     *   A) AB→ = ... CD→  (ratio inconnu, les deux vecteurs nommés)
     *   B) AB→ = (p)/(q) ...  ou  AB→ = n ...  (ratio connu, vecteur cible inconnu)
     * Les deux patterns peuvent coexister dans un même exercice multi-questions.
     */
    function tryDirectColinearitySolve() {
        const exercise = currentExercise;
        if (!exercise?.questions?.length) return null;

        // Extraire figCtx
        let figCtx = exercise.figureContext;
        if (!figCtx && exercise.questions[0]?.context) {
            const m = exercise.questions[0].context.match(/\[Figure g[eé]om[eé]trique\s*:[^\]]+\]/);
            if (m) figCtx = m[0];
        }
        if (!figCtx) return null;

        // Parser les coordonnées
        const coords = {};
        const reCoords = /([A-Z])\(([^;)]+);([^)]+)\)/g;
        let cm;
        while ((cm = reCoords.exec(figCtx)) !== null) {
            coords[cm[1]] = { x: parseFloat(cm[2]), y: parseFloat(cm[3]) };
        }
        const pointNames = Object.keys(coords);
        if (pointNames.length < 2) return null;

        const answers = [];
        const steps = [];

        for (const q of exercise.questions) {
            const ctx = q.context || '';

            // Pattern A : AB→ = ... CD→  (ratio inconnu, les deux vecteurs nommés)
            const mA = ctx.match(/([A-Z]{2})→\s*=\s*\.+\s*([A-Z]{2})→/);
            if (mA) {
                const ratio = tryComputeVectorRatio(ctx, figCtx);
                if (ratio === null) return null;
                answers.push(ratio);
                steps.push(`${mA[1]}→ = ${ratio} × ${mA[2]}→`);
                continue;
            }

            // Pattern B : AB→ = (p)/(q) ...  ou  AB→ = -(p)/(q) ...  ou  AB→ = n ...  (ratio connu, cible inconnue)
            // Gère : (-4)/(9) [signe dedans] ET -(4)/(9) [signe dehors]
            const mBfrac = ctx.match(/([A-Z]{2})→\s*=\s*(-?)\((-?\d+)\)\/\((\d+)\)\s*\.+/);
            const mBint  = !mBfrac && ctx.match(/([A-Z]{2})→\s*=\s*(-?\d+)\s*\.+/);
            const mB = mBfrac || mBint;
            if (mB) {
                const srcName = mB[1];
                // mBfrac : group2=signe externe, group3=num (peut être négatif), group4=den
                // mBint  : group2=entier signé
                const p = mBfrac
                    ? (mBfrac[2] === '-' ? -1 : 1) * parseInt(mBfrac[3], 10)
                    : parseInt(mB[2], 10);
                const q2 = mBfrac ? parseInt(mBfrac[4], 10) : 1;
                if (!srcName || q2 === 0 || p === 0) return null;

                const [sa, sb] = [srcName[0], srcName[1]];
                if (!coords[sa] || !coords[sb]) return null;

                const srcX = coords[sb].x - coords[sa].x;
                const srcY = coords[sb].y - coords[sa].y;
                // AB→ = (p/q)·cible  ⟹  cible = (q/p)·AB→
                const tgtX = (q2 / p) * srcX;
                const tgtY = (q2 / p) * srcY;

                const eps = 0.01;
                let found = null;
                for (const pn of pointNames) {
                    for (const qn of pointNames) {
                        if (pn === qn) continue;
                        const dx = coords[qn].x - coords[pn].x;
                        const dy = coords[qn].y - coords[pn].y;
                        if (Math.abs(dx - tgtX) < eps && Math.abs(dy - tgtY) < eps) {
                            found = `${pn}${qn}→`;
                            break;
                        }
                    }
                    if (found) break;
                }
                if (!found) return null;
                answers.push(found);
                steps.push(`${srcName}→=(${srcX};${srcY}), cible=(${tgtX};${tgtY}) → ${found} ✓`);
                continue;
            }

            return null; // Aucun pattern reconnu pour cette question
        }

        if (answers.length === 0) return null;
        LOG.info('Résolution directe colinéarité (sans IA):', answers);
        return formatSolution({
            regle: 'AB→ = k·CD→',
            etapes: steps,
            type_exercice: 'vecteurs',
            reponses: answers.map((a, i) => ({ question: i + 1, type: 'input', reponse: a }))
        });
    }

    function tryDirectTranslationSolve() {
        const exercise = currentExercise;
        if (!exercise?.questions?.length) return null;

        // Extraire figCtx
        let figCtx = exercise.figureContext;
        if (!figCtx && exercise.questions[0]?.context) {
            const m = exercise.questions[0].context.match(/\[Figure g[eé]om[eé]trique\s*:[^\]]+\]/);
            if (m) figCtx = m[0];
        }
        if (!figCtx) return null;

        // Extraire toutes les coordonnées nommées
        const coords = {};
        const re = /([A-Z])\(([^;)]+);([^)]+)\)/g;
        let cm;
        while ((cm = re.exec(figCtx)) !== null) {
            coords[cm[1]] = { x: parseFloat(cm[2]), y: parseFloat(cm[3]) };
        }
        if (Object.keys(coords).length === 0) return null;

        function findNamedPoint(x, y) {
            for (const [name, pt] of Object.entries(coords)) {
                if (Math.abs(pt.x - x) < 0.01 && Math.abs(pt.y - y) < 0.01) return name;
            }
            return null;
        }

        const answers = [];
        const steps = [];

        for (const q of exercise.questions) {
            const ctx = q.context;
            // Pattern direct : "translation de vecteur XY→ transforme Z en ."
            const fwd = ctx.match(/translation de vecteur ([A-Z]{2})→ transforme ([A-Z]) en/);
            // Pattern inverse : "translation de vecteur XY→ transforme en Z."
            const rev = ctx.match(/translation de vecteur ([A-Z]{2})→ transforme en ([A-Z])[.\s]/);

            if (fwd) {
                const [, vecName, fromPt] = fwd;
                const [a, b] = [vecName[0], vecName[1]];
                if (!coords[a] || !coords[b] || !coords[fromPt]) return null;
                const vx = coords[b].x - coords[a].x;
                const vy = coords[b].y - coords[a].y;
                const result = findNamedPoint(coords[fromPt].x + vx, coords[fromPt].y + vy);
                if (!result) return null;
                answers.push(result);
                steps.push(`${vecName}→=(${vx};${vy}), ${fromPt}+(${vx};${vy})=(${coords[fromPt].x + vx};${coords[fromPt].y + vy})=${result}`);
            } else if (rev) {
                const [, vecName, toPt] = rev;
                const [a, b] = [vecName[0], vecName[1]];
                if (!coords[a] || !coords[b] || !coords[toPt]) return null;
                const vx = coords[b].x - coords[a].x;
                const vy = coords[b].y - coords[a].y;
                const result = findNamedPoint(coords[toPt].x - vx, coords[toPt].y - vy);
                if (!result) return null;
                answers.push(result);
                steps.push(`${vecName}→=(${vx};${vy}), antécédent=${toPt}-(${vx};${vy})=(${coords[toPt].x - vx};${coords[toPt].y - vy})=${result}`);
            } else {
                return null; // Pattern non reconnu → fallback IA
            }
        }

        if (answers.length === 0) return null;
        LOG.info('Résolution directe translation (sans IA):', answers);
        return formatSolution({
            regle: 'Translation de vecteur v→ : image = point + v→ (antécédent = image − v→)',
            etapes: steps,
            type_exercice: 'vecteurs',
            reponses: answers.map((a, i) => ({ question: i + 1, type: 'input', reponse: a }))
        });
    }

    function tryDirectVectorEqualitySolve() {
        const exercise = currentExercise;
        if (!exercise?.questions?.length) return null;

        // Extraire figCtx
        let figCtx = exercise.figureContext;
        if (!figCtx && exercise.questions[0]?.context) {
            const m = exercise.questions[0].context.match(/\[Figure g[eé]om[eé]trique\s*:[^\]]+\]/);
            if (m) figCtx = m[0];
        }
        if (!figCtx) return null;

        // Extraire toutes les coordonnées nommées
        const coords = {};
        const re = /([A-Z])\(([^;)]+);([^)]+)\)/g;
        let cm;
        while ((cm = re.exec(figCtx)) !== null) {
            coords[cm[1]] = { x: parseFloat(cm[2]), y: parseFloat(cm[3]) };
        }
        const pointNames = Object.keys(coords);
        if (pointNames.length < 2) return null;

        const answers = [];
        const steps = [];

        for (const q of exercise.questions) {
            // Détecter "vecteurs égaux à XY→" (avec → ou \overrightarrow{XY})
            const m1 = q.context.match(/[eé]gaux [aà]\s*([A-Z]{2})→/);
            const m2 = q.context.match(/[eé]gaux [aà]\s*\\overrightarrow\{([A-Z]{2})\}/);
            const match = m1 || m2;
            if (!match) return null;

            const refName = match[1];
            const [ra, rb] = [refName[0], refName[1]];
            if (!coords[ra] || !coords[rb]) return null;

            const refX = coords[rb].x - coords[ra].x;
            const refY = coords[rb].y - coords[ra].y;

            // Énumérer TOUS les couples ordonnés (X,Y) avec X≠Y
            const found = [];
            for (const pn of pointNames) {
                for (const qn of pointNames) {
                    if (pn === qn) continue;
                    if (pn === ra && qn === rb) continue; // exclure le vecteur de référence lui-même
                    const dx = coords[qn].x - coords[pn].x;
                    const dy = coords[qn].y - coords[pn].y;
                    if (Math.abs(dx - refX) < 0.01 && Math.abs(dy - refY) < 0.01) {
                        found.push(`${pn}${qn}→`);
                    }
                }
            }

            if (found.length === 0) {
                answers.push('aucun');
                steps.push(`${refName}→=(${refX};${refY}) — aucun vecteur égal trouvé`);
            } else {
                answers.push(found.join(';'));
                steps.push(`${refName}→=(${refX};${refY})`);
                found.forEach(v => steps.push(`${v.replace('→','')} → (${refX};${refY}) ✓`));
            }
        }

        if (answers.length === 0) return null;
        LOG.info('Résolution directe vecteurs égaux (sans IA):', answers);
        return formatSolution({
            regle: 'Deux vecteurs sont égaux s\'ils ont les mêmes coordonnées (même direction, même sens, même longueur).',
            etapes: steps,
            type_exercice: 'vecteurs',
            reponses: answers.map((a, i) => ({ question: i + 1, type: 'input', reponse: a }))
        });
    }


    /**
     * Somme de vecteurs : AB→+CD→+... → vecteur résultant.
     * Algorithme : chaque AB→ contribue +1 à B et −1 à A.
     * Le point avec +1 net = arrivée, celui avec −1 net = départ → résultat = départ+arrivée+→
     */
    function tryDirectVectorSumSolve() {
        const exercise = currentExercise;
        if (!exercise?.questions?.length) return null;

        // Extraire les coordonnées depuis figureContext (pour fallback coordonnées)
        const figSrc = exercise.figureContext ||
            (exercise.questions[0]?.context || '').match(/\[Figure géométrique : ([^\]]+)\]/)?.[1] || '';
        const coords = {};
        if (figSrc) {
            const re = /([A-Z])\((-?\d+(?:[.,]\d+)?);(-?\d+(?:[.,]\d+)?)\)/g;
            let cm;
            while ((cm = re.exec(figSrc)) !== null) {
                coords[cm[1]] = { x: parseFloat(cm[2].replace(',', '.')), y: parseFloat(cm[3].replace(',', '.')) };
            }
        }
        const pointNames = Object.keys(coords); // ordre de la figure = ordre de recherche

        const answers = [];
        const steps = [];

        for (const q of exercise.questions) {
            const ctx = q.context || '';

            // Détecter une somme/différence : au moins 2 vecteurs séparés par + ou -
            const sumStr = ctx.match(/[A-Z]{2}→(?:\s*[+\-]\s*[A-Z]{2}→)+/);
            if (!sumStr) return null;

            // Parser les vecteurs avec leur signe (+ ou -)
            // Ex: "AD→-CG→" → [{name:"AD", sign:+1}, {name:"CG", sign:-1}]
            const signedVecs = [];
            const rawExpr = sumStr[0];
            const firstVec = rawExpr.match(/^([A-Z]{2})→/);
            if (!firstVec) return null;
            signedVecs.push({ name: firstVec[1], sign: +1 });
            const restTokens = rawExpr.slice(firstVec[0].length);
            for (const m of restTokens.matchAll(/\s*([+\-])\s*([A-Z]{2})→/g)) {
                signedVecs.push({ name: m[2], sign: m[1] === '-' ? -1 : +1 });
            }
            if (signedVecs.length < 2) return null;

            // Pour approche 1 count-based : un vecteur soustrait AB→ = ajouter BA→ (inverse)
            const vecs = signedVecs.map(sv => sv.sign === +1 ? sv.name : sv.name[1] + sv.name[0]);
            const hasSub = signedVecs.some(sv => sv.sign === -1);

            // --- Approche 1 : count-based (chaîne télescopique — sans coordonnées) ---
            // Ne s'applique que s'il n'y a que des additions (les soustractions rendent le count-based peu fiable)
            const counts = {};
            for (const v of vecs) {
                counts[v[0]] = (counts[v[0]] || 0) - 1;
                counts[v[1]] = (counts[v[1]] || 0) + 1;
            }
            const positives = Object.entries(counts).filter(([, c]) => c > 0);
            const negatives = Object.entries(counts).filter(([, c]) => c < 0);

            if (!hasSub && positives.length === 1 && negatives.length === 1) {
                const depart  = negatives[0][0];
                const arrivee = positives[0][0];
                const result  = depart + arrivee + '→';
                const cancelled = Object.keys(counts).filter(p => counts[p] === 0).join(', ');
                steps.push(
                    vecs.map(v => `(${v[1]}−${v[0]})`).join('+') +
                    ` = ${arrivee}−${depart}` +
                    (cancelled ? ` (${cancelled} annulés)` : '') +
                    ` → ${result}`
                );
                answers.push(result);
                continue;
            }

            // --- Approche 2 : Chasles ancré — partir du départ de chaque vecteur de la somme ---
            // Ex: LC→+JB→ : essayer L→R puis J→R avec R = départ + somme totale
            // Pour la soustraction AB→-CD→ : on utilise les signes (dx += sign*vdx)
            if (pointNames.length === 0) return null;

            let dx = 0, dy = 0;
            const stepParts = [];
            let coordsOk = true;
            for (const sv of signedVecs) {
                const v = sv.name;
                const A = coords[v[0]], B = coords[v[1]];
                if (!A || !B) { coordsOk = false; break; }
                const vdx = B.x - A.x, vdy = B.y - A.y;
                dx += sv.sign * vdx; dy += sv.sign * vdy;
                const signStr = sv.sign === -1 ? '-' : '+';
                stepParts.push(`${signStr}${v}→=(${sv.sign === -1 ? -vdx : vdx};${sv.sign === -1 ? -vdy : vdy})`);
            }
            if (!coordsOk) return null;

            // Tenter chaque point de départ des vecteurs de la somme (dans l'ordre)
            let found = null;
            for (const sv of signedVecs) {
                const startName = sv.name[0];
                const S = coords[startName];
                if (!S) continue;
                const Rx = S.x + dx, Ry = S.y + dy;
                const rName = pointNames.find(p => Math.abs(coords[p].x - Rx) < 0.001 && Math.abs(coords[p].y - Ry) < 0.001);
                if (rName && rName !== startName) {
                    found = startName + rName + '→';
                    break;
                }
            }

            // --- Approche 3 : fallback — première paire (P,Q) quelconque dans l'ordre de la figure ---
            if (!found) {
                outer3: for (const pn of pointNames) {
                    for (const qn of pointNames) {
                        if (pn === qn) continue;
                        const P = coords[pn], Q = coords[qn];
                        if (Math.abs((Q.x - P.x) - dx) < 0.001 && Math.abs((Q.y - P.y) - dy) < 0.001) {
                            found = pn + qn + '→';
                            break outer3;
                        }
                    }
                }
            }

            if (!found) return null;

            steps.push(...stepParts, `Somme=(${dx};${dy}) → ${found}`);
            answers.push(found);
        }

        if (answers.length === 0) return null;
        LOG.info('Résolution directe somme vecteurs (sans IA):', answers);
        return formatSolution({
            regle: 'Calculer les composantes de chaque vecteur, additionner, identifier la paire correspondante.',
            etapes: steps,
            type_exercice: 'vecteurs',
            reponses: answers.map((a, i) => ({ question: i + 1, type: 'input', reponse: a }))
        });
    }

    /**
     * Solver direct : exprimer un vecteur en combinaison linéaire de deux autres.
     * Pattern : "exprimer w→ en fonction des vecteurs u→ et v→"
     * Algorithme : règle de Cramer (système 2×2).
     */
    function tryDirectVectorLinearCombinationSolve() {
        if (!currentExercise?.questions?.length) return null;

        const q = currentExercise.questions.find(q =>
            /exprimer/i.test(q.context) && /en fonction de/i.test(q.context)
        );
        if (!q) return null;

        // Extraire tous les vecteurs nommés du contexte : [Vecteur X→ : (dx ; dy)]
        const vecPat = /\[Vecteur\s+([^:\u2192\s]+)\u2192\s*:\s*\((-?[\d.]+)\s*;\s*(-?[\d.]+)\)\]/g;
        const allVecs = {};
        for (const m of q.context.matchAll(vecPat)) {
            allVecs[m[1]] = { dx: parseFloat(m[2]), dy: parseFloat(m[3]) };
        }
        if (Object.keys(allVecs).length < 3) return null;

        // Identifier vecteur cible et vecteurs de base depuis le texte
        const exprMatch = q.context.match(
            /exprimer\s+(?:le\s+vecteur\s+)?([a-zA-Z]+)\u2192\s+en\s+fonction\s+des\s+vecteurs\s+([a-zA-Z]+)\u2192\s+et\s+([a-zA-Z]+)\u2192/i
        );
        if (!exprMatch) return null;

        const [, wName, uName, vName] = exprMatch;
        const W = allVecs[wName], U = allVecs[uName], V = allVecs[vName];
        if (!W || !U || !V) return null;

        // Cramer : W = a·U + b·V
        const det = U.dx * V.dy - U.dy * V.dx;
        if (Math.abs(det) < 0.001) return null; // vecteurs colinéaires

        const aRaw = (W.dx * V.dy - W.dy * V.dx) / det;
        const bRaw = (U.dx * W.dy - U.dy * W.dx) / det;

        // Convertir en fraction irréductible
        function toFrac(x) {
            if (Math.abs(x) < 1e-9) return { n: 0, d: 1 };
            const sign = x < 0 ? -1 : 1;
            x = Math.abs(x);
            for (let d = 1; d <= 100; d++) {
                const n = Math.round(x * d);
                if (Math.abs(n / d - x) < 1e-6) {
                    const g = (function gcd(a, b) { return b ? gcd(b, a % b) : a; })(n, d);
                    return { n: sign * (n / g), d: d / g };
                }
            }
            return null;
        }

        const aF = toFrac(aRaw), bF = toFrac(bRaw);
        if (!aF || !bF) return null;

        // Formater un coefficient devant un vecteur
        function fmtTerm(name, frac, isFirst) {
            const { n, d } = frac;
            if (n === 0) return '';
            const coeffStr = d === 1
                ? (Math.abs(n) === 1 ? '' : String(Math.abs(n)))
                : `(${Math.abs(n)}/${d})`;
            const sign = n < 0 ? '\u2212' : (isFirst ? '' : '+');
            return `${sign}${coeffStr}${name}\u2192`;
        }

        const term1 = fmtTerm(uName, aF, true);
        const term2 = fmtTerm(vName, bF, !term1);
        const reponse = (term1 + term2) || '0';

        const steps = [
            `${wName}\u2192=(${W.dx};${W.dy}), ${uName}\u2192=(${U.dx};${U.dy}), ${vName}\u2192=(${V.dx};${V.dy})`,
            `Système : ${W.dx}=${U.dx}·a + ${V.dx}·b  et  ${W.dy}=${U.dy}·a + ${V.dy}·b`,
            `det = ${U.dx}×${V.dy} \u2212 ${U.dy}×${V.dx} = ${det}`,
            `a = (${W.dx}×${V.dy} \u2212 ${W.dy}×${V.dx}) / ${det} = ${aF.n}${aF.d > 1 ? '/' + aF.d : ''}`,
            `b = (${U.dx}×${W.dy} \u2212 ${U.dy}×${W.dx}) / ${det} = ${bF.n}${bF.d > 1 ? '/' + bF.d : ''}`,
            `${wName}\u2192 = ${reponse}`
        ];

        LOG.debug(`Résolution directe combinaison linéaire (sans IA): ${reponse}`);
        return formatSolution({
            regle: `Résoudre : ${wName}x = a·${uName}x + b·${vName}x  et  ${wName}y = a·${uName}y + b·${vName}y (règle de Cramer)`,
            etapes: steps,
            type_exercice: 'vecteurs',
            reponses: [{ question: 1, type: 'input', reponse: reponse }]
        });
    }

    /** Point d'entrée unique pour tous les solvers directs (sans IA). */
    function tryDirectSolve() {
        const wrapped = tryDirectColinearitySolve()
            || tryDirectTranslationSolve()
            || tryDirectVectorEqualitySolve()
            || tryDirectVectorSumSolve()
            || tryDirectVectorLinearCombinationSolve();
        if (!wrapped) return null;
        // formatSolution() retourne { solution: {...} } — unwrap pour usage direct comme cachedSolution
        return wrapped.solution || wrapped;
    }

    async function solveProblem() {
        if (!config.mistralApiKey) {
            return { error: 'Cle API manquante. Va dans Options pour la configurer.' };
        }

        // Déduplication
        if (solveProblemPending && solveProblemHash === lastExerciseHash) {
            LOG.debug('Requête déjà en cours, réutilisation');
            return solveProblemPending;
        }

        const exerciseType = currentExercise?.exerciseType || 'unknown';

        solveProblemHash = lastExerciseHash;
        solveProblemPending = (async () => {
            try {
                // Tentative de résolution directe (sans IA) : colinéarité puis translation
                const directSolution = tryDirectSolve();
                if (directSolution) return directSolution;

                // Multi-questions → toujours un appel par question (évite les arrays IA)
                if (currentExercise.questions.length > 1) {
                    LOG.debug('Multi-questions: appels séparés par question');
                    const sharedContext = extractSharedContext(currentExercise.questions);
                    if (sharedContext) {
                        LOG.debug('Contexte partagé extrait:', sharedContext);
                    }
                    const results = await Promise.all(
                        currentExercise.questions.map((q, i) => solveOneQuestion(q, i, sharedContext).catch(err => ({ error: err.message })))
                    );

                    // Vérifier si toutes les requêtes ont échoué
                    const allErrors = results.every(r => r.error);
                    if (allErrors) {
                        return { error: `Erreur: ${results[0].error}` };
                    }

                    const merged = mergeResults(results);
                    // Stocker les solutions individuelles par question pour l'affichage ciblé
                    merged.solution._perQuestion = results.map(r => r.error ? null : r.solution);
                    return merged;
                }

                // 1 question → appel classique unique
                const prompt = buildPrompt();
                const promptType = currentExercise.questions.length > 0
                    ? (currentExercise.questions[0].promptType || detectPromptType(currentExercise.questions[0]))
                    : exerciseType;
                const systemPrompt = getSystemPrompt(promptType, currentExercise.questions[0]?.answerFormat || 'input');
                LOG.debug('=== SYSTEM PROMPT ===\n' + systemPrompt);
                LOG.debug('=== USER PROMPT ===\n' + prompt);
                const response = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${config.mistralApiKey}`
                    },
                    signal: cheatAbortController?.signal,
                    body: JSON.stringify({
                        model: config.model,
                        messages: [
                            {
                                role: 'system',
                                content: systemPrompt
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
                    LOG.error('Erreur API:', errorData);
                    return { error: `Erreur API (${response.status}): ${errorData.error?.message || 'Inconnue'}` };
                }

                const data = await response.json();
                const content = data.choices[0]?.message?.content;

                if (!content) {
                    return { error: 'Reponse vide de l\'API' };
                }

                LOG.debug('Reponse brute:', content);
                return parseAIResponse(content);

            } catch (error) {
                if (error.name === 'AbortError') {
                    LOG.debug('⛔ Appel IA annulé (nouvel exercice détecté)');
                    return { error: 'aborted' };
                }
                LOG.error('Erreur:', error);
                return { error: `Erreur: ${error.message}` };
            } finally {
                solveProblemPending = null;
            }
        })();

        return solveProblemPending;
    }

    // ===========================================
    // PROMPTS MODULAIRES
    // ===========================================

    /**
     * Prompt de base — commun à tous les types d'exercice.
     * Règles JSON, formatage math, et structure générale.
     */
    function getBasePrompt() {
        return `Réponds UNIQUEMENT en JSON valide. Aucun texte en dehors du JSON.
N'utilise JAMAIS de caractères d'échappement (\\n, \\t, \\x) dans les valeurs JSON.
INTERDIT dans les valeurs JSON: \\(...\\), \\[...\\], $...$ — aucun délimiteur LaTeX.
INTERDIT dans les valeurs JSON: \\frac{}{}, \\sqrt{}, \\overrightarrow{}, \\mathbb{}, \\text{} — utilise les notations ci-dessous à la place.

NOTATION (tous les champs):
- Fractions: TOUJOURS (numérateur)/(dénominateur) — ex: (1)/(3), (-8)/(7), (x+1)/(x-2). JAMAIS 1/3, -8/7, ou \\frac{1}{3}.
- Puissances: x^2 — Racines: √ simplifiées (ex: 2√7, jamais √28 ou \\sqrt{28}) — Pas de *
- Vecteurs: AB→ (flèche après) — JAMAIS \\overrightarrow{AB}
- Ensembles: ℝ, ℝ\\{0;1} — JAMAIS \\mathbb{R}
- Intervalles: ]a;b[, [a;b], ]a;+∞[ — strict (< >) → crochets ouverts aux racines ; large (≤ ≥) → crochets fermés
- Unions: simplifier {val}∪]val;b[ = [val;b[  |  ]a;val[∪{val} = ]a;val]

"reponse": valeur finale exacte uniquement, aucune explication.
Si une CONSIGNE DE FORMAT est fournie dans l'énoncé (ex: "sous la forme d'un ensemble"), la suivre en priorité.

CHAMP OBLIGATOIRE dans ta réponse JSON:
"type_exercice": classifie l'exercice parmi ces catégories EXACTES:
  "equation_1er_degre", "equation_2nd_degre", "inequation_1er_degre", "inequation_2nd_degre", "inequation_produit_quotient",
  "systeme_equations", "factorisation", "developpement", "identite_remarquable", "calcul_litteral",
  "fonction_affine", "fonction_carree", "fonction_inverse", "fonction_reference", "lecture_graphique",
  "tableau_signes", "tableau_variations", "intervalle_ensemble",
  "calcul_numerique", "fraction", "puissance_racine", "proportionnalite", "pourcentage",
  "probabilite", "statistiques", "geometrie", "vecteurs", "reperage",
  "autre"
Choisis la catégorie la plus précise possible.`;
    }

    /**
     * Module prompt spécifique au type d'exercice.
     * Contient le format JSON attendu + un exemple concret (few-shot).
     */
    function getTypePrompt(exerciseType) {
        const typePrompts = {

            qcm_simple: `
TYPE D'EXERCICE: QCM simple (une seule réponse à cocher parmi les options).

Réponds avec ce JSON exact:
{
  "regle": "Règle ou formule courte utilisée pour résoudre",
  "exemple": {
    "enonce": "Un exemple similaire mais DIFFÉRENT de l'exercice posé",
    "etapes": ["calcul 1", "calcul 2", "résultat"]
  },
  "etapes": ["calcul 1", "calcul 2", "résultat"],
  "reponses": [
    {"question": 1, "type": "qcm", "reponse": "LETTRE ou TEXTE EXACT de l'option"}
  ]
}

EXEMPLE — Énoncé: "Quelle est la forme factorisée de x²-9 ? A) (x-3)² B) (x+3)(x-3) C) (x+9)(x-9)"
Réponse:
{"regle": "a²-b² = (a+b)(a-b) : identité remarquable différence de deux carrés", "exemple": {"enonce": "Factoriser x²-25", "etapes": ["x²-25 = x²-5²", "(x+5)(x-5)"]}, "etapes": ["x²-9 = x²-3²", "x²-3² = (x+3)(x-3)"], "reponses": [{"question": 1, "type": "qcm", "reponse": "B"}]}`,

            qcm_multiple: `
TYPE D'EXERCICE: QCM multiple (plusieurs cases à cocher).

Réponds avec ce JSON exact:
{
  "regle": "Règle ou critère pour identifier les bonnes réponses",
  "exemple": {
    "enonce": "Un exemple similaire mais DIFFÉRENT de l'exercice posé",
    "etapes": ["option A : ...", "option B : ...", "→ réponses correctes : A, C"]
  },
  "etapes": ["option A : ...", "option B : ...", "→ réponses correctes : A, C"],
  "reponses": [
    {"question": 1, "type": "qcm_multiples", "reponses": ["A", "C"]}
  ]
}

IMPORTANT: utilise "reponses" (pluriel) avec un ARRAY de lettres/textes.

EXEMPLE — Énoncé: "Parmi ces fonctions, lesquelles sont affines ? A) f(x)=3 B) f(x)=x² C) f(x)=2x+1 D) f(x)=√x"
Réponse:
{"regle": "Une fonction affine est de la forme f(x) = ax+b. Une constante (a=0) est un cas particulier d'affine.", "exemple": {"enonce": "Parmi f(x)=2, g(x)=x³, h(x)=5x-1 : lesquelles sont affines ?", "etapes": ["f(x)=2 : a=0, b=2 → affine ✓", "g(x)=x³ : degré 3 → pas affine ✗", "h(x)=5x-1 : a=5, b=-1 → affine ✓"]}, "etapes": ["A) f(x)=3 : a=0, b=3 → affine ✓", "B) f(x)=x² : degré 2 → pas affine ✗", "C) f(x)=2x+1 : a=2, b=1 → affine ✓", "D) f(x)=√x : racine → pas affine ✗"], "reponses": [{"question": 1, "type": "qcm_multiples", "reponses": ["A", "C"]}]}`,

            input: `
TYPE D'EXERCICE: Saisie de réponse (champ texte ou MathQuill).

Réponds avec ce JSON:
{
  "regle": "propriété mathématique en une phrase (max 120 caractères)",
  "exemple": {"enonce": "exemple similaire mais différent", "etapes": ["calcul 1", "résultat"]},
  "etapes": ["calcul 1", "calcul 2", "résultat"],
  "reponses": [{"question": 1, "type": "input", "reponse": "VALEUR EXACTE"}]
}

Niveau Seconde: toujours choisir la méthode la plus simple (factorisation, facteur commun, identité remarquable AVANT discriminant).
"etapes": chaque élément = un calcul court, JAMAIS de texte en français. Utiliser "---" pour séparer les phases.
"reponse": copie exacte de la valeur finale trouvée dans les étapes.
Plusieurs questions → un objet par question dans "reponses".

EXEMPLE 1 — Énoncé: "Résoudre (x-3)(2x+4)=0"
Réponse:
{"regle": "Produit nul: AB=0 ⟺ A=0 ou B=0", "exemple": {"enonce": "Résoudre (x+1)(3x-6)=0", "etapes": ["x+1=0 → x=-1", "3x-6=0 → x=2", "-1;2"]}, "etapes": ["x-3=0 → x=3", "2x+4=0 → x=-2", "-2;3"], "reponses": [{"question": 1, "type": "input", "reponse": "-2;3"}]}

EXEMPLE 2 — Énoncé: "Résoudre x²-6x+9=0"
Réponse:
{"regle": "(a-b)²=a²-2ab+b² identité remarquable", "exemple": {"enonce": "Résoudre x²+10x+25=0", "etapes": ["(x+5)²=0", "x=-5"]}, "etapes": ["x²-6x+9=(x-3)²", "(x-3)²=0 → x=3", "3"], "reponses": [{"question": 1, "type": "input", "reponse": "3"}]}

`,

            inequation: `
TYPE D'EXERCICE: Inéquation (produit ou quotient, résoudre sur un ensemble).

Fournis les données structurées ET ta réponse finale dans "reponse".

Réponds avec ce JSON:
{
  "regle": "propriété mathématique en une phrase (max 120 caractères)",
  "exemple": {"enonce": "exemple similaire mais différent", "etapes": ["calcul 1", "résultat"]},
  "etapes": ["calcul 1", "calcul 2", "résultat"],
  "inequation": {
    "critiques": ["valeur1", "valeur2"],
    "interdites": ["valeur_denominateur"],
    "signes": ["+", "-", "+"],
    "comparaison": ">="
  },
  "reponses": [{"question": 1, "type": "input", "reponse": "INTERVALLE SOLUTION"}]
}

"critiques": TOUTES les valeurs où l'expression s'annule ou est interdite (inclure les interdites !). Format (num)/(den) si fraction.
"interdites": valeurs qui annulent un dénominateur (sous-ensemble de critiques). Vide [] si pas de quotient.
"signes": "+" ou "-" pour chaque intervalle. EXACTEMENT N+1 signes pour N critiques.
"comparaison": l'opérateur de l'énoncé (">", ">=", "<", "<=").
"reponse": l'intervalle solution (ex: ]-1;(2)/(3)[∪](2)/(3);+∞[). TOUJOURS écrire ta vraie réponse.

IMPORTANT: trie "critiques" du plus petit au plus grand (convertir en décimal pour comparer).

EXEMPLE — Énoncé: "Résoudre (9x+9)/(-6x+4)>=0 sur R∖{(2)/(3)}"
Réponse:
{"regle": "Quotient ≥0 quand numérateur et dénominateur sont de même signe", "exemple": {"enonce": "Résoudre (x-2)/(x+1)>0", "etapes": ["Critiques: x=2, x=-1", "Test x=-2: (-4)/(-1)=4 → +", "Test x=0: (-2)/(1)=-2 → -", "Test x=3: (1)/(4)=0.25 → +"]}, "etapes": ["9x+9=0 → x=-1", "-6x+4=0 → x=(2)/(3)", "Test x=-2: (-9)/(16)=-0.56 → -", "Test x=0: (9)/(4)=2.25 → +", "Test x=1: (18)/(-2)=-9 → -"], "inequation": {"critiques": ["-1", "(2)/(3)"], "interdites": ["(2)/(3)"], "signes": ["-", "+", "-"], "comparaison": ">="}, "reponses": [{"question": 1, "type": "input", "reponse": "[-1;(2)/(3)["}]}`,

            tableau_signes: `
TYPE D'EXERCICE: Tableau de signes à compléter.

Chaque case du tableau est une réponse séparée. Utilise +, -, 0 ou || (valeur interdite).
Numérote les cases de gauche à droite.

Réponds avec ce JSON exact:
{
  "regle": "Règle pour déterminer les signes d'une fonction",
  "exemple": {
    "enonce": "Un exemple similaire mais DIFFÉRENT de l'exercice posé",
    "etapes": ["calcul 1", "calcul 2", "résultat"]
  },
  "etapes": ["calcul 1", "calcul 2", "résultat"],
  "reponses": [
    {"question": 1, "type": "input", "reponse": "+"},
    {"question": 2, "type": "input", "reponse": "0"},
    {"question": 3, "type": "input", "reponse": "-"}
  ],
  "tableau": {
    "type": "signes",
    "headers": ["x", "-∞", "valeur_critique", "+∞"],
    "rows": [{"label": "f(x)", "values": ["+", "0", "-"]}]
  }
}

RÈGLES STRICTES:
- Le tableau a TOUJOURS une SEULE row, label TOUJOURS "f(x)"
- Pattern: signe, 0, signe, 0, signe... (alternance signes et zéros aux valeurs critiques)
- 1 valeur critique → 3 values. 2 valeurs critiques → 5 values. JAMAIS deux signes consécutifs sans 0.

VÉRIFICATION OBLIGATOIRE du signe aux extrémités:
- Fonction affine (degré 1): si a > 0 → commence par -, finit par +. Si a < 0 → commence par +, finit par -.
- Fonction du second degré (degré 2): si a > 0 → commence par +, finit par + (parabole ouverte vers le haut). Si a < 0 → commence par -, finit par - (parabole ouverte vers le bas).
- TOUJOURS vérifier le signe du coefficient dominant AVANT d'écrire les values. Le premier et dernier signe dépendent UNIQUEMENT du coefficient dominant et du degré.

EXEMPLE 1 — Énoncé: "Tableau de signes de f(x) = 2x - 4"
Réponse:
{"regle": "f(x) = ax + b s'annule en x = -b/a. Si a > 0 : f est négative avant, positive après. Si a < 0 : l'inverse.", "exemple": {"enonce": "Tableau de signes de f(x) = 3x - 6", "etapes": ["3x - 6 = 0 → x = 2", "---", "a = 3 > 0 : f(x) < 0 sur ]-∞;2[", "f(x) > 0 sur ]2;+∞["]}, "etapes": ["2x - 4 = 0 → x = 2", "---", "a = 2 > 0 : f(x) < 0 sur ]-∞;2[", "f(x) > 0 sur ]2;+∞["], "reponses": [{"question": 1, "type": "input", "reponse": "-"}, {"question": 2, "type": "input", "reponse": "0"}, {"question": 3, "type": "input", "reponse": "+"}], "tableau": {"type": "signes", "headers": ["x", "-∞", "2", "+∞"], "rows": [{"label": "f(x)", "values": ["-", "0", "+"]}]}}

EXEMPLE 2 — Énoncé: "Tableau de signes de f(x) = (-x-1)(6x-4)"
Réponse:
{"regle": "Produit de facteurs: même signe → +, signes contraires → -. Coeff dominant fixe les extrémités.", "exemple": {"enonce": "Tableau de signes de f(x) = (x-2)(x+1)", "etapes": ["x-2 = 0 → x = 2", "x+1 = 0 → x = -1", "---", "a = 1 > 0 : + aux extrémités", "Sur ]-∞;-1[ : +, sur ]-1;2[ : -, sur ]2;+∞[ : +"]}, "etapes": ["-x-1 = 0 → x = -1", "6x-4 = 0 → x = (2)/(3)", "---", "a = -6 < 0 : - aux extrémités", "Sur ]-∞;-1[ : -, sur ]-1;(2)/(3)[ : +, sur ](2)/(3);+∞[ : -"], "reponses": [{"question": 1, "type": "input", "reponse": "-"}, {"question": 2, "type": "input", "reponse": "0"}, {"question": 3, "type": "input", "reponse": "+"}, {"question": 4, "type": "input", "reponse": "0"}, {"question": 5, "type": "input", "reponse": "-"}], "tableau": {"type": "signes", "headers": ["x", "-∞", "-1", "(2)/(3)", "+∞"], "rows": [{"label": "f(x)", "values": ["-", "0", "+", "0", "-"]}]}}`,

            tableau_variations: `
TYPE D'EXERCICE: Tableau de variations à compléter.

Donne TOUTES les valeurs: numériques aux bornes/extremums ET les flèches ↗ (croissant) / ↘ (décroissant).
Numérote les cases de gauche à droite.

RÈGLE ABSOLUE — FORMAT DES VALUES:
- Le tableau de variations Kwyk ne contient QUE des flèches (↗ ou ↘) et des séparateurs (||).
- Ne mets JAMAIS de valeurs numériques (0, -∞, +∞, etc.) dans "values".
- Format toujours: ["↘", "↗", "||", ...] uniquement.
- Exemple CORRECT: "values": ["↘", "||", "↘"]
- Exemple INTERDIT: "values": ["0", "↘", "-∞", "||", "+∞", "↘", "0"]

Réponds avec ce JSON exact:
{
  "regle": "Règle pour déterminer les variations d'une fonction (sans dérivée — expliquer à partir de la forme)",
  "exemple": {
    "enonce": "Un exemple similaire mais DIFFÉRENT de l'exercice posé",
    "etapes": ["calcul 1", "calcul 2  (raison si non évident)", "résultat"]
  },
  "etapes": ["calcul 1", "calcul 2  (raison si non évident)", "résultat"],
  "reponses": [
    {"question": 1, "type": "input", "reponse": "↘"},
    {"question": 2, "type": "input", "reponse": "↗"}
  ],
  "tableau": {
    "type": "variation",
    "headers": ["x", "-2", "1", "4"],
    "rows": [{"label": "f(x)", "values": ["↘", "↗"]}]
  }
}

Les values contiennent UNIQUEMENT des flèches (↗/↘) et des séparateurs (||). JAMAIS de valeurs numériques.
- Fonction continue sur [a,b]: "values": ["↘"] ou ["↗"] ou ["↗", "↘"] selon les variations
- Fonction avec asymptote (point exclu): "values": ["↘", "||", "↘"] (les deux intervalles séparés par ||)

EXEMPLE 1 — Fonction continue: "Tableau de variations de f(x) = x² - 6x + 5 sur [-1; 5]"
Réponse:
{"regle": "f(x) = ax² + bx + c : parabole avec sommet en x = -b/(2a). Si a > 0, elle décroît avant le sommet puis croît. Si a < 0, l'inverse.", "exemple": {"enonce": "Tableau de variations de f(x) = x² - 4x + 3 sur [0;4]", "etapes": ["a = 1 > 0 : parabole ouverte vers le haut  (minimum au sommet)", "sommet : x = -(-4)/(2×1) = 2", "---", "Sur [0;2] : f décroissante ↘  (on se rapproche du minimum)", "Sur [2;4] : f croissante ↗  (on s'éloigne du minimum)"]}, "etapes": ["a = 1 > 0 : parabole ouverte vers le haut  (minimum au sommet)", "sommet : x = -(-6)/(2×1) = 3", "---", "Sur [-1;3] : f décroissante ↘  (on se rapproche du minimum)", "Sur [3;5] : f croissante ↗  (on s'éloigne du minimum)"], "reponses": [{"question": 1, "type": "input", "reponse": "↘"}, {"question": 2, "type": "input", "reponse": "↗"}], "tableau": {"type": "variation", "headers": ["x", "-1", "3", "5"], "rows": [{"label": "f(x)", "values": ["↘", "↗"]}]}}

EXEMPLE 2 — Fonction avec asymptote: "Tableau de variations de f(x) = (1)/(x)"
Réponse:
{"regle": "f(x) = (1)/(x) : quand x augmente (positif), (1)/(x) diminue. Asymptote verticale en x = 0 : la fonction n'est pas définie en 0.", "exemple": {"enonce": "Tableau de variations de f(x) = (2)/(x)", "etapes": ["x = 0 interdit  (division par zéro)", "---", "Sur ]-∞;0[ : quand x augmente vers 0⁻, (2)/(x) diminue vers -∞ → ↘", "Sur ]0;+∞[ : quand x augmente depuis 0⁺, (2)/(x) diminue → ↘"]}, "etapes": ["x = 0 interdit  (division par zéro)", "---", "Sur ]-∞;0[ : quand x augmente vers 0⁻, (1)/(x) diminue vers -∞ → ↘", "Sur ]0;+∞[ : quand x augmente depuis 0⁺, (1)/(x) diminue → ↘"], "reponses": [{"question": 1, "type": "input", "reponse": "↘"}, {"question": 2, "type": "input", "reponse": "↘"}], "tableau": {"type": "variation", "headers": ["x", "-∞", "0", "+∞"], "rows": [{"label": "f(x)", "values": ["↘", "||", "↘"]}]}}`,

            tableau_valeurs: `
TYPE D'EXERCICE: Tableau de valeurs — DEUX CAS POSSIBLES.

Le tableau est présenté entre [Tableau] et [/Tableau] avec des colonnes séparées par |.

CAS 1 — VALEURS MANQUANTES: Le tableau contient "?" → calculer la/les valeur(s) manquante(s).

CAS 2 — DÉRIVER UNE VALEUR DU TABLEAU: Le tableau est complet (pas de "?") → calculer ce que demande la question (coefficient directeur, ordonnée à l'origine, expression de f...).
- Coefficient directeur a : a = (f(x2) - f(x1)) / (x2 - x1)
- Ordonnée à l'origine b : b = f(x1) - a * x1
- Expression de f : retourner l'expression SEULE sans "f(x) =" (ex: "-x+2")

Réponds avec ce JSON exact:
{
  "regle": "Règle mathématique applicable",
  "exemple": {
    "enonce": "Un exemple similaire mais DIFFÉRENT de l'exercice posé",
    "etapes": ["calcul 1", "calcul 2", "résultat"]
  },
  "etapes": ["calcul 1", "calcul 2", "résultat"],
  "reponses": [
    {"question": 1, "type": "input", "reponse": "VALEUR"}
  ]
}

EXEMPLE CAS 1 — Énoncé: "f est linéaire. [Tableau] x | -8 | -6 / f(x) | -2 | ? [/Tableau]"
Réponse:
{"regle": "Fonction linéaire f(x) = ax. Trouver a depuis un couple connu, calculer les valeurs manquantes.", "exemple": {"enonce": "f linéaire. [Tableau] x | -10 | -5 / f(x) | -2 | ? [/Tableau]", "etapes": ["f(x) = ax", "f(-10) = -2 → a = (1)/(5)", "f(-5) = (1)/(5) × (-5) = -1"]}, "etapes": ["f(x) = ax", "f(-8) = -2 → a = (1)/(4)", "f(-6) = (1)/(4) × (-6) = (-3)/(2)"], "reponses": [{"question": 1, "type": "input", "reponse": "(-3)/(2)"}]}

EXEMPLE CAS 2 — Énoncé: "Fonction affine f. [Tableau] x | 2 | 6 / f(x) | 4 | -4 [/Tableau] Déterminer le coefficient directeur."
Réponse:
{"regle": "Coefficient directeur a = (f(x2) - f(x1)) / (x2 - x1).", "exemple": {"enonce": "Fonction affine f. [Tableau] x | 1 | 5 / f(x) | 3 | -5 [/Tableau] Coefficient directeur ?", "etapes": ["a = (-5 - 3) / (5 - 1)", "a = -8 / 4", "a = -2"]}, "etapes": ["a = (-4 - 4) / (6 - 2)", "a = -8 / 4", "a = -2"], "reponses": [{"question": 1, "type": "input", "reponse": "-2"}]}`,

            graphique: `
TYPE D'EXERCICE: Exercice à partir de graphiques de fonctions.
Les graphiques sont décrits sous la forme [Graphique f : y = expression].

TROIS CAS POSSIBLES — détecte lequel s'applique:

CAS 1 — IDENTIFICATION: "Quel type de fonction représente ce graphique ?"
- Analyse l'expression pour identifier le type (affine, linéaire, constante, polynôme...)
- Constante f(x) = k → AUSSI affine (a=0). Linéaire f(x) = ax → AUSSI affine (b=0).
- Si on demande "constante ET/OU affine ?", une constante est AUSSI affine → coche les DEUX

CAS 2 — RÉSOLUTION D'ÉQUATION/INÉGALITÉ: "Résoudre f(x) = g(x)" ou "f(x) ≤ g(x)"
- Recopie les coefficients EXACTEMENT tels qu'ils apparaissent. Ne jamais arrondir.
- Pour f(x) ≤ g(x) : calculer h(x) = f(x) - g(x), puis résoudre h(x) ≤ 0
- Signe de h(x) = ax² + bx + c : si a > 0, négatif entre les racines → [x1 ; x2]

CAS 3 — EXPRESSION ALGÉBRIQUE ou COEFFICIENT: "Trouver l'expression de f", "Donner la formule", "Déterminer le coefficient directeur"
- Lire l'expression dans [Graphique f : y = expression] ou calculer depuis un point A(x;y) : a = y/x
- Si la question demande le COEFFICIENT DIRECTEUR (ou "valeur de a") → retourner UNIQUEMENT le nombre (ex: "2", "(7)/(8)", "-3")
- Si la question demande l'EXPRESSION de f → retourner l'expression SEULE sans "f(x) =" (ex: "(7)/(8)x", "-2x+3")
- Notation: * → rien, fractions → (num)/(den)
- Ex coefficient: y = 2*x, question "coefficient directeur" → "2"
- Ex expression:  y = (7/8)*x, question "expression de f"  → "(7)/(8)x"

Réponds avec ce JSON exact:
{
  "regle": "Règle mathématique applicable (1 phrase)",
  "exemple": {
    "enonce": "Exemple similaire DIFFÉRENT de l'exercice posé",
    "etapes": ["calcul 1", "calcul 2", "---", "résultat"]
  },
  "etapes": ["calcul 1", "calcul 2", "---", "résultat"],
  "reponses": [{"question": 1, "type": "input", "reponse": "valeur"}]
}

EXEMPLE CAS 3a — Énoncé: "Déterminer le coefficient directeur. [Graphique A : y = 2*x]"
Réponse:
{"regle": "Coefficient directeur a = valeur devant x dans f(x) = ax + b.", "exemple": {"enonce": "Coefficient directeur de [Graphique f : y = (3)/(4)*x]", "etapes": ["y = (3)/(4)*x → a = (3)/(4)"]}, "etapes": ["y = 2*x → a = 2"], "reponses": [{"question": 1, "type": "input", "reponse": "2"}]}

EXEMPLE CAS 3b — Énoncé: "f est linéaire. Le point A(6;9) est sur la courbe de f. Trouver l'expression de f."
Réponse:
{"regle": "Fonction linéaire f(x) = ax. Trouver a : a = y/x pour tout point (x;y) sur la courbe.", "exemple": {"enonce": "f linéaire, A(4;6). Expression de f ?", "etapes": ["a = 6/4 = (3)/(2)", "f(x) = (3)/(2)x"]}, "etapes": ["f(x) = ax", "a = 9/6 = (3)/(2)", "f(x) = (3)/(2)x"], "reponses": [{"question": 1, "type": "input", "reponse": "(3)/(2)x"}]}

EXEMPLE CAS 2 — Énoncé: "Résoudre f(x) ≤ g(x) avec [Graphique f : y = x*x - 2*x] et [Graphique g : y = 2*x + 5]"
Réponse:
{"regle": "f(x) ≤ g(x) ⟺ f(x) - g(x) ≤ 0. On calcule h = f - g puis on résout h(x) ≤ 0.", "exemple": {"enonce": "Résoudre x² - 9 ≤ 0", "etapes": ["(x-3)(x+3) ≤ 0", "a > 0 → négatif entre les racines", "[-3;3]"]}, "etapes": ["h(x) = x²-2x - (2x+5) = x²-4x-5", "h(x) = (x-5)(x+1)", "a = 1 > 0 → négatif entre les racines", "[-1;5]"], "reponses": [{"question": 1, "type": "input", "reponse": "[-1;5]"}]}

EXEMPLE CAS 1 — Énoncé: "Le graphique A : y = 3x + 2 représente une fonction: A) linéaire B) affine C) ni l'une ni l'autre"
Réponse:
{"regle": "f(x) = ax + b est affine. Si b = 0, elle est aussi linéaire.", "exemple": {"enonce": "y = 5x : quel type ? A) linéaire B) affine", "etapes": ["y = 5x → b = 0 → linéaire ET affine"]}, "etapes": ["y = 3x + 2 → a = 3, b = 2", "b ≠ 0 → pas linéaire", "Forme ax+b → affine → B"], "reponses": [{"question": 1, "type": "qcm", "reponse": "B"}]}`,

            vecteurs: `
TYPE D'EXERCICE: Vecteurs sur figure géométrique.

Les coordonnées des points sont listées en début de question: [Figure géométrique : A(x;y), B(x;y), ...]

FORMULE: PQ→ = Q - P = (Qx - Px ; Qy - Py). ATTENTION: ARRIVÉE moins DÉPART.

Réponds avec ce JSON exact:
{
  "regle": "Règle courte (max 120 caractères)",
  "exemple": {"enonce": "exemple similaire DIFFÉRENT", "etapes": ["calcul 1", "résultat"]},
  "etapes": ["calcul 1", "calcul 2", "résultat"],
  "reponses": [{"question": 1, "type": "input", "reponse": "RÉPONSE EXACTE"}]
}

RÈGLES CRITIQUES:
1. Pour chaque vecteur à calculer, IDENTIFIER d'abord les coordonnées des deux points dans la liste: "P=(Px;Py), Q=(Qx;Qy)".
2. PQ→ = Q - P = (Qx - Px ; Qy - Py) : ARRIVÉE moins DÉPART. (Notation: PQ→ avec flèche après, JAMAIS \\overrightarrow{PQ} dans le JSON.)
3. Pour "vecteurs égaux": calculer le vecteur de référence, puis tester TOUS les couples ordonnés (X,Y) dans LES DEUX SENS — XY→ ET YX→ pour chaque paire. Un vecteur égal peut partir d'un point dont la lettre vient APRÈS la destination (ex: HA→ si H>A alphabétiquement).
4. Dans "etapes": N'écrire AUCUNE ligne pour les vecteurs non-égaux (même pas ✗). Écrire uniquement: 1) le vecteur de référence avec identification des coordonnées, 2) chaque vecteur égal trouvé (avec ✓), 3) la réponse finale.
5. "reponse": vecteurs avec "→" séparés par ";". Si aucun: "aucun". Translation → nom du point image.
6. Pour une somme de vecteurs symbolique (sans coordonnées): développer chaque AB→=B−A, regrouper et simplifier. CRUCIAL pour nommer le résultat: si le résultat vaut X−Y, le vecteur est YX→ (Y=départ, X=arrivée). Ex: résultat=O−J → JO→ (PAS OJ→). Rappel: PQ→=Q−P, donc résultat=Q−P → PQ→.

EXEMPLE 1 — Vecteurs égaux: "Citer tous les vecteurs égaux à IB→. [Figure géométrique : A(0;4), B(4;4), D(0;2), E(4;2), H(4;0), I(8;0)]"
Réponse:
{"regle": "Deux vecteurs sont égaux s'ils ont les mêmes coordonnées.", "exemple": {"enonce": "Vecteurs égaux à GD→ avec G(4;0), D(2;2), A(0;4)", "etapes": ["G=(4;0), D=(2;2) → GD→=(2-4;2-0)=(-2;2)", "D=(2;2), A=(0;4) → DA→=(0-2;4-2)=(-2;2) ✓", "DA→"]}, "etapes": ["I=(8;0), B=(4;4) → IB→=(4-8;4-0)=(-4;4)", "H=(4;0), A=(0;4) → HA→=(0-4;4-0)=(-4;4) ✓", "HA→"], "reponses": [{"question": 1, "type": "input", "reponse": "HA→"}]}

EXEMPLE 2 — Somme de vecteurs: "Donner EI→+IQ→+JE→ sous forme d'un seul vecteur."
Réponse:
{"regle": "AB→=B−A; simplifier la somme, résultat X−Y → vecteur YX→", "exemple": {"enonce": "AB→+BC→+DA→=?", "etapes": ["(B−A)+(C−B)+(A−D)=C−D", "résultat=C−D → départ=D, arrivée=C → DC→"]}, "etapes": ["(I−E)+(Q−I)+(E−J)", "I−I=0, −E+E=0", "=Q−J", "résultat=Q−J → départ=J, arrivée=Q → JQ→"], "reponses": [{"question": 1, "type": "input", "reponse": "JQ→"}]}`
        };

        return typePrompts[exerciseType] || typePrompts['input'];
    }

    /**
     * V15: Construit le system prompt modulaire.
     * Combine le prompt de base + le module spécifique au type d'exercice détecté.
     */
    function getSystemPrompt(exerciseType, answerFormat = 'input') {
        if (!exerciseType || exerciseType === 'unknown') {
            // Fix P0 — Si answerFormat indique un type spécialisé, utiliser CE prompt-là
            // Sinon le fallback 'input' + appendice QCM créait des formats contradictoires
            if (answerFormat === 'qcm_multiple') exerciseType = 'qcm_multiple';
            else if (answerFormat === 'qcm_simple') exerciseType = 'qcm_simple';
            else exerciseType = 'input';
        }
        LOG.debug(`Prompt modulaire pour type: ${exerciseType} | format: ${answerFormat}`);
        let prompt = getBasePrompt() + '\n\n' + getTypePrompt(exerciseType);
        // Appendice QCM uniquement si le type prompt n'est pas déjà QCM (évite double instructions)
        if (answerFormat === 'qcm_simple' && exerciseType !== 'qcm_simple') {
            prompt += '\n\nFORMAT RÉPONSE QCM (1 choix): après avoir calculé la réponse, identifie la lettre de l\'option correspondante parmi les options listées. Retourne `"type": "qcm_simple"` et `"reponse": "B"` (lettre seule, ex: A, B, C ou D).';
        } else if (answerFormat === 'qcm_multiple' && exerciseType !== 'qcm_multiple') {
            prompt += '\n\nFORMAT RÉPONSE QCM multiple: après avoir calculé les réponses, identifie les lettres des options correctes. Utilise `"type": "qcm_multiples"` et `"reponses": ["A", "C"]` (array de lettres).';
        }
        return prompt;
    }

    function buildPrompt() {
        const exerciseType = currentExercise?.exerciseType || 'unknown';
        let prompt = `Exercice de maths (type détecté: ${exerciseType}):\n\n`;

        // Inclure la figure géométrique si présente (exercices figure+panels)
        if (currentExercise.figureContext) {
            prompt += `Figure géométrique de l'exercice:\n${currentExercise.figureContext}\n`;
            prompt += `IMPORTANT: si le résultat d'un calcul correspond aux coordonnées d'un point nommé de la figure, retourner le NOM du point (lettre unique, ex: "K"), pas les coordonnées.\n\n`;
        }

        currentExercise.questions.forEach((q, i) => {
            const promptType = q.promptType || detectPromptType(q);
            prompt += `Question ${i + 1} [type: ${promptType}]:\n`;
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
        // 1. Enlever les backticks Markdown et tout texte après le bloc ```
        jsonStr = jsonStr.trim();
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json\s*/, '');
            // Couper à la première fermeture ``` (pas seulement en fin de string)
            const closeIdx = jsonStr.indexOf('```');
            if (closeIdx !== -1) jsonStr = jsonStr.substring(0, closeIdx);
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```\s*/, '');
            const closeIdx = jsonStr.indexOf('```');
            if (closeIdx !== -1) jsonStr = jsonStr.substring(0, closeIdx);
        }

        // 2. SOLUTION SIMPLE : Remplacer TOUS les retours à la ligne par des espaces
        jsonStr = jsonStr.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');

        // 2b. Fix --- séparateurs non quotés (l'IA oublie parfois les guillemets)
        // Pattern post-flatten : [   ---   "valeur  →  [   "---",   "valeur
        //                         ,   ---   "valeur  →  ,   "---",   "valeur
        //                         ,   ---   ,         →  ,   "---",  (trailing comma fixé étape 4)
        jsonStr = jsonStr.replace(/([\[,]\s*)---(\s*")/g, '$1"---",$2');
        jsonStr = jsonStr.replace(/([\[,]\s*)---(\s*[,\]])/g, '$1"---"$2');

        // 3. Supprimer les backslashes invalides (comme avant)
        let result = '';
        let i = 0;
        
        while (i < jsonStr.length) {
            const char = jsonStr[i];
            const nextChar = i < jsonStr.length - 1 ? jsonStr[i + 1] : '';
            
            if (char === '\\') {
                if (nextChar === '"' || nextChar === '\\' || nextChar === '/' || nextChar === 'u') {
                    // Échappements JSON structurels valides : garder tel quel
                    // NB: b/f/n/r/t EXCLUS volontairement — \frac, \theta, \beta, etc. sont
                    // des commandes LaTeX et ne doivent pas être interprétés comme contrôles JSON
                    result += char + nextChar;
                    i += 2;
                } else {
                    // Échappement LaTeX (\{, \}, \frac, \theta, \mathbb, etc.) ou inconnu :
                    // doubler le backslash → JSON.parse produira \X (littéral) au lieu de supprimer
                    result += '\\\\' + nextChar;
                    i += 2;
                }
            } else {
                result += char;
                i++;
            }
        }

        // 4. Supprimer trailing commas avant } ou ] (ex: {"a":1,} → {"a":1})
        // Doit être après le pass char-by-char car peut créer des commas en trop
        result = result.replace(/,(\s*[}\]])/g, '$1');

        return result;
    }

    /**
     * Parse la reponse de l'IA (JSON)
     */
    function parseAIResponse(content) {
        const originalContent = content;

        // Array response = multi-question (ex: tableau_signes Q1/Q2/Q3) → _perQuestion
        function wrapParsed(parsed) {
            // Fix W2 — IA a retourné string nu (ex: "null", "voir explication") au lieu d'objet JSON
            if (parsed === null || typeof parsed === 'string' || typeof parsed === 'number') {
                LOG.warn('IA réponse non-objet:', parsed);
                return formatSolution({ regle: '', etapes: parsed ? [String(parsed)] : [], reponses: [] });
            }
            if (Array.isArray(parsed) && parsed.length > 0) {
                const perQuestion = parsed.map(p => formatSolution(p).solution);
                const mainResult = formatSolution(parsed[0]);
                mainResult.solution._perQuestion = perQuestion;
                return mainResult;
            }
            return formatSolution(parsed);
        }

        try {
            // Essayer directement d'abord
            const cleaned1 = content.trim();
            let test1 = cleaned1;
            if (cleaned1.startsWith('```')) {
                test1 = cleaned1.replace(/^```json?\s*/, '');
                const closeIdx = test1.indexOf('```');
                if (closeIdx !== -1) test1 = test1.substring(0, closeIdx);
                test1 = test1.trim();
            }

            // Si l'IA a ajouté du texte avant le JSON (ex: "Voici ma réponse:\n{...}")
            // → trouver la position du premier { ou [ et extraire depuis là
            if (!test1.startsWith('{') && !test1.startsWith('[')) {
                const braceIdx  = test1.indexOf('{');
                const bracketIdx = test1.indexOf('[');
                const startIdx = (braceIdx === -1) ? bracketIdx
                               : (bracketIdx === -1) ? braceIdx
                               : Math.min(braceIdx, bracketIdx);
                if (startIdx !== -1) test1 = test1.substring(startIdx);
            }

            const parsed = JSON.parse(test1);
            return wrapParsed(parsed);
        } catch (e1) {
            LOG.debug('Parsing direct echoue, nettoyage ultra-robuste...');

            try {
                // Nettoyer et reessayer
                const cleaned = cleanJSON(content);
                LOG.debug('JSON nettoye (premiers 1000 chars):', cleaned.substring(0, 1000));

                const parsed = JSON.parse(cleaned);
                return wrapParsed(parsed);
            } catch (e2) {
                LOG.error('Erreur parsing JSON apres nettoyage:', e2);

                // Dernier essai : supprimer TOUS les retours a la ligne
                try {
                    const ultraCleaned = cleanJSON(content).replace(/[\r\n]+/g, ' ');
                    LOG.debug('Tentative ultra-nettoyage (sans retours ligne)...');
                    const parsed = JSON.parse(ultraCleaned);
                    return wrapParsed(parsed);
                } catch (e3) {
                    LOG.error('Echec total du parsing JSON. Erreur:', e3?.message);
                    // Capturer extrait début + fin de la réponse brute (toujours visible, pas debug-only)
                    const head = (originalContent || '').substring(0, 500);
                    const tail = (originalContent || '').substring(Math.max(0, (originalContent || '').length - 300));
                    LOG.error(`Réponse IA brute (début 500 chars):\n${head}`);
                    LOG.error(`Réponse IA brute (fin 300 chars):\n${tail}`);
                    Telemetry.incr('parseFailures');
                    // Fallback: extraire manuellement
                    return parseFallback(originalContent);
                }
            }
        }
    }

    /**
     * Formate la solution parsee
     */

    // Valide et nettoie une réponse pour s'assurer qu'elle ne contient pas d'explication
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
                LOG.debug('Réponse invalide détectée (explication):', reponse.substring(0, 50));
                return '';
            }
        }

        // Si la réponse est trop longue (> 100 chars), c'est probablement une explication
        if (reponse.length > 100) {
            LOG.debug('Réponse trop longue, probablement une explication:', reponse.substring(0, 50));
            return '';
        }

        return reponse;
    }

    function formatSolution(parsed) {
        const solution = {
            regle: parsed.regle || parsed.notion || parsed.methode || '',
            exemple: parsed.exemple || null,
            etapes: Array.isArray(parsed.etapes) ? parsed.etapes : [],
            type_exercice: parsed.type_exercice || 'autre',
            reponses: []
        };

        // Préserver le champ tableau pour l'affichage structuré
        if (parsed.tableau && parsed.tableau.headers && Array.isArray(parsed.tableau.rows)) {
            solution.tableau = parsed.tableau;
        }

        // Gérer les réponses (simple ou multiple)
        if (Array.isArray(parsed.reponses)) {
            parsed.reponses.forEach(r => {
                // Si "reponses" (pluriel) au lieu de "reponse" (singulier) → QCM multiple ou tableau objets
                if (r.reponses && Array.isArray(r.reponses)) {
                    // Si c'est un tableau d'objets {case, valeur}, extraire les valeurs en réponses individuelles
                    if (r.reponses.length > 0 && typeof r.reponses[0] === 'object' && r.reponses[0].valeur !== undefined) {
                        r.reponses.forEach((item, idx) => {
                            solution.reponses.push({
                                question: r.question ? `${r.question}.${idx + 1}` : idx + 1,
                                type: r.type || 'input',
                                reponse: validateReponse(String(item.valeur)),
                                explication: r.explication || ''
                            });
                        });
                    } else {
                        // QCM avec plusieurs réponses : ["A.xxx", "B.yyy", "D.zzz"]
                        // Extraire juste les lettres : "A, B, D"
                        const lettres = r.reponses.map(rep => {
                            if (typeof rep !== 'string') return String(rep);
                            const match = rep.match(/^([A-Z])\./);
                            return match ? match[1] : rep;
                        }).join(', ');

                        solution.reponses.push({
                            question: r.question,
                            type: r.type || 'qcm',
                            reponse: validateReponse(lettres),
                            explication: r.explication || ''
                        });
                    }
                } else if (r.reponse) {
                    // Normaliser reponse en string si l'IA renvoie un array/objet
                    let rawReponse = r.reponse;
                    if (Array.isArray(rawReponse)) {
                        // Array d'objets → extraire les valeurs utiles en réponses individuelles
                        rawReponse.forEach((item, idx) => {
                            const val = typeof item === 'string' ? item : (item.symbole || item.valeur || item.reponse || item.description || JSON.stringify(item));
                            solution.reponses.push({
                                question: r.question ? `${r.question}.${idx + 1}` : idx + 1,
                                type: r.type || 'input',
                                reponse: validateReponse(String(val)),
                                explication: r.explication || ''
                            });
                        });
                    } else if (typeof rawReponse === 'object') {
                        const val = rawReponse.symbole || rawReponse.valeur || rawReponse.reponse || rawReponse.description || JSON.stringify(rawReponse);
                        solution.reponses.push({
                            question: r.question,
                            type: r.type || 'input',
                            reponse: validateReponse(String(val)),
                            explication: r.explication || ''
                        });
                    } else {
                        // String normal - VALIDER la réponse
                        const cleanReponse = validateReponse(rawReponse);
                        solution.reponses.push({
                            question: r.question,
                            type: r.type || 'qcm',
                            reponse: cleanReponse,
                            explication: r.explication || ''
                        });
                    }
                } else if (r.r !== undefined) {
                    // Fix W1 — Champ alternatif "r" au lieu de "reponse" (l'IA écrit parfois différemment)
                    solution.reponses.push({
                        question: r.question,
                        type: r.type || 'input',
                        reponse: validateReponse(String(r.r)),
                        explication: r.explication || ''
                    });
                }
            });
            // Fix W6 — warn si extraction silencieusement vide alors que parsed contenait des items
            if (solution.reponses.length === 0 && parsed.reponses.length > 0) {
                LOG.warn(`formatSolution: 0/${parsed.reponses.length} réponses extraites — format IA non reconnu`);
            }
        }

        // Si données d'inéquation structurées, construire l'intervalle automatiquement
        if (parsed.inequation && parsed.inequation.critiques && parsed.inequation.signes && parsed.inequation.comparaison) {
            const ineq = parsed.inequation;

            // Extraire la comparaison depuis le contexte de la question (plus fiable que l'IA)
            // L'IA peut confondre > et >= (ex: "(1)/(x)>4" → IA écrit ">=" au lieu de ">")
            let comp = ineq.comparaison.replace('≥', '>=').replace('≤', '<=');
            const questionCtx = (currentExercise?.questions?.[0]?.context || '').replace(/\s/g, '');
            // Chercher l'opérateur dans le contexte : >=, <=, ≥, ≤, >, <
            const ctxCompMatch = questionCtx.match(/(>=|<=|≥|≤|[><])/);
            if (ctxCompMatch) {
                const ctxComp = ctxCompMatch[1].replace('≥', '>=').replace('≤', '<=');
                if (ctxComp !== comp) {
                    LOG.debug('⚠️ Comparaison IA corrigée:', comp, '→', ctxComp, '(depuis le contexte)');
                    comp = ctxComp;
                }
            }
            const intervalResult = buildIntervalFromSigns(
                ineq.critiques,
                ineq.interdites || [],
                ineq.signes,
                comp
            );
            LOG.debug('🔧 Intervalle construit par le code:', intervalResult);
            LOG.debug('   Données IA:', JSON.stringify(ineq));

            // Si construction réussie → utiliser l'intervalle construit (plus fiable pour les crochets)
            // Sinon → garder la réponse texte de l'IA (toujours présente grâce au prompt)
            if (intervalResult !== null) {
                if (solution.reponses.length > 0) {
                    solution.reponses[0].reponse = intervalResult;
                } else {
                    solution.reponses.push({
                        question: 1,
                        type: 'input',
                        reponse: intervalResult,
                        explication: ''
                    });
                }
            } else {
                let fallbackReponse = solution.reponses?.[0]?.reponse || '';
                if (!fallbackReponse || fallbackReponse === 'auto' || fallbackReponse === 'IGNORÉ (calculé auto)') {
                    LOG.error('❌ Construction échouée et pas de réponse IA exploitable');
                } else {
                    // Corriger les bornes inversées dans la réponse IA (ex: ]-(9)/(7);-(3)/(2)[ → ]-(3)/(2);-(9)/(7)[)
                    fallbackReponse = fixIntervalBounds(fallbackReponse);
                    solution.reponses[0].reponse = fallbackReponse;
                    LOG.warn('⚠️ Construction intervalle échouée, réponse IA corrigée:', fallbackReponse);
                }
            }
        }

        LOG.debug('Solution parsee:', solution);
        return { solution };
    }

    /**
     * Fallback si le JSON n'est pas valide
     */
    function parseFallback(content) {
        LOG.debug('Utilisation du fallback parsing');

        // Fix W7 — guard si appelé hors flow normal (prefetch sans currentExercise set, edge case async)
        if (!currentExercise || !Array.isArray(currentExercise.questions)) {
            LOG.error('parseFallback sans currentExercise — return solution vide');
            return { solution: { regle: '', exemple: null, etapes: [], reponses: [] } };
        }

        const solution = {
            regle: '',
            exemple: null,
            etapes: [],
            reponses: []
        };

        // Extraire la règle (ou notion en fallback)
        const regleMatch = content.match(/"regle"\s*:\s*"([^"]+)"/);
        if (regleMatch) {
            solution.regle = regleMatch[1];
        } else {
            const notionMatch = content.match(/"notion"\s*:\s*"([^"]+)"/);
            if (notionMatch) solution.regle = notionMatch[1];
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

        LOG.debug('Fallback - reponses extraites:', solution.reponses);
        return { solution };
    }

    // ===========================================
    // ACTIONS
    // ===========================================

    async function handleAction(action) {
        LOG.debug('Action:', action);

        if (isLoading) return;

        if (!currentExercise || currentExercise.questions.length === 0) {
            showResponse('Aucun exercice détecté sur cette page.', 'error');
            return;
        }

        isLoading = true;
        disableButtons(true);

        if (!cachedSolution) {
            // 0. Solvers directs (priorité max — override tout cache IA)
            const directSolutionPeda = tryDirectSolve();
            if (directSolutionPeda) {
                LOG.info('Résolution directe (péda) — bypass cache');
                cachedSolution = directSolutionPeda;
                cachedSolution._exerciseHash = lastExerciseHash;
                updateStatus('✓ Résolu (instantané)', 'success');
            } else {
            // Vérifier le prefetch cache d'abord
            const exId = extractExerciseIdFromUrl();
            const prefetched = exId ? getPrefetchedSolution(exId) : null;

            if (prefetched) {
                LOG.info('Utilisation solution prefetchée (péda)');
                cachedSolution = prefetched.solution;
                cachedSolution._exerciseHash = lastExerciseHash;
                updateStatus('✓ Résolu (instantané)', 'success');
            } else {
                showLoading('Résolution...');
                updateStatus('Calcul...', 'loading');

                let result = await solveProblem();

                if (result.error) {
                    isLoading = false;
                    disableButtons(false);
                    updateStatus('');
                    showResponse(result.error, 'error');
                    return;
                }

                // Retry silencieux si réponse vide (R1 — IA renvoie parfois objet vide)
                if (!isValidSolution(result.solution)) {
                    LOG.warn('Réponse IA vide, retry silencieux...');
                    updateStatus('Retry...', 'loading');
                    result = await solveProblem();
                }

                cachedSolution = result.solution;

                if (!isValidSolution(cachedSolution)) {
                    cachedSolution = null;
                    isLoading = false;
                    disableButtons(false);
                    updateStatus('');
                    showResponse('L\'IA a retourné une réponse vide. Réessayez.', 'error');
                    return;
                }

                updateStatus('✓ Résolu', 'success');
            }
            } // fin else (direct solver miss → prefetch / IA)
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

    /**
     * Nettoie le texte IA : supprime les marqueurs parasites (××, **, __, listes numérotées)
     */
    function cleanText(text) {
        if (!text) return '';
        return String(text)
            .replace(/××([^×]*)××/g, '$1')
            .replace(/\*\*([^*]*)\*\*/g, '$1')
            .replace(/\b\d+\.\s+/g, '')
            .replace(/^[-•]\s+/gm, '')
            .trim();
    }

    /**
     * Nettoie la règle : garde uniquement la première phrase, max 160 chars
     */
    function cleanRegle(text) {
        if (!text) return '';
        let clean = cleanText(text);
        // Garder seulement la première phrase
        const firstSentence = clean.match(/^[^.!?\n]+[.!?]?/);
        if (firstSentence) clean = firstSentence[0].trim();
        // Tronquer si trop long
        if (clean.length > 160) clean = clean.slice(0, 157) + '…';
        return clean;
    }

    /**
     * Rendu des étapes pédagogiques
     * Accepte string[], {calculs[]}[] ou mix (rétrocompat)
     * "---" → séparateur visuel entre phases
     */
    function renderSteps(etapes) {
        if (!etapes || etapes.length === 0) return '';
        const lines = [];
        etapes.forEach(e => {
            if (typeof e === 'string') {
                lines.push(e);
            } else if (Array.isArray(e.calculs)) {
                e.calculs.forEach(c => lines.push(c));
            }
        });
        if (lines.length === 0) return '';
        // Déterminer l'index de la dernière ligne non-séparateur
        const lastContentIndex = lines.reduce((last, line, i) => line === '---' ? last : i, -1);
        return `<div class="kwyk-steps">${lines.map((line, i) => {
            if (line === '---') return `<hr class="kwyk-step-sep">`;
            const isLast = i === lastContentIndex;
            return `<div class="kwyk-step-calc${isLast ? ' kwyk-step-calc-last' : ''}">${formatFractions(escapeHtml(cleanText(line)))}</div>`;
        }).join('')}</div>`;
    }

    function displaySolutionForQuestion(questionIndex, mode = 'answer') {
        if (!cachedSolution) return;

        // Utiliser la solution individuelle si disponible (exercice mixte avec appels séparés)
        const s = (cachedSolution._perQuestion && cachedSolution._perQuestion[questionIndex])
            ? cachedSolution._perQuestion[questionIndex]
            : cachedSolution;

        const question = currentExercise.questions[questionIndex];
        // La réponse est à l'index 0 dans la solution individuelle, ou à questionIndex dans la solution fusionnée
        const reponse = (cachedSolution._perQuestion && cachedSolution._perQuestion[questionIndex])
            ? s.reponses?.[0]
            : s.reponses?.[questionIndex];

        if (!question || !reponse) {
            showResponse(`Pas de solution pour la question ${questionIndex + 1}`, 'error');
            return;
        }

        let html = '';

        switch (mode) {
            case 'explain':
                html = `
                    ${s.regle ? `<div class="kwyk-rule-box">📐 ${formatFractions(escapeHtml(cleanRegle(s.regle)))}</div>` : ''}
                    ${renderSteps(s.etapes)}
                `;
                break;

            case 'hint':
                html = `
                    ${s.regle ? `<div class="kwyk-rule-box">📐 ${formatFractions(escapeHtml(cleanRegle(s.regle)))}</div>` : ''}
                    ${s.exemple ? `<div class="kwyk-exemple-box">
                        <div class="kwyk-exemple-title">📖 Exemple</div>
                        ${s.exemple.enonce ? `<div class="kwyk-exemple-enonce">${formatFractions(escapeHtml(cleanText(s.exemple.enonce)))}</div>` : ''}
                        ${renderSteps(s.exemple.etapes)}
                    </div>` : ''}
                `;
                break;

            case 'answer':
                if (s.tableau) {
                    if (s.tableau.type === 'variation') {
                        html = renderVariationTable(s.tableau);
                    } else {
                        html = renderSignTable(s.tableau);
                    }
                } else {
                    html = renderSingleAnswer(reponse, question);
                }
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
                    ${s.regle ? `<div class="kwyk-rule-box">📐 ${formatFractions(escapeHtml(cleanRegle(s.regle)))}</div>` : ''}
                    ${renderSteps(s.etapes)}
                `;
                break;

            case 'hint':
                html = `
                    ${s.regle ? `<div class="kwyk-rule-box">📐 ${formatFractions(escapeHtml(cleanRegle(s.regle)))}</div>` : ''}
                    ${s.exemple ? `<div class="kwyk-exemple-box">
                        <div class="kwyk-exemple-title">📖 Exemple</div>
                        ${s.exemple.enonce ? `<div class="kwyk-exemple-enonce">${formatFractions(escapeHtml(cleanText(s.exemple.enonce)))}</div>` : ''}
                        ${renderSteps(s.exemple.etapes)}
                    </div>` : ''}
                `;
                break;

            case 'answer':
                if (s.tableau) {
                    if (s.tableau.type === 'variation') {
                        html = renderVariationTable(s.tableau);
                    } else {
                        html = renderSignTable(s.tableau);
                    }
                } else {
                    html = renderAllAnswers(s.reponses);
                }
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

    /**
     * V14: Affiche un tableau de signes/variation structuré
     */
    /**
     * Convertit la notation (a)/(b) en fraction HTML <sup>a</sup>&frasl;<sub>b</sub>
     */
    function formatFractionHtml(str) {
        return String(str).replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '<sup>$1</sup>&frasl;<sub>$2</sub>');
    }

    function renderSignTable(tableau) {
        let html = '<div class="kwyk-sign-table-wrapper">';
        html += '<table class="kwyk-sign-table">';

        // Alignement correct du tableau de signes
        // -∞ au-dessus du premier signe, +∞ au-dessus du dernier signe
        // Colonnes vides seulement entre les valeurs critiques
        //
        // Exemple: headers [x, -∞, -1, 2/3, +∞], values [+, 0, -, 0, +]
        // Header:  x | -∞ | -1 |    | 2/3 | +∞
        // Values: f(x)| +  |  0 |  - |  0  |  +
        const boundaries = tableau.headers.slice(1); // [-∞, c1, c2, ..., +∞]
        const criticals = boundaries.slice(1, -1);   // [c1, c2, ...] sans ±∞

        // Construire le header étendu : -∞, c1, (vide), c2, (vide), c3, +∞
        html += '<tr class="kwyk-sign-table-header">';
        html += `<th>${formatFractionHtml(escapeHtml(String(tableau.headers[0] || 'x')))}</th>`;
        html += `<th>${formatFractionHtml(escapeHtml(String(boundaries[0] || '-∞')))}</th>`; // -∞
        for (let i = 0; i < criticals.length; i++) {
            html += `<th>${formatFractionHtml(escapeHtml(String(criticals[i])))}</th>`;
            if (i < criticals.length - 1) {
                html += '<th></th>'; // colonne vide entre deux valeurs critiques
            }
        }
        html += `<th>${formatFractionHtml(escapeHtml(String(boundaries[boundaries.length - 1] || '+∞')))}</th>`; // +∞
        html += '</tr>';

        // Nombre total de colonnes data = boundaries + (criticals - 1) vides
        const totalCols = boundaries.length + Math.max(0, criticals.length - 1);

        // Ligne de valeurs : les values se mappent 1:1 sur les colonnes
        tableau.rows.forEach(row => {
            const vals = row.values || [];
            html += '<tr>';
            html += `<td class="kwyk-sign-table-label">${escapeHtml(String(row.label || 'f(x)'))}</td>`;

            for (let i = 0; i < totalCols; i++) {
                const val = i < vals.length ? String(vals[i]) : '';
                let cls = '';
                if (val === '+') cls = 'sign-pos';
                else if (val === '-' || val === '\u2212') cls = 'sign-neg';
                else if (val === '0') cls = 'sign-zero';
                else if (val === '↗') cls = 'sign-up';
                else if (val === '↘') cls = 'sign-down';
                else if (val === '||') cls = 'sign-forbidden';
                else if (val === '') cls = 'sign-empty';
                html += `<td class="kwyk-sign-table-val ${cls}">${val ? escapeHtml(val) : ''}</td>`;
            }
            html += '</tr>';
        });

        html += '</table></div>';
        return html;
    }

    /**
     * Affiche un tableau de variations simple (flèches uniquement, sans valeurs de f aux bornes).
     * Format values: ["↘", "||", "↘"] ou ["↗", "↘"]
     * Produit: x | -∞ | (interval) | 0(sep) | (interval) | +∞
     *          f |    |     ↘      |  ||   |      ↘      |
     */
    function renderSimpleVariationTable(tableau) {
        const headers = tableau.headers || [];
        const rows = tableau.rows || [];
        const boundaries = headers.slice(1);
        const firstValues = rows.length > 0 ? (rows[0].values || []).map(String) : [];

        // Construire les colonnes en intercalant bornes et intervalles
        // Ex: boundaries=["-∞","0","+∞"], values=["↘","||","↘"]
        // → cols: [boundary:-∞, interval:↘, separator:0, interval:↘, boundary:+∞]
        const cols = [];
        let bIdx = 0;
        cols.push({ type: 'boundary', label: boundaries[bIdx++] || '' });
        for (let i = 0; i < firstValues.length; i++) {
            const val = firstValues[i];
            if (val === '||') {
                cols.push({ type: 'separator', label: boundaries[bIdx++] || '' });
            } else {
                cols.push({ type: 'interval', arrow: val });
            }
        }
        if (firstValues.length > 0 && firstValues[firstValues.length - 1] !== '||') {
            cols.push({ type: 'boundary', label: boundaries[bIdx] || '' });
        }

        let html = '<div class="kwyk-variation-table-wrapper">';
        html += '<table class="kwyk-variation-table">';

        // Ligne x (header)
        html += '<tr class="kwyk-variation-header">';
        html += `<th>${escapeHtml(String(headers[0] || 'x'))}</th>`;
        cols.forEach(col => {
            if (col.type === 'separator') {
                html += `<th class="kwyk-variation-separator">${formatFractionHtml(escapeHtml(col.label))}</th>`;
            } else if (col.type === 'boundary') {
                html += `<th>${formatFractionHtml(escapeHtml(col.label))}</th>`;
            } else {
                html += '<th></th>';
            }
        });
        html += '</tr>';

        // Lignes f (3 sous-lignes : haut / flèche / bas)
        rows.forEach(row => {
            const vals = (row.values || []).map(String);
            const fCols = [{ type: 'boundary' }];
            for (const v of vals) {
                fCols.push(v === '||' ? { type: 'separator' } : { type: 'arrow', arrow: v });
            }
            if (vals.length > 0 && vals[vals.length - 1] !== '||') {
                fCols.push({ type: 'boundary' });
            }

            html += '<tr class="kwyk-variation-row-high">';
            html += `<td class="kwyk-variation-label" rowspan="3">${escapeHtml(String(row.label))}</td>`;
            fCols.forEach(col => {
                if (col.type === 'separator') {
                    html += '<td class="kwyk-variation-separator" rowspan="3"></td>';
                } else {
                    html += '<td class="kwyk-variation-empty"></td>';
                }
            });
            html += '</tr>';

            html += '<tr class="kwyk-variation-row-arrow">';
            fCols.forEach(col => {
                if (col.type === 'separator') return;
                if (col.type === 'arrow') {
                    const cls = col.arrow === '↗' ? 'arrow-up' : 'arrow-down';
                    html += `<td class="kwyk-variation-arrow ${cls}">${escapeHtml(col.arrow)}</td>`;
                } else {
                    html += '<td class="kwyk-variation-empty"></td>';
                }
            });
            html += '</tr>';

            html += '<tr class="kwyk-variation-row-low">';
            fCols.forEach(col => {
                if (col.type === 'separator') return;
                html += '<td class="kwyk-variation-empty"></td>';
            });
            html += '</tr>';
        });

        html += '</table></div>';
        return html;
    }

    /**
     * V14: Affiche un tableau de variations avec positionnement haut/bas des valeurs
     * Les valeurs alternent avec les flèches dans row.values.
     * Position déduite : avant ↗ = bas, après ↗ = haut, avant ↘ = haut, après ↘ = bas.
     */
    function renderVariationTable(tableau) {
        const rows = tableau.rows || [];
        const firstValues = rows.length > 0 ? (rows[0].values || []) : [];

        // Format simple : uniquement des flèches et séparateurs (pas de valeurs numériques de f)
        const isSimple = firstValues.length > 0 && firstValues.every(v => {
            const s = String(v);
            return s === '↗' || s === '↘' || s === '||';
        });
        if (isSimple) return renderSimpleVariationTable(tableau);

        const headers = tableau.headers || [];
        // Bornes = headers sans le premier élément "x" (qui est le label de la ligne d'en-tête)
        const boundaries = headers.slice(1);

        let html = '<div class="kwyk-variation-table-wrapper">';
        html += '<table class="kwyk-variation-table">';

        // Ligne d'en-tête — première colonne "x", puis une colonne par valeur dans values
        // Les flèches reçoivent un <th> vide, les valeurs numériques reçoivent la borne correspondante
        html += '<tr class="kwyk-variation-header">';
        html += `<th>${escapeHtml(String(headers[0] || 'x'))}</th>`;
        let boundIdx = 0;
        for (let i = 0; i < firstValues.length; i++) {
            const val = String(firstValues[i]);
            const nextVal = i + 1 < firstValues.length ? String(firstValues[i + 1]) : null;
            const prevVal = i - 1 >= 0 ? String(firstValues[i - 1]) : null;

            if (val === '↗' || val === '↘') {
                html += '<th></th>';
            } else if (val === '||') {
                // Le séparateur correspond à la borne exclue → lui attribuer la borne x
                const label = boundIdx < boundaries.length ? boundaries[boundIdx] : '';
                html += `<th class="kwyk-variation-separator" style="width:6px;padding:0;font-size:11px">${formatFractionHtml(escapeHtml(String(label)))}</th>`;
                boundIdx++;
            } else if (nextVal === '||' || prevVal === '||') {
                // Valeur limite adjacente au séparateur → pas de borne x (c'est une limite, pas une borne)
                html += '<th></th>';
            } else {
                const label = boundIdx < boundaries.length ? boundaries[boundIdx] : '';
                html += `<th>${formatFractionHtml(escapeHtml(String(label)))}</th>`;
                boundIdx++;
            }
        }
        html += '</tr>';

        // Lignes de variation (chaque row génère 3 sous-lignes : haut, flèche, bas)
        rows.forEach(row => {
            const values = row.values || [];

            // Déterminer la position (haut/bas) de chaque valeur
            const positions = [];
            for (let i = 0; i < values.length; i++) {
                const val = String(values[i]);
                if (val === '↗' || val === '↘') {
                    positions.push('arrow');
                } else if (val === '||') {
                    positions.push('separator');
                } else {
                    const nextVal = i + 1 < values.length ? String(values[i + 1]) : null;
                    const prevVal = i - 1 >= 0 ? String(values[i - 1]) : null;

                    if (nextVal === '↗' || prevVal === '↘') {
                        positions.push('low');
                    } else if (nextVal === '↘' || prevVal === '↗') {
                        positions.push('high');
                    } else if (prevVal === '||') {
                        // Valeur juste après une discontinuité → commence en haut
                        positions.push('high');
                    } else if (nextVal === '||') {
                        // Valeur juste avant une discontinuité → finit en bas
                        positions.push('low');
                    } else {
                        positions.push('high');
                    }
                }
            }

            // Sous-ligne haute (avec label f(x) en rowspan=3)
            html += '<tr class="kwyk-variation-row-high">';
            html += `<td class="kwyk-variation-label" rowspan="3">${escapeHtml(String(row.label))}</td>`;
            for (let i = 0; i < values.length; i++) {
                if (positions[i] === 'separator') {
                    html += '<td class="kwyk-variation-separator" rowspan="3"></td>';
                } else if (positions[i] === 'high') {
                    html += `<td class="kwyk-variation-val high">${escapeHtml(String(values[i]))}</td>`;
                } else {
                    html += '<td class="kwyk-variation-empty"></td>';
                }
            }
            html += '</tr>';

            // Sous-ligne flèche
            html += '<tr class="kwyk-variation-row-arrow">';
            for (let i = 0; i < values.length; i++) {
                if (positions[i] === 'separator') continue; // rowspan déjà posé
                const val = String(values[i]);
                if (positions[i] === 'arrow') {
                    const arrowCls = val === '↗' ? 'arrow-up' : 'arrow-down';
                    html += `<td class="kwyk-variation-arrow ${arrowCls}">${escapeHtml(val)}</td>`;
                } else {
                    html += '<td class="kwyk-variation-empty"></td>';
                }
            }
            html += '</tr>';

            // Sous-ligne basse
            html += '<tr class="kwyk-variation-row-low">';
            for (let i = 0; i < values.length; i++) {
                if (positions[i] === 'separator') continue; // rowspan déjà posé
                if (positions[i] === 'low') {
                    html += `<td class="kwyk-variation-val low">${escapeHtml(String(values[i]))}</td>`;
                } else {
                    html += '<td class="kwyk-variation-empty"></td>';
                }
            }
            html += '</tr>';
        });

        html += '</table></div>';
        return html;
    }

    // ===========================================
    // AFFICHAGE
    // ===========================================

    function showLoading(text = 'Réflexion...') {
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

        // 0. LATEX → LISIBLE (nettoie les résidus LaTeX de l'IA avant tout autre traitement)
        // Délimiteurs math
        result = result.replace(/\\\(|\\\)/g, '');
        result = result.replace(/\\\[|\\\]/g, '');
        result = result.replace(/\$\$([^$]+)\$\$/g, '$1');
        result = result.replace(/\$([^$\n]+)\$/g, '$1');
        // Vecteurs LaTeX → span kwyk-vec (avant la détection AB→ ci-dessous)
        result = result.replace(/\\overrightarrow\{([^}]+)\}/g, '<span class="kwyk-vec">$1</span>');
        result = result.replace(/\\vec\{([^}]+)\}/g, '<span class="kwyk-vec">$1</span>');
        // Fractions LaTeX → (a)/(b) (puis converties en HTML ci-dessous)
        result = result.replace(/\\d?frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
        // Racines LaTeX
        result = result.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');
        // Crochets inverses interdits → directs
        result = result.replace(/\\left\]/g, ']').replace(/\\right\[/g, '[');
        result = result.replace(/\\left\[/g, '[').replace(/\\right\]/g, ']');
        result = result.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')');
        // Opérateurs et symboles
        result = result.replace(/\\infty/g, '∞');
        result = result.replace(/\\times/g, '×');
        result = result.replace(/\\cdot/g, '·');
        result = result.replace(/\\neq/g, '≠');
        result = result.replace(/\\leq/g, '≤');
        result = result.replace(/\\geq/g, '≥');
        result = result.replace(/\\text\{([^}]+)\}/g, '$1');
        result = result.replace(/\\[a-zA-Z]+\{([^}]+)\}/g, '$1'); // fallback: \cmd{x} → x

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
        // Coefficients fractionnaires en notation (a/b) → fraction HTML directe (sans parens extérieures)
        // Ex: (7/3)u→ → [frac 7/3]u→  (évite ((7)/(3))u→ avec double parens)
        result = result.replace(/\((-?\d+)\/(\d+)\)/g,
            '<span class="kwyk-fraction"><span class="kwyk-frac-num">$1</span><span class="kwyk-frac-den">$2</span></span>'
        );

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

        // Vecteurs : AB→ ou u→ → <span class="kwyk-vec">AB</span>
        // Matcher 2 majuscules (AB→) ou 1 lettre quelconque (u→, v→)
        // Le → doit être directement après les lettres (pas d'espace) → pas de faux positifs avec "texte → résultat"
        result = result.replace(/([A-Z]{1,2}|[a-zA-Z])\u2192/g,
            '<span class="kwyk-vec">$1</span>');

        return result;
    }

    function disableButtons(disabled) {
        ['btn-explain', 'btn-hint', 'btn-answer'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = disabled;
        });
    }

    // ===========================================
    // DEBUG HELPER — kwykDebug()
    // ===========================================
    // Appeler depuis la console Chrome pour obtenir un snapshot complet.
    // Nécessite que window._kwykGetState soit disponible (défini au démarrage de l'IIFE).

    window.kwykDebug = function() {
        const s = window._kwykGetState?.();
        if (!s) {
            console.warn('[kwykDebug] Extension non chargée ou _kwykGetState absent');
            return null;
        }
        const ex = s.exercise;
        const lx = s.exchange;

        console.group('%c[kwykDebug] ══ KWYK TUTOR SNAPSHOT ══', 'color:#7c3aed;font-weight:bold;font-size:13px');

        console.group('📌 Exercice courant');
        console.log('Type global      :', ex?.exerciseType ?? '—');
        console.log('Texte extrait    :', ex?.texte?.substring(0, 300) ?? '—');
        console.log('sharedContext    :', ex?.sharedContext ?? '—');
        console.log('Nb questions     :', ex?.questions?.length ?? 0);
        (ex?.questions ?? []).forEach((q, i) => {
            console.log(
                `  Q${i + 1}`,
                '| DOM type:', q.type,
                '| questionType:', q.questionType,
                '| answerFormat:', q.answerFormat || '?',
                '| context:', (q.context ?? '').substring(0, 150)
            );
        });
        console.groupEnd();

        console.group('🤖 Dernier échange IA');
        console.log('promptType       :', lx?.type ?? '— (aucun appel depuis chargement)');
        if (lx?.systemPrompt) {
            console.log('System prompt    :\n' + lx.systemPrompt);
            console.log('User prompt      :\n' + lx.userPrompt);
            console.log('Réponse brute    :\n' + (lx.rawResponse ?? '— (pas encore reçue)'));
        }
        console.groupEnd();

        console.group('💾 Cache & Prefetch');
        console.log('cachedSolution   :', s.cached ?? 'null');
        console.log('prefetchCache    :', Object.keys(s.prefetch ?? {}).length, 'entrées');
        console.groupEnd();

        console.group('⚙️ État général');
        console.log('Mode triche actif:', s.cheatActive);
        console.groupEnd();

        console.groupEnd();
        console.log('%c→ Objet retourné pour inspection dans la console', 'color:#6b7280;font-size:11px');
        return s;
    };

    // Bridge MAIN world : répond aux requêtes de debug venant d'inject.js
    document.addEventListener('kwyk:debug:request', function() {
        const s = window._kwykGetState?.();
        let payload;
        try {
            payload = {
                exercise: s?.exercise ? {
                    exerciseType: s.exercise.exerciseType,
                    texte:        s.exercise.texte,
                    sharedContext: s.exercise.sharedContext,
                    exerciseId:   s.exercise.exerciseId,
                    questions: (s.exercise.questions || []).map(q => ({
                        index:        q.index,
                        type:         q.type,
                        questionType: q.questionType,
                        label:        q.label,
                        context:      q.context
                    }))
                } : null,
                cached:      s?.cached ?? null,
                cheatActive: s?.cheatActive ?? false,
                prefetch:    Object.keys(s?.prefetch || {}),
                exchange: s?.exchange ? {
                    type:         s.exchange.type,
                    systemPrompt: s.exchange.systemPrompt,
                    userPrompt:   s.exchange.userPrompt,
                    rawResponse:  s.exchange.rawResponse
                } : null
            };
        } catch (e) {
            payload = { error: 'Sérialisation échouée : ' + e.message };
        }
        document.dispatchEvent(new CustomEvent('kwyk:debug:response', {
            detail: JSON.stringify(payload)
        }));
    });

    // ===========================================
    // START
    // ===========================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

