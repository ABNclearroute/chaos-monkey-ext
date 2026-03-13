// activityLogger.js
// Logs user-like activity, stats, DOM changes, and errors. Handles error screenshot linkage.

(function () {
  if (window.ChaosMonkeyLogger) {
    return;
  }

  const logs = [];
  const stats = {
    total: 0,
    clicks: 0,
    inputs: 0,
    scrolls: 0,
    domChanges: 0,
    errors: 0
  };

  let running = false;
  let lastErrorIndex = null;
  const domSnapshots = {
    before: null,
    after: null
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function getCssSelector(el) {
    if (!el || el.nodeType !== 1) return null;
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 5) {
      let part = el.nodeName.toLowerCase();
      if (el.id) {
        part += '#' + el.id;
        parts.unshift(part);
        break;
      } else {
        let className = (el.className || '').trim().replace(/\s+/g, '.');
        if (className) {
          part += '.' + className;
        }
        const siblings = el.parentNode ? Array.from(el.parentNode.children) : [];
        const sameTagSiblings = siblings.filter((s) => s.nodeName === el.nodeName);
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(el);
          part += `:nth-of-type(${index + 1})`;
        }
      }
      parts.unshift(part);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

  function pushLog(entry) {
    const fullEntry = {
      timestamp: nowIso(),
      ...entry
    };
    logs.push(fullEntry);
    stats.total += 1;

    if (logs.length % 20 === 0) {
      sendStatsUpdate();
    }
  }

  function sendStatsUpdate() {
    chrome.runtime.sendMessage({
      type: 'STATS_UPDATE',
      stats: { ...stats }
    });
  }

  function onClick(event) {
    if (!running) return;
    const target = event.target;
    const selector = getCssSelector(target);
    stats.clicks += 1;

    pushLog({
      action: 'click',
      selector,
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      text: (target && target.textContent || '').trim().slice(0, 200)
    });
  }

  function onInput(event) {
    if (!running) return;
    const target = event.target;
    const selector = getCssSelector(target);
    stats.inputs += 1;

    let value = null;
    if (target && 'value' in target) {
      value = String(target.value).slice(0, 200);
    }

    pushLog({
      action: 'input',
      selector,
      value
    });
  }

  function onScroll(event) {
    if (!running) return;
    const target = event.target === document ? document.scrollingElement || document.documentElement : event.target;
    const selector = getCssSelector(target);
    stats.scrolls += 1;

    pushLog({
      action: 'scroll',
      selector,
      scrollTop: target && target.scrollTop,
      scrollLeft: target && target.scrollLeft
    });
  }

  function onDomMutation(mutations) {
    if (!running) return;
    stats.domChanges += mutations.length;

    mutations.forEach((mutation) => {
      let description = mutation.type;
      if (mutation.type === 'childList') {
        description += ` added: ${mutation.addedNodes.length}, removed: ${mutation.removedNodes.length}`;
      } else if (mutation.type === 'attributes') {
        description += ` attr: ${mutation.attributeName}`;
      } else if (mutation.type === 'characterData') {
        description += ' characterData changed';
      }

      pushLog({
        action: 'dom-mutation',
        selector: getCssSelector(mutation.target),
        detail: description
      });
    });
  }

  function onWindowError(message, source, lineno, colno, error) {
    stats.errors += 1;
    const errorLog = {
      action: 'error',
      message: String(message),
      source: String(source),
      lineno,
      colno,
      stack: error && error.stack ? String(error.stack).slice(0, 2000) : null,
      screenshot: null
    };
    pushLog(errorLog);
    lastErrorIndex = logs.length - 1;

    chrome.runtime.sendMessage({ type: 'CAPTURE_ERROR_SCREENSHOT' });
  }

  const originalConsoleError = console.error;
  console.error = function (...args) {
    stats.errors += 1;
    const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join(' ');
    pushLog({
      action: 'console-error',
      message: message.slice(0, 2000)
    });
    if (originalConsoleError) {
      originalConsoleError.apply(console, args);
    }
  };

  const mutationObserver = new MutationObserver(onDomMutation);

  function startLogging() {
    if (running) return;
    running = true;
    logs.length = 0;
    stats.total = stats.clicks = stats.inputs = stats.scrolls = stats.domChanges = stats.errors = 0;
    lastErrorIndex = null;

    document.addEventListener('click', onClick, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onInput, true);
    window.addEventListener('scroll', onScroll, true);

    mutationObserver.observe(document.documentElement, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true
    });

    window.addEventListener('error', onWindowError, true);
  }

  function stopLogging() {
    if (!running) return;
    running = false;

    document.removeEventListener('click', onClick, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('change', onInput, true);
    window.removeEventListener('scroll', onScroll, true);
    mutationObserver.disconnect();
    window.removeEventListener('error', onWindowError, true);

    sendStatsUpdate();
  }

  function exportAsJson() {
    const payload = {
      meta: {
        generatedAt: nowIso(),
        userAgent: navigator.userAgent,
        domSnapshotBefore: domSnapshots.before,
        domSnapshotAfter: domSnapshots.after
      },
      stats: { ...stats },
      logs
    };

    return {
      filename: `chaosmonkey-logs-${Date.now()}.json`,
      mimeType: 'application/json',
      data: JSON.stringify(payload, null, 2)
    };
  }

  function exportAsCsv() {
    const headers = [
      'timestamp',
      'action',
      'selector',
      'x',
      'y',
      'value',
      'scrollTop',
      'scrollLeft',
      'detail',
      'message',
      'source',
      'lineno',
      'colno'
    ];

    const lines = [];
    lines.push(headers.join(','));

    function csvEscape(value) {
      if (value === null || value === undefined) return '';
      const str = String(value).replace(/"/g, '""');
      if (/[",\n]/.test(str)) {
        return `"${str}"`;
      }
      return str;
    }

    logs.forEach((log) => {
      const row = [
        log.timestamp,
        log.action,
        log.selector,
        log.x,
        log.y,
        log.value || log.text || '',
        log.scrollTop,
        log.scrollLeft,
        log.detail,
        log.message,
        log.source,
        log.lineno,
        log.colno
      ].map(csvEscape);
      lines.push(row.join(','));
    });

    return {
      filename: `chaosmonkey-logs-${Date.now()}.csv`,
      mimeType: 'text/csv',
      data: lines.join('\n')
    };
  }

  const ChaosMonkeyLogger = {
    onStart() {
      domSnapshots.before = null;
      domSnapshots.after = null;
      startLogging();
    },
    onStop({ domBefore, domAfter }) {
      domSnapshots.before = domBefore;
      domSnapshots.after = domAfter;
      stopLogging();
    },
    getStats() {
      return { ...stats };
    },
    exportLogs(format) {
      if (format === 'csv') return exportAsCsv();
      return exportAsJson();
    }
  };

  window.ChaosMonkeyLogger = ChaosMonkeyLogger;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === 'GET_STATS') {
      sendResponse({ success: true, stats: ChaosMonkeyLogger.getStats() });
    }

    if (message.type === 'EXPORT_LOGS') {
      const payload = ChaosMonkeyLogger.exportLogs(message.format);
      sendResponse({ success: true, ...payload });
    }

    if (message.type === 'ERROR_SCREENSHOT_CAPTURED' && message.dataUrl) {
      if (lastErrorIndex != null && logs[lastErrorIndex]) {
        logs[lastErrorIndex].screenshot = message.dataUrl;
      }
    }

    return true;
  });
})();

