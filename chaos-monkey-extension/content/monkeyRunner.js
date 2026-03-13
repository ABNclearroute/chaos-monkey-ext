// monkeyRunner.js
// Inject bookmarklet-style gremlins horde into the page context.

(function () {
  if (window.ChaosMonkeyRunner) return;

  const ChaosMonkeyRunner = {
    running: false,
    stopTimeoutId: null,
    config: null,
    snapshotBefore: null,
    snapshotAfter: null
  };

  window.ChaosMonkeyRunner = ChaosMonkeyRunner;

  function takeDomSnapshot() {
    try {
      const serializer = new XMLSerializer();
      return serializer.serializeToString(document.documentElement);
    } catch (e) {
      return '<snapshot-error>' + String(e) + '</snapshot-error>';
    }
  }

  function injectPageBootstrap(config) {
    try {
      const script = document.createElement('script');
      const base = chrome.runtime.getURL('content/pageGremlinsBootstrap.js');
      const payload = encodeURIComponent(JSON.stringify(config || {}));
      script.src = `${base}#${payload}`;
      (document.documentElement || document.body).appendChild(script);
      // Do not remove the script immediately; allow it to execute naturally.
    } catch (e) {
      console.error('[ChaosMonkey] Failed to inject page bootstrap', e);
    }
  }

  function startChaos(config) {
    if (ChaosMonkeyRunner.running) return;

    ChaosMonkeyRunner.config = config;
    ChaosMonkeyRunner.snapshotBefore = takeDomSnapshot();
    ChaosMonkeyRunner.running = true;

    if (window.ChaosMonkeyLogger && window.ChaosMonkeyLogger.onStart) {
      window.ChaosMonkeyLogger.onStart();
    }

    // Inject a non-inline script tag that runs in the page's main world.
    // The actual bootstrap code lives in content/pageGremlinsBootstrap.js
    // and reads the config from its own URL fragment to avoid CSP inline issues.
    injectPageBootstrap(config);

    const durationMs = (config.durationSeconds || 30) * 1000;
    if (ChaosMonkeyRunner.stopTimeoutId) {
      clearTimeout(ChaosMonkeyRunner.stopTimeoutId);
    }
    ChaosMonkeyRunner.stopTimeoutId = setTimeout(stopChaos, durationMs);
  }

  function stopChaos() {
    if (!ChaosMonkeyRunner.running) return;

    try {
      const stopScript = document.createElement('script');
      stopScript.textContent = `
        try {
          if (window.__chaosMonkeyHorde && window.__chaosMonkeyHorde.stop) {
            window.__chaosMonkeyHorde.stop();
          }
        } catch (e) {}
      `;
      (document.documentElement || document.body).appendChild(stopScript);
      stopScript.parentNode && stopScript.parentNode.removeChild(stopScript);
    } catch (e) {
      console.error('[ChaosMonkey] Failed to stop page horde', e);
    }

    ChaosMonkeyRunner.running = false;
    if (ChaosMonkeyRunner.stopTimeoutId) {
      clearTimeout(ChaosMonkeyRunner.stopTimeoutId);
      ChaosMonkeyRunner.stopTimeoutId = null;
    }

    ChaosMonkeyRunner.snapshotAfter = takeDomSnapshot();
    if (window.ChaosMonkeyLogger && window.ChaosMonkeyLogger.onStop) {
      window.ChaosMonkeyLogger.onStop({
        domBefore: ChaosMonkeyRunner.snapshotBefore,
        domAfter: ChaosMonkeyRunner.snapshotAfter
      });
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === 'START_MONKEY') {
      startChaos(message.config);
      sendResponse({ success: true });
    }

    if (message.type === 'STOP_MONKEY') {
      stopChaos();
      sendResponse({ success: true });
    }

    if (message.type === 'GET_STATS') {
      if (window.ChaosMonkeyLogger && window.ChaosMonkeyLogger.getStats) {
        const stats = window.ChaosMonkeyLogger.getStats();
        sendResponse({ success: true, stats, running: !!ChaosMonkeyRunner.running });
      } else {
        sendResponse({ success: true, stats: {}, running: !!ChaosMonkeyRunner.running });
      }
    }

    if (message.type === 'EXPORT_LOGS') {
      if (window.ChaosMonkeyLogger && window.ChaosMonkeyLogger.exportLogs) {
        const payload = window.ChaosMonkeyLogger.exportLogs(message.format);
        sendResponse({ success: true, ...payload });
      } else {
        sendResponse({ success: false, error: 'Logger not ready' });
      }
    }
  });
})();

