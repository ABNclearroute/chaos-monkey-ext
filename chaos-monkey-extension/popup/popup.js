// popup.js

const DEFAULT_CONFIG = {
  gremlinCount: 50,
  durationSeconds: 30,
  speedMs: 100,
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
    gremlinCount: parseInt(elements.gremlinCount.value, 10) || DEFAULT_CONFIG.gremlinCount,
    durationSeconds: parseInt(elements.duration.value, 10) || DEFAULT_CONFIG.durationSeconds,
    speedMs: parseInt(elements.speed.value, 10) || DEFAULT_CONFIG.speedMs,
    types: {
      clicker: elements.clicker.checked,
      toucher: elements.toucher.checked,
      formFiller: elements.formFiller.checked,
      scroller: elements.scroller.checked,
      typer: elements.typer.checked
    }
  };
}

function applyConfigToUI(config) {
  elements.gremlinCount.value = config.gremlinCount;
  elements.duration.value = config.durationSeconds;
  elements.speed.value = config.speedMs;
  elements.clicker.checked = !!config.types.clicker;
  elements.toucher.checked = !!config.types.toucher;
  elements.formFiller.checked = !!config.types.formFiller;
  elements.scroller.checked = !!config.types.scroller;
  elements.typer.checked = !!config.types.typer;
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

function setupPeriodicStats() {
  requestStats();
  setInterval(requestStats, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  elements.gremlinCount = $('gremlinCount');
  elements.duration = $('duration');
  elements.speed = $('speed');
  elements.clicker = $('clicker');
  elements.toucher = $('toucher');
  elements.formFiller = $('formFiller');
  elements.scroller = $('scroller');
  elements.typer = $('typer');

  elements.startBtn = $('startBtn');
  elements.stopBtn = $('stopBtn');
  elements.exportJsonBtn = $('exportJsonBtn');
  elements.exportCsvBtn = $('exportCsvBtn');

  elements.totalActions = $('totalActions');
  elements.clicks = $('clicks');
  elements.inputs = $('inputs');
  elements.scrolls = $('scrolls');
  elements.domChanges = $('domChanges');
  elements.errors = $('errors');
  elements.status = $('status');

  loadConfig();
  setupPeriodicStats();

  elements.startBtn.addEventListener('click', startChaos);
  elements.stopBtn.addEventListener('click', stopChaos);
  elements.exportJsonBtn.addEventListener('click', () => exportLogs('json'));
  elements.exportCsvBtn.addEventListener('click', () => exportLogs('csv'));
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'STATS_UPDATE' && message.stats) {
    updateStats(message.stats);
  }
});

