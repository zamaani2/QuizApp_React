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
import './student.css';

export const StudentQuizTake: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<StudentQuizTakeData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active question index (0-based)
  const [currentIndex, setCurrentIndex] = useState<number>(0);

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

      setData(res);
      setSecondsRemaining(res.time_remaining_seconds);

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

  // Execute Idempotent Submission
  const handleSubmit = async () => {
    if (!attemptId || isSubmittingRef.current) return;
    try {
      isSubmittingRef.current = true;
      setSubmitting(true);
      setSubmitError(null);

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

  // Save response to backend and sync with localStorage
  const saveAnswer = async (
    questionId: number,
    newResponse: Partial<StudentQuestionResponse>
  ) => {
    if (!attemptId) return;

    const base: StudentQuestionResponse = responses[String(questionId)] || {
      selected_choice_id: null,
      selected_choice_ids: [],
      text_answer: '',
    };
    const updated: StudentQuestionResponse = {
      ...base,
      ...newResponse,
    };

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

    try {
      setSaveStatus('saving');
      setSaveErrorMessage(null);

      const savePayload = {
        question_id: questionId,
        choice_id: updated.selected_choice_id,
        choice_ids: updated.selected_choice_ids,
        text_answer: updated.text_answer,
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
      <div className="d-flex justify-content-center align-items-center min-vh-100" data-testid="student-quiz-take-loading">
        <LoadingSpinner size="lg" message="Loading your assessment..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4" data-testid="student-quiz-take-error">
        <Alert variant="danger" dismissible={false}>
          <h5>Unable to load quiz session</h5>
          <p className="mb-2">{error || 'Session could not be initialized.'}</p>
          <button className="stu-btn-outline" onClick={loadAttempt}>
            Retry
          </button>
        </Alert>
      </div>
    );
  }

  const currentQuestion = data.questions[currentIndex];
  const currentAnswer = currentQuestion
    ? responses[String(currentQuestion.id)] || {
        selected_choice_id: null,
        selected_choice_ids: [],
        text_answer: '',
      }
    : null;

  const answeredCount = Object.values(responses).filter((r) =>
    r.selected_choice_id !== null || (r.text_answer && r.text_answer.trim() !== '')
  ).length;

  const progressPercent = data.total_questions > 0 ? (answeredCount / data.total_questions) * 100 : 0;

  return (
    <div className="stu-exam-shell" data-testid="student-quiz-take">
      {/* Distraction-Free Top Bar */}
      <header className="stu-exam-top-bar" role="banner">
        <div className="stu-exam-top-bar__inner">
          <div className="stu-exam-top-bar__title-wrap">
            <h1 className="stu-exam-top-bar__title">{data.quiz_title}</h1>
            <div className="stu-exam-top-bar__qcount">
              Question {currentIndex + 1} of {data.total_questions} • Answered: {answeredCount}/{data.total_questions}
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            {/* Autosave status indicator */}
            <div className="d-none d-sm-block" style={{ fontSize: '0.75rem' }}>
              {saveStatus === 'saving' && (
                <span className="text-muted">
                  <span className="spinner-border spinner-border-sm me-1" style={{ width: '10px', height: '10px' }} />
                  Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-success fw-semibold">
                  <i className="bi bi-cloud-check me-1" />
                  Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-warning fw-semibold" title={saveErrorMessage || ''}>
                  <i className="bi bi-cloud-slash me-1" />
                  Saved Offline
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
                <i className="bi bi-clock" aria-hidden="true" />
                <span>{formatTime(secondsRemaining)}</span>
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
        {currentQuestion && (
          <div className="stu-exam-card">
            {/* Question Heading & Marks */}
            <div className="stu-exam-question-head">
              <span className="stu-badge stu-badge--sky">
                Question {currentIndex + 1} of {data.total_questions}
              </span>
              <span className="stu-badge stu-badge--muted">
                {currentQuestion.marks} {currentQuestion.marks === 1 ? 'mark' : 'marks'}
              </span>
            </div>

            {/* Large Readable Question Text */}
            <div className="stu-exam-question-text">
              {currentQuestion.question_text}
            </div>

            {/* Multiple Choice & True/False Choices */}
            {(currentQuestion.question_type === 'multiple_choice' ||
              currentQuestion.question_type === 'true_false') && (
              <div className="d-flex flex-column" role="radiogroup" aria-label="Answer options">
                {currentQuestion.choices.map((choice) => {
                  const isSelected = currentAnswer?.selected_choice_id === choice.id;
                  return (
                    <label
                      key={choice.id}
                      className={`stu-exam-choice ${isSelected ? 'stu-exam-choice--selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name={`question_${currentQuestion.id}`}
                        value={choice.id}
                        checked={isSelected}
                        onChange={() =>
                          saveAnswer(currentQuestion.id, { selected_choice_id: choice.id })
                        }
                        className="stu-exam-choice__input"
                        aria-label={choice.choice_text}
                      />
                      <span className="stu-exam-choice__label">{choice.choice_text}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Text / Essay Input */}
            {(currentQuestion.question_type === 'essay' ||
              currentQuestion.question_type === 'short_answer' ||
              currentQuestion.question_type === 'fill_blank') && (
              <div className="mb-3">
                <label
                  htmlFor="essay-answer"
                  className="form-label small fw-bold"
                  style={{ color: 'var(--stu-navy)' }}
                >
                  Type your response below:
                </label>
                <textarea
                  id="essay-answer"
                  className="form-control"
                  rows={6}
                  placeholder="Write your answer clearly..."
                  style={{
                    borderColor: 'var(--stu-border)',
                    borderRadius: 'var(--stu-radius-md)',
                    fontSize: '0.95rem',
                    lineHeight: '1.5',
                  }}
                  value={currentAnswer?.text_answer || ''}
                  onChange={(e) =>
                    setResponses((prev) => ({
                      ...prev,
                      [String(currentQuestion.id)]: {
                        selected_choice_id: null,
                        selected_choice_ids: [],
                        text_answer: e.target.value,
                      },
                    }))
                  }
                  onBlur={(e) =>
                    saveAnswer(currentQuestion.id, { text_answer: e.target.value })
                  }
                />
                <div className="small text-muted mt-2">
                  <i className="bi bi-info-circle me-1" />
                  Your answer saves automatically when you navigate or finish typing.
                </div>
              </div>
            )}
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
            <i className="bi bi-grid-3x3-gap me-1" aria-hidden="true" />
            <span>
              {currentIndex + 1} / {data.total_questions}
            </span>
          </button>

          {/* Next or Review & Submit Button */}
          {currentIndex < data.total_questions - 1 ? (
            <button
              type="button"
              className="stu-btn-primary"
              onClick={() =>
                setCurrentIndex((prev) => Math.min(data.total_questions - 1, prev + 1))
              }
              style={{ minWidth: '95px' }}
            >
              Next →
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
          <div className="d-flex justify-content-end w-100">
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
          <p className="small text-muted mb-3">
            Tap any question number to jump directly to it:
          </p>

          <div className="stu-palette-grid mb-3">
            {data.questions.map((q, idx) => {
              const ans = responses[String(q.id)];
              const isAnswered =
                ans &&
                (ans.selected_choice_id !== null ||
                  (ans.text_answer && ans.text_answer.trim() !== ''));
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

          <div className="d-flex align-items-center gap-3 pt-2 border-top small text-muted">
            <div className="d-flex align-items-center gap-1">
              <span className="stu-palette-btn stu-palette-btn--current" style={{ width: '16px', height: '16px', fontSize: '9px' }}>✓</span>
              <span>Current</span>
            </div>
            <div className="d-flex align-items-center gap-1">
              <span className="stu-palette-btn stu-palette-btn--answered" style={{ width: '16px', height: '16px', fontSize: '9px' }}>✓</span>
              <span>Answered</span>
            </div>
            <div className="d-flex align-items-center gap-1">
              <span className="stu-palette-btn stu-palette-btn--unanswered" style={{ width: '16px', height: '16px', fontSize: '9px' }}>-</span>
              <span>Unanswered</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirmation Submit Modal */}
      <Modal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        title="Submit Quiz Assessment"
        size="md"
        footer={
          <div className="d-flex gap-2 justify-content-end w-100">
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
              className="fw-bold"
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
            <Alert variant="danger" dismissible onDismiss={() => setSubmitError(null)} className="mb-3">
              {submitError}
            </Alert>
          )}

          <p className="mb-3">
            Are you sure you want to finish and submit <strong>{data.quiz_title}</strong>?
          </p>

          <div className="p-3 bg-light rounded border mb-3">
            <div className="d-flex justify-content-between mb-1 small">
              <span>Total Questions:</span>
              <strong>{data.total_questions}</strong>
            </div>
            <div className="d-flex justify-content-between mb-1 small">
              <span>Questions Answered:</span>
              <strong className="text-success">{answeredCount}</strong>
            </div>
            <div className="d-flex justify-content-between small">
              <span>Unanswered Questions:</span>
              <strong
                className={
                  data.total_questions - answeredCount > 0 ? 'text-danger' : 'text-success'
                }
              >
                {data.total_questions - answeredCount}
              </strong>
            </div>
          </div>

          {data.total_questions - answeredCount > 0 && (
            <div className="alert alert-warning small mb-0">
              <i className="bi bi-exclamation-triangle me-1" />
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
        <div className="text-center py-2">
          <i className="bi bi-alarm fs-1 text-danger d-block mb-2" />
          <h5 className="fw-bold">Time has expired!</h5>
          <p className="text-muted small mb-0">
            Your assessment has been automatically finalized and submitted with your saved answers.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default StudentQuizTake;
