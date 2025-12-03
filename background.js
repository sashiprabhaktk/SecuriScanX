// Background service worker: handle extension-level messages

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (msg && msg.action === 'start-scan') {
		console.log('SecuriScanX: starting scan for user', msg.user);
		setTimeout(() => {
			console.log('SecuriScanX: scan initialized for', msg.user);
		}, 500);
		sendResponse({ status: 'started' });
		return true;
	}
});
