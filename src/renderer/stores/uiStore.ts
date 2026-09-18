// UI Store - Global UI state

type Listener = (state: UIState) => void;

interface UIState {
  activeTab: 'queue' | 'history' | 'settings';
  queueSearch: string;
  queueStatusFilter: string;
  historySearch: string;
  historyStatusFilter: string;
  historyDateFrom: string;
  historyDateTo: string;
  schedulerStatus: any;
}

class UIStore {
  private state: UIState = {
    activeTab: 'queue',
    queueSearch: '',
    queueStatusFilter: '',
    historySearch: '',
    historyStatusFilter: '',
    historyDateFrom: '',
    historyDateTo: '',
    schedulerStatus: null
  };
  private listeners: Set<Listener> = new Set();

  get activeTab(): string {
    return this.state.activeTab;
  }

  get queueSearch(): string {
    return this.state.queueSearch;
  }

  get queueStatusFilter(): string {
    return this.state.queueStatusFilter;
  }

  get historySearch(): string {
    return this.state.historySearch;
  }

  get historyStatusFilter(): string {
    return this.state.historyStatusFilter;
  }

  get historyDateFrom(): string {
    return this.state.historyDateFrom;
  }

  get historyDateTo(): string {
    return this.state.historyDateTo;
  }

  get schedulerStatus(): any {
    return this.state.schedulerStatus;
  }

  setActiveTab(tab: 'queue' | 'history' | 'settings'): void {
    this.state.activeTab = tab;
    this.notify();
  }

  setQueueSearch(search: string): void {
    this.state.queueSearch = search;
    this.notify();
  }

  setQueueStatusFilter(filter: string): void {
    this.state.queueStatusFilter = filter;
    this.notify();
  }

  setHistorySearch(search: string): void {
    this.state.historySearch = search;
    this.notify();
  }

  setHistoryStatusFilter(filter: string): void {
    this.state.historyStatusFilter = filter;
    this.notify();
  }

  setHistoryDateFrom(date: string): void {
    this.state.historyDateFrom = date;
    this.notify();
  }

  setHistoryDateTo(date: string): void {
    this.state.historyDateTo = date;
    this.notify();
  }

  setSchedulerStatus(status: any): void {
    this.state.schedulerStatus = status;
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener({ ...this.state });
    }
  }
}

export const uiStore = new UIStore();