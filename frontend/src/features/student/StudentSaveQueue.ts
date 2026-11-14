import type { PendingStudentSave, SaveResponseResult } from '../../types/student';
import { ApiError } from '../../types';

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];
const NON_RETRYABLE_CODES = new Set([
  'CHOOSE_N_LIMIT',
  'SECTION_LOCKED',
  'SECTION_TIME_EXPIRED',
]);

export class StudentSaveQueue {
  private readonly pending = new Map<number, PendingStudentSave>();
  private readonly inFlight = new Map<number, Promise<void>>();
  private readonly retryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly retryCounts = new Map<number, number>();
  private destroyed = false;

  constructor(
    private readonly send: (entry: PendingStudentSave) => Promise<SaveResponseResult>,
    private readonly onChange: (pending: PendingStudentSave[], savingCount: number) => void,
    private readonly onSaved: (
      entry: PendingStudentSave,
      result: SaveResponseResult
    ) => void,
    private readonly onRejected: (entry: PendingStudentSave, error: ApiError) => void,
    private readonly isOnline: () => boolean
  ) {}

  snapshot(): PendingStudentSave[] {
    return [...this.pending.values()];
  }

  restore(entries: PendingStudentSave[]): void {
    for (const entry of entries) {
      const current = this.pending.get(entry.question_id);
      if (!current || entry.client_sequence > current.client_sequence) {
        this.pending.set(entry.question_id, entry);
      }
    }
    this.emit();
    for (const questionId of this.pending.keys()) this.start(questionId);
  }

  enqueue(entry: PendingStudentSave): void {
    if (this.destroyed) return;
    this.pending.set(entry.question_id, entry);
    this.emit();
    this.start(entry.question_id);
  }

  async flush(): Promise<boolean> {
    if (this.destroyed || !this.isOnline()) return false;
    this.retryPending();
    await Promise.all([...this.inFlight.values()]);
    return this.pending.size === 0;
  }

  retryPending(): void {
    if (this.destroyed || !this.isOnline()) return;
    for (const questionId of this.pending.keys()) {
      this.clearRetryTimer(questionId);
      this.start(questionId);
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
  }

  private start(questionId: number): void {
    if (
      this.destroyed
      || !this.isOnline()
      || this.inFlight.has(questionId)
      || !this.pending.has(questionId)
    ) return;

    const worker = this.drain(questionId).finally(() => {
      this.inFlight.delete(questionId);
      this.emit();
      if (this.pending.has(questionId) && !this.retryTimers.has(questionId)) {
        this.start(questionId);
      }
    });
    this.inFlight.set(questionId, worker);
    this.emit();
  }

  private async drain(questionId: number): Promise<void> {
    while (!this.destroyed && this.isOnline()) {
      const entry = this.pending.get(questionId);
      if (!entry) return;

      try {
        const result = await this.send(entry);
        if (this.destroyed) return;
        this.retryCounts.delete(questionId);
        this.onSaved(entry, result);
        if (this.pending.get(questionId) === entry) {
          this.pending.delete(questionId);
        }
      } catch (error) {
        if (this.destroyed) return;
        const latest = this.pending.get(questionId);
        if (
          error instanceof ApiError
          && NON_RETRYABLE_CODES.has(error.code)
          && latest === entry
        ) {
          this.pending.delete(questionId);
          this.retryCounts.delete(questionId);
          this.onRejected(entry, error);
          continue;
        }

        if (latest !== entry) continue;
        this.scheduleRetry(questionId);
        return;
      }
      this.emit();
    }
  }

  private scheduleRetry(questionId: number): void {
    if (this.retryTimers.has(questionId) || this.destroyed) return;
    const failures = this.retryCounts.get(questionId) ?? 0;
    const delay = RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)];
    this.retryCounts.set(questionId, failures + 1);
    const timer = setTimeout(() => {
      this.retryTimers.delete(questionId);
      this.start(questionId);
    }, delay);
    this.retryTimers.set(questionId, timer);
    this.emit();
  }

  private clearRetryTimer(questionId: number): void {
    const timer = this.retryTimers.get(questionId);
    if (timer !== undefined) clearTimeout(timer);
    this.retryTimers.delete(questionId);
  }

  private emit(): void {
    if (!this.destroyed) {
      this.onChange(this.snapshot(), this.inFlight.size);
    }
  }
}
