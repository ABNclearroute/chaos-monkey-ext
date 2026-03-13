// monkeyRunner.js
// Injects gremlins.js, configures the horde, and runs/stops chaos.

(function () {
  if (window.ChaosMonkeyRunner) {
    return;
  }

  const ChaosMonkeyRunner = {
    gremlinsLoaded: false,
    horde: null,
    running: false,
    stopTimeoutId: null,
    config: null,
    snapshotBefore: null,
    snapshotAfter: null
  };

  window.ChaosMonkeyRunner = ChaosMonkeyRunner;

  // In MV3 we inject gremlins.min.js via chrome.scripting from the background,
  // so by the time this content script runs, window.gremlins should already exist.

  function takeDomSnapshot() {
    try {
      const serializer = new XMLSerializer();
      return serializer.serializeToString(document.documentElement);
    } catch (e) {
      return '<snapshot-error>' + String(e) + '</snapshot-error>';
    }
  }

  function buildHorde(config) {
    if (!window.gremlins) {
      console.error('gremlins.js is not available');
      return null;
    }

    const species = [];

    if (config.types.clicker) {
      species.push(
        window.gremlins.species.clicker({
          clickTypes: ['click']
        })()
      );
    }
    if (config.types.toucher && window.gremlins.species.toucher) {
      species.push(window.gremlins.species.toucher()());
    }
    if (config.types.formFiller) {
      species.push(window.gremlins.species.formFiller()());
    }
    if (config.types.scroller) {
      species.push(window.gremlins.species.scroller()());
    }
    if (config.types.typer) {
      species.push(window.gremlins.species.typer()());
    }

    const horde = window.gremlins.createHorde({
      species,
      strategies: [
        window.gremlins.strategies.distribution({
          delay: config.speedMs
        })
      ]
    });

    return horde;
  }

  function startChaos(config) {
    if (ChaosMonkeyRunner.running) {
      return;
    }
    ChaosMonkeyRunner.config = config;
    ChaosMonkeyRunner.snapshotBefore = takeDomSnapshot();

    if (!window.gremlins) {
      console.error('[ChaosMonkey] window.gremlins is missing');
      return;
    }

    const horde = buildHorde(config);
    if (!horde) {
      return;
    }

    ChaosMonkeyRunner.horde = horde;
    ChaosMonkeyRunner.running = true;
    if (window.ChaosMonkeyLogger && window.ChaosMonkeyLogger.onStart) {
      window.ChaosMonkeyLogger.onStart();
    }
    console.log('[ChaosMonkey] Horde starting');

    horde.seed(Date.now());
    horde.unleash({ nb: config.gremlinCount });

    const durationMs = config.durationSeconds * 1000;
    if (ChaosMonkeyRunner.stopTimeoutId) {
      clearTimeout(ChaosMonkeyRunner.stopTimeoutId);
    }
    ChaosMonkeyRunner.stopTimeoutId = setTimeout(() => {
      stopChaos();
    }, durationMs);
  }

  function stopChaos() {
    if (!ChaosMonkeyRunner.running) return;

    if (ChaosMonkeyRunner.horde && ChaosMonkeyRunner.horde.stop) {
      ChaosMonkeyRunner.horde.stop();
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
    console.log('[ChaosMonkey] Horde stopped');
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
        sendResponse({ success: true, stats });
      } else {
        sendResponse({ success: true, stats: {} });
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

