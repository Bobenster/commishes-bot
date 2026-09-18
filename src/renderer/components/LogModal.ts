// LogModal Component - View execution log and screenshots

export class LogModal {
  private modal: HTMLElement;
  private closeBtn: HTMLElement;
  private closeBtn2: HTMLElement;
  private titleEl: HTMLElement;
  private statusEl: HTMLElement;
  private stagesEl: HTMLElement;
  private errorEl: HTMLElement;
  private errorTextEl: HTMLElement;
  private screenshotsEl: HTMLElement;
  private screenshotGridEl: HTMLElement;

  constructor() {
    this.modal = document.getElementById('logModal')!;
    this.closeBtn = document.getElementById('logModalClose')!;
    this.closeBtn2 = document.getElementById('logModalClose2')!;
    this.titleEl = document.getElementById('logJobTitle')!;
    this.statusEl = document.getElementById('logStatus')!;
    this.stagesEl = document.getElementById('logStages')!;
    this.errorEl = document.getElementById('logError')!;
    this.errorTextEl = document.getElementById('logErrorText')!;
    this.screenshotsEl = document.getElementById('logScreenshots')!;
    this.screenshotGridEl = document.getElementById('screenshotGrid')!;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.closeBtn.addEventListener('click', () => this.close());
    this.closeBtn2.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.hidden) {
        this.close();
      }
    });
  }

  static open(job: any, log: any, screenshots: string[] = []): void {
    const modal = new LogModal();
    modal.show(job, log, screenshots);
  }

  show(job: any, log: any, screenshots: string[]): void {
    this.titleEl.textContent = job.params?.title || `Job ${job.queueItemId?.slice(0, 8)}`;
    
    // Status
    const isSuccess = log?.success ?? job.success;
    this.statusEl.textContent = isSuccess ? '✅ Success' : '❌ Failed';
    this.statusEl.className = `log-status ${isSuccess ? 'success' : 'failed'}`;

    // Stages
    this.renderStages(log?.stages || job.stages || []);

    // Error
    if (log?.error || !isSuccess) {
      this.errorEl.style.display = 'block';
      this.errorTextEl.textContent = log?.error || job.error || 'Unknown error';
    } else {
      this.errorEl.style.display = 'none';
    }

    // Screenshots
    if (screenshots.length > 0) {
      this.screenshotsEl.style.display = 'block';
      this.screenshotGridEl.innerHTML = screenshots.map(path => `
        <div class="screenshot-item">
          <img src="file://${path}" alt="Error screenshot" loading="lazy">
        </div>
      `).join('');
    } else {
      this.screenshotsEl.style.display = 'none';
    }

    this.modal.hidden = false;
  }

  private renderStages(stages: any[]): void {
    this.stagesEl.innerHTML = '';

    if (!stages.length) {
      this.stagesEl.innerHTML = '<p style="color: var(--text-muted); padding: 16px;">No stage data available</p>';
      return;
    }

    for (const stage of stages) {
      const div = document.createElement('div');
      div.className = `log-stage ${stage.ok ? 'ok' : 'error'}`;
      
      const icon = stage.ok 
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

      const duration = stage.durationMs ? `${stage.durationMs}ms` : '-';
      const time = stage.timestamp ? new Date(stage.timestamp).toLocaleTimeString() : '-';
      const details = stage.details ? ` | ${JSON.stringify(stage.details)}` : '';

      div.innerHTML = `
        <div class="log-stage-icon">${icon}</div>
        <div class="log-stage-info">
          <div class="log-stage-name">${this.escapeHtml(stage.stage)}${details}</div>
          <div class="log-stage-meta">${time} • Duration: ${duration}</div>
        </div>
      `;
      
      this.stagesEl.appendChild(div);
    }
  }

  close(): void {
    this.modal.hidden = true;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}