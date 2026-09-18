// SettingsTab Component

import { settingsStore } from '../stores/settingsStore.js';

export class SettingsTab {
  private elements: Record<string, HTMLElement> = {};
  private unsubscribeSettings: (() => void) | null = null;
  private saveBtn!: HTMLButtonElement;

  constructor() {
    this.cacheElements();
    this.bindEvents();
    this.subscribe();
    this.loadSettings();
  }

  private cacheElements(): void {
    const ids = [
      'settingChromePath', 'settingProfilePath', 'settingDebugPort',
      'browseChromePath', 'browseProfilePath', 'checkChromeBtn', 'chromeCheckResult',
      'settingInterval', 'settingCooldown', 'settingMaxRetries', 'settingAutoStart',
      'settingTestMode', 'settingImagesDir', 'browseImagesDir',
      'settingAutoLaunch', 'settingNotifications',
      'exportQueueBtn', 'importQueueBtn', 'exportHistoryBtn', 'exportSettingsBtn',
      'resetSettingsBtn', 'saveSettingsBtn'
    ];

    for (const id of ids) {
      this.elements[id] = document.getElementById(id)!;
    }

    this.saveBtn = this.elements.saveSettingsBtn as HTMLButtonElement;
  }

  private bindEvents(): void {
    // Browse buttons
    this.elements.browseChromePath.addEventListener('click', () => this.browsePath('settingChromePath', 'Chrome Executable', [{ name: 'Executable', extensions: ['exe'] }]));
    this.elements.browseProfilePath.addEventListener('click', () => this.browsePath('settingProfilePath', 'Profile Directory', [], true));
    this.elements.browseImagesDir.addEventListener('click', () => this.browsePath('settingImagesDir', 'Images Directory', [], true));

    // Check Chrome
    this.elements.checkChromeBtn.addEventListener('click', async () => {
      await this.checkChrome();
    });

    // Export/Import
    this.elements.exportQueueBtn.addEventListener('click', () => this.exportData('queue'));
    this.elements.importQueueBtn.addEventListener('click', () => this.importData('queue'));
    this.elements.exportHistoryBtn.addEventListener('click', () => this.exportData('history'));
    this.elements.exportSettingsBtn.addEventListener('click', () => this.exportData('settings'));

    // Reset
    this.elements.resetSettingsBtn.addEventListener('click', () => this.resetSettings());

    // Save
    this.saveBtn.addEventListener('click', () => this.saveSettings());
  }

  private subscribe(): void {
    this.unsubscribeSettings = settingsStore.onChange((settings) => {
      this.populateForm(settings);
    });
  }

  destroy(): void {
    this.unsubscribeSettings?.();
  }

  private loadSettings(): void {
    settingsStore.refresh();
  }

  private populateForm(settings: any): void {
    if (!settings) return;

    // Chrome
    (this.elements.settingChromePath as HTMLInputElement).value = settings.chrome?.executablePath || '';
    (this.elements.settingProfilePath as HTMLInputElement).value = settings.chrome?.profilePath || '';
    (this.elements.settingDebugPort as HTMLInputElement).value = settings.chrome?.debugPort || 9223;

    // Scheduler
    (this.elements.settingInterval as HTMLInputElement).value = settings.scheduler?.intervalMs || 5000;
    (this.elements.settingCooldown as HTMLInputElement).value = settings.scheduler?.cooldownMs || 60000;
    (this.elements.settingMaxRetries as HTMLInputElement).value = settings.scheduler?.maxRetries || 2;
    (this.elements.settingAutoStart as HTMLInputElement).checked = settings.scheduler?.autoStart || false;

    // Engine
    (this.elements.settingTestMode as HTMLInputElement).checked = settings.engine?.testMode ?? true;
    (this.elements.settingImagesDir as HTMLInputElement).value = settings.engine?.imagesDir || '';

    // App
    (this.elements.settingAutoLaunch as HTMLInputElement).checked = settings.app?.autoLaunch || false;
    (this.elements.settingNotifications as HTMLInputElement).checked = settings.app?.notifications ?? true;
  }

  private async browsePath(inputId: string, title: string, filters: any[] = [], directory: boolean = false): Promise<void> {
    const input = this.elements[inputId] as HTMLInputElement;
    const result = await window.api.dialog.openFile({
      title,
      defaultPath: input.value,
      properties: directory ? ['openDirectory'] : ['openFile'],
      filters: filters.length > 0 ? filters : undefined
    });

    if (!result.canceled && result.filePaths.length > 0) {
      input.value = result.filePaths[0];
    }
  }

  private async checkChrome(): Promise<void> {
    const btn = this.elements.checkChromeBtn as HTMLButtonElement;
    const resultEl = this.elements.chromeCheckResult;
    
    btn.disabled = true;
    btn.textContent = 'Checking...';
    resultEl.textContent = '';

    try {
      const result = await window.api.engine.checkChrome();
      if (result.success && result.healthy) {
        resultEl.textContent = `✅ Connected (port ${result.port}, PID ${result.pid})`;
        resultEl.style.color = 'var(--accent-primary)';
      } else {
        resultEl.textContent = `❌ ${result.error || 'Not healthy'}`;
        resultEl.style.color = 'var(--accent-danger)';
      }
    } catch (error) {
      resultEl.textContent = `❌ Error: ${error instanceof Error ? error.message : String(error)}`;
      resultEl.style.color = 'var(--accent-danger)';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Check Chrome Connection';
    }
  }

  private async exportData(type: 'queue' | 'history' | 'settings'): Promise<void> {
    let data: string;
    let filename: string;

    switch (type) {
      case 'queue':
        data = await window.api.queue.export();
        filename = `queue-export-${new Date().toISOString().split('T')[0]}.json`;
        break;
      case 'history':
        data = await window.api.history.export();
        filename = `history-export-${new Date().toISOString().split('T')[0]}.json`;
        break;
      case 'settings':
        data = await window.api.settings.export();
        filename = `settings-export-${new Date().toISOString().split('T')[0]}.json`;
        break;
    }

    const result = await window.api.dialog.saveFile({
      title: `Export ${type}`,
      defaultPath: filename,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (!result.canceled && result.filePath) {
      alert(`${type} exported successfully`);
    }
  }

  private async importData(type: 'queue'): Promise<void> {
    const result = await window.api.dialog.openFile({
      title: `Import ${type}`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      if (type === 'queue') {
        const merge = confirm('Merge with existing queue? (Cancel = replace)');
        await window.api.queue.import(result.filePaths[0], merge);
        alert('Queue imported successfully');
      }
    }
  }

  private async resetSettings(): Promise<void> {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      await settingsStore.reset();
      alert('Settings reset to defaults');
    }
  }

  private async saveSettings(): Promise<void> {
    this.saveBtn.disabled = true;
    this.saveBtn.textContent = 'Saving...';

    try {
      const settings = {
        chrome: {
          executablePath: (this.elements.settingChromePath as HTMLInputElement).value,
          profilePath: (this.elements.settingProfilePath as HTMLInputElement).value,
          debugPort: parseInt((this.elements.settingDebugPort as HTMLInputElement).value) || 9223
        },
        scheduler: {
          intervalMs: parseInt((this.elements.settingInterval as HTMLInputElement).value) || 5000,
          cooldownMs: parseInt((this.elements.settingCooldown as HTMLInputElement).value) || 60000,
          maxRetries: parseInt((this.elements.settingMaxRetries as HTMLInputElement).value) || 2,
          autoStart: (this.elements.settingAutoStart as HTMLInputElement).checked
        },
        engine: {
          testMode: (this.elements.settingTestMode as HTMLInputElement).checked,
          imagesDir: (this.elements.settingImagesDir as HTMLInputElement).value
        },
        app: {
          autoLaunch: (this.elements.settingAutoLaunch as HTMLInputElement).checked,
          notifications: (this.elements.settingNotifications as HTMLInputElement).checked
        }
      };

      await settingsStore.set(settings);
      
      // Update scheduler interval if running
      await window.api.scheduler.setInterval(settings.scheduler.intervalMs);

      alert('Settings saved successfully');
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.textContent = 'Save Settings';
    }
  }
}