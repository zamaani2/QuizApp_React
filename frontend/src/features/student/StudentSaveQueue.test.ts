import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../types';
import type { PendingStudentSave } from '../../types/student';
import { StudentSaveQueue } from './StudentSaveQueue';

const createEntry = (sequence: number): PendingStudentSave => ({
  question_id: 7,
  response: {
    selected_choice_id: null,
    selected_choice_ids: [],
    text_answer: `Answer ${sequence}`,
    answer_data: {},
  },
  timestamp: sequence,
  client_sequence: sequence,
  section_id: null,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StudentSaveQueue', () => {
  it('sends only the latest answer after an in-flight save completes', async () => {
    let resolveFirst: (() => void) | undefined;
    const send = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = () => resolve({ success: true });
      }))
      .mockResolvedValue({ success: true });
    const queue = new StudentSaveQueue(
      send,
      () => {},
      () => {},
      () => {},
      () => true
    );

    queue.enqueue(createEntry(1));
    queue.enqueue(createEntry(2));
    const flushed = queue.flush();
    resolveFirst?.();

    await expect(flushed).resolves.toBe(true);
    expect(send.mock.calls.map(([entry]) => entry.client_sequence)).toEqual([1, 2]);
    queue.destroy();
  });

  it('retries with the capped exponential backoff schedule', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockRejectedValue(new Error('network unavailable'));
    const queue = new StudentSaveQueue(
      send,
      () => {},
      () => {},
      () => {},
      () => true
    );

    queue.enqueue(createEntry(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    for (const [index, delay] of [1000, 2000, 4000, 8000, 15000].entries()) {
      await vi.advanceTimersByTimeAsync(delay);
      expect(send).toHaveBeenCalledTimes(index + 2);
    }

    queue.destroy();
  });

  it('does not flush while offline and resumes when connectivity returns', async () => {
    let online = false;
    const send = vi.fn().mockResolvedValue({ success: true });
    const queue = new StudentSaveQueue(
      send,
      () => {},
      () => {},
      () => {},
      () => online
    );
    queue.enqueue(createEntry(1));

    await expect(queue.flush()).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();

    online = true;
    await expect(queue.flush()).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    queue.destroy();
  });

  it('retries persisted answers immediately when restored while online', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const queue = new StudentSaveQueue(
      send,
      () => {},
      () => {},
      () => {},
      () => true
    );

    queue.restore([createEntry(1)]);
    await expect(queue.flush()).resolves.toBe(true);

    expect(send).toHaveBeenCalledOnce();
    queue.destroy();
  });

  it('does not retry rule rejections and reports the rejected answer', async () => {
    vi.useFakeTimers();
    for (const code of ['CHOOSE_N_LIMIT', 'SECTION_LOCKED', 'SECTION_TIME_EXPIRED']) {
      const rejected = vi.fn();
      const queue = new StudentSaveQueue(
        vi.fn().mockRejectedValue(new ApiError(400, {
          code,
          message: 'Rule rejected the answer.',
        })),
        () => {},
        () => {},
        rejected,
        () => true
      );

      queue.enqueue(createEntry(1));
      await vi.advanceTimersByTimeAsync(0);

      expect(rejected).toHaveBeenCalledOnce();
      expect(queue.snapshot()).toEqual([]);
      await vi.advanceTimersByTimeAsync(30000);
      expect(rejected).toHaveBeenCalledOnce();
      queue.destroy();
    }
  });
});
