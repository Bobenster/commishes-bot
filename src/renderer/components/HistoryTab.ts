// HistoryTab Component

import { historyStore } from '../stores/historyStore.js';
import { uiStore } from '../stores/uiStore.js';
import { LogModal } from './LogModal.js';
import { JobModal } from './JobModal.js';

export class HistoryTab {
  private tbody: HTMLTableSectionElement;
  private emptyState: HTMLElement;
  private searchInput: HTMLInputElement;
  private statusFilter: HTMLSelectElement;
  private dateFrom: HTMLInputElement;
  private dateTo: HTMLInputElement;
  private unsubscribeHistory: (() => void) | null = null;
  private unsubscribeUI: (() => void) | null = null;
  private debounceTimer: number | null = null;

  constructor() {
    this.tbody = document.getElementById('historyTableBody') as HTMLTableSectionElement;
    this.emptyState = document.getElementById('historyEmpty')!;
    this.searchInput = document.getElementById('historySearch') as HTMLInputElement;
    this.statusFilter = document.getElementById('historyStatusFilter') as HTMLSelectElement;
    this.dateFrom = document.getElementById('historyDateFrom') as HTMLInputElement;
    this.dateTo = document.getElementById('historyDateTo') as HTMLInputElement;

    this.bindEvents();
    this.subscribe();
  }

  private bindEvents(): void {
    const debouncedRefresh = () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => this.refresh(), 300);
    };

    this.searchInput.addEventListener('input', debouncedRefresh);
    this.statusFilter.addEventListener('change', debouncedRefresh);
    this.dateFrom.addEventListener('change', debouncedRefresh);
    this.dateTo.addEventListener('change', debouncedRefresh);
  }

  private subscribe(): void {
    this.unsubscribeHistory = historyStore.subscribe(() => this.render());
    this.unsubscribeUI = uiStore.subscribe(() => this.render());
  }

  destroy(): void {
    this.unsubscribeHistory?.();
    this.unsubscribeUI?.();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  async refresh(): Promise<void> {
    const filter: any = {};
    if (uiStore.historySearch) filter.search = uiStore.historySearch;
    if (uiStore.historyStatusFilter) filter.status = uiStore.historyStatusFilter;
    if (uiStore.historyDateFrom) filter.dateFrom = uiStore.historyDateFrom;
    if (uiStore.historyDateTo) filter.dateTo = uiStore.historyDateTo;

    await historyStore.refresh(filter);
  }

  render(): void {
    const history = historyStore.all;

    this.emptyState.style.display = history.length === 0 ? 'flex' : 'none';
    (this.tbody.parentElement as HTMLElement).style.display = history.length === 0 ? 'none' : 'table';

    this.tbody.innerHTML = '';

    for (const item of history) {
      const tr = document.createElement('tr');
      tr.innerHTML = this.createRowHTML(item);
      this.bindRowEvents(tr, item);
      this.tbody.appendChild(tr);
    }
  }

  private createRowHTML(item: any): string {
    const date = new Date(item.startedAt).toLocaleString();
    const duration = item.finishedAt 
      ? `${((new Date(item.finishedAt).getTime() - new Date(item.startedAt).getTime()) / 1000).toFixed(1)}s`
      : '-';
    const statusClass = item.success ? 'success' : 'failed';
    const statusLabel = item.success ? '✅ Success' : '❌ Failed';
    const auctionLink = item.auctionUrl 
      ? `<a href="${item.auctionUrl}" target="_blank" class="auction-link">Open ↗</a>`
      : '-';

    return `
      <td>${date}</td>
      <td>
        <strong>${this.escapeHtml(item.queueItemId.slice(0, 8))}...</strong>
        ${item.stages?.some((s: any) => s.details?.title) 
          ? `<br><small style="color: var(--text-muted)">${this.escapeHtml(item.stages.find((s: any) => s.details?.title)?.details?.title || '')}</small>`
          : ''}
      </td>
      <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      <td>${duration}</td>
      <td>${auctionLink}</td>
      <td>
        <button class="action-btn clone" title="Make New">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button class="action-btn log" title="View Details">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </button>
      </td>
    `;
  }

  private bindRowEvents(tr: HTMLTableRowElement, item: any): void {
    const cloneBtn = tr.querySelector<HTMLButtonElement>('.action-btn.clone');
    cloneBtn?.addEventListener('click', async () => {
      const sourceParams = item.sourceParams;
      if (sourceParams) {
        JobModal.openForClone({
          params: sourceParams,
          scheduledAt: item.sourceScheduledAt || item.startedAt,
          recurrence: item.sourceRecurrence
        });
        return;
      }

      const source = await window.api.queue.getById(item.queueItemId);
      if (!source) {
        alert('Original queue item is no longer available, so its publication data cannot be cloned.');
        return;
      }

      JobModal.openForClone(source);
    });

    const logBtn = tr.querySelector<HTMLButtonElement>('.action-btn.log');
    logBtn?.addEventListener('click', async () => {
      const log = await historyStore.getLog(item.queueItemId);
      const screenshots = await historyStore.getScreenshots(item.queueItemId);
      LogModal.open(item, log, screenshots);
    });

    // Click row to open log
    tr.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('button') && !(e.target as HTMLElement).closest('a')) {
        logBtn?.click();
      }
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}