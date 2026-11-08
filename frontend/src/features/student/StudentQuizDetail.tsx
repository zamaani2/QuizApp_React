import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type { StudentQuizDetail as IStudentQuizDetail } from '../../types/student';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import './student.css';

export const StudentQuizDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<IStudentQuizDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string>('');
  const [starting, setStarting] = useState<boolean>(false);
  const [startError, setStartError] = useState<string | null>(null);

  const loadDetail = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await studentApi.getStudentQuizDetail(Number(id));
      setQuiz(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  const handleStartOrResume = async () => {
    if (!id) return;
    try {
      setStarting(true);
      setStartError(null);
      const res = await studentApi.startStudentQuiz(Number(id), password);
      if (res.success && res.attempt_id) {
        navigate(`/student/take/${res.attempt_id}`);
      } else {
        setStartError(res.message || 'Unable to start quiz.');
      }
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start quiz.');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center py-5" data-testid="student-quiz-detail-loading">
        <LoadingSpinner size="lg" message="Loading quiz details..." />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div data-testid="student-quiz-detail-error">
        <Alert variant="danger" dismissible={false}>
          <h5>Unable to load quiz</h5>
          <p className="mb-2">{error || 'Quiz not found or not assigned to your class.'}</p>
          <div className="d-flex gap-2">
            <button className="stu-btn-outline" onClick={loadDetail}>
              Retry
            </button>
            <Link to="/student/quizzes" className="stu-btn-outline">
              Back to Available Quizzes
            </Link>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div data-testid="student-quiz-detail">
      {/* Back Link & Header */}
      <div className="mb-3">
        <Link to="/student/quizzes" className="stu-section-head__link">
          ← Back to Available Quizzes
        </Link>
      </div>

      <div className="stu-welcome">
        <div className="stu-welcome__heading-row">
          <h1 className="stu-welcome__name">{quiz.title}</h1>
          <span className="stu-badge stu-badge--sky">{quiz.subject_name}</span>
        </div>
        <p className="stu-welcome__subtitle">
          Instructor: {quiz.teacher_name}
          {quiz.available_until && (
            <> • Available until {new Date(quiz.available_until).toLocaleDateString()}</>
          )}
        </p>
      </div>

      {startError && (
        <Alert variant="danger" dismissible onDismiss={() => setStartError(null)} className="mb-3">
          {startError}
        </Alert>
      )}

      {/* Prominent Action Callout Card */}
      <div className="stu-cta-card">
        <div className="stu-cta-card__top">
          <div className="stu-cta-card__icon-box">
            <i className="bi bi-pencil-square" aria-hidden="true" />
          </div>
          <div className="stu-cta-card__info">
            <div className="stu-cta-card__eyebrow">
              {quiz.subject_name.toUpperCase()} • {quiz.total_questions} QUESTIONS
            </div>
            <h2 className="stu-cta-card__title">
              {quiz.in_progress_attempt_id ? 'Resume In-Progress Assessment' : 'Ready to Begin?'}
            </h2>
            <p className="stu-cta-card__desc">
              {quiz.description || 'Review the instructions and assessment rules below before starting.'}
            </p>
          </div>
        </div>

        {/* Password Prompt if required */}
        {quiz.require_password && !quiz.in_progress_attempt_id && (
          <div className="mt-2">
            <label htmlFor="quiz-password" className="form-label small fw-bold" style={{ color: 'var(--stu-navy)' }}>
              Quiz Access Password:
            </label>
            <input
              id="quiz-password"
              type="password"
              className="form-control"
              placeholder="Enter quiz password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ borderColor: 'var(--stu-border)', borderRadius: 'var(--stu-radius-sm)' }}
            />
          </div>
        )}

        {/* Start / Resume Button */}
        {quiz.in_progress_attempt_id ? (
          <div>
            <div className="stu-banner stu-banner--warning mb-2">
              <div className="stu-banner__content">
                <span className="stu-banner__dot" aria-hidden="true" />
                <span>You have an attempt currently in progress!</span>
              </div>
            </div>
            <Button
              variant="primary"
              className="w-100 py-3 fw-bold"
              style={{ backgroundColor: 'var(--stu-navy)', borderColor: 'var(--stu-navy)' }}
              onClick={handleStartOrResume}
              loading={starting}
            >
              Resume In-Progress Quiz
            </Button>
          </div>
        ) : quiz.can_attempt ? (
          <div>
            <Button
              variant="primary"
              className="w-100 py-3 fw-bold"
              style={{ backgroundColor: 'var(--stu-navy)', borderColor: 'var(--stu-navy)' }}
              onClick={handleStartOrResume}
              loading={starting}
              disabled={quiz.require_password && !password.trim()}
            >
              Start Assessment Now
            </Button>
            <p className="small text-muted text-center mt-2 mb-0">
              Timer starts immediately once clicked. Ensure a stable internet connection.
            </p>
          </div>
        ) : (
          <div className="stu-banner">
            <div className="stu-banner__content">
              <span>{quiz.attempt_message || 'You cannot take this assessment at this time.'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Assessment Rules Grid */}
      <div className="stu-section-head">
        <div className="stu-section-head__title-group">
          <h2 className="stu-section-head__title">Assessment Rules</h2>
          <p className="stu-section-head__subtitle">Structure and passing criteria</p>
        </div>
      </div>

      <div className="stu-stats-grid mb-4">
        <div className="stu-stat-box">
          <div className="stu-stat-box__val" style={{ color: 'var(--stu-navy)' }}>
            {quiz.duration_minutes > 0 ? `${quiz.duration_minutes}m` : 'Untimed'}
          </div>
          <div className="stu-stat-box__label">Time Limit</div>
        </div>

        <div className="stu-stat-box">
          <div className="stu-stat-box__val" style={{ color: 'var(--stu-sky)' }}>
            {quiz.total_questions}
          </div>
          <div className="stu-stat-box__label">Questions</div>
        </div>

        <div className="stu-stat-box">
          <div className="stu-stat-box__val" style={{ color: 'var(--stu-success)' }}>
            {quiz.passing_marks} ({quiz.pass_percentage}%)
          </div>
          <div className="stu-stat-box__label">Passing Mark</div>
        </div>
      </div>

      {/* Overview & Instructions Card */}
      <div className="stu-card mb-4">
        <h3 className="fw-bold mb-2" style={{ fontSize: '1rem', color: 'var(--stu-navy)' }}>
          Instructions
        </h3>
        {quiz.instructions ? (
          <div
            className="p-3 rounded mb-3"
            style={{ backgroundColor: 'var(--stu-surface-alt)', border: '1px solid var(--stu-border-light)' }}
          >
            <p className="mb-0 text-dark" style={{ whiteSpace: 'pre-line', fontSize: '0.9rem', lineHeight: '1.5' }}>
              {quiz.instructions}
            </p>
          </div>
        ) : (
          <p className="text-muted small fst-italic mb-3">No specific instructions provided.</p>
        )}

        <div className="d-flex justify-content-between text-muted small pt-2 border-top">
          <span>Total Marks: <strong className="text-dark">{quiz.total_marks}</strong></span>
          <span>Max Attempts: <strong className="text-dark">{quiz.max_attempts}</strong></span>
          <span>Remaining: <strong className="text-primary">{quiz.remaining_attempts}</strong></span>
        </div>
      </div>

      {/* Past Attempts Section */}
      <div className="stu-section-head">
        <div className="stu-section-head__title-group">
          <h2 className="stu-section-head__title">Your Past Attempts</h2>
          <p className="stu-section-head__subtitle">History for this assessment</p>
        </div>
      </div>

      {quiz.past_attempts.length === 0 ? (
        <div className="stu-card text-center py-4">
          <i className="bi bi-clock-history text-muted" style={{ fontSize: '1.75rem' }} aria-hidden="true" />
          <p className="text-muted small mb-0 mt-2">You haven't attempted this quiz yet.</p>
        </div>
      ) : (
        <div className="stu-card-list">
          {quiz.past_attempts.map((att) => (
            <div key={att.id} className="stu-result-card">
              <div className="stu-result-card__info">
                <h3 className="stu-result-card__title">Attempt #{att.attempt_number}</h3>
                <div className="stu-result-card__sub">
                  <span>Score: {att.score} / {att.total_marks}</span>
                  {att.submitted_at && <span> • {new Date(att.submitted_at).toLocaleDateString()}</span>}
                </div>
              </div>

              <div className="stu-result-card__score-box">
                <span className={`stu-badge ${att.is_passed ? 'stu-badge--success' : 'stu-badge--danger'}`}>
                  {att.percentage}% ({att.is_passed ? 'Passed' : 'Failed'})
                </span>
                {att.is_submitted ? (
                  <Link
                    to={`/student/attempts/${att.id}/result`}
                    className="stu-section-head__link"
                    style={{ fontSize: '0.75rem' }}
                  >
                    Review →
                  </Link>
                ) : (
                  <Link
                    to={`/student/take/${att.id}`}
                    className="stu-section-head__link text-warning"
                    style={{ fontSize: '0.75rem' }}
                  >
                    Resume →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentQuizDetail;
