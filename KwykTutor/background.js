// Service worker minimal pour Kwyk Tutor V13
// Gère le rechargement automatique après mise à jour

chrome.runtime.onMessage.addListener((message, sender) => {
    console.log('[Kwyk Background] Message reçu:', message.action);
    if (message.action === 'reloadExtension') {
        // Sauvegarder l'onglet à recharger après le reload de l'extension
        if (sender.tab) {
            chrome.storage.local.set({ kwykReloadTabId: sender.tab.id });
        }
        console.log('[Kwyk Background] Rechargement de l\'extension...');
        // Recharger l'extension (prend les nouveaux fichiers depuis le disque)
        chrome.runtime.reload();
    }
});

// Après reload de l'extension, recharger l'onglet Kwyk
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[Kwyk Background] onInstalled - reason:', details.reason);
    if (details.reason === 'update') {
        const data = await chrome.storage.local.get('kwykReloadTabId');
        if (data.kwykReloadTabId) {
            try {
                await chrome.tabs.reload(data.kwykReloadTabId);
            } catch (e) {
                // L'onglet peut ne plus exister, recharger tous les onglets Kwyk
                const tabs = await chrome.tabs.query({ url: ['https://www.kwyk.fr/*', 'https://kwyk.fr/*'] });
                for (const tab of tabs) {
                    chrome.tabs.reload(tab.id);
                }
            }
            chrome.storage.local.remove('kwykReloadTabId');
        }
    }
});
