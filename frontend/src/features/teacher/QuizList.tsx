import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchTeacherQuizzes, updateQuizStatus, deleteQuiz } from '../../api/teacher';
import type { QuizListItem } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import '../../components/table/DataTable.css';

function formatClasses(classes?: { id: number; name: string }[]): string {
  if (!classes || classes.length === 0) return 'No classes';
  const firstTwo = classes.slice(0, 2).map((c) => c.name).join(', ');
  const remaining = classes.length - 2;
  return remaining > 0 ? `${firstTwo} (+${remaining})` : firstTwo;
}

function formatSchedule(from?: string | null, until?: string | null): string {
  if (!from && !until) return 'No schedule';
  const fmt = (d: string) => {
    const dt = new Date(d);
    return Number.isNaN(dt.getTime())
      ? d
      : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
  if (from && until) return `${fmt(from)} – ${fmt(until)}`;
  if (from) return `From ${fmt(from)}`;
  if (until) return `Until ${fmt(until)}`;
  return 'No schedule';
}

export const QuizList: React.FC = () => {
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Delete modal state
  const [deleteQuizItem, setDeleteQuizItem] = useState<QuizListItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadQuizzes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchTeacherQuizzes({
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setQuizzes(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quizzes.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  const handleStatusChange = async (quizId: number, nextStatus: string) => {
    setError(null);
    try {
      await updateQuizStatus(quizId, nextStatus);
      setMessage(`Quiz status updated to ${nextStatus}.`);
      await loadQuizzes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update quiz status.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteQuizItem) return;
    setDeleteLoading(true);
    setError(null);
    try {
      await deleteQuiz(deleteQuizItem.id);
      setMessage(`Quiz "${deleteQuizItem.title}" deleted.`);
      setDeleteQuizItem(null);
      await loadQuizzes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete quiz.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filter quizzes by search query
  const filteredQuizzes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return quizzes;
    return quizzes.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subject_name && item.subject_name.toLowerCase().includes(q))
    );
  }, [quizzes, searchQuery]);

  return (
    <div className="assessment-page core-container core-space--padding-y-4" data-testid="teacher-quiz-list">
      {/* Title row */}
      <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-space--margin-bottom-4 core-layout--gap-3">
        <div>
          <h1 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">
            Quizzes
          </h1>
          <p className="core-text--muted core-space--margin-bottom-0">
            Quiz Catalog & assessment management
          </p>
        </div>
        <div className="core-display-flex core-layout--gap-2">
          <Link
            to="/teacher/quizzes/new"
            className="core-button core-button--primary core-button--sm core-display-inline-flex core-layout--align-center core-layout--gap-1"
          >
            + New quiz
          </Link>
        </div>
      </div>

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

      {/* Controls row: Search & Status Filters */}
      <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-space--margin-bottom-4 core-layout--gap-3">
        {/* Status filter tabs */}
        <div className="core-button-group" role="group" aria-label="Status filters">
          {(['all', 'draft', 'published', 'archived'] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={`core-button core-button--sm ${
                statusFilter === status
                  ? 'core-button--primary'
                  : 'core-button--outline-secondary'
              } core-text--capitalize`}
              onClick={() => {
                setStatusFilter(status);
              }}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ maxWidth: '320px', width: '100%' }}>
          <input
            type="text"
            className="core-field__input core-field__input--sm"
            placeholder="Search quizzes..."
            aria-label="Search quizzes"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading && quizzes.length === 0 ? (
        <div className="core-display-flex core-layout--justify-center core-space--padding-y-5">
          <LoadingSpinner size="lg" message="Loading quizzes..." />
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="core-card core-shadow--sm core-border--none core-surface--white core-space--padding-5 core-text--center">
          <div className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-bottom-2">
            No Quizzes Found
          </div>
          <p className="core-text--muted core-space--margin-bottom-3">
            {searchQuery
              ? `No quizzes matched "${searchQuery}".`
              : `There are no ${statusFilter !== 'all' ? statusFilter : ''} quizzes yet.`}
          </p>
          <Link to="/teacher/quizzes/new" className="core-button core-button--primary core-button--sm">
            Create a New Quiz
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4">
            <div className="core-card__body core-space--padding-0">
              <div className="data-table-container">
                <div className="data-table__viewport">
                  <table className="data-table__table" style={{ minWidth: '1000px' }} aria-label="Quiz catalog">
                    <thead>
                      <tr>
                        <th scope="col" style={{ textAlign: 'center', width: '300px' }}>Actions</th>
                        <th scope="col" style={{ textAlign: 'left' }}>Quiz Title & Subject</th>
                        <th scope="col" style={{ textAlign: 'center' }}>Status</th>
                        <th scope="col" style={{ textAlign: 'center' }}>Questions</th>
                        <th scope="col" style={{ textAlign: 'left' }}>Assigned Classes</th>
                        <th scope="col" style={{ textAlign: 'left' }}>Schedule Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQuizzes.map((quiz) => (
                        <tr key={quiz.id}>
                          <td style={{ textAlign: 'center', minWidth: '300px' }}>
                            <div className="core-display-flex core-layout--justify-center core-layout--wrap core-layout--gap-1">
                              <Link
                                to={`/teacher/quizzes/${quiz.id}`}
                                className="core-button core-button--sm core-button--primary"
                              >
                                Open
                              </Link>
                              <Link
                                to={`/teacher/quizzes/${quiz.id}/settings`}
                                className="core-button core-button--sm core-button--outline-secondary"
                              >
                                Settings
                              </Link>
                              <Button
                                size="sm"
                                variant="outline-secondary"
                                aria-label={`${quiz.status === 'archived' ? 'Unarchive' : 'Archive'} ${quiz.title}`}
                                onClick={() =>
                                  handleStatusChange(
                                    quiz.id,
                                    quiz.status === 'archived' ? 'draft' : 'archived'
                                  )
                                }
                              >
                                {quiz.status === 'archived' ? 'Unarchive' : 'Archive'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-danger"
                                aria-label={`Delete ${quiz.title}`}
                                onClick={() => setDeleteQuizItem(quiz)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                          <td>
                            <div>
                              <Link
                                to={`/teacher/quizzes/${quiz.id}`}
                                className="core-type--weight-bold core-text--dark core-text--decoration-none"
                              >
                                {quiz.title}
                              </Link>
                              <div className="core-type--small core-text--muted">
                                {quiz.subject_name || 'General Subject'}
                                {quiz.academic_year && ` · ${quiz.academic_year}`}
                              </div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className={`core-badge ${
                                quiz.status === 'published'
                                  ? 'core-surface--success'
                                  : quiz.status === 'draft'
                                  ? 'core-surface--warning core-text--dark'
                                  : 'core-surface--secondary'
                              }`}
                            >
                              {quiz.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="core-type--weight-semibold">{quiz.total_questions}</span>
                            <div className="core-type--small core-text--muted">
                              {quiz.total_marks} marks
                            </div>
                          </td>
                          <td>
                            <span className="core-type--small core-text--dark">
                              {formatClasses(quiz.classes)}
                            </span>
                          </td>
                          <td>
                            <span className="core-type--small core-text--muted">
                              {formatSchedule(quiz.available_from, quiz.available_until)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteQuizItem)}
        title="Delete Quiz"
        message={`Are you sure you want to delete "${deleteQuizItem?.title}"? All questions and student attempts associated with this quiz will be permanently removed.`}
        confirmLabel={deleteLoading ? 'Deleting...' : 'Delete Quiz'}
        confirmVariant="danger"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteQuizItem(null)}
      />
    </div>
  );
};
