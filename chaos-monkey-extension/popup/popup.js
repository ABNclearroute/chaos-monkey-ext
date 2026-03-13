// popup.js

const DEFAULT_CONFIG = {
  durationSeconds: 30,
  gremlinCount: 200,
  speedMs: 50,
  types: {
    clicker: true,
    toucher: true,
    formFiller: true,
    scroller: true,
    typer: true
  }
};

const elements = {};

function $(id) {
  return document.getElementById(id);
}

function collectConfigFromUI() {
  return {
    durationSeconds: parseInt(elements.duration.value, 10) || DEFAULT_CONFIG.durationSeconds,
    gremlinCount: DEFAULT_CONFIG.gremlinCount,
    speedMs: DEFAULT_CONFIG.speedMs,
    types: { ...DEFAULT_CONFIG.types }
  };
}

function applyConfigToUI(config) {
  elements.duration.value = config.durationSeconds;
}

function setStatus(text) {
  elements.status.textContent = text;
}

function updateStats(stats) {
  elements.totalActions.textContent = stats.total || 0;
  elements.clicks.textContent = stats.clicks || 0;
  elements.inputs.textContent = stats.inputs || 0;
  elements.scrolls.textContent = stats.scrolls || 0;
  elements.domChanges.textContent = stats.domChanges || 0;
  elements.errors.textContent = stats.errors || 0;
}

function saveConfig(config) {
  chrome.storage.sync.set({ chaosMonkeyConfig: config });
}

function loadConfig() {
  chrome.storage.sync.get('chaosMonkeyConfig', (data) => {
    const config = data.chaosMonkeyConfig || DEFAULT_CONFIG;
    applyConfigToUI(config);
  });
}

function sendMessageToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}

async function startChaos() {
  const config = collectConfigFromUI();
  saveConfig(config);
  setStatus('Starting chaos...');
  elements.startBtn.disabled = true;

  const response = await sendMessageToBackground({
    type: 'START_MONKEY',
    config
  });

  if (response && response.success) {
    setStatus('Chaos running...');
  } else {
    setStatus(response && response.error ? `Error: ${response.error}` : 'Failed to start chaos');
    elements.startBtn.disabled = false;
  }
}

async function stopChaos() {
  setStatus('Stopping chaos...');
  const response = await sendMessageToBackground({ type: 'STOP_MONKEY' });
  if (response && response.success) {
    setStatus('Chaos stopped');
    elements.startBtn.disabled = false;
  } else {
    setStatus('Chaos already stopped or not running');
    elements.startBtn.disabled = false;
  }
}

function downloadFile(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportLogs(format) {
  setStatus(`Exporting logs as ${format.toUpperCase()}...`);

  const response = await sendMessageToBackground({
    type: 'EXPORT_LOGS',
    format
  });

  if (!response || !response.success) {
    setStatus('Failed to export logs');
    return;
  }

  const { data, filename, mimeType } = response;
  downloadFile(filename, mimeType, data);
  setStatus(`Logs exported as ${filename}`);
}

async function requestStats() {
  const response = await sendMessageToBackground({ type: 'GET_STATS' });
  if (response && response.success && response.stats) {
    updateStats(response.stats);
    if (response.running) {
      setStatus('Chaos running...');
      elements.startBtn.disabled = true;
    } else {
      elements.startBtn.disabled = false;
    }
  }
}

let lastRunning = false;

async function autoExportLogs() {
  const response = await sendMessageToBackground({
    type: 'EXPORT_LOGS',
    format: 'json'
  });

  if (!response || !response.success) {
    setStatus('Failed to auto-export logs');
    return;
  }

  const { data, filename, mimeType } = response;
  downloadFile(filename, mimeType, data);
  setStatus(`Logs auto-exported as ${filename}`);
}

async function pollStatsAndLogs() {
  const response = await sendMessageToBackground({ type: 'GET_STATS' });
  if (response && response.success && response.stats) {
    updateStats(response.stats);
    const running = !!response.running;
    if (running) {
      setStatus('Chaos running...');
      elements.startBtn.disabled = true;
    } else {
      elements.startBtn.disabled = false;
    }

    if (lastRunning && !running) {
      await autoExportLogs();
    }
    lastRunning = running;
  }

  const logsResponse = await sendMessageToBackground({
    type: 'GET_RECENT_LOGS',
    limit: 40
  });
  if (logsResponse && logsResponse.success && Array.isArray(logsResponse.logs)) {
    const lines = logsResponse.logs.map((l) => {
      const time = l.timestamp ? l.timestamp.split('T')[1].replace('Z', '') : '';
      return `[${time}] ${l.action || ''} ${l.selector || ''} ${l.message || l.detail || ''}`.trim();
    });
    elements.logTail.textContent = lines.join('\n');
  }
}

function setupPeriodicStats() {
  pollStatsAndLogs();
  setInterval(pollStatsAndLogs, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  elements.duration = $('duration');
  elements.startBtn = $('startBtn');
  elements.stopBtn = $('stopBtn');
  elements.exportJsonBtn = $('exportJsonBtn');

  elements.totalActions = $('totalActions');
  elements.clicks = $('clicks');
  elements.inputs = $('inputs');
  elements.scrolls = $('scrolls');
  elements.domChanges = $('domChanges');
  elements.errors = $('errors');
  elements.status = $('status');
  elements.logTail = $('logTail');

  loadConfig();
  setupPeriodicStats();

  elements.startBtn.addEventListener('click', startChaos);
  elements.stopBtn.addEventListener('click', stopChaos);
  elements.exportJsonBtn.addEventListener('click', () => exportLogs('json'));
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'STATS_UPDATE' && message.stats) {
    updateStats(message.stats);
  }
});

