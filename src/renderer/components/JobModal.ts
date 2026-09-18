// JobModal Component - Create/Edit publication

import { queueStore } from '../stores/queueStore.js';
import type { AuctionDuration, AuctionParams, QueueItem, RecurrenceSettings } from '../../main/engine/types.js';

interface JobData {
  id?: string;
  params: AuctionParams;
  scheduledAt: string;
  recurrence?: RecurrenceSettings;
}

const DURATION_LABELS: Record<AuctionDuration, string> = {
  '24h': '24 hours',
  '3d': '3 days',
  '7d': '7 days'
};

const DURATION_DAYS: Record<AuctionDuration, number> = {
  '24h': 1,
  '3d': 3,
  '7d': 7
};

export class JobModal {
  private modal: HTMLElement;
  private form: HTMLFormElement;
  private titleEl: HTMLElement;
  private closeBtn: HTMLElement;
  private saveBtn: HTMLButtonElement;
  private imageBtn: HTMLButtonElement;
  private imageText: HTMLElement;
  private imagePreview: HTMLElement;
  private repeatCheckbox: HTMLInputElement;
  private repeatOptions: HTMLElement;
  private repeatGapInput: HTMLInputElement;
  private repeatSummary: HTMLElement;
  private selectedImagePath = '';
  private currentJob: JobData | null = null;
  private isEdit = false;

  constructor() {
    this.modal = document.getElementById('jobModal')!;
    this.form = document.getElementById('jobForm') as HTMLFormElement;
    this.titleEl = document.getElementById('jobModalTitle')!;
    this.closeBtn = document.getElementById('jobModalClose')!;
    this.saveBtn = document.getElementById('jobModalSave') as HTMLButtonElement;
    this.imageBtn = document.getElementById('jobImageBtn') as HTMLButtonElement;
    this.imageText = document.getElementById('jobImageText')!;
    this.imagePreview = document.getElementById('imagePreview')!;
    this.repeatCheckbox = document.getElementById('jobRepeat') as HTMLInputElement;
    this.repeatOptions = document.getElementById('jobRepeatOptions')!;
    this.repeatGapInput = document.getElementById('jobRepeatGap') as HTMLInputElement;
    this.repeatSummary = document.getElementById('jobRepeatSummary')!;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.closeBtn.addEventListener('click', () => this.close());
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.save();
    });

    this.imageBtn.addEventListener('click', () => void this.browseImage());

    const autobuyEnabled = document.getElementById('jobAutobuyEnabled') as HTMLInputElement;
    const autobuyGroup = document.getElementById('jobAutobuyGroup')!;
    autobuyEnabled.addEventListener('change', () => {
      autobuyGroup.style.display = autobuyEnabled.checked ? 'block' : 'none';
    });

    document.getElementById('jobDateMinus')?.addEventListener('click', () => this.adjustDate(-1));
    document.getElementById('jobDatePlus')?.addEventListener('click', () => this.adjustDate(1));
    document.getElementById('jobTimeMinus')?.addEventListener('click', () => this.adjustHour(-1));
    document.getElementById('jobTimePlus')?.addEventListener('click', () => this.adjustHour(1));

    this.repeatCheckbox.addEventListener('change', () => this.updateRepeatUI());
    this.repeatGapInput.addEventListener('input', () => this.updateRepeatSummary());

    document.getElementById('jobDuration')?.addEventListener('change', () => this.updateRepeatSummary());

  }

  private async browseImage(): Promise<void> {
    const result = await window.api.dialog.openFile({
      title: 'Select Image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      this.selectedImagePath = filePath;
      const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || 'Selected';
      this.imageText.textContent = fileName;
      await this.showImagePreview(filePath);
    }
  }

  static openForEdit(job: QueueItem): void {
    const modal = new JobModal();
    modal.open(job);
  }

  static openForNew(): void {
    const modal = new JobModal();
    modal.open();
  }

  open(job?: QueueItem): void {
    this.resetForm();

    if (job) {
      this.isEdit = true;
      this.currentJob = job;
      this.titleEl.textContent = 'Edit Publication';
      this.saveBtn.textContent = 'Save Changes';
      this.populateForm(job);
    } else {
      this.isEdit = false;
      this.currentJob = null;
      this.titleEl.textContent = 'New Publication';
      this.saveBtn.textContent = 'Add to Queue';
      this.setDefaultDateTime();
      this.updateRepeatUI();
    }

    this.modal.hidden = false;
    const firstInput = this.form.querySelector('input:not([type="checkbox"]):not([type="radio"]), select') as HTMLElement;
    firstInput?.focus();
  }

  close(): void {
    this.modal.hidden = true;
    this.resetForm();
    this.currentJob = null;
    this.isEdit = false;
  }

  private resetForm(): void {
    this.form.reset();
    this.selectedImagePath = '';
    this.imageText.textContent = 'No file selected';
    this.imagePreview.style.display = 'none';
    this.imagePreview.innerHTML = '';
    document.getElementById('jobAutobuyGroup')!.style.display = 'none';
    this.repeatGapInput.value = '1';
    this.repeatCheckbox.checked = false;
    this.repeatOptions.hidden = true;
    this.repeatSummary.textContent = '';
  }

  private setDefaultDateTime(): void {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    this.writeLocalDateTime(now);
  }

  private populateForm(job: QueueItem): void {
    const params = job.params;

    (document.getElementById('jobCategory') as HTMLSelectElement).value = params.category;
    (document.getElementById('jobSubtitle') as HTMLInputElement).value = params.subtitle;
    (document.getElementById('jobTitle') as HTMLInputElement).value = params.title;
    (document.getElementById('jobDescription') as HTMLTextAreaElement).value = params.description;

    const ratingInput = document.querySelector(`input[name="rating"][value="${params.rating}"]`) as HTMLInputElement;
    if (ratingInput) ratingInput.checked = true;

    (document.getElementById('jobNsfw') as HTMLInputElement).checked = false;
    (document.getElementById('jobPreventSniping') as HTMLInputElement).checked = false;

    (document.getElementById('jobDuration') as HTMLSelectElement).value = params.duration;
    (document.getElementById('jobPromoted') as HTMLInputElement).checked = params.promoted;

    (document.getElementById('jobStartingBid') as HTMLInputElement).value = params.startingBid;
    (document.getElementById('jobMinIncrease') as HTMLInputElement).value = params.minIncrease;
    (document.getElementById('jobAutobuyEnabled') as HTMLInputElement).checked = params.autobuyEnabled;
    (document.getElementById('jobAutobuy') as HTMLInputElement).value = params.autobuy;
    document.getElementById('jobAutobuyGroup')!.style.display = params.autobuyEnabled ? 'block' : 'none';

    const scheduled = new Date(job.scheduledAt);
    if (!Number.isNaN(scheduled.getTime())) {
      this.writeLocalDateTime(scheduled);
    }

    this.repeatCheckbox.checked = job.recurrence?.enabled === true;
    this.repeatGapInput.value = String(job.recurrence?.gapDays ?? 1);
    this.updateRepeatUI();

    if (params.imagePath) {
      this.selectedImagePath = params.imagePath;
      const fileName = params.imagePath.split('\\').pop() || params.imagePath.split('/').pop() || 'Selected';
      this.imageText.textContent = fileName;
      void this.showImagePreview(params.imagePath);
    }
  }

  private async showImagePreview(src: string): Promise<void> {
    this.imagePreview.style.display = 'flex';
    this.imagePreview.innerHTML = '<span class="image-preview-loading">Loading preview…</span>';

    try {
      const dataUrl = await window.api.dialog.readImagePreview(src);
      if (!dataUrl) {
        throw new Error('Preview data is empty');
      }

      const img = document.createElement('img');
      img.alt = 'Preview';
      img.src = dataUrl;
      this.imagePreview.innerHTML = '';
      this.imagePreview.appendChild(img);
    } catch (error) {
      console.error('Failed to load image preview:', error);
      this.imagePreview.innerHTML = '<span class="image-preview-error">Preview unavailable</span>';
    }
  }

  private getScheduledLocalDate(): Date | null {
    const dateValue = (document.getElementById('jobDate') as HTMLInputElement).value;
    const timeValue = (document.getElementById('jobTime') as HTMLInputElement).value;

    if (!dateValue || !timeValue) return null;

    const [year, month, day] = dateValue.split('-').map(Number);
    const [hour, minute] = timeValue.split(':').map(Number);
    const date = new Date(year, month - 1, day, hour, minute, 0, 0);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private writeLocalDateTime(date: Date): void {
    const dateInput = document.getElementById('jobDate') as HTMLInputElement;
    const timeInput = document.getElementById('jobTime') as HTMLInputElement;

    const pad = (value: number) => String(value).padStart(2, '0');

    dateInput.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    timeInput.value = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private adjustDate(deltaDays: number): void {
    const scheduled = this.getScheduledLocalDate() ?? new Date();
    scheduled.setDate(scheduled.getDate() + deltaDays);
    this.writeLocalDateTime(scheduled);
  }

  private adjustHour(deltaHours: number): void {
    const scheduled = this.getScheduledLocalDate() ?? new Date();
    scheduled.setHours(scheduled.getHours() + deltaHours);
    this.writeLocalDateTime(scheduled);
  }

  private updateRepeatUI(): void {
    this.repeatOptions.hidden = !this.repeatCheckbox.checked;
    this.updateRepeatSummary();
  }

  private updateRepeatSummary(): void {
    if (!this.repeatCheckbox.checked) {
      this.repeatSummary.textContent = '';
      return;
    }

    const duration = (document.getElementById('jobDuration') as HTMLSelectElement).value as AuctionDuration;
    const gapDays = Math.max(0, Number(this.repeatGapInput.value || 0));
    const durationDays = DURATION_DAYS[duration] ?? 1;
    const totalDays = durationDays + gapDays;
    const durationLabel = DURATION_LABELS[duration] ?? 'duration';

    this.repeatSummary.textContent = `Repeats every ${totalDays} day(s): ${durationLabel} + ${gapDays} day(s) gap.`;
  }

  private async save(): Promise<void> {
    if (!this.validateForm()) return;

    this.saveBtn.disabled = true;
    this.saveBtn.textContent = this.isEdit ? 'Saving...' : 'Adding...';

    try {
      const { params, scheduledAt, recurrence } = this.collectFormData();

      const imageUnchanged = this.isEdit && this.currentJob?.params.imagePath === params.imagePath;
      if (params.imagePath && !imageUnchanged) {
        params.imagePath = await queueStore.copyImage(params.imagePath);
      }

      if (this.isEdit && this.currentJob?.id) {
        await queueStore.update(this.currentJob.id, { params, scheduledAt, recurrence });
      } else {
        await queueStore.add({ params, scheduledAt, recurrence });
      }

      this.close();
    } catch (error) {
      console.error('Failed to save job:', error);
      alert(`Failed to save: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.textContent = this.isEdit ? 'Save Changes' : 'Add to Queue';
    }
  }

  private collectFormData(): {
    params: AuctionParams;
    scheduledAt: string;
    recurrence: RecurrenceSettings;
  } {
    const scheduled = this.getScheduledLocalDate();
    if (!scheduled) {
      throw new Error('A valid schedule date and time are required');
    }

    const params: AuctionParams = {
      imagePath: this.selectedImagePath,
      category: (document.getElementById('jobCategory') as HTMLSelectElement).value,
      subtitle: (document.getElementById('jobSubtitle') as HTMLInputElement).value,
      title: (document.getElementById('jobTitle') as HTMLInputElement).value,
      description: (document.getElementById('jobDescription') as HTMLTextAreaElement).value,
      rating: (document.querySelector('input[name="rating"]:checked') as HTMLInputElement).value as AuctionParams['rating'],
      nsfw: false,
      preventSniping: false,
      duration: (document.getElementById('jobDuration') as HTMLSelectElement).value as AuctionDuration,
      promoted: (document.getElementById('jobPromoted') as HTMLInputElement).checked,
      startingBid: (document.getElementById('jobStartingBid') as HTMLInputElement).value,
      minIncrease: (document.getElementById('jobMinIncrease') as HTMLInputElement).value,
      autobuyEnabled: (document.getElementById('jobAutobuyEnabled') as HTMLInputElement).checked,
      autobuy: (document.getElementById('jobAutobuy') as HTMLInputElement).value
    };

    const gapDays = Number(this.repeatGapInput.value || 1);
    const recurrence: RecurrenceSettings = {
      enabled: this.repeatCheckbox.checked,
      gapDays: Number.isFinite(gapDays) ? Math.max(0, Math.floor(gapDays)) : 1
    };

    return {
      params,
      scheduledAt: scheduled.toISOString(),
      recurrence
    };
  }

  private validateForm(): boolean {
    if (!this.selectedImagePath && !this.currentJob?.params.imagePath) {
      alert('Image is required');
      this.imageBtn.focus();
      return false;
    }

    const requiredFields = [
      { id: 'jobCategory', label: 'Category' },
      { id: 'jobSubtitle', label: 'Subtitle' },
      { id: 'jobTitle', label: 'Title' },
      { id: 'jobDuration', label: 'Duration' },
      { id: 'jobStartingBid', label: 'Starting Bid' },
      { id: 'jobMinIncrease', label: 'Min Increase' },
      { id: 'jobDate', label: 'Date' },
      { id: 'jobTime', label: 'Time' }
    ];

    for (const field of requiredFields) {
      const el = document.getElementById(field.id) as HTMLInputElement | HTMLSelectElement;
      if (!el.value) {
        alert(`${field.label} is required`);
        el.focus();
        return false;
      }
    }

    const autobuyEnabled = (document.getElementById('jobAutobuyEnabled') as HTMLInputElement).checked;
    if (autobuyEnabled) {
      const autobuy = (document.getElementById('jobAutobuy') as HTMLInputElement).value;
      if (!autobuy || parseFloat(autobuy) <= 0) {
        alert('Autobuy amount is required when Autobuy is enabled');
        return false;
      }
    }

    const scheduled = this.getScheduledLocalDate();
    if (!scheduled) {
      alert('A valid schedule date and time are required');
      return false;
    }

    if (scheduled <= new Date()) {
      if (!confirm('Scheduled time is in the past. Continue anyway?')) {
        return false;
      }
    }

    if (!Number.isFinite(Number(this.repeatGapInput.value)) || Number(this.repeatGapInput.value) < 0) {
      alert('Repeat gap must be 0 or greater');
      this.repeatGapInput.focus();
      return false;
    }

    return true;
  }
}
