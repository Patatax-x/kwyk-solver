/**
 * Kwyk Tutor V14 - Script injecté dans le contexte de la page
 * Permet d'accéder à MathQuill (MQ) qui n'est pas accessible depuis le content script
 *
 * V12: Utilise write() au lieu de latex() pour préserver le format LaTeX exact
 *      (latex() convertit \mathbb{R} en ℝ Unicode, write() garde \mathbb{R})
 */

(function() {
    'use strict';

    console.log('[Kwyk Tutor Inject] Script chargé dans le contexte de la page');

    // Écouter les messages du content script
    window.addEventListener('message', function(event) {
        // Vérifier que le message vient de notre extension
        if (event.data && event.data.type === 'KWYK_TUTOR_FILL') {
            const { latex, callbackId, fieldIndex = 0 } = event.data;

            console.log('[Kwyk Tutor Inject] Reçu demande de remplissage:', latex, 'fieldIndex:', fieldIndex);

            try {
                // Trouver TOUS les champs MathQuill (deux sélecteurs possibles)
                let mqFields = document.querySelectorAll('.mq-editable-field.input-kwyk');
                if (mqFields.length === 0) {
                    mqFields = document.querySelectorAll('.mq-math-mode.input-kwyk');
                }

                console.log('[Kwyk Tutor Inject] Nombre de champs MQ trouvés:', mqFields.length);

                if (!mqFields || mqFields.length === 0) {
                    console.error('[Kwyk Tutor Inject] Aucun champ MathQuill trouvé');
                    window.postMessage({ type: callbackId, success: false, error: 'Champ non trouvé' }, '*');
                    return;
                }

                // Sélectionner le champ à l'index demandé
                const mqField = mqFields[fieldIndex];

                if (!mqField) {
                    console.error('[Kwyk Tutor Inject] Champ MathQuill index', fieldIndex, 'non trouvé');
                    window.postMessage({ type: callbackId, success: false, error: `Champ ${fieldIndex} non trouvé` }, '*');
                    return;
                }

                // Vérifier que MQ existe
                if (typeof MQ === 'undefined') {
                    console.error('[Kwyk Tutor Inject] MQ non défini');
                    window.postMessage({ type: callbackId, success: false, error: 'MQ non défini' }, '*');
                    return;
                }

                // Obtenir l'instance MathQuill
                const mathField = MQ(mqField);

                if (!mathField || !mathField.latex) {
                    console.error('[Kwyk Tutor Inject] Instance MathQuill invalide');
                    window.postMessage({ type: callbackId, success: false, error: 'Instance invalide' }, '*');
                    return;
                }

                // V12: Utiliser write() au lieu de latex() pour préserver le format exact
                // latex() convertit \mathbb{R} en ℝ (Unicode) → Kwyk compte faux
                // write() garde \mathbb{R} tel quel → Kwyk accepte
                mathField.latex(''); // Effacer le champ d'abord
                mathField.write(latex); // Insérer avec write() qui préserve le LaTeX

                console.log('[Kwyk Tutor Inject] LaTeX inséré avec write() (index', fieldIndex + '):', latex);
                console.log('[Kwyk Tutor Inject] Vérification stockage:', mathField.latex());
                window.postMessage({ type: callbackId, success: true }, '*');

            } catch (e) {
                console.error('[Kwyk Tutor Inject] Erreur:', e);
                window.postMessage({ type: callbackId, success: false, error: e.message }, '*');
            }
        }
    });

    // Signaler que le script est prêt
    window.postMessage({ type: 'KWYK_TUTOR_INJECT_READY' }, '*');
})();
