import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type { StudentQuiz, StudentQuizStatus } from '../../types/student';
import { Alert } from '../../components/common/Alert';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import './student.css';

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Available', value: 'available' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Upcoming', value: 'upcoming' },
];

export const StudentQuizList: React.FC = () => {
  const location = useLocation();
  const isAssignments = location.pathname.startsWith('/student/assignments');

  const [quizzes, setQuizzes] = useState<StudentQuiz[]>([]);
  const [className, setClassName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const loadQuizzes = async (status: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await studentApi.getStudentQuizzes({
        status: status === 'all' ? undefined : status,
      });
      setQuizzes(res.quizzes);
      setClassName(res.class_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch quizzes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuizzes(statusFilter);
  }, [statusFilter]);

  const filteredQuizzes = quizzes.filter((q) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      q.title.toLowerCase().includes(term) ||
      q.subject_name.toLowerCase().includes(term) ||
      q.teacher_name.toLowerCase().includes(term)
    );
  });

  const getStatusBadge = (status: StudentQuizStatus) => {
    switch (status) {
      case 'available':
        return <span className="stu-badge stu-badge--success">Available</span>;
      case 'in_progress':
        return <span className="stu-badge stu-badge--warning">In Progress</span>;
      case 'completed':
        return <span className="stu-badge stu-badge--muted">Completed</span>;
      case 'upcoming':
        return <span className="stu-badge stu-badge--sky">Upcoming</span>;
      case 'expired':
        return <span className="stu-badge stu-badge--danger">Expired</span>;
      default:
        return <span className="stu-badge stu-badge--muted">Unavailable</span>;
    }
  };

  return (
    <div data-testid="student-quiz-list">
      {/* Promotion Prep Style Header */}
      <div className="stu-welcome">
        <div className="stu-welcome__heading-row">
          <h1 className="stu-welcome__name">{isAssignments ? 'My Assignments' : 'Available Quizzes'}</h1>
          {className && (
            <span className="stu-welcome__role-badge">
              <AppIcon name="graduationCap" aria-hidden="true" /> {className}
            </span>
          )}
        </div>
        <p className="stu-welcome__subtitle">
          {isAssignments
            ? 'View quizzes and assessments assigned specifically to your class cohort.'
            : 'Browse, start, or review your assigned quizzes and assessments.'}
        </p>
      </div>

      {/* Search Input */}
      <div className="core-space--margin-bottom-3">
        <div className="input-group" style={{ maxWidth: '600px' }}>
          <span className="input-group-text core-surface--white core-border--end-none" style={{ borderColor: 'var(--stu-border)' }}>
            <AppIcon name="search" className="core-text--muted" aria-hidden="true" />
          </span>
          <input
            type="search"
            className="core-field__input core-border--start-none core-space--padding-start-0"
            style={{ borderColor: 'var(--stu-border)', fontSize: '0.875rem' }}
            placeholder="Search by quiz title, subject, or teacher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search quizzes"
          />
        </div>
      </div>

      {/* Status Filter Horizontal Pills */}
      <div className="stu-filter-pills" role="tablist" aria-label="Quiz status filters">
        {STATUS_OPTIONS.map((opt) => (
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
        <Alert variant="danger" dismissible={false} className="core-space--margin-bottom-3">
          <h5>Error loading quizzes</h5>
          <p className="core-space--margin-bottom-2">{error}</p>
          <button className="stu-btn-outline" onClick={() => loadQuizzes(statusFilter)}>
            Retry
          </button>
        </Alert>
      )}

      {loading ? (
        <div className="core-display-flex core-layout--justify-center core-space--padding-y-5">
          <LoadingSpinner size="lg" message="Loading quizzes..." />
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="stu-card core-text--center core-space--padding-y-5">
          <AppIcon name="clipboardCheck" className="core-text--muted" style={{ fontSize: '2.5rem' }} aria-hidden="true" />
          <h2 className="stu-card__title core-space--margin-top-3 core-space--margin-bottom-1" style={{ fontSize: '1.1rem' }}>No quizzes found</h2>
          <p className="core-text--muted core-space--margin-bottom-0" style={{ fontSize: '0.875rem' }}>
            {searchTerm
              ? 'No quizzes match your search filter.'
              : 'There are no quizzes matching this status.'}
          </p>
        </div>
      ) : (
        /* Mobile-First Card List (Promotion Prep Style) */
        <div className="stu-card-list">
          {filteredQuizzes.map((quiz) => (
            <div key={quiz.id} className="stu-quiz-card">
              <div className="stu-quiz-card__header">
                <div className="stu-quiz-card__icon-title">
                  <div className="stu-quiz-card__icon">
                    <AppIcon name="bookText" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="stu-quiz-card__title">{quiz.title}</h2>
                    <div className="core-display-flex core-layout--align-center core-layout--gap-2 core-layout--wrap">
                      <span className="stu-badge stu-badge--sky">{quiz.subject_name}</span>
                      <span className="core-type--small core-text--muted">By {quiz.teacher_name}</span>
                    </div>
                  </div>
                </div>
                {getStatusBadge(quiz.status)}
              </div>

              {quiz.description && (
                <p className="core-text--muted core-type--small core-space--margin-bottom-0" style={{ lineHeight: '1.4' }}>
                  {quiz.description}
                </p>
              )}

              <div className="stu-quiz-card__meta">
                <span className="stu-quiz-card__meta-item">
                  <AppIcon name="clock" aria-hidden="true" />
                  {quiz.duration_minutes > 0 ? `${quiz.duration_minutes} mins` : 'Untimed'}
                </span>
                <span>•</span>
                <span className="stu-quiz-card__meta-item">
                  <AppIcon name="circleHelp" aria-hidden="true" />
                  {quiz.total_questions} questions
                </span>
                <span>•</span>
                <span className="stu-quiz-card__meta-item">
                  <AppIcon name="star" aria-hidden="true" />
                  {quiz.total_marks} marks
                </span>
                <span>•</span>
                <span className="stu-quiz-card__meta-item">
                  {quiz.attempts_count} of {quiz.max_attempts} attempts
                </span>
                {quiz.attempts_count > 0 && quiz.results_available && quiz.best_percentage !== null && (
                  <>
                    <span>•</span>
                    <span className="stu-quiz-card__meta-item core-text--primary core-type--weight-semibold">
                      Best: {quiz.best_percentage}%
                    </span>
                  </>
                )}
              </div>

              <div className="stu-quiz-card__footer">
                {quiz.status === 'in_progress' && quiz.in_progress_attempt_id ? (
                  <Link
                    to={`/student/take/${quiz.in_progress_attempt_id}`}
                    className="stu-btn-warning"
                    style={{ width: '100%' }}
                  >
                    Resume Assessment →
                  </Link>
                ) : quiz.can_attempt ? (
                  <Link
                    to={`/student/quizzes/${quiz.id}`}
                    className="stu-btn-primary"
                    style={{ width: '100%' }}
                  >
                    Take Quiz
                  </Link>
                ) : (
                  <Link
                    to={`/student/quizzes/${quiz.id}`}
                    className="stu-btn-outline"
                    style={{ width: '100%' }}
                  >
                    View Details & Attempts
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

export default StudentQuizList;
