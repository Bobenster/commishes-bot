// QueueTab Component

import { queueStore } from '../stores/queueStore.js';
import { uiStore } from '../stores/uiStore.js';
import { JobModal } from './JobModal.js';
import { LogModal } from './LogModal.js';

export class QueueTab {
  private tbody: HTMLTableSectionElement;
  private emptyState: HTMLElement;
  private countEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private statusFilter: HTMLSelectElement;
  private unsubscribeQueue: (() => void) | null = null;
  private unsubscribeUI: (() => void) | null = null;
  private dragSrc: HTMLElement | null = null;

  constructor() {
    this.tbody = document.getElementById('queueTableBody') as HTMLTableSectionElement;
    this.emptyState = document.getElementById('queueEmpty')!;
    this.countEl = document.getElementById('queueCount')!;
    this.searchInput = document.getElementById('queueSearch') as HTMLInputElement;
    this.statusFilter = document.getElementById('queueStatusFilter') as HTMLSelectElement;

    this.bindEvents();
    this.subscribe();
  }

  private bindEvents(): void {
    this.searchInput.addEventListener('input', (e) => {
      uiStore.setQueueSearch((e.target as HTMLInputElement).value);
    });

    this.statusFilter.addEventListener('change', (e) => {
      uiStore.setQueueStatusFilter((e.target as HTMLSelectElement).value);
    });
  }

  private subscribe(): void {
    this.unsubscribeQueue = queueStore.subscribe(() => this.render());
    this.unsubscribeUI = uiStore.subscribe(() => this.render());
  }

  destroy(): void {
    this.unsubscribeQueue?.();
    this.unsubscribeUI?.();
  }

  render(): void {
    const queue = queueStore.all;
    const filtered = this.getFilteredQueue(queue);

    this.updateCount(queue.length, filtered.length);
    this.renderRows(filtered);
    this.toggleEmptyState(filtered.length === 0);
  }

  private getFilteredQueue(queue: any[]): any[] {
    let result = queue;

    if (uiStore.queueSearch) {
      const s = uiStore.queueSearch.toLowerCase();
      result = result.filter(q => 
        q.params.title.toLowerCase().includes(s) ||
        q.params.subtitle.toLowerCase().includes(s) ||
        q.id.toLowerCase().includes(s)
      );
    }

    if (uiStore.queueStatusFilter) {
      result = result.filter(q => q.status === uiStore.queueStatusFilter);
    }

    return result;
  }

  private updateCount(total: number, filtered: number): void {
    if (uiStore.queueSearch || uiStore.queueStatusFilter) {
      this.countEl.textContent = `${filtered} of ${total} items`;
    } else {
      this.countEl.textContent = `${total} items`;
    }
  }

  private toggleEmptyState(empty: boolean): void {
    this.emptyState.style.display = empty ? 'flex' : 'none';
    (this.tbody.parentElement as HTMLElement).style.display = empty ? 'none' : 'table';
  }

  private renderRows(queue: any[]): void {
    this.tbody.innerHTML = '';

    for (const item of queue) {
      const tr = document.createElement('tr');
      tr.dataset.jobId = item.id;
      tr.draggable = true;
      tr.innerHTML = this.createRowHTML(item);
      this.bindRowEvents(tr, item);
      this.bindDragEvents(tr);
      this.tbody.appendChild(tr);
    }
  }

  private createRowHTML(item: any): string {
    const scheduledTime = new Date(item.scheduledAt).toLocaleString();
    const statusClass = item.status;
    const statusLabel = this.getStatusLabel(item.status);
    const canRun = ['waiting', 'paused', 'failed', 'retrying'].includes(item.status);
    const isRunning = item.status === 'running';

    return `
      <td>${scheduledTime}</td>
      <td>
        <strong>${this.escapeHtml(item.params.title)}</strong>
        ${item.params.subtitle ? `<br><small style="color: var(--text-muted)">${this.escapeHtml(item.params.subtitle)}</small>` : ''}
      </td>
      <td>${this.escapeHtml(item.params.category)}</td>
      <td>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
        ${item.lastError ? `<br><small style="color: var(--accent-danger)">${this.escapeHtml(item.lastError)}</small>` : ''}
      </td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit" title="Edit" ${isRunning ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn run" title="Run Now" ${!canRun ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>
          <button class="action-btn test" title="Test Run (Dry Run)" ${!canRun ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          </button>
          <button class="action-btn log" title="View Log">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </button>
          <button class="action-btn delete" title="Delete" ${isRunning ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </td>
    `;
  }

  private getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      waiting: '⏳ Waiting',
      running: '🔄 Running',
      paused: '⏸ Paused',
      retrying: '🔁 Retrying',
      completed: '✅ Completed',
      failed: '❌ Failed'
    };
    return labels[status] || status;
  }

  private bindRowEvents(tr: HTMLTableRowElement, item: any): void {
    tr.querySelector('.action-btn.edit')?.addEventListener('click', () => {
      JobModal.openForEdit(item);
    });

    tr.querySelector('.action-btn.run')?.addEventListener('click', async () => {
      if (confirm(`Run "${item.params.title}" now?`)) {
        await queueStore.runNow(item.id);
      }
    });

    tr.querySelector('.action-btn.test')?.addEventListener('click', async () => {
      const result = await queueStore.testRun(item.id);
      LogModal.open(item, result);
    });

    tr.querySelector('.action-btn.log')?.addEventListener('click', async () => {
      const log = await window.api.history.getLog(item.id);
      const screenshots = await window.api.history.getScreenshots(item.id);
      LogModal.open(item, log, screenshots);
    });

    tr.querySelector('.action-btn.delete')?.addEventListener('click', async () => {
      if (confirm(`Delete "${item.params.title}"?`)) {
        await queueStore.delete(item.id);
      }
    });
  }

  private bindDragEvents(tr: HTMLTableRowElement): void {
    tr.addEventListener('dragstart', (e) => {
      this.dragSrc = tr;
      tr.classList.add('dragging');
      (e as DragEvent).dataTransfer!.effectAllowed = 'move';
    });

    tr.addEventListener('dragend', () => {
      tr.classList.remove('dragging');
      this.dragSrc = null;
    });

    tr.addEventListener('dragover', (e) => {
      e.preventDefault();
      (e as DragEvent).dataTransfer!.dropEffect = 'move';
      const target = e.currentTarget as HTMLElement;
      if (target !== this.dragSrc) {
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if ((e as DragEvent).clientY < midY) {
          target.style.borderTop = '2px solid var(--accent-primary)';
          target.style.borderBottom = 'none';
        } else {
          target.style.borderBottom = '2px solid var(--accent-primary)';
          target.style.borderTop = 'none';
        }
      }
    });

    tr.addEventListener('dragleave', () => {
      tr.style.borderTop = '';
      tr.style.borderBottom = '';
    });

    tr.addEventListener('drop', (e) => {
      e.preventDefault();
      tr.style.borderTop = '';
      tr.style.borderBottom = '';
      
      if (this.dragSrc && this.dragSrc !== tr) {
        const srcId = this.dragSrc.dataset.jobId!;
        const targetId = tr.dataset.jobId!;
        const allIds = Array.from(this.tbody.querySelectorAll('tr')).map(r => r.dataset.jobId!);
        const srcIndex = allIds.indexOf(srcId);
        const targetIndex = allIds.indexOf(targetId);
        
        // Reorder array
        const newIds = [...allIds];
        newIds.splice(srcIndex, 1);
        newIds.splice(targetIndex, 0, srcId);
        
        queueStore.reorder(newIds);
      }
    });
  }

  updateJobProgress(progress: any): void {
    const tr = this.tbody.querySelector(`tr[data-job-id="${progress.jobId}"]`);
    if (!tr) return;

    const statusCell = tr.querySelector('td:nth-child(4)');
    if (statusCell) {
      statusCell.innerHTML = `
        <span class="status-badge running">🔄 Running</span>
        <div style="margin-top: 4px; font-size: 0.75rem; color: var(--text-muted)">
          ${progress.message} (${progress.progress}%)
        </div>
        <progress value="${progress.progress}" max="100" style="width: 100%; margin-top: 4px;"></progress>
      `;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}