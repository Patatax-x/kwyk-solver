(function () {
    'use strict';

    const SITE_URL = 'https://patatax-x.github.io/kwyk-solver/';

    function createButton() {
        const btn = document.createElement('div');
        btn.id = 'kwyk-tutor-btn';
        btn.textContent = 'KT';
        btn.addEventListener('click', togglePopup);
        document.body.appendChild(btn);
    }

    function createPopup() {
        const popup = document.createElement('div');
        popup.id = 'kwyk-deprecated-popup';
        popup.style.display = 'none';
        popup.innerHTML = `
            <div style="font-size:20px;margin-bottom:10px;text-align:center;">🔒</div>
            <div style="font-weight:700;font-size:13px;color:#eaeaea;margin-bottom:10px;text-align:center;">Cette version de Kwyk Tutor est obsolète.</div>
            <div style="font-size:13px;color:#eaeaea;margin-bottom:12px;">Installe la version officielle : <a href="${SITE_URL}" target="_blank" style="color:#f87171;text-decoration:underline;">Site officiel</a></div>
            <div style="border-top:1px solid rgba(231,76,60,0.3);padding-top:10px;font-size:12px;color:#9ca3af;">
                Supprime le dossier <strong style="color:#eaeaea;">Kwyk Tutor</strong> de tes documents.
            </div>
        `;
        document.body.appendChild(popup);
    }

    function togglePopup() {
        const popup = document.getElementById('kwyk-deprecated-popup');
        if (!popup) return;
        popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    }

    function toggleAll() {
        const btn   = document.getElementById('kwyk-tutor-btn');
        const popup = document.getElementById('kwyk-deprecated-popup');
        if (!btn) return;
        const hidden = btn.style.display === 'none';
        btn.style.display   = hidden ? '' : 'none';
        if (popup) popup.style.display = 'none'; // ferme popup à chaque toggle
    }

    function init() {
        createButton();
        createPopup();
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); toggleAll(); }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
