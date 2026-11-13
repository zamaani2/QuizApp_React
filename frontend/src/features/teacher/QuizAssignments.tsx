import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchQuizAssignments, fetchTeacherQuizzes, setQuizClasses } from '../../api/teacher';
import type { QuizAssignmentsData, QuizListItem } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import './QuizAssignments.css';

type StatusFilter = 'all' | 'draft' | 'published' | 'archived';

function formatAvailability(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

function formatSchedule(quiz: QuizListItem): string {
  const from = formatAvailability(quiz.available_from);
  const until = formatAvailability(quiz.available_until);
  if (from && until) return `${from} – ${until}`;
  if (from) return `From ${from}`;
  if (until) return `Until ${until}`;
  return 'No schedule';
}

function formatClassNames(classes?: { id: number; name: string }[]): string {
  if (!classes?.length) return 'No classes assigned';
  const names = classes.slice(0, 2).map((item) => item.name).join(', ');
  const remaining = classes.length - 2;
  return remaining > 0 ? `${names} (+${remaining})` : names;
}

function readQuizId(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export const QuizAssignments: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const quizIdParam = searchParams.get('quiz');
  const quizId = readQuizId(quizIdParam);
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [assignments, setAssignments] = useState<QuizAssignmentsData | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const assignmentRequestId = useRef(0);

  const selectedQuiz = useMemo(
    () => quizzes.find((quiz) => quiz.id === quizId) ?? null,
    [quizzes, quizId]
  );

  const refreshAssignments = useCallback(async (id: number) => {
    const requestId = ++assignmentRequestId.current;
    setLoadingAssignments(true);
    setAssignmentError(null);
    try {
      const result = await fetchQuizAssignments(id);
      if (requestId === assignmentRequestId.current) {
        setAssignments(result);
        setSelectedClassIds(result.assigned_classes.map((item) => item.id));
      }
    } catch (err) {
      if (requestId === assignmentRequestId.current) {
        setAssignments(null);
        setAssignmentError(err instanceof Error ? err.message : 'Unable to load quiz assignments.');
      }
    } finally {
      if (requestId === assignmentRequestId.current) setLoadingAssignments(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingQuizzes(true);
    setError(null);
    fetchTeacherQuizzes()
      .then((response) => {
        if (active) setQuizzes(response.results);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load quizzes.');
      })
      .finally(() => {
        if (active) setLoadingQuizzes(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setAssignments(null);
    setSelectedClassIds([]);
    setClassSearch('');
    setAssignmentError(null);
    setConfirmRemoval(false);
    if (quizId !== null) {
      void refreshAssignments(quizId);
    } else if (quizIdParam !== null) {
      setAssignmentError('Enter a valid quiz ID to manage its assignments.');
    }
  }, [quizId, quizIdParam, refreshAssignments]);

  const filteredQuizzes = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return quizzes.filter((quiz) => {
      const matchesStatus = statusFilter === 'all' || quiz.status === statusFilter;
      const matchesQuery = !query ||
        quiz.title.toLocaleLowerCase().includes(query) ||
        quiz.subject_name.toLocaleLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [quizzes, searchQuery, statusFilter]);

  const classes = useMemo(() => {
    if (!assignments) return [];
    const byId = new Map<number, { id: number; name: string }>();
    assignments.assigned_classes.forEach((item) => byId.set(item.id, item));
    assignments.available_classes.forEach((item) => byId.set(item.id, item));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments]);

  const visibleClasses = useMemo(() => {
    const query = classSearch.trim().toLocaleLowerCase();
    return classes.filter((item) => item.name.toLocaleLowerCase().includes(query));
  }, [classes, classSearch]);

  const assignedIds = useMemo(
    () => new Set(assignments?.assigned_classes.map((item) => item.id) ?? []),
    [assignments]
  );
  const selectedIds = useMemo(() => new Set(selectedClassIds), [selectedClassIds]);
  const addedIds = selectedClassIds.filter((id) => !assignedIds.has(id));
  const removedIds = [...assignedIds].filter((id) => !selectedIds.has(id));
  const removalNeedsConfirmation = removedIds.length > 0 && (selectedQuiz?.total_attempts ?? 0) > 0;

  function openPanel(id: number) {
    const next = new URLSearchParams(searchParams);
    next.set('quiz', String(id));
    setSearchParams(next);
  }

  function closePanel() {
    if (saving) return;
    const next = new URLSearchParams(searchParams);
    next.delete('quiz');
    setSearchParams(next, { replace: true });
  }

  function toggleClass(classId: number, checked: boolean) {
    setSelectedClassIds((current) => checked
      ? [...current, classId]
      : current.filter((id) => id !== classId));
  }

  function setVisibleSelection(checked: boolean) {
    const visibleIds = new Set(visibleClasses.map((item) => item.id));
    setSelectedClassIds((current) => {
      const retained = current.filter((id) => !visibleIds.has(id));
      return checked ? [...retained, ...visibleIds] : retained;
    });
  }

  async function saveAssignments() {
    if (quizId === null || !assignments || saving) return;
    setSaving(true);
    setAssignmentError(null);
    setMessage(null);
    try {
      const result = await setQuizClasses(quizId, selectedClassIds);
      setMessage(result.message);
      await refreshAssignments(quizId);
    } catch (err) {
      setAssignmentError(err instanceof Error ? err.message : 'Unable to save class assignments.');
    } finally {
      setSaving(false);
      setConfirmRemoval(false);
    }
  }

  const summary = addedIds.length || removedIds.length
    ? `Assign to ${addedIds.length} class${addedIds.length === 1 ? '' : 'es'}, remove from ${removedIds.length}`
    : 'No assignment changes';

  return (
    <div className="assessment-page core-container core-space--padding-y-4 quiz-assignments-page">
      <header className="quiz-assignments-page__header">
        <div>
          <h1 className="core-type--heading-3">Assignments</h1>
          <p className="core-text--muted">See and manage which classes have each quiz.</p>
        </div>
        <Link className="core-button core-button--primary core-button--sm" to="/teacher/quizzes">
          Quiz catalog
        </Link>
      </header>

      {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
      {message && <Alert variant="success" dismissible onDismiss={() => setMessage(null)}>{message}</Alert>}

      <div className="quiz-assignments-page__controls">
        <div className="core-button-group" role="group" aria-label="Status filters">
          {(['all', 'draft', 'published', 'archived'] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={`core-button core-button--sm ${statusFilter === status ? 'core-button--primary' : 'core-button--outline-secondary'}`}
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="core-field__input core-field__input--sm quiz-assignments-page__search"
          aria-label="Search quizzes"
          placeholder="Search quizzes..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      {loadingQuizzes ? (
        <LoadingSpinner size="lg" message="Loading quizzes..." />
      ) : filteredQuizzes.length === 0 ? (
        <div className="core-card core-space--padding-4 quiz-assignments-page__empty">
          {quizzes.length === 0
            ? 'No quizzes are available to assign.'
            : 'No quizzes match your search and status filters.'}
        </div>
      ) : (
        <>
          <div className="quiz-assignments-table-wrap">
            <table className="data-table__table quiz-assignments-table">
              <thead>
                <tr>
                  <th scope="col">Quiz</th>
                  <th scope="col">Status</th>
                  <th scope="col">Assigned classes</th>
                  <th scope="col">Schedule</th>
                  <th scope="col"><span className="core-visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredQuizzes.map((quiz) => (
                  <tr key={quiz.id}>
                    <td>
                      <Link to={`/teacher/quizzes/${quiz.id}`} className="quiz-assignments-table__title">{quiz.title}</Link>
                      <span className="quiz-assignments-table__subject">{quiz.subject_name}</span>
                    </td>
                    <td><span className={`quiz-assignments-status quiz-assignments-status--${quiz.status}`}>{quiz.status}</span></td>
                    <td>{formatClassNames(quiz.classes)}</td>
                    <td>{formatSchedule(quiz)}</td>
                    <td>
                      <Button size="sm" variant="outline-primary" onClick={() => openPanel(quiz.id)}>Assign</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="quiz-assignments-cards">
            {filteredQuizzes.map((quiz) => (
              <article className="core-card quiz-assignments-card" key={quiz.id}>
                <div className="quiz-assignments-card__heading">
                  <div>
                    <Link to={`/teacher/quizzes/${quiz.id}`} className="quiz-assignments-table__title">{quiz.title}</Link>
                    <span className="quiz-assignments-table__subject">{quiz.subject_name}</span>
                  </div>
                  <span className={`quiz-assignments-status quiz-assignments-status--${quiz.status}`}>{quiz.status}</span>
                </div>
                <dl>
                  <div><dt>Assigned classes</dt><dd>{formatClassNames(quiz.classes)}</dd></div>
                  <div><dt>Schedule</dt><dd>{formatSchedule(quiz)}</dd></div>
                </dl>
                <Button size="sm" variant="outline-primary" onClick={() => openPanel(quiz.id)}>Assign classes</Button>
              </article>
            ))}
          </div>
        </>
      )}

      {quizIdParam !== null && (
        <div
          className="quiz-assignment-drawer-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closePanel(); }}
        >
          <section className="quiz-assignment-drawer" role="dialog" aria-modal="true" aria-labelledby="quiz-assignment-title">
            <header className="quiz-assignment-drawer__header">
              <div>
                <p className="core-text--muted">Manage classes</p>
                <h2 id="quiz-assignment-title">{selectedQuiz?.title ?? assignments?.quiz_title ?? 'Quiz assignments'}</h2>
              </div>
              <button type="button" className="quiz-assignment-drawer__close" aria-label="Close assignments" onClick={closePanel} disabled={saving}>×</button>
            </header>
            <div className="quiz-assignment-drawer__body">
              {assignmentError && <Alert variant="danger">{assignmentError}</Alert>}
              {selectedQuiz?.status === 'draft' && (
                <Alert variant="warning">
                  This quiz is a draft. Students cannot see it until it is published.
                </Alert>
              )}
              {selectedQuiz?.status === 'published' && (
                <p className="quiz-assignment-visibility">
                  {assignments?.assigned_classes.length
                    ? `Visible to ${assignments.assigned_classes.length} ${assignments.assigned_classes.length === 1 ? 'class' : 'classes'}`
                    : 'Not visible to any classes'}
                  {selectedQuiz.available_from && ` from ${formatAvailability(selectedQuiz.available_from)}`}
                  {selectedQuiz.available_until && ` to ${formatAvailability(selectedQuiz.available_until)}`}
                  {!selectedQuiz.available_from && !selectedQuiz.available_until && assignments?.assigned_classes.length
                    ? '; no schedule limits'
                    : ''}
                </p>
              )}
              {loadingAssignments ? (
                <LoadingSpinner size="md" message="Loading classes..." />
              ) : assignments ? (
                <>
                  <label className="quiz-assignment-drawer__search-label" htmlFor="assignment-class-search">Search classes</label>
                  <input
                    id="assignment-class-search"
                    type="search"
                    className="core-field__input"
                    placeholder="Search classes..."
                    value={classSearch}
                    onChange={(event) => setClassSearch(event.target.value)}
                  />
                  <div className="quiz-assignment-drawer__selection-controls">
                    <Button size="sm" variant="link" onClick={() => setVisibleSelection(true)}>Select all shown</Button>
                    <Button size="sm" variant="link" onClick={() => setVisibleSelection(false)}>Clear shown</Button>
                  </div>
                  <div className="quiz-assignment-class-list">
                    {visibleClasses.length ? visibleClasses.map((item) => {
                      const isAssigned = assignedIds.has(item.id);
                      return (
                        <label className="quiz-assignment-class" key={item.id}>
                          <input
                            type="checkbox"
                            aria-label={item.name}
                            checked={selectedIds.has(item.id)}
                            onChange={(event) => toggleClass(item.id, event.target.checked)}
                          />
                          <span>{item.name}</span>
                          {isAssigned && <span className="quiz-assignment-class__badge">Assigned</span>}
                        </label>
                      );
                    }) : <p className="core-text--muted">No classes match your search.</p>}
                  </div>
                </>
              ) : null}
            </div>
            <footer className="quiz-assignment-drawer__footer">
              <p aria-live="polite">{summary}</p>
              <div>
                <Button variant="secondary" onClick={closePanel} disabled={saving}>Cancel</Button>
                <Button
                  variant="primary"
                  onClick={() => removalNeedsConfirmation ? setConfirmRemoval(true) : void saveAssignments()}
                  disabled={!assignments || loadingAssignments || (!addedIds.length && !removedIds.length)}
                  loading={saving}
                >
                  Save
                </Button>
              </div>
            </footer>
          </section>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmRemoval}
        onClose={() => setConfirmRemoval(false)}
        onConfirm={() => void saveAssignments()}
        title="Remove class assignment?"
        message={(
          <span>
            This quiz has {selectedQuiz?.total_attempts ?? 0} existing student attempt{selectedQuiz?.total_attempts === 1 ? '' : 's'}.
            Removing {removedIds.length} {removedIds.length === 1 ? 'class' : 'classes'} stops students in those classes from accessing the quiz for new attempts. Existing attempt records will be retained.
          </span>
        )}
        confirmLabel="Remove class assignment"
        loading={saving}
      />
    </div>
  );
};
