// Commishes Control Center - Renderer Entry Point

import './styles.css';
import { QueueTab } from './components/QueueTab.js';
import { HistoryTab } from './components/HistoryTab.js';
import { SettingsTab } from './components/SettingsTab.js';
import { JobModal } from './components/JobModal.js';
import { LogModal } from './components/LogModal.js';
import { queueStore } from './stores/queueStore.js';
import { historyStore } from './stores/historyStore.js';
import { settingsStore } from './stores/settingsStore.js';
import { uiStore } from './stores/uiStore.js';
import { WatchdogTab } from './components/WatchdogTab.js';

// Initialize tabs
const queueTab = new QueueTab();
const historyTab = new HistoryTab();
const settingsTab = new SettingsTab();
const jobModal = JobModal.getInstance();
const logModal = new LogModal();

// Tab navigation
const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
const panels = document.querySelectorAll<HTMLElement>('.tab-panel');
const watchdogPanelController = new WatchdogTab();

function switchTab(tabName: 'queue' | 'history' | 'settings' | 'watchdog') {
  tabs.forEach(tab => {
    const isActive = tab.dataset.tab === tabName;
    tab.setAttribute('aria-selected', String(isActive));
  });
  panels.forEach(panel => {
    panel.hidden = panel.id !== `${tabName}Panel`;
  });
  uiStore.setActiveTab(tabName);
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab as 'queue' | 'history' | 'settings' | 'watchdog';
    if (tabName) switchTab(tabName);
  });
});

// Global event listeners
document.getElementById('addJobBtn')?.addEventListener('click', () => jobModal.open());
document.getElementById('emptyAddBtn')?.addEventListener('click', () => jobModal.open());
document.getElementById('refreshBtn')?.addEventListener('click', () => {
  queueStore.refresh();
  historyStore.refresh();
  settingsStore.refresh();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    jobModal.open();
  }
  if (e.key === 'F5') {
    e.preventDefault();
    queueStore.refresh();
    historyStore.refresh();
  }
  if (e.key === 'Escape') {
    logModal.close();
  }
});

window.addEventListener('error', (event) => {
  const message = event.error instanceof Error ? event.error.message : event.message;
  void window.api.watchdog.reportRendererError(message || 'Unknown renderer error');
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  void window.api.watchdog.reportRendererError(message);
});

// Initialize stores
queueStore.init();
historyStore.init();
settingsStore.init();

// Load initial data
queueStore.refresh();
historyStore.refresh();
settingsStore.refresh();

// Check Chrome status periodically
setInterval(() => {
  if (uiStore.activeTab === 'queue' || uiStore.activeTab === 'settings') {
    window.api.engine.checkChrome().then(result => {
      updateChromeStatus(result);
    }).catch(() => {
      updateChromeStatus({ healthy: false, error: 'Connection failed' });
    });
  }
}, 30000);

// Initial Chrome check
window.api.engine.checkChrome().then(result => {
  updateChromeStatus(result);
}).catch(() => {
  updateChromeStatus({ healthy: false, error: 'Connection failed' });
});

function updateChromeStatus(result: { healthy: boolean; port?: number; pid?: number; error?: string }) {
  const statusEl = document.getElementById('chromeStatus');
  const dot = statusEl?.querySelector('.status-dot');
  if (!statusEl || !dot) return;

  if (result.healthy) {
    dot.classList.add('connected');
    const textSpan = statusEl.querySelector('span:last-child');
    if (textSpan) textSpan.textContent = `Chrome: Connected (port ${result.port}, PID ${result.pid})`;
  } else {
    dot.classList.remove('connected');
    const textSpan = statusEl.querySelector('span:last-child');
    if (textSpan) textSpan.textContent = `Chrome: Disconnected${result.error ? ` - ${result.error}` : ''}`;
  }
}

// Test mode badge
settingsStore.onChange((settings) => {
  const badge = document.getElementById('testModeBadge');
  if (badge) {
    badge.style.display = settings.engine?.testMode ? 'inline-flex' : 'none';
  }
});

// Listen for job progress
window.api.engine.onProgress((progress) => {
  queueTab.updateJobProgress(progress);
});

window.api.app.getBuildInfo().then((info) => {
  const buildEl = document.getElementById('buildInfo');
  if (!buildEl) return;
  const commit = info.sourceShort || info.sourceCommit || 'unknown';
  const buildDate = info.buildAtUtc
    ? new Date(info.buildAtUtc).toLocaleString()
    : 'development';
  buildEl.textContent = `v${info.version} • ${commit} • ${buildDate}`;
  buildEl.title = `Source commit: ${info.sourceCommit}\\nBuilt: ${buildDate}\\nMode: ${info.mode}`;
}).catch(() => {
  const buildEl = document.getElementById('buildInfo');
  if (buildEl) buildEl.textContent = 'Build: unknown';
});

console.log('Commishes Control Center initialized');