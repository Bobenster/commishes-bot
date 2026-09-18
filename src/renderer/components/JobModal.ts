// JobModal Component - Create/Edit publication

import { queueStore } from '../stores/queueStore.js';
import { settingsStore } from '../stores/settingsStore.js';

interface JobData {
  id?: string;
  params: any;
  scheduledAt: string;
}

export class JobModal {
  private modal: HTMLElement;
  private form: HTMLFormElement;
  private titleEl: HTMLElement;
  private closeBtn: HTMLElement;
  private cancelBtn: HTMLButtonElement;
  private saveBtn: HTMLButtonElement;
  private imageBtn: HTMLButtonElement;
  private imageText: HTMLElement;
  private imagePreview: HTMLElement;
  private selectedImagePath: string = '';
  private currentJob: JobData | null = null;
  private isEdit = false;

  constructor() {
    this.modal = document.getElementById('jobModal')!;
    this.form = document.getElementById('jobForm') as HTMLFormElement;
    this.titleEl = document.getElementById('jobModalTitle')!;
    this.closeBtn = document.getElementById('jobModalClose')!;
    this.cancelBtn = document.getElementById('jobModalCancel') as HTMLButtonElement;
    this.saveBtn = document.getElementById('jobModalSave') as HTMLButtonElement;
    this.imageBtn = document.getElementById('jobImageBtn') as HTMLButtonElement;
    this.imageText = document.getElementById('jobImageText')!;
    this.imagePreview = document.getElementById('imagePreview')!;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.closeBtn.addEventListener('click', () => this.close());
    this.cancelBtn.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.save();
    });

    // Image select button
    this.imageBtn.addEventListener('click', () => this.browseImage());

    // Autobuy toggle
    const autobuyEnabled = document.getElementById('jobAutobuyEnabled') as HTMLInputElement;
    const autobuyGroup = document.getElementById('jobAutobuyGroup')!;
    autobuyEnabled.addEventListener('change', () => {
      autobuyGroup.style.display = autobuyEnabled.checked ? 'block' : 'none';
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.hidden) {
        this.close();
      }
    });
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
      this.showImagePreview(filePath);
    }
  }

  static openForEdit(job: any): void {
    const modal = new JobModal();
    modal.open(job);
  }

  static openForNew(): void {
    const modal = new JobModal();
    modal.open();
  }

  open(job?: any): void {
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
    }

    this.modal.hidden = false;
    const firstInput = this.form.querySelector('input, select') as HTMLElement;
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
  }

  private setDefaultDateTime(): void {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5); // Default to 5 minutes from now
    const dateInput = document.getElementById('jobDate') as HTMLInputElement;
    const timeInput = document.getElementById('jobTime') as HTMLInputElement;
    dateInput.value = now.toISOString().split('T')[0];
    timeInput.value = now.toTimeString().slice(0, 5);
  }

  private populateForm(job: any): void {
    (document.getElementById('jobCategory') as HTMLSelectElement).value = job.params.category;
    (document.getElementById('jobSubtitle') as HTMLInputElement).value = job.params.subtitle;
    (document.getElementById('jobTitle') as HTMLInputElement).value = job.params.title;
    (document.getElementById('jobDescription') as HTMLTextAreaElement).value = job.params.description;
    
    const ratingInput = document.querySelector(`input[name="rating"][value="${job.params.rating}"]`) as HTMLInputElement;
    if (ratingInput) ratingInput.checked = true;

    (document.getElementById('jobNsfw') as HTMLInputElement).checked = job.params.nsfw;
    (document.getElementById('jobPreventSniping') as HTMLInputElement).checked = job.params.preventSniping;

    (document.getElementById('jobDuration') as HTMLSelectElement).value = job.params.duration;
    (document.getElementById('jobPromoted') as HTMLInputElement).checked = job.params.promoted;

    (document.getElementById('jobStartingBid') as HTMLInputElement).value = job.params.startingBid;
    (document.getElementById('jobMinIncrease') as HTMLInputElement).value = job.params.minIncrease;
    (document.getElementById('jobAutobuyEnabled') as HTMLInputElement).checked = job.params.autobuyEnabled;
    (document.getElementById('jobAutobuy') as HTMLInputElement).value = job.params.autobuy;
    document.getElementById('jobAutobuyGroup')!.style.display = job.params.autobuyEnabled ? 'block' : 'none';

    const scheduled = new Date(job.scheduledAt);
    (document.getElementById('jobDate') as HTMLInputElement).value = scheduled.toISOString().split('T')[0];
    (document.getElementById('jobTime') as HTMLInputElement).value = scheduled.toTimeString().slice(0, 5);

    // Show existing image if any
    if (job.params.imagePath) {
      this.selectedImagePath = job.params.imagePath;
      const fileName = job.params.imagePath.split('\\').pop() || job.params.imagePath.split('/').pop() || 'Selected';
      this.imageText.textContent = fileName;
      this.showImagePreview(job.params.imagePath);
    }
  }

  private handleImageChange(): void {
    const file = this.imageInput.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      this.showImagePreview(url);
    }
  }

  private showImagePreview(src: string): void {
    this.imagePreview.innerHTML = `<img src="${src}" alt="Preview">`;
    this.imagePreview.style.display = 'block';
  }

  private async save(): Promise<void> {
    if (!this.validateForm()) return;

    this.saveBtn.disabled = true;
    this.saveBtn.textContent = this.isEdit ? 'Saving...' : 'Adding...';

    try {
      const { params, scheduledAt } = this.collectFormData();
      
      // Copy image to images directory
      if (params.imagePath) {
        const imagePath = await queueStore.copyImage(params.imagePath);
        params.imagePath = imagePath;
      }

      if (this.isEdit && this.currentJob) {
        await queueStore.update(this.currentJob.id!, { params, scheduledAt });
      } else {
        await queueStore.add({ params, scheduledAt });
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

  private collectFormData(): { params: any; scheduledAt: string } {
    const scheduledAt = new Date(
      (document.getElementById('jobDate') as HTMLInputElement).value + 'T' +
      (document.getElementById('jobTime') as HTMLInputElement).value
    ).toISOString();

    const params = {
      imagePath: this.selectedImagePath,
      category: (document.getElementById('jobCategory') as HTMLSelectElement).value,
      subtitle: (document.getElementById('jobSubtitle') as HTMLInputElement).value,
      title: (document.getElementById('jobTitle') as HTMLInputElement).value,
      description: (document.getElementById('jobDescription') as HTMLTextAreaElement).value,
      rating: (document.querySelector('input[name="rating"]:checked') as HTMLInputElement).value,
      nsfw: (document.getElementById('jobNsfw') as HTMLInputElement).checked,
      preventSniping: (document.getElementById('jobPreventSniping') as HTMLInputElement).checked,
      duration: (document.getElementById('jobDuration') as HTMLSelectElement).value,
      promoted: (document.getElementById('jobPromoted') as HTMLInputElement).checked,
      startingBid: (document.getElementById('jobStartingBid') as HTMLInputElement).value,
      minIncrease: (document.getElementById('jobMinIncrease') as HTMLInputElement).value,
      autobuyEnabled: (document.getElementById('jobAutobuyEnabled') as HTMLInputElement).checked,
      autobuy: (document.getElementById('jobAutobuy') as HTMLInputElement).value
    };

    return { params, scheduledAt };
  }

  private validateForm(): boolean {
    // Check image
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

    const scheduledAt = new Date(
      (document.getElementById('jobDate') as HTMLInputElement).value + 'T' +
      (document.getElementById('jobTime') as HTMLInputElement).value
    );
    if (scheduledAt <= new Date()) {
      if (!confirm('Scheduled time is in the past. Continue anyway?')) {
        return false;
      }
    }

    return true;
  }
}