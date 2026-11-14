import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type {
  StudentQuizTakeData,
  PendingStudentSave,
  StudentQuestionResponse,
} from '../../types/student';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { getQuestionType, isQuestionAnswered } from '../../question-types';
import { ApiError } from '../../types';
import { StudentSaveQueue } from './StudentSaveQueue';
import './student.css';

interface StoredStudentDraft {
  responses?: Record<string, StudentQuestionResponse>;
  response_timestamps?: Record<string, number>;
  pending_saves?: PendingStudentSave[];
  last_question_id?: number;
  last_section_id?: number | null;
  client_sequence?: number;
  saved_at?: number;
  savedAt?: number;
}

const EMPTY_RESPONSE: StudentQuestionResponse = {
  selected_choice_id: null,
  selected_choice_ids: [],
  text_answer: '',
  answer_data: {},
};

export const StudentQuizTake: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<StudentQuizTakeData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active question index (0-based)
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [sectionSecondsRemaining, setSectionSecondsRemaining] = useState<number | null>(null);
  const [showSectionConfirm, setShowSectionConfirm] = useState(false);
  const [sectionSubmitting, setSectionSubmitting] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);

  // Responses map: questionId -> { selected_choice_id, selected_choice_ids, text_answer }
  const [responses, setResponses] = useState<Record<string, StudentQuestionResponse>>({});

  // Autosave status
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'offline' | 'error'>('saved');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [pendingAnswerCount, setPendingAnswerCount] = useState(0);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine
  );

  // Server-authoritative timer (in seconds)
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  // Modals & Drawers
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPaletteDrawer, setShowPaletteDrawer] = useState<boolean>(false);

  // Auto-submitted due to timer expiration
  const [timeExpiredModal, setTimeExpiredModal] = useState<boolean>(false);

  // Refs keep timer and save callbacks independent of render timing.
  const isSubmittingRef = useRef<boolean>(false);
  const sectionSubmittingRef = useRef<boolean>(false);
  const responseRef = useRef<Record<string, StudentQuestionResponse>>({});
  const syncedResponsesRef = useRef<Record<string, StudentQuestionResponse>>({});
  const responseTimestampsRef = useRef<Record<string, number>>({});
  const syncedResponseTimestampsRef = useRef<Record<string, number>>({});
  const nextSequenceRef = useRef(0);
  const saveQueueRef = useRef<StudentSaveQueue | null>(null);
  const persistDraftRef = useRef<(pending?: PendingStudentSave[]) => void>(() => {});
  const debouncedAnswersRef = useRef(new Map<number, PendingStudentSave>());
  const debounceTimersRef = useRef(new Map<number, number>());
  const serverOffsetRef = useRef(0);
  const attemptDeadlineRef = useRef<number | null>(null);
  const sectionDeadlinesRef = useRef(new Map<string, number | null>());
  const activeSectionDeadlineKeyRef = useRef<string | null>(null);
  const timeUpHandledRef = useRef(false);
  const sectionTimeUpHandledRef = useRef<string | null>(null);
  const queueFailureRef = useRef(false);
  const localStorageErrorRef = useRef(false);
  const autoSubmitRetryCountRef = useRef(0);
  const autoSubmitRetryTimerRef = useRef<number | null>(null);
  const timeUpSubmitTimerRef = useRef<number | null>(null);
  const autoSubmitRef = useRef<(automatic: boolean) => void>(() => {});
  const clockRefreshRef = useRef<() => void>(() => {});
  const onlineRef = useRef(isOnline);
  const draftCursorRef = useRef<{ questionId: number | null; sectionId: number | null }>({
    questionId: null,
    sectionId: null,
  });

  const persistLocalDraft = useCallback((pending = saveQueueRef.current?.snapshot() ?? []) => {
    if (!attemptId) return;
    try {
      localStorage.setItem(
        `quiz_draft_${attemptId}`,
        JSON.stringify({
          responses: responseRef.current,
          response_timestamps: responseTimestampsRef.current,
          pending_saves: pending,
          last_question_id: draftCursorRef.current.questionId ?? undefined,
          last_section_id: draftCursorRef.current.sectionId,
          client_sequence: nextSequenceRef.current,
          saved_at: Date.now(),
        })
      );
      localStorageErrorRef.current = false;
    } catch {
      localStorageErrorRef.current = true;
      queueFailureRef.current = true;
      setSaveStatus('error');
      setSaveErrorMessage('Your browser could not store this answer locally. Keep this page open while it syncs.');
    }
  }, [attemptId]);
  persistDraftRef.current = persistLocalDraft;

  const refreshTimerDisplay = useCallback(() => {
    const serverNow = Date.now() + serverOffsetRef.current;
    const attemptDeadline = attemptDeadlineRef.current;
    setSecondsRemaining(
      attemptDeadline === null
        ? null
        : Math.max(0, Math.ceil((attemptDeadline - serverNow) / 1000))
    );
    const sectionKey = activeSectionDeadlineKeyRef.current;
    const sectionDeadline = sectionKey
      ? sectionDeadlinesRef.current.get(sectionKey) ?? null
      : null;
    setSectionSecondsRemaining(
      sectionDeadline === null
        ? null
        : Math.max(0, Math.ceil((sectionDeadline - serverNow) / 1000))
    );
  }, []);
  clockRefreshRef.current = refreshTimerDisplay;

  const applyServerTiming = useCallback((
    payload: {
      server_time?: string;
      attempt_deadline_at?: string | null;
      section_deadline_at?: string | null;
      sections?: Array<{ id: number | null; deadline_at?: string | null }>;
    },
    requestStartedAt: number,
    responseReceivedAt: number,
    sectionId?: number | null
  ) => {
    const parsedServerTime = payload.server_time ? Date.parse(payload.server_time) : Number.NaN;
    if (Number.isFinite(parsedServerTime)) {
      serverOffsetRef.current =
        parsedServerTime - ((requestStartedAt + responseReceivedAt) / 2);
    }
    if (payload.attempt_deadline_at !== undefined) {
      const deadline = payload.attempt_deadline_at
        ? Date.parse(payload.attempt_deadline_at)
        : Number.NaN;
      attemptDeadlineRef.current = Number.isFinite(deadline) ? deadline : null;
    }
    for (const section of payload.sections ?? []) {
      const deadline = section.deadline_at ? Date.parse(section.deadline_at) : Number.NaN;
      sectionDeadlinesRef.current.set(
        String(section.id),
        Number.isFinite(deadline) ? deadline : null
      );
    }
    if (sectionId !== undefined && payload.section_deadline_at !== undefined) {
      const deadline = payload.section_deadline_at
        ? Date.parse(payload.section_deadline_at)
        : Number.NaN;
      sectionDeadlinesRef.current.set(
        String(sectionId),
        Number.isFinite(deadline) ? deadline : null
      );
    }
    refreshTimerDisplay();
  }, [refreshTimerDisplay]);

  const sections = data?.sections ?? [];
  const currentSectionId = data?.section_timing_enabled
    ? data.active_section_id ?? (sections.some((section) => section.id === null) ? null : undefined)
    : selectedSectionId;
  const currentSection = sections.find((section) => section.id === currentSectionId);
  const visibleQuestions = currentSection?.questions ?? (data?.section_timing_enabled ? [] : data?.questions ?? []);
  const currentQuestion = visibleQuestions[currentIndex];
  const activeGroup = currentSection?.groups.find(
    (group) => group.questions.some((question) => question.id === currentQuestion?.id)
  );

  const loadAttempt = useCallback(async (showInitialLoading = true) => {
    if (!attemptId) return;
    if (showInitialLoading) setLoading(true);
    try {
      setError(null);
      const requestStartedAt = Date.now();
      const res = await studentApi.getStudentQuizTake(Number(attemptId));
      const responseReceivedAt = Date.now();
      if (res.is_submitted) {
        navigate(`/student/attempts/${attemptId}/result`, { replace: true });
        return;
      }

      let draft: StoredStudentDraft = {};
      try {
        const draftText = localStorage.getItem(`quiz_draft_${attemptId}`);
        if (draftText) {
          const parsed: unknown = JSON.parse(draftText);
          if (parsed && typeof parsed === 'object') {
            draft = parsed as StoredStudentDraft;
          }
        }
      } catch {
        localStorageErrorRef.current = true;
        queueFailureRef.current = true;
        setSaveStatus('error');
        setSaveErrorMessage('The saved answers on this device could not be read.');
      }

      const initialResponses = { ...res.existing_responses };
      const timestamps: Record<string, number> = {};
      const serverSequences = Object.values(res.existing_response_sequences ?? {});
      let sequence = Math.max(
        Number(draft.client_sequence) || 0,
        ...serverSequences,
        0
      );
      const serverResponseTimestamp = (questionId: string) => {
        const value = res.existing_response_timestamps?.[questionId];
        const parsed = value ? Date.parse(value) : Number.NaN;
        return Number.isFinite(parsed) ? parsed : 0;
      };
      for (const questionId of Object.keys(res.existing_responses)) {
        timestamps[questionId] = serverResponseTimestamp(questionId);
      }

      const persistedPending = Array.isArray(draft.pending_saves)
        ? draft.pending_saves.filter((entry) => (
          entry
          && Number.isInteger(entry.question_id)
          && Number.isFinite(entry.timestamp)
          && Number.isInteger(entry.client_sequence)
          && entry.response
        ))
        : [];
      const pendingByQuestion = new Map<number, PendingStudentSave>();
      const localResponses = draft.responses ?? {};
      const draftSavedAt = Number(draft.saved_at ?? draft.savedAt) || 0;
      const localAnswerTimestamp = (questionId: string) => (
        Number(draft.response_timestamps?.[questionId])
        || (draft.response_timestamps ? 0 : draftSavedAt)
      );
      for (const [questionId, answer] of Object.entries(localResponses)) {
        const localTime = localAnswerTimestamp(questionId);
        const serverTime = res.existing_responses[questionId]
          ? serverResponseTimestamp(questionId) || Number.POSITIVE_INFINITY
          : 0;
        if (localTime > serverTime) {
          initialResponses[questionId] = answer;
          timestamps[questionId] = localTime;
        }
      }

      const restorePending = (entry: PendingStudentSave) => {
        const questionKey = String(entry.question_id);
        const serverTime = res.existing_responses[questionKey]
          ? serverResponseTimestamp(questionKey) || Number.POSITIVE_INFINITY
          : 0;
        if (entry.timestamp <= serverTime) return;
        sequence = Math.max(sequence + 1, entry.client_sequence);
        const restored = { ...entry, client_sequence: sequence };
        pendingByQuestion.set(entry.question_id, restored);
        initialResponses[questionKey] = restored.response;
        timestamps[questionKey] = restored.timestamp;
      };
      persistedPending.forEach(restorePending);

      const pendingQuestionIds = new Set(pendingByQuestion.keys());
      for (const [questionId, answer] of Object.entries(localResponses)) {
        const id = Number(questionId);
        if (pendingQuestionIds.has(id) || initialResponses[questionId] !== answer) continue;
        const serverTime = res.existing_responses[questionId]
          ? serverResponseTimestamp(questionId) || Number.POSITIVE_INFINITY
          : 0;
        const localTime = localAnswerTimestamp(questionId);
        if (localTime <= serverTime) continue;
        const question = res.questions.find((item) => item.id === id);
        sequence += 1;
        const queued: PendingStudentSave = {
          question_id: id,
          response: answer,
          timestamp: localTime,
          client_sequence: sequence,
          section_id: question?.section_id ?? null,
        };
        pendingByQuestion.set(id, queued);
      }

      const restoredSectionId = res.section_timing_enabled
        ? res.active_section_id ?? null
        : draft.last_section_id !== undefined
          ? draft.last_section_id
          : res.sections?.[0]?.id ?? null;
      const restoredSection = res.sections?.find((section) => section.id === restoredSectionId);
      const restoredQuestions = restoredSection?.questions
        ?? (res.section_timing_enabled ? [] : res.questions);
      const restoredIndex = restoredQuestions.findIndex(
        (question) => question.id === draft.last_question_id
      );
      const nextIndex = restoredIndex >= 0 ? restoredIndex : 0;
      responseRef.current = initialResponses;
      syncedResponsesRef.current = { ...res.existing_responses };
      responseTimestampsRef.current = timestamps;
      syncedResponseTimestampsRef.current = { ...timestamps };
      nextSequenceRef.current = sequence;
      draftCursorRef.current = {
        questionId: restoredQuestions[nextIndex]?.id ?? null,
        sectionId: restoredSectionId,
      };
      activeSectionDeadlineKeyRef.current = String(restoredSectionId);
      applyServerTiming(res, requestStartedAt, responseReceivedAt);
      saveQueueRef.current?.restore([...pendingByQuestion.values()]);
      setData(res);
      setResponses(initialResponses);
      setCurrentIndex(nextIndex);
      setSelectedSectionId(restoredSectionId);
      setSectionError(null);
      persistDraftRef.current(saveQueueRef.current?.snapshot() ?? []);
    } catch (err) {
      if (showInitialLoading) {
        setError(err instanceof Error ? err.message : 'Failed to load quiz attempt.');
      } else {
        setSectionError(err instanceof Error ? err.message : 'Unable to refresh the section.');
      }
    } finally {
      if (showInitialLoading) setLoading(false);
    }
  }, [attemptId, applyServerTiming, navigate]);

  useEffect(() => {
    if (!attemptId) return undefined;
    queueFailureRef.current = false;
    const queue = new StudentSaveQueue(
      async (entry) => {
        const requestStartedAt = Date.now();
        try {
          const result = await studentApi.saveStudentResponse(Number(attemptId), {
            question_id: entry.question_id,
            client_sequence: entry.client_sequence,
            choice_id: entry.response.selected_choice_id,
            choice_ids: entry.response.selected_choice_ids,
            text_answer: entry.response.text_answer,
            answer_data: entry.response.answer_data,
          });
          applyServerTiming(result, requestStartedAt, Date.now(), entry.section_id);
          if (result.submitted) {
            setTimeExpiredModal(true);
            navigate(`/student/attempts/${attemptId}/result`, { replace: true });
          }
          return result;
        } catch (err) {
          clockRefreshRef.current();
          if (err instanceof ApiError && err.code === 'TIME_EXPIRED') {
            setTimeExpiredModal(true);
            navigate(`/student/attempts/${attemptId}/result`, { replace: true });
            return { success: true, submitted: true };
          }
          throw err;
        }
      },
      (pending, savingCount) => {
        const unanswered = new Set([
          ...pending.map((entry) => entry.question_id),
          ...debouncedAnswersRef.current.keys(),
        ]);
        setPendingAnswerCount(unanswered.size);
        if (!onlineRef.current) setSaveStatus('offline');
        else if (savingCount > 0 || unanswered.size > 0) setSaveStatus('saving');
        else setSaveStatus(
          queueFailureRef.current || localStorageErrorRef.current ? 'error' : 'saved'
        );
        persistDraftRef.current(pending);
      },
      (entry, result) => {
        if (result.stale && result.stored_response) {
          const newer = saveQueueRef.current?.snapshot().some(
            (pending) => pending.question_id === entry.question_id
              && pending.client_sequence > entry.client_sequence
          );
          if (!newer) {
            responseRef.current = {
              ...responseRef.current,
              [String(entry.question_id)]: result.stored_response,
            };
            setResponses(responseRef.current);
          }
          syncedResponsesRef.current[String(entry.question_id)] = result.stored_response;
        } else {
          syncedResponsesRef.current[String(entry.question_id)] = entry.response;
        }
        const updatedAt = result.response_updated_at ? Date.parse(result.response_updated_at) : Date.now();
        responseTimestampsRef.current[String(entry.question_id)] =
          Number.isFinite(updatedAt) ? updatedAt : Date.now();
        syncedResponseTimestampsRef.current[String(entry.question_id)] =
          responseTimestampsRef.current[String(entry.question_id)];
        queueFailureRef.current = false;
      },
      (entry, err) => {
        const key = String(entry.question_id);
        const restored = syncedResponsesRef.current[key];
        responseRef.current = { ...responseRef.current };
        if (restored) responseRef.current[key] = restored;
        else delete responseRef.current[key];
        responseTimestampsRef.current[key] = syncedResponseTimestampsRef.current[key] ?? 0;
        setResponses(responseRef.current);
        queueFailureRef.current = true;
        setSaveStatus('error');
        const rejectionMessage = err.code === 'CHOOSE_N_LIMIT'
          ? 'You have reached the answer limit for this section. Your change was reverted.'
          : err.code === 'SECTION_TIME_EXPIRED'
            ? 'This section time has expired. Your change was reverted.'
            : 'This section is locked. Your change was reverted.';
        setSaveErrorMessage(rejectionMessage);
        persistDraftRef.current();
      },
      () => onlineRef.current
    );
    saveQueueRef.current = queue;
    return () => {
      queue.destroy();
      if (saveQueueRef.current === queue) saveQueueRef.current = null;
    };
  }, [attemptId, applyServerTiming, navigate]);

  useEffect(() => {
    void loadAttempt();
  }, [loadAttempt]);

  useEffect(() => {
    const refresh = () => clockRefreshRef.current();
    const handleOnline = () => {
      onlineRef.current = true;
      setIsOnline(true);
      sectionTimeUpHandledRef.current = null;
      saveQueueRef.current?.retryPending();
      const waiting = (saveQueueRef.current?.snapshot().length ?? 0)
        + debouncedAnswersRef.current.size;
      setSaveStatus(
        waiting > 0
          ? 'saving'
          : queueFailureRef.current || localStorageErrorRef.current
            ? 'error'
            : 'saved'
      );
      refresh();
      if (timeUpHandledRef.current) {
        if (!timeUpSubmitTimerRef.current) autoSubmitRef.current(true);
      }
    };
    const handleOffline = () => {
      onlineRef.current = false;
      setIsOnline(false);
      refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', refresh);
    const interval = window.setInterval(refresh, 1000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      const pending = (saveQueueRef.current?.snapshot().length ?? 0)
        + debouncedAnswersRef.current.size;
      if (pending === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);

  useEffect(() => {
    if (!data) return;
    const sectionId = currentSection?.id ?? null;
    activeSectionDeadlineKeyRef.current = String(sectionId);
    draftCursorRef.current = {
      questionId: currentQuestion?.id ?? null,
      sectionId,
    };
    persistDraftRef.current();
    clockRefreshRef.current();
  }, [data, currentQuestion?.id, currentSection?.id]);

  const enqueueAnswer = useCallback((entry: PendingStudentSave) => {
    queueFailureRef.current = false;
    setSaveErrorMessage(null);
    saveQueueRef.current?.enqueue(entry);
    persistDraftRef.current();
  }, []);

  const flushDebouncedAnswers = useCallback(() => {
    for (const [questionId, entry] of debouncedAnswersRef.current) {
      const timer = debounceTimersRef.current.get(questionId);
      if (timer !== undefined) window.clearTimeout(timer);
      debounceTimersRef.current.delete(questionId);
      debouncedAnswersRef.current.delete(questionId);
      enqueueAnswer(entry);
    }
  }, [enqueueAnswer]);

  const flushPendingAnswers = useCallback(async () => {
    flushDebouncedAnswers();
    return saveQueueRef.current?.flush() ?? true;
  }, [flushDebouncedAnswers]);

  const retryPendingAnswers = useCallback(async () => {
    if (!onlineRef.current) {
      const answerNoun = pendingAnswerCount === 1 ? 'answer is' : 'answers are';
      setSaveErrorMessage(
        localStorageErrorRef.current
          ? `You are offline. Your ${pendingAnswerCount} ${answerNoun} only in this page because browser storage failed. Keep this page open and reconnect to submit.`
          : `You are offline. Your ${pendingAnswerCount} ${answerNoun} safe on this device. Reconnect to submit.`
      );
      return;
    }
    saveQueueRef.current?.retryPending();
    const flushed = await flushPendingAnswers();
    if (!flushed) {
      setSaveErrorMessage('Some answers are still waiting to sync. Please retry when your connection is stable.');
    }
    if (timeUpHandledRef.current) autoSubmitRef.current(true);
  }, [flushPendingAnswers, pendingAnswerCount]);

  useEffect(() => () => {
    if (autoSubmitRetryTimerRef.current) window.clearTimeout(autoSubmitRetryTimerRef.current);
    if (timeUpSubmitTimerRef.current) window.clearTimeout(timeUpSubmitTimerRef.current);
    for (const timer of debounceTimersRef.current.values()) window.clearTimeout(timer);
  }, []);

  const handleSubmit = useCallback(async (automatic = false) => {
    if (!attemptId || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (!onlineRef.current) {
        const answerNoun = pendingAnswerCount === 1 ? 'answer is' : 'answers are';
        throw new Error(
          localStorageErrorRef.current
            ? `You are offline. Your ${pendingAnswerCount} ${answerNoun} only in this page because browser storage failed. Keep this page open and reconnect to submit.`
            : `You are offline. Your ${pendingAnswerCount} ${answerNoun} safe on this device. Reconnect to submit.`
        );
      }
      const flushed = await flushPendingAnswers();
      if (!flushed) {
        throw new Error('Some answers are still waiting to sync. Reconnect and retry submission.');
      }
      const result = await studentApi.submitStudentQuiz(Number(attemptId));
      if (!result.success) throw new Error(result.message || 'Submission failed. Please try again.');
      if (autoSubmitRetryTimerRef.current) window.clearTimeout(autoSubmitRetryTimerRef.current);
      if (timeUpSubmitTimerRef.current) window.clearTimeout(timeUpSubmitTimerRef.current);
      try {
        localStorage.removeItem(`quiz_draft_${attemptId}`);
      } catch {
        queueFailureRef.current = true;
        setSaveErrorMessage('The quiz was submitted, but the local answer copy could not be cleared.');
      }
      navigate(`/student/attempts/${attemptId}/result`, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Submission failed.';
      setSubmitError(
        automatic
          ? `${message} The server will finalise the attempt using the answers it received.`
          : message
      );
      if (automatic) {
        const delays = [1000, 2000, 4000, 8000, 15000];
        const delay = delays[Math.min(autoSubmitRetryCountRef.current, delays.length - 1)];
        autoSubmitRetryCountRef.current += 1;
        if (autoSubmitRetryTimerRef.current) window.clearTimeout(autoSubmitRetryTimerRef.current);
        autoSubmitRetryTimerRef.current = window.setTimeout(
          () => void autoSubmitRef.current(true),
          delay
        );
      }
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }, [attemptId, flushPendingAnswers, navigate, pendingAnswerCount]);
  autoSubmitRef.current = (automatic) => { void handleSubmit(automatic); };

  useEffect(() => {
    if (secondsRemaining !== 0 || !attemptDeadlineRef.current || timeUpHandledRef.current) return;
    timeUpHandledRef.current = true;
    setTimeExpiredModal(true);
    const delay = Math.floor(Math.random() * 15001);
    timeUpSubmitTimerRef.current = window.setTimeout(() => {
      timeUpSubmitTimerRef.current = null;
      autoSubmitRef.current(true);
    }, delay);
  }, [secondsRemaining]);

  const submitCurrentSection = useCallback(async () => {
    if (
      !attemptId
      || !currentSection
      || currentSection.id === null
      || sectionSubmittingRef.current
    ) return;
    sectionSubmittingRef.current = true;
    setSectionSubmitting(true);
    setSectionError(null);
    try {
      if (!onlineRef.current) {
        throw new Error('You are offline. Your answers are safe on this device. Reconnect to continue.');
      }
      const flushed = await flushPendingAnswers();
      if (!flushed) throw new Error('Some answers are still waiting to sync. Reconnect and retry.');
      const requestStartedAt = Date.now();
      const result = await studentApi.submitStudentSection(Number(attemptId), currentSection.id);
      applyServerTiming(result, requestStartedAt, Date.now(), currentSection.id);
      setShowSectionConfirm(false);
      await loadAttempt(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setShowSectionConfirm(false);
        await loadAttempt(false);
      } else {
        setSectionError(err instanceof Error ? err.message : 'Unable to move to the next section.');
      }
    } finally {
      sectionSubmittingRef.current = false;
      setSectionSubmitting(false);
    }
  }, [attemptId, applyServerTiming, currentSection, flushPendingAnswers, loadAttempt]);

  useEffect(() => {
    if (
      !data?.section_timing_enabled
      || !currentSection
      || currentSection.id === null
      || currentSection.time_limit_minutes === null
      || secondsRemaining === 0
      || sectionSecondsRemaining !== 0
    ) return;
    const sectionKey = String(currentSection.id);
    if (sectionTimeUpHandledRef.current === sectionKey) return;
    sectionTimeUpHandledRef.current = sectionKey;
    void submitCurrentSection();
  }, [currentSection, data?.section_timing_enabled, isOnline, sectionSecondsRemaining, secondsRemaining, submitCurrentSection]);

  const saveAnswer = (
    questionId: number,
    newResponse: Partial<StudentQuestionResponse>,
    persist = true
  ) => {
    if (!attemptId) return;
    const key = String(questionId);
    const base = responseRef.current[key] ?? EMPTY_RESPONSE;
    const updated = { ...base, ...newResponse };
    const question = data?.questions.find((item) => item.id === questionId);
    const questionType = question?.question_type ?? currentQuestion?.question_type ?? '';
    const alreadyAnswered = isQuestionAnswered(questionType, base);
    const willBeAnswered = isQuestionAnswered(questionType, updated);
    const section = data?.sections?.find((item) => item.id === (question?.section_id ?? currentSection?.id));
    const sectionQuestions = section?.questions ?? currentSection?.questions ?? [];
    const sectionAnswered = sectionQuestions.filter((item) => {
      const answer = responseRef.current[String(item.id)];
      return answer ? isQuestionAnswered(item.question_type, answer) : false;
    }).length;
    if (
      section?.choose_n !== null
      && section?.choose_n !== undefined
      && !alreadyAnswered
      && willBeAnswered
      && sectionAnswered >= section.choose_n
    ) {
      queueFailureRef.current = true;
      setSaveStatus('error');
      setSaveErrorMessage(`You may answer only ${section.choose_n} question(s) in this section.`);
      return;
    }

    responseRef.current = { ...responseRef.current, [key]: updated };
    responseTimestampsRef.current[key] = Date.now() + serverOffsetRef.current;
    setResponses(responseRef.current);
    const entry: PendingStudentSave = {
      question_id: questionId,
      response: updated,
      timestamp: responseTimestampsRef.current[key],
      client_sequence: ++nextSequenceRef.current,
      section_id: question?.section_id ?? currentSection?.id ?? null,
    };

    if (persist) {
      const timer = debounceTimersRef.current.get(questionId);
      if (timer !== undefined) window.clearTimeout(timer);
      debounceTimersRef.current.delete(questionId);
      debouncedAnswersRef.current.delete(questionId);
      enqueueAnswer(entry);
    } else {
      debouncedAnswersRef.current.set(questionId, entry);
      const oldTimer = debounceTimersRef.current.get(questionId);
      if (oldTimer !== undefined) window.clearTimeout(oldTimer);
      debounceTimersRef.current.set(questionId, window.setTimeout(() => {
        debounceTimersRef.current.delete(questionId);
        debouncedAnswersRef.current.delete(questionId);
        enqueueAnswer(entry);
      }, 1500));
      setPendingAnswerCount(new Set([
        ...(saveQueueRef.current?.snapshot().map((pending) => pending.question_id) ?? []),
        ...debouncedAnswersRef.current.keys(),
      ]).size);
      setSaveStatus(onlineRef.current ? 'saving' : 'offline');
      persistDraftRef.current();
    }
  };

  const navigateQuestion = (index: number) => {
    flushDebouncedAnswers();
    void saveQueueRef.current?.flush();
    setCurrentIndex(index);
  };

  const requestSectionNavigation = (sectionId: number | null) => {
    if (!data || !currentSection || sectionId === currentSection.id) return;
    flushDebouncedAnswers();
    void saveQueueRef.current?.flush();
    if (!data.section_timing_enabled) {
      setSelectedSectionId(sectionId);
      setCurrentIndex(0);
      setSectionError(null);
      return;
    }
    if (currentSection.id === null) return;
    const currentPosition = sections.findIndex((section) => section.id === currentSection.id);
    const targetPosition = sections.findIndex((section) => section.id === sectionId);
    if (targetPosition === currentPosition + 1) {
      if (currentSection.time_limit_minutes === null) {
        void submitCurrentSection();
      } else {
        setShowSectionConfirm(true);
      }
    }
  };

  const confirmSectionNavigation = () => submitCurrentSection();

  // Format time remaining
  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return 'Untimed';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (loading) {
    return (
      <div className="core-display-flex core-layout--justify-center core-layout--align-center core-size--min-height-vh-100" data-testid="student-quiz-take-loading">
        <LoadingSpinner size="lg" message="Loading your assessment..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="core-space--padding-4" data-testid="student-quiz-take-error">
        <Alert variant="danger" dismissible={false}>
          <h5>Unable to load quiz session</h5>
          <p className="core-space--margin-bottom-2">{error || 'Session could not be initialized.'}</p>
          <button className="stu-btn-outline" onClick={() => void loadAttempt()}>
            Retry
          </button>
        </Alert>
      </div>
    );
  }

  const currentAnswer = currentQuestion
    ? responses[String(currentQuestion.id)] || {
        selected_choice_id: null,
        selected_choice_ids: [],
        text_answer: '',
        answer_data: {},
      }
    : null;

  const answeredCount = data.questions.filter((question) => {
    const answer = responses[String(question.id)];
    return answer ? isQuestionAnswered(question.question_type, answer) : false;
  }).length;
  const sectionAnsweredCount = visibleQuestions.filter((question) => {
    const answer = responses[String(question.id)];
    return answer ? isQuestionAnswered(question.question_type, answer) : false;
  }).length;
  const currentSectionIndex = currentSection
    ? sections.findIndex((section) => section.id === currentSection.id)
    : -1;
  const nextSection = currentSectionIndex >= 0 ? sections[currentSectionIndex + 1] : undefined;

  const progressPercent = data.total_questions > 0 ? (answeredCount / data.total_questions) * 100 : 0;

  return (
    <div className="stu-exam-shell" data-testid="student-quiz-take">
      {/* Distraction-Free Top Bar */}
      <header className="stu-exam-top-bar" role="banner">
        <div className="stu-exam-top-bar__inner">
          <div className="stu-exam-top-bar__title-wrap">
            <h1 className="stu-exam-top-bar__title">{data.quiz_title}</h1>
            <div className="stu-exam-top-bar__qcount">
              {currentSection ? `${currentSection.title} • ` : ''}
              Question {currentIndex + 1} of {visibleQuestions.length} • Answered: {answeredCount}/{data.total_questions}
              {currentSection?.choose_n !== null && currentSection?.choose_n !== undefined
                ? ` • Answer ${sectionAnsweredCount} of ${currentSection.choose_n} (${visibleQuestions.length} available)`
                : ''}
            </div>
          </div>

          <div className="core-display-flex core-layout--align-center core-layout--gap-2">
            {/* Autosave status indicator */}
            <div
              className="core-type--small core-type--weight-semibold"
              style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
              aria-live="polite"
              data-testid="student-sync-status"
            >
              {!isOnline && (
                <span className="core-text--warning">
                  <AppIcon name="cloudOff" className="core-space--margin-end-1" />
                  Offline · {pendingAnswerCount} answers waiting
                </span>
              )}
              {isOnline && saveStatus === 'saving' && (
                <span className="core-text--muted">
                  <span className="core-spinner core-spinner--sm core-space--margin-end-1" style={{ width: '10px', height: '10px' }} />
                  Saving{pendingAnswerCount > 0 ? ` · ${pendingAnswerCount} waiting` : ''}
                </span>
              )}
              {isOnline && saveStatus === 'saved' && (
                <span className="core-text--success core-type--weight-semibold">
                  <AppIcon name="cloudCheck" className="core-space--margin-end-1" />
                  Saved
                </span>
              )}
              {isOnline && saveStatus === 'error' && (
                <span className="core-text--warning core-type--weight-semibold" title={saveErrorMessage || ''}>
                  <AppIcon name="cloudOff" className="core-space--margin-end-1" />
                  Save issue{pendingAnswerCount > 0 ? ` · ${pendingAnswerCount} waiting` : ''}
                </span>
              )}
            </div>

            {/* Server-authoritative timer badge */}
            {secondsRemaining !== null && (
              <div
                className={`stu-exam-timer-badge ${
                  secondsRemaining < 60
                    ? 'stu-exam-timer-badge--critical'
                    : secondsRemaining < 300
                    ? 'stu-exam-timer-badge--warning'
                    : ''
                }`}
                data-testid="quiz-timer"
                aria-label={`Time remaining: ${formatTime(secondsRemaining)}`}
              >
                <AppIcon name="clock" aria-hidden="true" />
                <span>{formatTime(secondsRemaining)}</span>
              </div>
            )}
            {data.section_timing_enabled && currentSection?.time_limit_minutes !== null && sectionSecondsRemaining !== null && (
              <div
                className={`stu-exam-timer-badge ${sectionSecondsRemaining < 60 ? 'stu-exam-timer-badge--critical' : ''}`}
                data-testid="section-timer"
                aria-label={`Section time remaining: ${formatTime(sectionSecondsRemaining)}`}
              >
                <AppIcon name="clock" aria-hidden="true" />
                <span>{formatTime(sectionSecondsRemaining)}</span>
              </div>
            )}

            {/* Direct Submit Action */}
            <button
              type="button"
              className="stu-btn-primary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              onClick={() => setShowSubmitModal(true)}
            >
              Submit Quiz
            </button>
          </div>
        </div>

        {sections.length > 1 && (
          <nav className="stu-exam-section-nav" aria-label="Exam sections">
            {sections.map((section, index) => {
              const activeIndex = currentSection
                ? sections.findIndex((item) => item.id === currentSection.id)
                : -1;
              const isCurrent = currentSection?.id === section.id;
              const canMove = !data.section_timing_enabled || index === activeIndex || index === activeIndex + 1;
              return (
                <button
                  key={section.id ?? 'unsectioned'}
                  type="button"
                  className={`stu-btn-outline ${isCurrent ? 'stu-exam-section-nav__active' : ''}`}
                  disabled={!canMove || (data.section_timing_enabled && activeIndex < 0)}
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => requestSectionNavigation(section.id)}
                >
                  {index + 1}. {section.title}
                  {section.is_locked && !isCurrent ? ' (locked)' : ''}
                </button>
              );
            })}
          </nav>
        )}

        {/* Minimal Progress Bar */}
        <div
          style={{
            height: '3px',
            backgroundColor: 'var(--stu-border-light)',
            width: '100%',
            marginTop: '0.45rem',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              backgroundColor: 'var(--stu-sky)',
              width: `${progressPercent}%`,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </header>

      {/* Main Examination Area */}
      <main className="stu-exam-body" id="quiz-question-container">
        {!isOnline && (
          <Alert variant="warning" dismissible={false}>
            <div className="core-display-flex core-layout--align-center core-layout--justify-between core-layout--gap-2">
              <span>
                {localStorageErrorRef.current
                  ? `You are offline. Your ${pendingAnswerCount} ${pendingAnswerCount === 1 ? 'answer is' : 'answers are'} only in this page because browser storage failed. Keep this page open and reconnect to submit.`
                  : `You are offline. Your ${pendingAnswerCount} ${pendingAnswerCount === 1 ? 'answer is' : 'answers are'} safe on this device. Reconnect to submit.`}
              </span>
              <Button variant="outline-secondary" size="sm" onClick={() => void retryPendingAnswers()}>
                Retry
              </Button>
            </div>
          </Alert>
        )}
        {sectionSubmitting && (
          <div className="core-alert core-alert--info" role="status" data-testid="section-submit-progress">
            Saving answers and submitting this section…
          </div>
        )}
        {sectionError && (
          <Alert variant="danger" dismissible onDismiss={() => setSectionError(null)}>
            <div className="core-display-flex core-layout--align-center core-layout--justify-between core-layout--gap-2">
              <span>{sectionError}</span>
              <Button variant="outline-secondary" size="sm" onClick={() => void submitCurrentSection()}>
                Retry
              </Button>
            </div>
          </Alert>
        )}
        {saveErrorMessage && (saveStatus === 'error' || localStorageErrorRef.current) && (
          <Alert variant="warning" dismissible onDismiss={() => setSaveErrorMessage(null)}>
            {saveErrorMessage}
          </Alert>
        )}
        {data.section_timing_enabled && !currentSection && (
          <Alert variant="info">All sections are complete. Submit your quiz to finish.</Alert>
        )}
        {currentSection && (
          <section className="stu-exam-section-header" aria-label={`${currentSection.title} instructions`}>
            <h2>{currentSection.title}</h2>
            {currentSection.instructions && <p>{currentSection.instructions}</p>}
            {currentSection.choose_n !== null && currentSection.choose_n !== undefined && (
              <p className="stu-exam-choose-counter">
                Answer {sectionAnsweredCount} of {currentSection.choose_n} questions ({visibleQuestions.length} available).
              </p>
            )}
          </section>
        )}
        {currentQuestion && (
          <div className="stu-exam-card">
            {activeGroup?.stimulus_text && (
              <aside className="stu-exam-stimulus" aria-label="Shared stimulus">
                <strong>{activeGroup.title}</strong>
                <div>{activeGroup.stimulus_text}</div>
              </aside>
            )}
            {/* Question Heading & Marks */}
            <div className="stu-exam-question-head">
              <span className="stu-badge stu-badge--sky">
                Question {currentIndex + 1} of {visibleQuestions.length}
              </span>
              <span className="stu-badge stu-badge--muted">
                {currentQuestion.marks} {currentQuestion.marks === 1 ? 'mark' : 'marks'}
              </span>
            </div>

            {/* Large Readable Question Text */}
            <div className="stu-exam-question-text">
              {currentQuestion.question_text.replace(/_{5,}/g, '__________')}
            </div>

            {currentAnswer && (() => {
              const Player = getQuestionType(currentQuestion.question_type).Player;
              return (
                <div className={`stu-exam-player stu-exam-player--${currentQuestion.question_type}`}>
                  <Player
                    question={currentQuestion}
                    response={currentAnswer}
                    onChange={(answer, persist) => saveAnswer(currentQuestion.id, answer, persist)}
                  />
                </div>
              );
            })()}
          </div>
        )}
      </main>

      {/* Distraction-Free Sticky Bottom Bar */}
      <footer className="stu-exam-bottom-bar" role="contentinfo">
        <div className="stu-exam-bottom-bar__inner">
          {/* Previous Button */}
          <button
            type="button"
            className="stu-btn-outline"
            disabled={currentIndex === 0}
            onClick={() => navigateQuestion(Math.max(0, currentIndex - 1))}
            style={{ minWidth: '95px' }}
          >
            ← Previous
          </button>

          {/* Question Palette Trigger / Progress Pill */}
          <button
            type="button"
            className="stu-btn-outline"
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
            onClick={() => setShowPaletteDrawer(!showPaletteDrawer)}
            aria-label="Toggle Question Navigator"
          >
            <AppIcon name="layoutGrid" className="core-space--margin-end-1" aria-hidden="true" />
            <span>
              {currentIndex + 1} / {visibleQuestions.length}
            </span>
          </button>

          {/* Next or Review & Submit Button */}
          {currentIndex < visibleQuestions.length - 1 ? (
            <button
              type="button"
              className="stu-btn-primary"
              onClick={() => navigateQuestion(Math.min(visibleQuestions.length - 1, currentIndex + 1))}
              style={{ minWidth: '95px' }}
            >
              Next →
            </button>
          ) : nextSection ? (
            <button
              type="button"
              className="stu-btn-primary"
              onClick={() => requestSectionNavigation(nextSection.id)}
              style={{ minWidth: '130px' }}
            >
              Next section →
            </button>
          ) : (
            <button
              type="button"
              className="stu-btn-primary"
              onClick={() => setShowSubmitModal(true)}
              style={{ minWidth: '130px', backgroundColor: 'var(--stu-navy)' }}
            >
              Review & Submit
            </button>
          )}
        </div>
      </footer>

      {/* Question Palette Modal Drawer */}
      <Modal
        isOpen={showPaletteDrawer}
        onClose={() => setShowPaletteDrawer(false)}
        title="Question Navigator"
        size="md"
        footer={
          <div className="core-display-flex core-layout--justify-end core-size--width-full">
            <button
              type="button"
              className="stu-btn-primary"
              onClick={() => setShowPaletteDrawer(false)}
            >
              Back to Assessment
            </button>
          </div>
        }
      >
        <div>
          <p className="core-type--small core-text--muted core-space--margin-bottom-3">
            Tap any question number to jump directly to it:
          </p>

          <div className="stu-palette-grid core-space--margin-bottom-3">
            {visibleQuestions.map((q, idx) => {
              const ans = responses[String(q.id)];
              const isAnswered = ans
                ? isQuestionAnswered(q.question_type, ans)
                : false;
              const isCurrent = idx === currentIndex;

              let btnModifier = 'stu-palette-btn--unanswered';
              if (isCurrent) {
                btnModifier = 'stu-palette-btn--current';
              } else if (isAnswered) {
                btnModifier = 'stu-palette-btn--answered';
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  className={`stu-palette-btn ${btnModifier}`}
                  onClick={() => {
                    navigateQuestion(idx);
                    setShowPaletteDrawer(false);
                  }}
                  title={`Question ${idx + 1}: ${isAnswered ? 'Answered' : 'Unanswered'}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="core-display-flex core-layout--align-center core-layout--gap-3 core-space--padding-top-2 core-border--top core-type--small core-text--muted">
            <div className="core-display-flex core-layout--align-center core-layout--gap-1">
              <span className="stu-palette-btn stu-palette-btn--current" style={{ width: '16px', height: '16px', fontSize: '9px' }}>✓</span>
              <span>Current</span>
            </div>
            <div className="core-display-flex core-layout--align-center core-layout--gap-1">
              <span className="stu-palette-btn stu-palette-btn--answered" style={{ width: '16px', height: '16px', fontSize: '9px' }}>✓</span>
              <span>Answered</span>
            </div>
            <div className="core-display-flex core-layout--align-center core-layout--gap-1">
              <span className="stu-palette-btn stu-palette-btn--unanswered" style={{ width: '16px', height: '16px', fontSize: '9px' }}>-</span>
              <span>Unanswered</span>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showSectionConfirm}
        onClose={() => setShowSectionConfirm(false)}
        title="Leave this timed section?"
        size="sm"
        footer={
          <div className="core-display-flex core-layout--gap-2 core-layout--justify-end core-size--width-full">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setShowSectionConfirm(false)}
              disabled={sectionSubmitting}
            >
              Keep working
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={confirmSectionNavigation}
              loading={sectionSubmitting}
            >
              Submit section and continue
            </Button>
          </div>
        }
      >
        <p>
          Continuing will submit and lock <strong>{currentSection?.title}</strong>. You will not be able to change its answers afterward.
        </p>
      </Modal>

      {/* Confirmation Submit Modal */}
      <Modal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        title="Submit Quiz Assessment"
        size="md"
        footer={
          <div className="core-display-flex core-layout--gap-2 core-layout--justify-end core-size--width-full">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setShowSubmitModal(false)}
              disabled={submitting}
            >
              Continue Working
            </Button>
            <Button
              variant="success"
              size="sm"
              className="core-type--weight-bold"
              onClick={() => void handleSubmit(false)}
              loading={submitting}
            >
              Confirm and Submit
            </Button>
          </div>
        }
      >
        <div>
          {submitError && (
            <Alert variant="danger" dismissible onDismiss={() => setSubmitError(null)} className="core-space--margin-bottom-3">
              {submitError}
            </Alert>
          )}

          <p className="core-space--margin-bottom-3">
            Are you sure you want to finish and submit <strong>{data.quiz_title}</strong>?
          </p>

          <div className="core-space--padding-3 core-surface--light core-radius core-border core-space--margin-bottom-3">
            <div className="core-display-flex core-layout--justify-between core-space--margin-bottom-1 core-type--small">
              <span>Total Questions:</span>
              <strong>{data.total_questions}</strong>
            </div>
            <div className="core-display-flex core-layout--justify-between core-space--margin-bottom-1 core-type--small">
              <span>Questions Answered:</span>
              <strong className="core-text--success">{answeredCount}</strong>
            </div>
            <div className="core-display-flex core-layout--justify-between core-type--small">
              <span>Unanswered Questions:</span>
              <strong
                className={
                  data.total_questions - answeredCount > 0 ? 'core-text--danger' : 'core-text--success'
                }
              >
                {data.total_questions - answeredCount}
              </strong>
            </div>
          </div>

          {data.total_questions - answeredCount > 0 && (
            <div className="core-alert core-alert--warning core-type--small core-space--margin-bottom-0">
              <AppIcon name="triangleAlert" className="core-space--margin-end-1" />
              You have unanswered questions. Unanswered questions will receive 0 marks.
            </div>
          )}
        </div>
      </Modal>

      {/* Time Expired Modal */}
      <Modal
        isOpen={timeExpiredModal}
        onClose={() => {}}
        title="Time Limit Reached"
        size="sm"
        footer={
          <Button
            variant="primary"
            size="sm"
            onClick={() => autoSubmitRef.current(true)}
            loading={submitting}
          >
            Retry submission
          </Button>
        }
      >
        <div className="core-text--center core-space--padding-y-2">
          <AppIcon name="alarmClock" className="core-type--size-1 core-text--danger core-display-block core-space--margin-bottom-2" />
          <h5 className="core-type--weight-bold">Time has expired!</h5>
          {submitError ? (
            <Alert variant="warning" dismissible={false}>
              {submitError}
            </Alert>
          ) : (
            <p className="core-text--muted core-type--small core-space--margin-bottom-0">
              We are submitting your saved answers. Your attempt is not marked submitted until the server confirms.
          </p>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default StudentQuizTake;
