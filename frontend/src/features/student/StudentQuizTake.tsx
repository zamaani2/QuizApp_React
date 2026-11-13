import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type {
  StudentQuizTakeData,
  StudentQuestionResponse,
} from '../../types/student';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { getQuestionType, isQuestionAnswered } from '../../question-types';
import { ApiError } from '../../types';
import './student.css';

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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Server-authoritative timer (in seconds)
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  // Modals & Drawers
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPaletteDrawer, setShowPaletteDrawer] = useState<boolean>(false);

  // Auto-submitted due to timer expiration
  const [timeExpiredModal, setTimeExpiredModal] = useState<boolean>(false);

  // Ref to prevent double submission
  const isSubmittingRef = useRef<boolean>(false);
  const pendingSavesRef = useRef<Set<Promise<void>>>(new Set());
  const sectionSubmittingRef = useRef<boolean>(false);

  // Load quiz attempt data
  const loadAttempt = useCallback(async () => {
    if (!attemptId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await studentApi.getStudentQuizTake(Number(attemptId));

      if (res.is_submitted) {
        navigate(`/student/attempts/${attemptId}/result`, { replace: true });
        return;
      }

      setCurrentIndex(0);
      setData(res);
      setSecondsRemaining(res.time_remaining_seconds);
      setSelectedSectionId(
        res.section_timing_enabled
          ? res.active_section_id ?? null
          : res.sections?.[0]?.id ?? null
      );
      setSectionSecondsRemaining(
        res.sections?.find((section) => section.id === res.active_section_id)?.remaining_seconds ?? null
      );

      // Restore existing responses from backend
      const initialResponses: Record<string, StudentQuestionResponse> = {
        ...res.existing_responses,
      };

      // Also check localStorage for unsaved local draft
      try {
        const localDraft = localStorage.getItem(`quiz_draft_${attemptId}`);
        if (localDraft) {
          const parsedDraft = JSON.parse(localDraft);
          Object.assign(initialResponses, parsedDraft);
        }
      } catch {
        // Ignore local storage error
      }

      setResponses(initialResponses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz attempt.');
    } finally {
      setLoading(false);
    }
  }, [attemptId, navigate]);

  useEffect(() => {
    loadAttempt();
  }, [loadAttempt]);

  const sections = data?.sections ?? [];
  const currentSectionId = data?.section_timing_enabled
    ? data.active_section_id ?? (sections.some((section) => section.id === null) ? null : undefined)
    : selectedSectionId;
  const currentSection = sections.find((section) => section.id === currentSectionId);
  const visibleQuestions = currentSection?.questions ?? (data?.section_timing_enabled ? [] : data?.questions ?? []);
  const activeGroup = currentSection?.groups.find(
    (group) => group.questions.some((question) => question.id === visibleQuestions[currentIndex]?.id)
  );

  useEffect(() => {
    if (!data) return;
    const activeId = data.section_timing_enabled
      ? data.active_section_id ?? (sections.some((section) => section.id === null) ? null : undefined)
      : selectedSectionId;
    const section = sections.find((item) => item.id === activeId);
    setSectionSecondsRemaining(section?.remaining_seconds ?? null);
    if (data.section_timing_enabled && data.active_section_id !== undefined) {
      setSelectedSectionId(data.active_section_id);
    }
  }, [data, sections, selectedSectionId]);

  // Execute Idempotent Submission
  const handleSubmit = async () => {
    if (!attemptId || isSubmittingRef.current) return;
    try {
      isSubmittingRef.current = true;
      setSubmitting(true);
      setSubmitError(null);

      await Promise.all([...pendingSavesRef.current]);
      const res = await studentApi.submitStudentQuiz(Number(attemptId));
      if (res.success) {
        // Clean up local draft
        try {
          localStorage.removeItem(`quiz_draft_${attemptId}`);
        } catch {
          // ignore
        }
        navigate(`/student/attempts/${attemptId}/result`, { replace: true });
      } else {
        setSubmitError(res.message || 'Submission failed. Please try again.');
        isSubmittingRef.current = false;
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed.');
      isSubmittingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  // Server-authoritative timer countdown
  useEffect(() => {
    if (secondsRemaining === null || secondsRemaining <= 0) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timer);
          setTimeExpiredModal(true);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsRemaining]);

  useEffect(() => {
    if (
      !data?.section_timing_enabled
      || !attemptId
      || !currentSection
      || currentSection.id === null
      || currentSection.time_limit_minutes === null
      || sectionSecondsRemaining === null
    ) return;
    const activeSectionId = currentSection.id;
    if (sectionSecondsRemaining <= 0) {
      if (sectionSubmittingRef.current) return;
      sectionSubmittingRef.current = true;
      void (async () => {
        try {
          await studentApi.submitStudentSection(Number(attemptId), activeSectionId);
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 409) {
            setSectionError(err instanceof Error ? err.message : 'Unable to submit the timed section.');
          }
        } finally {
          await loadAttempt();
          sectionSubmittingRef.current = false;
        }
      })();
      return;
    }

    const timer = setInterval(() => {
      setSectionSecondsRemaining((remaining) => remaining === null ? null : Math.max(0, remaining - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [attemptId, currentSection, data?.section_timing_enabled, loadAttempt, sectionSecondsRemaining]);

  // Save response to backend and sync with localStorage
  const saveAnswer = async (
    questionId: number,
    newResponse: Partial<StudentQuestionResponse>,
    persist = true
  ) => {
    if (!attemptId) return;

    const base: StudentQuestionResponse = responses[String(questionId)] || {
      selected_choice_id: null,
      selected_choice_ids: [],
      text_answer: '',
      answer_data: {},
    };
    const updated: StudentQuestionResponse = {
      ...base,
      ...newResponse,
    };
    const alreadyAnswered = isQuestionAnswered(
      currentQuestion?.question_type ?? '',
      base
    );
    const willBeAnswered = isQuestionAnswered(
      currentQuestion?.question_type ?? '',
      updated
    );
    const sectionAnswered = (currentSection?.questions ?? []).filter((question) => {
      const answer = responses[String(question.id)];
      return answer ? isQuestionAnswered(question.question_type, answer) : false;
    }).length;
    if (
      currentQuestion
      && currentSection?.choose_n !== null
      && currentSection?.choose_n !== undefined
      && !alreadyAnswered
      && willBeAnswered
      && sectionAnswered >= currentSection.choose_n
    ) {
      setSaveStatus('error');
      setSaveErrorMessage(`You may answer only ${currentSection.choose_n} question(s) in this section.`);
      return;
    }

    const nextResponses = {
      ...responses,
      [String(questionId)]: updated,
    };
    setResponses(nextResponses);

    // Save local draft
    try {
      localStorage.setItem(`quiz_draft_${attemptId}`, JSON.stringify(nextResponses));
    } catch {
      // ignore
    }

    if (!persist) return;

    const pendingSave = (async () => {
      try {
        setSaveStatus('saving');
        setSaveErrorMessage(null);

        const savePayload = {
          question_id: questionId,
          choice_id: updated.selected_choice_id,
          choice_ids: updated.selected_choice_ids,
          text_answer: updated.text_answer,
          answer_data: updated.answer_data,
        };

        const result = await studentApi.saveStudentResponse(Number(attemptId), savePayload);
        if (result.submitted) {
          setTimeExpiredModal(true);
          navigate(`/student/attempts/${attemptId}/result`, { replace: true });
          return;
        }
        setSaveStatus('saved');
      } catch (err) {
        setSaveStatus('error');
        setSaveErrorMessage(
          err instanceof Error ? err.message : 'Response saved locally. Reconnecting...'
        );
        if (err instanceof ApiError && err.code === 'CHOOSE_N_LIMIT') {
          const restored = { ...responses };
          if (alreadyAnswered) restored[String(questionId)] = base;
          else delete restored[String(questionId)];
          setResponses(restored);
          try {
            localStorage.setItem(`quiz_draft_${attemptId}`, JSON.stringify(restored));
          } catch {
            // A rejected answer must not remain in the local draft.
          }
        } else if (
          err instanceof ApiError
          && (err.code === 'SECTION_TIME_EXPIRED' || err.code === 'SECTION_LOCKED')
        ) {
          const restored = { ...responses };
          if (alreadyAnswered) restored[String(questionId)] = base;
          else delete restored[String(questionId)];
          setResponses(restored);
          try {
            localStorage.setItem(`quiz_draft_${attemptId}`, JSON.stringify(restored));
          } catch {
            // A rejected answer must not remain in the local draft.
          }
        }
      }
    })();
    pendingSavesRef.current.add(pendingSave);
    try {
      await pendingSave;
    } finally {
      pendingSavesRef.current.delete(pendingSave);
    }
  };

  const requestSectionNavigation = (sectionId: number | null) => {
    if (!data || !currentSection || sectionId === currentSection.id) return;
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
        void confirmSectionNavigation();
      } else {
        setShowSectionConfirm(true);
      }
    }
  };

  const confirmSectionNavigation = async () => {
    if (!attemptId || !currentSection || currentSection.id === null || sectionSubmittingRef.current) return;
    sectionSubmittingRef.current = true;
    setSectionSubmitting(true);
    setSectionError(null);
    try {
      await Promise.all([...pendingSavesRef.current]);
      await studentApi.submitStudentSection(Number(attemptId), currentSection.id);
      setShowSectionConfirm(false);
      await loadAttempt();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setShowSectionConfirm(false);
        await loadAttempt();
      } else {
        setSectionError(err instanceof Error ? err.message : 'Unable to move to the next section.');
      }
    } finally {
      sectionSubmittingRef.current = false;
      setSectionSubmitting(false);
    }
  };

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
          <button className="stu-btn-outline" onClick={loadAttempt}>
            Retry
          </button>
        </Alert>
      </div>
    );
  }

  const currentQuestion = visibleQuestions[currentIndex];
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
            <div className="core-display-none core-display-sm-block" style={{ fontSize: '0.75rem' }}>
              {saveStatus === 'saving' && (
                <span className="core-text--muted">
                  <span className="core-spinner core-spinner--sm core-space--margin-end-1" style={{ width: '10px', height: '10px' }} />
                  Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="core-text--success core-type--weight-semibold">
                  <AppIcon name="cloudCheck" className="core-space--margin-end-1" />
                  Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="core-text--warning core-type--weight-semibold" title={saveErrorMessage || ''}>
                  <AppIcon name="cloudOff" className="core-space--margin-end-1" />
                  Save issue
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
        {sectionError && <Alert variant="danger" dismissible onDismiss={() => setSectionError(null)}>{sectionError}</Alert>}
        {saveStatus === 'error' && saveErrorMessage && (
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
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
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
              onClick={() =>
                setCurrentIndex((prev) => Math.min(visibleQuestions.length - 1, prev + 1))
              }
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
                    setCurrentIndex(idx);
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
              onClick={handleSubmit}
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
            onClick={() =>
              navigate(`/student/attempts/${attemptId}/result`, { replace: true })
            }
          >
            View Results Now
          </Button>
        }
      >
        <div className="core-text--center core-space--padding-y-2">
          <AppIcon name="alarmClock" className="core-type--size-1 core-text--danger core-display-block core-space--margin-bottom-2" />
          <h5 className="core-type--weight-bold">Time has expired!</h5>
          <p className="core-text--muted core-type--small core-space--margin-bottom-0">
            Your assessment has been automatically finalized and submitted with your saved answers.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default StudentQuizTake;
