// background.js (service worker, MV3)

let tabState = {}; // keyed by tabId: { running: boolean }

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function ensureContentScriptsInjected(tabId) {
  // Load gremlins library into the same isolated world first
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['libs/gremlins.min.js']
  });

  // Then our logger and runner, which expect window.gremlins to exist
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/activityLogger.js']
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/monkeyRunner.js']
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || !message.type) return;

    if (message.type === 'START_MONKEY') {
      const tab = await getActiveTab();
      if (!tab || !tab.id) {
        sendResponse({ success: false, error: 'No active tab' });
        return;
      }

      try {
        await ensureContentScriptsInjected(tab.id);

        await chrome.tabs.sendMessage(tab.id, {
          type: 'START_MONKEY',
          config: message.config
        });

        tabState[tab.id] = { running: true };
        sendResponse({ success: true });
      } catch (err) {
        console.error('Failed to start monkey:', err);
        sendResponse({ success: false, error: String(err) });
      }
    }

    if (message.type === 'STOP_MONKEY') {
      const tab = await getActiveTab();
      if (!tab || !tab.id) {
        sendResponse({ success: false, error: 'No active tab' });
        return;
      }

      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'STOP_MONKEY' });
        tabState[tab.id] = { running: false };
        sendResponse({ success: true });
      } catch (err) {
        console.error('Failed to stop monkey:', err);
        sendResponse({ success: false, error: String(err) });
      }
    }

    if (message.type === 'GET_STATS') {
      const tab = await getActiveTab();
      if (!tab || !tab.id) {
        sendResponse({ success: true, stats: {}, running: false });
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'GET_STATS'
        }).catch(() => null);

        if (response && response.success) {
          sendResponse({
            success: true,
            stats: response.stats || {},
            running: !!(tabState[tab.id] && tabState[tab.id].running)
          });
        } else {
          sendResponse({ success: true, stats: {}, running: false });
        }
      } catch (err) {
        console.error('GET_STATS error:', err);
        sendResponse({ success: false, error: String(err) });
      }
    }

    if (message.type === 'GET_RECENT_LOGS') {
      const tab = await getActiveTab();
      if (!tab || !tab.id) {
        sendResponse({ success: true, logs: [] });
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'GET_RECENT_LOGS',
          limit: message.limit
        }).catch(() => null);

        if (response && response.success) {
          sendResponse({ success: true, logs: response.logs || [] });
        } else {
          sendResponse({ success: true, logs: [] });
        }
      } catch (err) {
        console.error('GET_RECENT_LOGS error:', err);
        sendResponse({ success: false, error: String(err) });
      }
    }

    if (message.type === 'EXPORT_LOGS') {
      const tab = await getActiveTab();
      if (!tab || !tab.id) {
        sendResponse({ success: false, error: 'No active tab' });
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'EXPORT_LOGS',
          format: message.format
        }).catch(() => null);

        if (!response || !response.success) {
          sendResponse({ success: false, error: 'Export failed' });
          return;
        }

        sendResponse({
          success: true,
          data: response.data,
          filename: response.filename,
          mimeType: response.mimeType
        });
      } catch (err) {
        console.error('EXPORT_LOGS error:', err);
        sendResponse({ success: false, error: String(err) });
      }
    }

    if (message.type === 'CAPTURE_ERROR_SCREENSHOT') {
      const tabId = sender.tab && sender.tab.id;
      if (!tabId) {
        sendResponse({ success: false, error: 'No tab in sender' });
        return;
      }

      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
          format: 'png'
        });

        await chrome.tabs.sendMessage(tabId, {
          type: 'ERROR_SCREENSHOT_CAPTURED',
          dataUrl
        });

        sendResponse({ success: true });
      } catch (err) {
        console.error('Error capturing screenshot:', err);
        sendResponse({ success: false, error: String(err) });
      }
    }
  })();

  return true;
});

