import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  fetchTeacherQuizzes,
  fetchTeacherQuizDetail,
  reorderQuizQuestions,
  duplicateQuestion,
  deleteQuestion,
  bulkDeleteQuestions,
} from '../../api/teacher';
import type { QuizListItem, QuizDetailData, QuestionDetailItem } from '../../types';
import { questionTypeRegistry } from '../../question-types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

function formatTypeLabel(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function isAnswerKeyMissing(q: QuestionDetailItem): boolean {
  if (q.question_type === 'multiple_choice' || q.question_type === 'true_false') {
    return !q.choices || q.choices.length === 0 || !q.choices.some((c) => c.is_correct);
  }
  if (
    q.question_type === 'short_answer' ||
    q.question_type === 'fill_blank' ||
    q.question_type === 'matching' ||
    q.question_type === 'ordering'
  ) {
    return !q.correct_answer_text && (!q.config || Object.keys(q.config).length === 0);
  }
  return false;
}

export const QuizQuestionsPage: React.FC = () => {
  const { quizId } = useParams<{ quizId?: string }>();
  const navigate = useNavigate();

  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [quizzesLoading, setQuizzesLoading] = useState(true);
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);

  const [quiz, setQuiz] = useState<QuizDetailData | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Expanded rows
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [draggedQuestionId, setDraggedQuestionId] = useState<number | null>(null);

  // Row menus
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

  // Bulk selection
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Single delete dialog
  const [deleteQuestionItem, setDeleteQuestionItem] = useState<QuestionDetailItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load quiz list
  useEffect(() => {
    let active = true;
    setQuizzesLoading(true);
    fetchTeacherQuizzes()
      .then((res) => {
        if (!active) return;
        setQuizzes(res.results);

        // Determine quiz to select:
        let targetId: number | null = null;
        if (quizId) {
          targetId = Number(quizId);
        } else {
          const stored = localStorage.getItem('last_selected_quiz_id');
          if (stored && res.results.some((q) => q.id === Number(stored))) {
            targetId = Number(stored);
          } else if (res.results.length > 0) {
            targetId = res.results[0].id;
          }
        }

        if (targetId) {
          setSelectedQuizId(targetId);
          localStorage.setItem('last_selected_quiz_id', String(targetId));
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load quizzes.');
      })
      .finally(() => {
        if (active) setQuizzesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [quizId]);

  // Load selected quiz details
  const loadQuizDetails = useCallback(async (id: number) => {
    setQuizLoading(true);
    setError(null);
    try {
      const data = await fetchTeacherQuizDetail(id);
      setQuiz(data);
      setSelectedQuestionIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz questions.');
    } finally {
      setQuizLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedQuizId) {
      loadQuizDetails(selectedQuizId);
    }
  }, [selectedQuizId, loadQuizDetails]);

  // Handle quiz selector change
  const handleQuizSelectChange = (newQuizId: number) => {
    setSelectedQuizId(newQuizId);
    localStorage.setItem('last_selected_quiz_id', String(newQuizId));
    navigate(`/teacher/questions/${newQuizId}`);
  };

  // Reordering with optimistic update & rollback
  const moveQuestion = async (sourceId: number, targetId: number) => {
    if (!quiz) return;
    const sourceIndex = quiz.questions.findIndex((q) => q.id === sourceId);
    const targetIndex = quiz.questions.findIndex((q) => q.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

    const previousQuestions = [...quiz.questions];
    const reordered = [...quiz.questions];
    const [movedQuestion] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, movedQuestion);

    // Optimistic update
    setQuiz({
      ...quiz,
      questions: reordered.map((q, idx) => ({ ...q, order: idx + 1 })),
    });

    try {
      await reorderQuizQuestions(quiz.id, reordered.map((q) => q.id));
    } catch (err) {
      // Rollback on error
      setQuiz({
        ...quiz,
        questions: previousQuestions,
      });
      setError(err instanceof Error ? err.message : 'Failed to reorder questions. Changes reverted.');
    }
  };

  const handleReorder = (questionId: number, offset: number) => {
    if (!quiz) return;
    const index = quiz.questions.findIndex((q) => q.id === questionId);
    const target = quiz.questions[index + offset];
    if (index >= 0 && target) {
      void moveQuestion(questionId, target.id);
    }
  };

  // Duplicate question
  const handleDuplicate = async (questionId: number) => {
    if (!quiz) return;
    setActiveMenuId(null);
    setError(null);
    try {
      await duplicateQuestion(quiz.id, questionId);
      setMessage('Question duplicated successfully.');
      await loadQuizDetails(quiz.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to duplicate question.');
    }
  };

  // Delete question
  const handleDeleteConfirm = async () => {
    if (!quiz || !deleteQuestionItem) return;
    setDeleteLoading(true);
    setError(null);
    try {
      await deleteQuestion(quiz.id, deleteQuestionItem.id);
      setMessage('Question deleted.');
      setDeleteQuestionItem(null);
      await loadQuizDetails(quiz.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete question.');
      setDeleteQuestionItem(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Bulk delete
  const handleBulkDeleteConfirm = async () => {
    if (!quiz || selectedQuestionIds.length === 0) return;
    setBulkDeleteLoading(true);
    setError(null);
    try {
      const res = await bulkDeleteQuestions(quiz.id, selectedQuestionIds);
      setMessage(res.message || `${selectedQuestionIds.length} question(s) deleted.`);
      setSelectedQuestionIds([]);
      setBulkDeleteOpen(false);
      await loadQuizDetails(quiz.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete selected questions.');
      setBulkDeleteOpen(false);
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  // Toggle row expansion
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Toggle selection
  const toggleSelectQuestion = (id: number) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Filter questions
  const filteredQuestions = useMemo(() => {
    if (!quiz) return [];
    return quiz.questions.filter((q) => {
      if (typeFilter !== 'all' && q.question_type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        return q.question_text.toLowerCase().includes(query);
      }
      return true;
    });
  }, [quiz, typeFilter, searchQuery]);

  // Counts by question type
  const typeCounts = useMemo(() => {
    if (!quiz) return [];
    const counts: Record<string, number> = {};
    for (const q of quiz.questions) {
      counts[q.question_type] = (counts[q.question_type] || 0) + 1;
    }
    return Object.entries(counts).map(([type, count]) => `${count} ${formatTypeLabel(type)}`);
  }, [quiz]);

  // Grouped quizzes for selector
  const groupedQuizzes = useMemo(() => {
    const published = quizzes.filter((q) => q.status === 'published');
    const drafts = quizzes.filter((q) => q.status === 'draft');
    const archived = quizzes.filter((q) => q.status === 'archived');
    return { published, drafts, archived };
  }, [quizzes]);

  const selectAll = () => {
    if (selectedQuestionIds.length === filteredQuestions.length) {
      setSelectedQuestionIds([]);
    } else {
      setSelectedQuestionIds(filteredQuestions.map((q) => q.id));
    }
  };

  if (quizzesLoading) {
    return (
      <div className="core-container core-space--padding-y-5 core-display-flex core-layout--justify-center">
        <LoadingSpinner size="lg" message="Loading quizzes..." />
      </div>
    );
  }

  if (quizzes.length === 0) {
    return (
      <div className="assessment-page core-container core-space--padding-y-5 core-text--center" data-testid="teacher-questions-page">
        <div className="core-card core-shadow--sm core-border--none core-surface--white core-space--padding-5">
          <h2 className="core-type--heading-4 core-type--weight-bold core-text--dark core-space--margin-bottom-2">
            No Quizzes Available
          </h2>
          <p className="core-text--muted core-space--margin-bottom-4">
            Create a quiz before writing or managing assessment questions.
          </p>
          <Link to="/teacher/quizzes/new" className="core-button core-button--primary">
            Create a quiz
          </Link>
        </div>
      </div>
    );
  }

  const isPublishedWithAttempts = Boolean(
    quiz && quiz.status === 'published' && quiz.total_attempts > 0
  );

  return (
    <div className="assessment-page core-container core-space--padding-y-4" data-testid="teacher-questions-page">
      {/* Top row: Quiz Selector & back link */}
      <div className="core-space--margin-bottom-4">
        <div className="core-space--margin-bottom-2">
          <Link to="/teacher/quizzes" className="core-text--decoration-none core-type--small core-text--muted">
            &larr; Back to Quizzes
          </Link>
        </div>

        <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-layout--gap-3">
          <div className="core-display-flex core-layout--align-center core-layout--gap-2" style={{ flex: 1, maxWidth: '500px' }}>
            <label htmlFor="quiz-picker-select" className="core-type--weight-semibold core-text--dark core-type--small" style={{ whiteSpace: 'nowrap' }}>
              Select Quiz:
            </label>
            <select
              id="quiz-picker-select"
              className="core-field__select core-field__select--sm"
              value={selectedQuizId || ''}
              onChange={(e) => handleQuizSelectChange(Number(e.target.value))}
            >
              {groupedQuizzes.published.length > 0 && (
                <optgroup label="Published Quizzes">
                  {groupedQuizzes.published.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title} ({q.subject_name})
                    </option>
                  ))}
                </optgroup>
              )}
              {groupedQuizzes.drafts.length > 0 && (
                <optgroup label="Draft Quizzes">
                  {groupedQuizzes.drafts.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title} ({q.subject_name})
                    </option>
                  ))}
                </optgroup>
              )}
              {groupedQuizzes.archived.length > 0 && (
                <optgroup label="Archived Quizzes">
                  {groupedQuizzes.archived.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title} ({q.subject_name})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {quiz && (
            <div className="core-display-flex core-layout--gap-2">
              <Link to={`/teacher/quizzes/${quiz.id}`} className="core-button core-button--sm core-button--outline-secondary">
                Quiz Overview
              </Link>
              <Link to={`/teacher/quizzes/${quiz.id}/settings`} className="core-button core-button--sm core-button--outline-secondary">
                Quiz Settings
              </Link>
            </div>
          )}
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

      {/* Non-blocking notice for published quiz with attempts */}
      {isPublishedWithAttempts && (
        <Alert variant="info" dismissible>
          <strong>Live Assessment:</strong> This quiz is published and already has {quiz?.total_attempts} student attempt(s). Edits apply to new attempts only.
        </Alert>
      )}

      {/* Clearly named slot for SectionsPanel (Phase 9) */}
      <div data-slot="sections-panel" className="core-display-none" id="quiz-sections-slot" />

      {quizLoading ? (
        <div className="core-display-flex core-layout--justify-center core-space--padding-y-5">
          <LoadingSpinner size="lg" message="Loading questions..." />
        </div>
      ) : quiz ? (
        <>
          {/* Summary Strip */}
          <div className="core-card core-shadow--sm core-border--none core-surface--white core-space--margin-bottom-3">
            <div className="core-card__body core-space--padding-3 core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-layout--gap-2">
              <div className="core-display-flex core-layout--wrap core-layout--align-center core-layout--gap-3">
                <span className="core-type--weight-bold core-text--dark">
                  {quiz.total_questions} Question{quiz.total_questions !== 1 ? 's' : ''}
                </span>
                <span className="core-text--muted">·</span>
                <span className="core-type--weight-semibold core-text--dark">
                  {quiz.total_marks} Total Marks
                </span>
                {typeCounts.length > 0 && (
                  <>
                    <span className="core-text--muted">·</span>
                    <span className="core-type--small core-text--muted">
                      {typeCounts.join(' · ')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4">
            <div className="core-card__body core-space--padding-3">
              <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-layout--gap-3">
                {/* Actions */}
                <div className="core-display-flex core-layout--wrap core-layout--gap-2">
                  <Link
                    to={`/teacher/questions/${quiz.id}/new`}
                    className="core-button core-button--primary core-button--sm"
                  >
                    + Add question
                  </Link>
                  <Link
                    to={`/teacher/questions/${quiz.id}/import`}
                    className="core-button core-button--outline-secondary core-button--sm"
                  >
                    Import
                  </Link>
                  {selectedQuestionIds.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      Delete selected ({selectedQuestionIds.length})
                    </Button>
                  )}
                </div>

                {/* Filters */}
                <div className="core-display-flex core-layout--wrap core-layout--gap-2 core-layout--align-center">
                  <select
                    className="core-field__select core-field__select--sm"
                    aria-label="Filter by question type"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    style={{ width: 'auto' }}
                  >
                    <option value="all">All Types</option>
                    <option value="multiple_choice">Multiple Choice</option>
                    <option value="true_false">True / False</option>
                    <option value="short_answer">Short Answer</option>
                    <option value="fill_blank">Fill in Blank</option>
                    <option value="matching">Matching</option>
                    <option value="ordering">Ordering</option>
                    <option value="essay">Essay</option>
                  </select>

                  <input
                    type="text"
                    className="core-field__input core-field__input--sm"
                    placeholder="Search questions..."
                    aria-label="Search questions"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ maxWidth: '200px' }}
                  >
                  </input>
                </div>
              </div>
            </div>
          </div>

          {/* Questions List or Empty State */}
          {quiz.questions.length === 0 ? (
            /* Empty State */
            <div className="core-grid core-grid--gap-4 core-space--margin-bottom-4">
              <div className="core-grid__span-12 core-grid__span-md-6">
                <div className="core-card core-shadow--sm core-border--none core-surface--white core-space--padding-4 core-text--center">
                  <div className="core-type--heading-4 core-type--weight-bold core-text--dark core-space--margin-bottom-2">
                    Write a question
                  </div>
                  <p className="core-text--muted core-space--margin-bottom-4">
                    Author interactive multiple choice, short answer, matching, or essay questions manually.
                  </p>
                  <Link
                    to={`/teacher/questions/${quiz.id}/new`}
                    className="core-button core-button--primary"
                  >
                    Write a question
                  </Link>
                </div>
              </div>

              <div className="core-grid__span-12 core-grid__span-md-6">
                <div className="core-card core-shadow--sm core-border--none core-surface--white core-space--padding-4 core-text--center">
                  <div className="core-type--heading-4 core-type--weight-bold core-text--dark core-space--margin-bottom-2">
                    Import from file
                  </div>
                  <p className="core-text--muted core-space--margin-bottom-4">
                    Bulk import questions using structured CSV or Excel spreadsheets with instant validation.
                  </p>
                  <Link
                    to={`/teacher/questions/${quiz.id}/import`}
                    className="core-button core-button--outline-primary"
                  >
                    Import from file
                  </Link>
                </div>
              </div>
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="core-card core-shadow--sm core-border--none core-surface--white core-space--padding-4 core-text--center">
              <p className="core-text--muted core-space--margin-bottom-0">
                No questions matched your current search or type filter.
              </p>
            </div>
          ) : (
            <div className="core-display-flex core-layout--column core-layout--gap-2 core-space--margin-bottom-4">
              {/* Select all bar */}
              <div className="core-display-flex core-layout--align-center core-layout--gap-2 core-space--padding-x-2 core-space--margin-bottom-1">
                <input
                  type="checkbox"
                  id="select-all-questions"
                  checked={
                    filteredQuestions.length > 0 &&
                    selectedQuestionIds.length === filteredQuestions.length
                  }
                  onChange={selectAll}
                  aria-label="Select all questions"
                />
                <label
                  htmlFor="select-all-questions"
                  className="core-type--small core-text--muted core-cursor--pointer core-space--margin-bottom-0"
                >
                  Select all ({filteredQuestions.length})
                </label>
              </div>

              {filteredQuestions.map((q) => {
                const isExpanded = expandedIds.includes(q.id);
                const isSelected = selectedQuestionIds.includes(q.id);
                const answerMissing = isAnswerKeyMissing(q);
                const typeDef = questionTypeRegistry[q.question_type];
                const ReviewComponent = typeDef?.Review;
                const questionIndex = quiz.questions.findIndex((item) => item.id === q.id);

                return (
                  <article
                    key={q.id}
                    className="core-card core-shadow--sm core-border--none core-surface--white"
                    onDragOver={(event) => {
                      if (draggedQuestionId !== null) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = Number(event.dataTransfer.getData('text/plain')) || draggedQuestionId;
                      if (sourceId !== null) void moveQuestion(sourceId, q.id);
                      setDraggedQuestionId(null);
                    }}
                  >
                    <div
                      className="core-card__body core-space--padding-3 core-display-flex core-layout--align-center core-layout--gap-3 quiz-question-row"
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectQuestion(q.id)}
                        aria-label={`Select question ${questionIndex + 1}`}
                      />

                      {/* Drag handle and keyboard reorder controls */}
                      <div className="core-display-flex core-layout--align-center core-layout--gap-1">
                        <button
                          type="button"
                          className="core-button core-button--sm core-button--outline-secondary core-space--padding-x-1"
                          draggable
                          aria-label={`Drag question ${questionIndex + 1} to reorder`}
                          title="Drag to reorder"
                          onDragStart={(event) => {
                            setDraggedQuestionId(q.id);
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', String(q.id));
                          }}
                          onDragEnd={() => setDraggedQuestionId(null)}
                        >
                          ⋮⋮
                        </button>
                        <button
                          type="button"
                          className="core-button core-button--sm core-button--outline-secondary core-space--padding-x-1 core-space--padding-y-0"
                          title="Move question up"
                          aria-label={`Move question ${questionIndex + 1} up`}
                          disabled={questionIndex === 0}
                          onClick={() => handleReorder(q.id, -1)}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="core-button core-button--sm core-button--outline-secondary core-space--padding-x-1 core-space--padding-y-0"
                          title="Move question down"
                          aria-label={`Move question ${questionIndex + 1} down`}
                          disabled={questionIndex === quiz.questions.length - 1}
                          onClick={() => handleReorder(q.id, 1)}
                        >
                          ▼
                        </button>
                      </div>

                      {/* Number */}
                      <span className="core-type--weight-bold core-text--muted" style={{ minWidth: '24px' }}>
                        {questionIndex + 1}.
                      </span>

                      {/* Question Text clamped to two lines */}
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        className="quiz-question-expand core-type--weight-semibold core-text--dark"
                        style={{
                          flex: 1,
                          textAlign: 'left',
                        }}
                        onClick={() => toggleExpand(q.id)}
                      >
                        <span className="quiz-question-clamp">{q.question_text}</span>
                      </button>

                      {/* Badges */}
                      <div
                        className="core-display-flex core-layout--align-center core-layout--gap-2 quiz-question-badges"
                      >
                        {answerMissing && (
                          <span className="core-badge core-surface--warning-subtle core-text--dark core-border">
                            Missing answer key
                          </span>
                        )}
                        <span className="core-badge core-surface--light core-text--secondary core-border">
                          {formatTypeLabel(q.question_type)}
                        </span>
                        <span className="core-badge core-surface--primary-subtle core-text--primary core-border">
                          {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
                        </span>
                      </div>

                      {/* Expand indicator */}
                      <button
                        type="button"
                        className="core-button core-button--sm core-button--outline-secondary core-space--padding-x-2"
                        onClick={() => toggleExpand(q.id)}
                        aria-label={isExpanded ? 'Collapse question details' : 'Expand question details'}
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>

                      {/* Row kebab menu */}
                      <div className="core-dropdown" style={{ position: 'relative' }}>
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          aria-label={`Options for question ${questionIndex + 1}`}
                          onClick={() => setActiveMenuId(activeMenuId === q.id ? null : q.id)}
                        >
                          ⋮
                        </Button>
                        {activeMenuId === q.id && (
                          <div
                            className="core-card core-shadow--md core-border core-surface--white"
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: '100%',
                              minWidth: '140px',
                              zIndex: 50,
                              padding: '0.25rem 0',
                            }}
                          >
                            <Link
                              to={`/teacher/questions/${quiz.id}/${q.id}/edit`}
                              className="core-dropdown__item core-display-block core-space--padding-x-3 core-space--padding-y-2 core-text--dark core-text--decoration-none core-type--small"
                              onClick={() => setActiveMenuId(null)}
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              className="core-dropdown__item core-display-block core-width--100 core-space--padding-x-3 core-space--padding-y-2 core-text--start core-border--none core-surface--transparent core-text--dark core-type--small core-cursor--pointer"
                              onClick={() => handleDuplicate(q.id)}
                            >
                              Duplicate
                            </button>
                            <div className="core-border--top core-space--margin-y-1" />
                            <button
                              type="button"
                              className="core-dropdown__item core-display-block core-width--100 core-space--padding-x-3 core-space--padding-y-2 core-text--start core-border--none core-surface--transparent core-text--danger core-type--small core-cursor--pointer"
                              onClick={() => {
                                setActiveMenuId(null);
                                setDeleteQuestionItem(q);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded Review component */}
                    {isExpanded && (
                      <div className="core-border--top core-surface--light core-space--padding-3">
                        {ReviewComponent ? (
                          <ReviewComponent
                            answer={q.correct_answer_text}
                            correctAnswer={q.correct_answer_text}
                            choices={q.choices?.map((c) => ({
                              id: c.id,
                              choice_text: c.choice_text,
                              is_correct: c.is_correct,
                              is_selected: false,
                            }))}
                            showCorrectAnswers={true}
                          />
                        ) : (
                          <div className="core-type--small core-text--muted">
                            Preview not available for this question type.
                          </div>
                        )}
                        {q.explanation && (
                          <div className="core-alert core-alert--light core-space--margin-top-2 core-type--small core-space--margin-bottom-0">
                            <strong>Explanation: </strong> {q.explanation}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {/* Single Delete Question Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteQuestionItem)}
        title="Delete Question"
        message="Are you sure you want to delete this question? This action cannot be undone."
        confirmLabel={deleteLoading ? 'Deleting...' : 'Delete Question'}
        confirmVariant="danger"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteQuestionItem(null)}
      />

      {/* Bulk Delete Dialog */}
      <ConfirmDialog
        isOpen={bulkDeleteOpen}
        title="Delete Selected Questions"
        message={`Are you sure you want to delete ${selectedQuestionIds.length} question(s)? This action cannot be undone.`}
        confirmLabel={bulkDeleteLoading ? 'Deleting...' : `Delete ${selectedQuestionIds.length} Questions`}
        confirmVariant="danger"
        loading={bulkDeleteLoading}
        onConfirm={handleBulkDeleteConfirm}
        onClose={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
};
