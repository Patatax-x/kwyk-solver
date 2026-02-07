// Service worker minimal pour Kwyk Tutor V13
// Gère le rechargement automatique après mise à jour

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.action === 'reloadExtension') {
        // Recharger la page d'abord, puis l'extension
        if (sender.tab) {
            chrome.tabs.reload(sender.tab.id, () => {
                // Petit délai pour que le reload de la page commence
                setTimeout(() => chrome.runtime.reload(), 500);
            });
        } else {
            chrome.runtime.reload();
        }
    }
});
