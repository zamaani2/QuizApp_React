import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type { StudentAttemptsData } from '../../types/student';
import { Alert } from '../../components/common/Alert';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import './student.css';

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All Attempts', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Passed', value: 'passed' },
  { label: 'Failed', value: 'failed' },
  { label: 'In Progress', value: 'in_progress' },
];

export const StudentAttemptsList: React.FC = () => {
  const [data, setData] = useState<StudentAttemptsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadAttempts = async (status: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await studentApi.getStudentAttempts({
        status: status === 'all' ? undefined : status,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch attempts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttempts(statusFilter);
  }, [statusFilter]);

  return (
    <div data-testid="student-attempts-list">
      {/* Promotion Prep Style Header */}
      <div className="stu-welcome">
        <div className="stu-welcome__heading-row">
          <h1 className="stu-welcome__name">My Quiz Attempts</h1>
          {data && (
            <span className="stu-welcome__role-badge">
              <i className="bi bi-award-fill" aria-hidden="true" /> {data.completed_attempts_count} Completed
            </span>
          )}
        </div>
        <p className="stu-welcome__subtitle">
          View your past assessment attempts, scores, and review detailed question feedback.
        </p>
      </div>

      {/* Minimal Stats Overview Bar */}
      {data && (
        <div className="stu-stats-grid">
          <div className="stu-stat-box">
            <div className="stu-stat-box__val" style={{ color: 'var(--stu-sky)' }}>
              {data.total_attempts}
            </div>
            <div className="stu-stat-box__label">Total Attempts</div>
          </div>

          <div className="stu-stat-box">
            <div className="stu-stat-box__val" style={{ color: 'var(--stu-navy)' }}>
              {data.avg_percentage}%
            </div>
            <div className="stu-stat-box__label">Average</div>
          </div>

          <div className="stu-stat-box">
            <div className="stu-stat-box__val" style={{ color: 'var(--stu-success)' }}>
              {data.best_percentage}%
            </div>
            <div className="stu-stat-box__label">Best Score</div>
          </div>
        </div>
      )}

      {/* Filter Horizontal Pills */}
      <div className="stu-filter-pills" role="tablist" aria-label="Attempt status filters">
        {STATUS_FILTERS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`stu-filter-pill ${statusFilter === opt.value ? 'stu-filter-pill--active' : ''}`}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <Alert variant="danger" dismissible={false} className="mb-3">
          <h5>Error loading attempts</h5>
          <p className="mb-2">{error}</p>
          <button className="stu-btn-outline" onClick={() => loadAttempts(statusFilter)}>
            Retry
          </button>
        </Alert>
      )}

      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <LoadingSpinner size="lg" message="Loading your attempts..." />
        </div>
      ) : !data || data.attempts.length === 0 ? (
        <div className="stu-card text-center py-5">
          <i className="bi bi-journal-x text-muted" style={{ fontSize: '2.5rem' }} aria-hidden="true" />
          <h2 className="stu-card__title mt-3 mb-1" style={{ fontSize: '1.1rem' }}>No attempt records found</h2>
          <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>
            You haven't attempted any quizzes in this category yet.
          </p>
          <Link to="/student/quizzes" className="stu-btn-primary">
            Explore Available Quizzes →
          </Link>
        </div>
      ) : (
        /* Mobile-First Result Card List */
        <div className="stu-card-list">
          {data.attempts.map((att) => (
            <div key={att.id} className="stu-quiz-card">
              <div className="stu-quiz-card__header">
                <div className="stu-quiz-card__icon-title">
                  <div className="stu-quiz-card__icon">
                    <i className="bi bi-award" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="stu-quiz-card__title">{att.quiz_title}</h2>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span className="stu-badge stu-badge--sky">{att.subject_name}</span>
                      <span className="small text-muted fw-semibold">
                        Attempt #{att.attempt_number}
                      </span>
                    </div>
                  </div>
                </div>

                {att.is_submitted ? (
                  <span className={`stu-badge ${att.is_passed ? 'stu-badge--success' : 'stu-badge--danger'}`}>
                    {att.percentage}% ({att.is_passed ? 'Passed' : 'Failed'})
                  </span>
                ) : (
                  <span className="stu-badge stu-badge--warning">In Progress</span>
                )}
              </div>

              <div className="stu-quiz-card__meta">
                {att.is_submitted ? (
                  <span className="stu-quiz-card__meta-item">
                    <i className="bi bi-star" aria-hidden="true" />
                    <strong>{att.score}</strong> / {att.total_marks} marks
                  </span>
                ) : (
                  <span className="stu-quiz-card__meta-item text-warning">
                    <i className="bi bi-clock-history" aria-hidden="true" /> Not submitted yet
                  </span>
                )}

                {att.submitted_at ? (
                  <>
                    <span>•</span>
                    <span className="stu-quiz-card__meta-item">
                      <i className="bi bi-calendar3" aria-hidden="true" />
                      {new Date(att.submitted_at).toLocaleDateString()}
                    </span>
                  </>
                ) : att.started_at ? (
                  <>
                    <span>•</span>
                    <span className="stu-quiz-card__meta-item">
                      Started: {new Date(att.started_at).toLocaleDateString()}
                    </span>
                  </>
                ) : null}
              </div>

              <div className="stu-quiz-card__footer">
                {att.is_submitted ? (
                  <Link
                    to={`/student/attempts/${att.id}/result`}
                    className="stu-btn-primary"
                    style={{ width: '100%' }}
                  >
                    Review Result
                  </Link>
                ) : (
                  <Link
                    to={`/student/take/${att.id}`}
                    className="stu-btn-warning"
                    style={{ width: '100%' }}
                  >
                    Resume Quiz →
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

export default StudentAttemptsList;
