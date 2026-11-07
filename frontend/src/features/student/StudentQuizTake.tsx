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

  // Modals
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

      // Also check localStorage for any unsaved local draft (safeguard against connection drop)
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

    // Save local draft to localStorage (safeguard)
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
      <div className="assessment-page container-fluid py-4" data-testid="student-quiz-take-loading">
        <div className="d-flex justify-content-center py-5">
          <LoadingSpinner size="lg" message="Loading your assessment..." />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="assessment-page container-fluid py-4" data-testid="student-quiz-take-error">
        <Alert variant="danger" dismissible={false}>
          <h5>Unable to load quiz session</h5>
          <p className="mb-2">{error || 'Session could not be initialized.'}</p>
          <div className="d-flex gap-2">
            <Button variant="secondary" size="sm" onClick={loadAttempt}>
              Retry
            </Button>
          </div>
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

  return (
    <div className="assessment-page container-fluid py-3" data-testid="student-quiz-take">
      {/* Top Header / Status Bar */}
      <div className="card shadow-sm border-0 mb-3 bg-white">
        <div className="card-body py-2 px-3">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
              <h5 className="fw-bold mb-0 text-dark">{data.quiz_title}</h5>
              <div className="small text-muted">
                Question {currentIndex + 1} of {data.total_questions} • Answered:{' '}
                <strong>{answeredCount}</strong> / {data.total_questions}
              </div>
            </div>

            {/* Timer and Status Indicator */}
            <div className="d-flex align-items-center gap-3">
              {/* Autosave status pill */}
              <div className="small">
                {saveStatus === 'saving' && (
                  <span className="text-muted">
                    <span className="spinner-border spinner-border-sm me-1" />
                    Saving...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-success">
                    <i className="bi bi-cloud-check me-1" />
                    Draft saved
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-warning fw-semibold" title={saveErrorMessage || ''}>
                    <i className="bi bi-exclamation-triangle me-1" />
                    Draft saved offline
                  </span>
                )}
              </div>

              {/* Timer Pill */}
              {secondsRemaining !== null && (
                <div
                  className={`badge fs-6 px-3 py-2 ${
                    secondsRemaining < 300 ? 'bg-danger animate-pulse' : 'bg-primary'
                  }`}
                  data-testid="quiz-timer"
                >
                  <i className="bi bi-stopwatch me-1"></i>
                  {formatTime(secondsRemaining)}
                </div>
              )}

              {/* Submit Quiz CTA */}
              <Button
                variant="success"
                size="sm"
                className="fw-bold"
                onClick={() => setShowSubmitModal(true)}
              >
                Submit Quiz
              </Button>

            </div>
          </div>
        </div>
      </div>

      <div className="row g-3">
        {/* Left Column: Current Question */}
        <div className="col-lg-9">
          {currentQuestion && (
            <div className="card shadow-sm border-0 mb-3">
              <div className="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
                <span className="badge bg-light text-dark border fs-6">
                  Question {currentIndex + 1}
                </span>
                <span className="badge bg-secondary text-white">{currentQuestion.marks} pts</span>
              </div>
              <div className="card-body p-4">
                <p className="fs-5 text-dark fw-medium mb-4">{currentQuestion.question_text}</p>

                {/* Multiple Choice & True/False Choices */}
                {(currentQuestion.question_type === 'multiple_choice' ||
                  currentQuestion.question_type === 'true_false') && (
                  <div className="d-flex flex-column gap-2 mb-4">
                    {currentQuestion.choices.map((choice) => {
                      const isSelected = currentAnswer?.selected_choice_id === choice.id;
                      return (
                        <label
                          key={choice.id}
                          className={`p-3 border rounded d-flex align-items-center gap-3 cursor-pointer transition ${
                            isSelected
                              ? 'border-primary bg-primary-subtle text-dark fw-semibold'
                              : 'border-light-subtle bg-white hover-bg-light'
                          }`}
                          style={{ cursor: 'pointer' }}
                        >
                          <input
                            type="radio"
                            name={`question_${currentQuestion.id}`}
                            value={choice.id}
                            checked={isSelected}
                            onChange={() =>
                              saveAnswer(currentQuestion.id, { selected_choice_id: choice.id })
                            }
                            className="form-check-input mt-0"
                          />
                          <span className="fs-6">{choice.choice_text}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Text / Essay Input */}
                {(currentQuestion.question_type === 'essay' ||
                  currentQuestion.question_type === 'short_answer' ||
                  currentQuestion.question_type === 'fill_blank') && (
                  <div className="mb-4">
                    <label htmlFor="essay-answer" className="form-label small fw-semibold text-muted">
                      Type your response below:
                    </label>
                    <textarea
                      id="essay-answer"
                      className="form-control"
                      rows={6}
                      placeholder="Write your answer here..."
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
                    <div className="form-text text-muted">
                      Your answer will automatically save when you navigate or finish typing.
                    </div>
                  </div>
                )}

                {/* Navigation Buttons: Previous / Next */}
                <div className="d-flex justify-content-between align-items-center pt-3 border-top">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  >
                    ← Previous Question
                  </Button>

                  {currentIndex < data.total_questions - 1 ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        setCurrentIndex((prev) =>
                          Math.min(data.total_questions - 1, prev + 1)
                        )
                      }
                    >
                      Next Question →
                    </Button>
                  ) : (
                    <Button
                      variant="success"
                      size="sm"
                      className="fw-bold"
                      onClick={() => setShowSubmitModal(true)}
                    >
                      Review & Submit
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Question Navigator Palette */}
        <div className="col-lg-3">
          <div className="card shadow-sm border-0 sticky-top" style={{ top: '1rem' }}>
            <div className="card-header bg-white py-3 border-0">
              <h6 className="card-title fw-bold mb-0">Question Navigator</h6>
            </div>
            <div className="card-body">
              <div className="d-flex flex-wrap gap-2 mb-3">
                {data.questions.map((q, idx) => {
                  const ans = responses[String(q.id)];
                  const isAnswered =
                    ans &&
                    (ans.selected_choice_id !== null ||
                      (ans.text_answer && ans.text_answer.trim() !== ''));
                  const isCurrent = idx === currentIndex;

                  let btnClass = 'btn btn-sm ';
                  if (isCurrent) {
                    btnClass += 'btn-primary fw-bold';
                  } else if (isAnswered) {
                    btnClass += 'btn-success text-white';
                  } else {
                    btnClass += 'btn-outline-secondary';
                  }

                  return (
                    <button
                      key={q.id}
                      type="button"
                      className={btnClass}
                      style={{ width: '38px', height: '38px' }}
                      onClick={() => setCurrentIndex(idx)}
                      title={`Question ${idx + 1}: ${isAnswered ? 'Answered' : 'Not answered'}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div className="small text-muted d-flex flex-column gap-1 pt-2 border-top">
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-primary" style={{ width: '12px', height: '12px' }} />
                  <span>Current Question</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-success" style={{ width: '12px', height: '12px' }} />
                  <span>Answered</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span
                    className="badge border border-secondary"
                    style={{ width: '12px', height: '12px' }}
                  />
                  <span>Unanswered</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
            <Alert variant="danger" dismissible onDismiss={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          <p className="mb-3">
            Are you sure you want to finish and submit <strong>{data.quiz_title}</strong>?
          </p>

          <div className="p-3 bg-light rounded border mb-3">
            <div className="d-flex justify-content-between mb-1">
              <span>Total Questions:</span>
              <strong>{data.total_questions}</strong>
            </div>
            <div className="d-flex justify-content-between mb-1">
              <span>Questions Answered:</span>
              <strong className="text-success">{answeredCount}</strong>
            </div>
            <div className="d-flex justify-content-between">
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
              <i className="bi bi-exclamation-triangle me-1"></i>
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
          <i className="bi bi-alarm fs-1 text-danger d-block mb-2"></i>
          <h5 className="fw-bold">Time has expired!</h5>
          <p className="text-muted small mb-0">
            Your assessment has been automatically finalized and submitted with your saved answers.
          </p>
        </div>
      </Modal>
    </div>
  );
};
