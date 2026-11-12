import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  deleteQuiz,
  fetchTeacherQuizDetail,
  releaseQuizResults,
  updateQuizStatus,
} from '../../api/teacher';
import type { QuizDetailData } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

export const QuizDetail: React.FC = () => {
  const { id, quizId } = useParams<{ id?: string; quizId?: string }>();
  const routeId = id ?? quizId;
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<QuizDetailData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Menu state
  const [menuOpen, setMenuOpen] = useState(false);

  // Delete quiz dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!routeId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTeacherQuizDetail(Number(routeId));
      setQuiz(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz details.');
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleStatusToggle = async (nextStatus: string) => {
    if (!quiz) return;
    setActionLoading(true);
    setError(null);
    try {
      await updateQuizStatus(quiz.id, nextStatus);
      setMessage(`Quiz status updated to ${nextStatus}.`);
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update quiz status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteQuiz = async () => {
    if (!quiz) return;
    setDeleteLoading(true);
    setError(null);
    try {
      await deleteQuiz(quiz.id);
      navigate('/teacher/quizzes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete quiz.');
      setDeleteOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleReleaseResults = async () => {
    if (!quiz) return;
    setReleaseLoading(true);
    setError(null);
    try {
      await releaseQuizResults(quiz.id);
      setMessage('Quiz results released to students.');
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to release quiz results.');
    } finally {
      setReleaseLoading(false);
    }
  };

  // Checklist calculations
  const checklist = useMemo(() => {
    if (!quiz) return { completedCount: 0, items: [] };

    const questionsDone = quiz.total_questions > 0;
    const classesDone = (quiz.assigned_classes?.length ?? 0) > 0;
    const settingsDone = Boolean(quiz.title && quiz.subject_name);
    const publishDone = quiz.status === 'published';

    const items = [
      {
        id: 'questions',
        label: 'Add questions',
        detail: `${quiz.total_questions} added`,
        done: questionsDone,
        link: `/teacher/questions/${quiz.id}`,
        buttonText: questionsDone ? 'Edit Questions' : 'Add Questions',
      },
      {
        id: 'classes',
        label: 'Assign classes',
        detail: `${quiz.assigned_classes?.length ?? 0} classes`,
        done: classesDone,
        link: `/teacher/assignments?quiz=${quiz.id}`,
        buttonText: classesDone ? 'Manage Classes' : 'Assign Classes',
      },
      {
        id: 'settings',
        label: 'Review settings',
        detail: 'Timing, score thresholds, security',
        done: settingsDone,
        link: `/teacher/quizzes/${quiz.id}/settings`,
        buttonText: 'Settings',
      },
      {
        id: 'publish',
        label: 'Publish quiz',
        detail: quiz.status === 'published' ? 'Published to assigned classes' : 'Draft only',
        done: publishDone,
        action: 'publish',
      },
    ];

    const completedCount = items.filter((i) => i.done).length;
    return { completedCount, items };
  }, [quiz]);

  if (loading && !quiz) {
    return (
      <div className="core-container core-space--padding-y-5 core-display-flex core-layout--justify-center">
        <LoadingSpinner size="lg" message="Loading quiz details..." />
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="core-container core-space--padding-y-4">
        <Alert variant="danger">{error || 'Quiz not found.'}</Alert>
      </div>
    );
  }

  const isDraft = quiz.status === 'draft';
  const isPublished = quiz.status === 'published';
  const isArchived = quiz.status === 'archived';

  const classesAssigned = quiz.assigned_classes?.length ?? 0;
  const canPublish = quiz.total_questions > 0 && classesAssigned > 0;
  const publishDisabledReason = canPublish
    ? null
    : quiz.total_questions === 0
    ? 'Add at least one question before publishing.'
    : 'Assign at least one class before publishing.';

  return (
    <div className="assessment-page core-container core-space--padding-y-4" data-testid="teacher-quiz-detail">
      {/* Back Link */}
      <div className="core-space--margin-bottom-3">
        <Link to="/teacher/quizzes" className="core-text--decoration-none core-type--small core-text--muted">
          &larr; Back to Quizzes
        </Link>
      </div>

      {/* Header */}
      <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-space--margin-bottom-4 core-layout--gap-3">
        <div>
          <h1 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">
            {quiz.title}
          </h1>
          <div className="core-display-flex core-layout--wrap core-layout--align-center core-layout--gap-2 core-space--margin-top-1">
            <span
              className={`core-badge ${
                quiz.status === 'published'
                  ? 'core-surface--success'
                  : quiz.status === 'draft'
                  ? 'core-surface--warning core-text--dark'
                  : 'core-surface--secondary'
              }`}
            >
              {quiz.status?.toUpperCase() ?? ''}
            </span>
            <span className="core-badge core-surface--primary-subtle core-text--primary core-border">
              {quiz.subject_name || 'Subject'}
            </span>
            {(quiz.academic_year || quiz.term) && (
              <span className="core-badge core-surface--light core-text--dark core-border">
                {quiz.academic_year} {quiz.term && `· ${quiz.term}`}
              </span>
            )}
          </div>
        </div>

        {/* Header Actions: Exactly ONE primary action by state + secondary menu */}
        <div className="core-display-flex core-layout--align-center core-layout--gap-2">
          {/* Exactly one primary action by state */}
          {isDraft && (
            <div title={publishDisabledReason || undefined}>
              <Button
                variant="primary"
                size="sm"
                disabled={!canPublish || actionLoading}
                onClick={() => handleStatusToggle('published')}
              >
                {actionLoading ? 'Publishing...' : 'Publish'}
              </Button>
            </div>
          )}

          {isPublished && (
            <Button
              variant="warning"
              size="sm"
              disabled={actionLoading}
              onClick={() => handleStatusToggle('draft')}
            >
              {actionLoading ? 'Unpublishing...' : 'Unpublish'}
            </Button>
          )}

          {/* Action menu */}
          <div className="core-dropdown" style={{ position: 'relative' }}>
            <Button
              variant="outline-secondary"
              size="sm"
              aria-label="Quiz options menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              ⋮ More
            </Button>
            {menuOpen && (
              <div
                className="core-card core-shadow--md core-border core-surface--white"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  minWidth: '160px',
                  zIndex: 50,
                  padding: '0.25rem 0',
                }}
              >
                <Link
                  to={`/teacher/quizzes/${quiz.id}/settings`}
                  className="core-dropdown__item core-display-block core-space--padding-x-3 core-space--padding-y-2 core-text--dark core-text--decoration-none core-type--small"
                  onClick={() => setMenuOpen(false)}
                >
                  Settings
                </Link>
                {isPublished && !quiz.show_results_immediately && !quiz.results_released_at && (
                  <button
                    type="button"
                    className="core-dropdown__item core-display-block core-width--100 core-space--padding-x-3 core-space--padding-y-2 core-text--start core-border--none core-surface--transparent core-text--dark core-type--small core-cursor--pointer"
                    disabled={releaseLoading}
                    onClick={() => {
                      setMenuOpen(false);
                      handleReleaseResults();
                    }}
                  >
                    {releaseLoading ? 'Releasing results...' : 'Release results'}
                  </button>
                )}
                <button
                  type="button"
                  className="core-dropdown__item core-display-block core-width--100 core-space--padding-x-3 core-space--padding-y-2 core-text--start core-border--none core-surface--transparent core-text--dark core-type--small core-cursor--pointer"
                  onClick={() => {
                    setMenuOpen(false);
                    handleStatusToggle(isArchived ? 'draft' : 'archived');
                  }}
                >
                  {isArchived ? 'Restore' : 'Archive'}
                </button>
                <div className="core-border--top core-space--margin-y-1" />
                <button
                  type="button"
                  className="core-dropdown__item core-display-block core-width--100 core-space--padding-x-3 core-space--padding-y-2 core-text--start core-border--none core-surface--transparent core-text--danger core-type--small core-cursor--pointer"
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert variant="success" dismissible onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      )}
      {isDraft && publishDisabledReason && (
        <Alert variant="warning">
          <strong>Setup incomplete:</strong> {publishDisabledReason}. Use the checklist below to complete setup.
        </Alert>
      )}

      {/* 3. Summary Cards */}
      <div className="core-grid core-grid--gap-3 core-space--margin-bottom-4">
        <div className="core-grid__span-6 core-grid__span-md-2">
          <div className="core-card core-shadow--sm core-border--none core-text--center core-space--padding-3">
            <div className="core-text--muted core-type--small">Questions</div>
            <div className="core-type--heading-4 core-type--weight-bold core-space--margin-bottom-0">
              {quiz.total_questions}
            </div>
          </div>
        </div>

        <div className="core-grid__span-6 core-grid__span-md-2">
          <div className="core-card core-shadow--sm core-border--none core-text--center core-space--padding-3">
            <div className="core-text--muted core-type--small">Total Marks</div>
            <div className="core-type--heading-4 core-type--weight-bold core-space--margin-bottom-0">
              {quiz.total_marks}
            </div>
          </div>
        </div>

        <div className="core-grid__span-6 core-grid__span-md-3">
          <div className="core-card core-shadow--sm core-border--none core-text--center core-space--padding-3">
            <div className="core-text--muted core-type--small">Pass Mark</div>
            <div className="core-type--heading-4 core-type--weight-bold core-space--margin-bottom-0">
              {quiz.pass_percentage}%
            </div>
            <div className="core-type--small core-text--muted">
              {quiz.passing_marks ?? 0} marks
            </div>
          </div>
        </div>

        <div className="core-grid__span-6 core-grid__span-md-2">
          <div className="core-card core-shadow--sm core-border--none core-text--center core-space--padding-3">
            <div className="core-text--muted core-type--small">Attempts</div>
            <div className="core-type--heading-4 core-type--weight-bold core-space--margin-bottom-0">
              {quiz.max_attempts}
            </div>
            <div className="core-type--small core-text--muted">allowed</div>
          </div>
        </div>

        <div className="core-grid__span-12 core-grid__span-md-3">
          <div className="core-card core-shadow--sm core-border--none core-text--center core-space--padding-3">
            <div className="core-text--muted core-type--small">Time Limit</div>
            <div className="core-type--heading-4 core-type--weight-bold core-space--margin-bottom-0">
              {quiz.duration_minutes ? `${quiz.duration_minutes}m` : 'Untimed'}
            </div>
            <div className="core-type--small core-text--muted">
              {quiz.duration_minutes ? 'per attempt' : 'unlimited'}
            </div>
          </div>
        </div>
      </div>

      <div className="core-grid core-grid--gap-4 core-space--margin-bottom-4">
        {/* 4. Setup Checklist Card */}
        <div className="core-grid__span-12 core-grid__span-md-8">
          <div className="core-card core-shadow--sm core-border--none">
            <div className="core-card__header core-surface--white core-display-flex core-layout--justify-between core-layout--align-center core-space--padding-y-3">
              <div>
                <h2 className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-bottom-0">
                  Setup Checklist
                </h2>
                <div className="core-type--small core-text--muted core-space--margin-top-1">
                  Progress: {checklist.completedCount} of {checklist.items.length} completed
                </div>
              </div>
              <span
                className={`core-badge ${
                  checklist.completedCount === checklist.items.length
                    ? 'core-surface--success'
                    : 'core-surface--secondary-subtle'
                }`}
              >
                {checklist.completedCount} of {checklist.items.length}
              </span>
            </div>
            <div className="core-card__body core-space--padding-0">
              <div className="core-list core-list--flush">
                {checklist.items.map((item) => (
                  <div
                    key={item.id}
                    className="core-list__item core-display-flex core-layout--justify-between core-layout--align-center core-space--padding-3 core-border--bottom"
                  >
                    <div className="core-display-flex core-layout--align-center core-layout--gap-3">
                      <span
                        className={`core-badge ${
                          item.done
                            ? 'core-surface--success core-text--white'
                            : 'core-surface--light core-text--secondary core-border'
                        }`}
                        style={{ width: '24px', height: '24px', borderRadius: '50%', textAlign: 'center', lineHeight: '20px' }}
                      >
                        {item.done ? '✓' : '○'}
                      </span>
                      <div>
                        <div className="core-type--weight-semibold core-text--dark">
                          {item.label}
                        </div>
                        <div className="core-type--small core-text--muted">
                          {item.detail}
                        </div>
                      </div>
                    </div>

                    <div>
                      {item.link ? (
                        <Link
                          to={item.link}
                          className="core-button core-button--sm core-button--outline-primary"
                        >
                          {item.buttonText}
                        </Link>
                      ) : item.action === 'publish' ? (
                        <span className="core-type--small core-text--muted">
                          {isPublished ? 'Published' : canPublish ? 'Use Publish above' : publishDisabledReason}
                        </span>
                      ) : (
                        <span className="core-type--small core-text--muted">
                          {item.done ? 'Done' : 'Pending'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 5. Results Card */}
        <div className="core-grid__span-12 core-grid__span-md-4">
          <div className="core-card core-shadow--sm core-border--none core-surface--white">
            <div className="core-card__body">
              <h2 className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-bottom-2">
                Submissions & Results
              </h2>
              <div className="core-space--margin-bottom-3">
                <div className="core-type--heading-3 core-type--weight-bold core-text--primary">
                  {quiz.total_attempts}
                </div>
                <div className="core-type--small core-text--muted">
                  student attempt{quiz.total_attempts !== 1 ? 's' : ''} recorded
                </div>
              </div>
              <p className="core-type--small core-text--muted core-space--margin-bottom-4">
                View submission logs, grades, student percentages, and grading breakdown.
              </p>
              <Link
                to={`/teacher/results?quiz_id=${quiz.id}`}
                className="core-button core-button--outline-primary core-width--100 core-display-inline-flex core-layout--justify-center"
              >
                View Quiz Results ({quiz.total_attempts})
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={deleteOpen}
        title="Delete Quiz"
        message={`Are you sure you want to permanently delete "${quiz.title}"? All questions, settings, and attempts will be permanently erased.`}
        confirmLabel={deleteLoading ? 'Deleting...' : 'Delete Quiz'}
        confirmVariant="danger"
        loading={deleteLoading}
        onConfirm={handleDeleteQuiz}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
};
