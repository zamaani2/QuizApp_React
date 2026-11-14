import { AppIcon } from '../../components/common/AppIcon';
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
              <AppIcon name="award" aria-hidden="true" /> {data.completed_attempts_count} Completed
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
      <div className="stu-filter-pills" role="group" aria-label="Attempt status filters">
        {STATUS_FILTERS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`stu-filter-pill ${statusFilter === opt.value ? 'stu-filter-pill--active' : ''}`}
            aria-pressed={statusFilter === opt.value}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <Alert variant="danger" dismissible={false} className="core-space--margin-bottom-3">
          <h5>Error loading attempts</h5>
          <p className="core-space--margin-bottom-2">{error}</p>
          <button className="stu-btn-outline" onClick={() => loadAttempts(statusFilter)}>
            Retry
          </button>
        </Alert>
      )}

      {loading ? (
        <div className="core-display-flex core-layout--justify-center core-space--padding-y-5">
          <LoadingSpinner size="lg" message="Loading your attempts..." />
        </div>
      ) : !data || data.attempts.length === 0 ? (
        <div className="stu-card core-text--center core-space--padding-y-5">
          <AppIcon name="bookX" className="core-text--muted" style={{ fontSize: '2.5rem' }} aria-hidden="true" />
          <h2 className="stu-card__title core-space--margin-top-3 core-space--margin-bottom-1" style={{ fontSize: '1.1rem' }}>No attempt records found</h2>
          <p className="core-text--muted core-space--margin-bottom-3" style={{ fontSize: '0.875rem' }}>
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
                    <AppIcon name="award" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="stu-quiz-card__title">{att.quiz_title}</h2>
                    <div className="core-display-flex core-layout--align-center core-layout--gap-2 core-layout--wrap">
                      <span className="stu-badge stu-badge--sky">{att.subject_name}</span>
                      <span className="core-type--small core-text--muted core-type--weight-semibold">
                        Attempt #{att.attempt_number}
                      </span>
                    </div>
                  </div>
                </div>

                {att.is_submitted && att.results_available ? (
                  <span className={`stu-badge ${att.is_passed ? 'stu-badge--success' : 'stu-badge--danger'}`}>
                    {att.percentage}% ({att.is_passed ? 'Passed' : 'Failed'})
                  </span>
                ) : att.is_submitted ? (
                  <span className="stu-badge stu-badge--warning">Results pending</span>
                ) : (
                  <span className="stu-badge stu-badge--warning">In Progress</span>
                )}
              </div>

              <div className="stu-quiz-card__meta">
                {att.is_submitted && att.results_available ? (
                  <span className="stu-quiz-card__meta-item">
                    <AppIcon name="star" aria-hidden="true" />
                    <strong>{att.score}</strong> / {att.total_marks} marks
                  </span>
                ) : att.is_submitted ? (
                  <span className="stu-quiz-card__meta-item core-text--muted">
                    Results are waiting for your teacher.
                  </span>
                ) : (
                  <span className="stu-quiz-card__meta-item core-text--warning">
                    <AppIcon name="history" aria-hidden="true" /> Not submitted yet
                  </span>
                )}

                {att.submitted_at ? (
                  <>
                    <span>•</span>
                    <span className="stu-quiz-card__meta-item">
                      <AppIcon name="calendarDays" aria-hidden="true" />
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
                {att.is_submitted && att.results_available ? (
                  <Link
                    to={`/student/attempts/${att.id}/result`}
                    className="stu-btn-primary"
                    style={{ width: '100%' }}
                  >
                    Review Result
                  </Link>
                ) : !att.is_submitted ? (
                  <Link
                    to={`/student/take/${att.id}`}
                    className="stu-btn-warning"
                    style={{ width: '100%' }}
                  >
                    Resume Quiz →
                  </Link>
                ) : (
                  <span className="core-type--small core-text--muted">Results pending</span>
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
