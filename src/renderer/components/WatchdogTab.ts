import type { WatchdogServiceStatus, WatchdogState, WatchdogStatus } from '../../main/engine/watchdog.js';

export class WatchdogTab {
  private panel: HTMLElement;
  private overallEl: HTMLElement;
  private tableBody: HTMLTableSectionElement;
  private refreshBtn: HTMLButtonElement;
  private unsubscribe: (() => void) | null = null;
  private timer: number | null = null;

  constructor() {
    this.panel = document.getElementById('watchdogPanel')!;
    this.overallEl = document.getElementById('watchdogOverall')!;
    this.tableBody = document.getElementById('watchdogTableBody') as HTMLTableSectionElement;
    this.refreshBtn = document.getElementById('watchdogRefreshBtn') as HTMLButtonElement;

    this.refreshBtn.addEventListener('click', () => void this.checkNow());
    this.timer = window.setInterval(() => void this.refresh(), 2000);
    void this.refresh();
  }

  destroy(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.unsubscribe?.();
  }

  async refresh(): Promise<void> {
    try {
      const status = await window.api.watchdog.getStatus();
      this.render(status);
    } catch (error) {
      console.error('Failed to load watchdog status:', error);
    }
  }

  private async checkNow(): Promise<void> {
    this.refreshBtn.disabled = true;
    try {
      const status = await window.api.watchdog.checkNow();
      this.render(status);
    } catch (error) {
      console.error('Watchdog check failed:', error);
    } finally {
      this.refreshBtn.disabled = false;
    }
  }

  private render(status: WatchdogStatus): void {
    const bad = status.services.filter(service => service.state === 'failed');
    const recovering = status.services.filter(service => service.state === 'recovering');
    const warnings = status.services.filter(service => service.state === 'warning');

    if (bad.length > 0) {
      this.overallEl.textContent = `🔴 ${bad.length} problem(s) — automatic recovery failed`;
      this.overallEl.className = 'watchdog-overall failed';
    } else if (recovering.length > 0 || warnings.length > 0) {
      this.overallEl.textContent = `🟡 ${recovering.length + warnings.length} service(s) need attention`;
      this.overallEl.className = 'watchdog-overall warning';
    } else {
      this.overallEl.textContent = '🟢 All monitored services are healthy';
      this.overallEl.className = 'watchdog-overall healthy';
    }

    this.tableBody.innerHTML = '';
    for (const service of status.services) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${this.escapeHtml(service.label)}</strong></td>
        <td><span class="watchdog-state ${service.state}">${this.stateLabel(service.state)}</span></td>
        <td>${this.escapeHtml(service.message)}</td>
        <td>${service.restartCount}</td>
        <td>${this.escapeHtml(new Date(service.lastCheckedAt).toLocaleTimeString())}</td>
        <td>
          ${['renderer','scheduler','chrome'].includes(service.id)
            ? '<button class="btn btn-secondary btn-small watchdog-restart">Restart</button>'
            : ''}
        </td>
      `;

      row.querySelector('.watchdog-restart')?.addEventListener('click', async () => {
        const button = row.querySelector<HTMLButtonElement>('.watchdog-restart');
        if (!button) return;
        button.disabled = true;
        try {
          const next = await window.api.watchdog.restartService(service.id);
          this.render(next);
        } catch (error) {
          alert(`Failed to restart ${service.label}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          button.disabled = false;
        }
      });

      this.tableBody.appendChild(row);
    }
  }

  private stateLabel(state: WatchdogState): string {
    switch (state) {
      case 'healthy': return 'Healthy';
      case 'idle': return 'Idle';
      case 'recovering': return 'Recovering';
      case 'warning': return 'Warning';
      case 'failed': return 'Failed';
    }
  }

  private escapeHtml(value: string): string {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }
}
