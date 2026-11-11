import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  deleteQuestion,
  deleteQuiz,
  duplicateQuestion,
  fetchTeacherQuizDetail,
  reorderQuizQuestions,
  updateQuizStatus,
} from '../../api/teacher';
import type { QuizDetailData } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { SectionBuilder } from './SectionBuilder';

export const QuizDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizDetailData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteQuizOpen, setDeleteQuizOpen] = useState(false);
  const [deleteQuizLoading, setDeleteQuizLoading] = useState(false);
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);
  const [deleteQuestionLoading, setDeleteQuestionLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTeacherQuizDetail(Number(id));
      setQuiz(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const performAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setError(null);
    try {
      await action();
      setMessage(successMessage);
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The requested action failed.');
    }
  };

  const moveQuestion = async (index: number, offset: number) => {
    if (!quiz) return;
    const target = index + offset;
    if (target < 0 || target >= quiz.questions.length) return;
    const reordered = [...quiz.questions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await reorderQuizQuestions(quiz.id, reordered.map((question) => question.id));
      setQuiz({ ...quiz, questions: reordered.map((question, order) => ({ ...question, order: order + 1 })) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reorder questions.');
    }
  };

  const handleDeleteQuiz = async () => {
    if (!quiz) return;
    setDeleteQuizLoading(true);
    try {
      await deleteQuiz(quiz.id);
      navigate('/teacher/quizzes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete quiz.');
    } finally {
      setDeleteQuizLoading(false);
      setDeleteQuizOpen(false);
    }
  };

  return (
    <div className="assessment-page core-container core-space--padding-y-4" data-testid="teacher-quiz-detail">
      <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-space--margin-bottom-4 core-layout--gap-3">
        <div>
          <div className="core-space--margin-bottom-2">
            <Link to="/teacher/quizzes" className="core-text--decoration-none core-type--small core-text--muted">
              &larr; Back to Quiz Catalog
            </Link>
          </div>
          <h2 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">{quiz?.title || 'Quiz Details'}</h2>
          <div className="core-display-flex core-layout--wrap core-layout--align-center core-layout--gap-2 core-space--margin-top-2">
            {quiz && (
              <>
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
                <span className="core-badge core-surface--primary-subtle core-text--primary core-border">
                  {quiz.subject_name || 'Subject'}
                </span>
                {quiz.academic_year && (
                  <span className="core-badge core-surface--light core-text--dark core-border">
                    {quiz.academic_year} {quiz.term && `· ${quiz.term}`}
                  </span>
                )}
                <span className="core-badge core-surface--info-subtle core-text--info core-border">
                  {quiz.duration_minutes ? `${quiz.duration_minutes} Minutes` : 'Untimed'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="core-display-flex core-layout--gap-2">
          <Button variant="secondary" size="sm" onClick={loadDetail} disabled={loading}>
            Refresh
          </Button>
          {quiz && (
            <>
              <Link to={`/teacher/results?quiz_id=${quiz.id}`} className="core-button core-button--sm core-button--outline-success">
                View Results ({quiz.total_attempts})
              </Link>
              <Link to={`/teacher/quizzes/${quiz.id}/assignments`} className="core-button core-button--sm core-button--outline-primary">
                Class Assignments
              </Link>
              <Link to={`/teacher/quizzes/${quiz.id}/edit`} className="core-button core-button--sm core-button--primary">
                Edit Quiz
              </Link>
              <Button variant="outline-danger" size="sm" onClick={() => void handleDeleteQuiz()}>Delete</Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {message && <Alert variant="success" dismissible onDismiss={() => setMessage(null)}>{message}</Alert>}

      {loading && !quiz ? (
        <div className="core-display-flex core-layout--justify-center core-space--padding-y-5">
          <LoadingSpinner size="lg" message="Loading quiz details..." />
        </div>
      ) : quiz ? (
        <>
          <SectionBuilder quiz={quiz} onUpdated={loadDetail} />
          {/* Metadata Card */}
          <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4">
            <div className="core-card__body">
              {quiz.description && (
                <p className="core-text--secondary core-space--margin-bottom-3">{quiz.description}</p>
              )}
              {quiz.instructions && <div className="core-alert core-alert--light core-border"><strong>Instructions:</strong><br />{quiz.instructions}</div>}
              <div className="core-grid core-grid--gap-3">
                <div className="core-grid__span-6 core-grid__span-md-3">
                  <div className="core-text--muted core-type--small">Total Questions</div>
                  <div className="core-type--heading-5 core-type--weight-bold core-space--margin-bottom-0">{quiz.total_questions}</div>
                </div>
                <div className="core-grid__span-6 core-grid__span-md-3">
                  <div className="core-text--muted core-type--small">Total Marks</div>
                  <div className="core-type--heading-5 core-type--weight-bold core-space--margin-bottom-0">{quiz.total_marks}</div>
                </div>
                <div className="core-grid__span-6 core-grid__span-md-3">
                  <div className="core-text--muted core-type--small">Pass Threshold</div>
                  <div className="core-type--heading-5 core-type--weight-bold core-space--margin-bottom-0">{quiz.pass_percentage}%</div>
                </div>
                <div className="core-grid__span-6 core-grid__span-md-3">
                  <div className="core-text--muted core-type--small">Max Attempts</div>
                  <div className="core-type--heading-5 core-type--weight-bold core-space--margin-bottom-0">{quiz.max_attempts}</div>
                </div>
              </div>
              <div className="core-display-flex core-layout--wrap core-layout--gap-2 core-space--margin-top-3">
                <Button
                  size="sm"
                  variant={quiz.status === 'published' ? 'warning' : 'success'}
                  onClick={() => void performAction(
                    () => updateQuizStatus(quiz.id, quiz.status === 'published' ? 'draft' : 'published'),
                    'Quiz status updated.'
                  )}
                >
                  {quiz.status === 'published' ? 'Unpublish' : 'Publish'}
                </Button>
                <Link to={`/teacher/quizzes/${quiz.id}/questions/import`} className="core-button core-button--sm core-button--outline-secondary">Import Questions</Link>
                <Link to={`/teacher/quizzes/${quiz.id}/questions/new`} className="core-button core-button--sm core-button--primary">Add Question</Link>
              </div>

              {quiz.assigned_classes && quiz.assigned_classes.length > 0 && (
                <div className="core-space--margin-top-3 core-space--padding-top-3 core-border--top">
                  <div className="core-type--small core-text--muted core-space--margin-bottom-2">Assigned Classes:</div>
                  <div className="core-display-flex core-layout--wrap core-layout--gap-2">
                    {quiz.assigned_classes.map((c) => (
                      <span key={c.id} className="core-badge core-surface--secondary-subtle core-text--secondary core-border">
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Questions Breakdown */}
          <h4 className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-bottom-3">Questions & Answer Keys ({quiz.questions.length})</h4>
          <div className="core-display-flex core-layout--column core-layout--gap-3 core-space--margin-bottom-4">
            {quiz.questions.map((q, idx) => (
              <div key={q.id} className="core-card core-shadow--sm core-border--none">
                <div className="core-card__header core-surface--white core-space--padding-y-3 core-display-flex core-layout--justify-between core-layout--align-center">
                  <span className="core-type--weight-bold">
                    Question {idx + 1}
                    <span className="core-badge core-surface--light core-text--secondary core-border core-space--margin-start-2 core-text--capitalize">
                      {q.question_type.replace('_', ' ')}
                    </span>
                  </span>
                  <div className="core-display-flex core-layout--align-center core-layout--gap-2">
                    <span className="core-badge core-surface--primary-subtle core-text--primary core-border">{q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}</span>
                    <Button size="sm" variant="outline-secondary" disabled={idx === 0} onClick={() => void moveQuestion(idx, -1)} aria-label="Move question up">↑</Button>
                    <Button size="sm" variant="outline-secondary" disabled={idx === quiz.questions.length - 1} onClick={() => void moveQuestion(idx, 1)} aria-label="Move question down">↓</Button>
                    <Link to={`/teacher/quizzes/${quiz.id}/questions/${q.id}/edit`} className="core-button core-button--sm core-button--outline-primary">Edit</Link>
                    <Button size="sm" variant="outline-secondary" onClick={() => void performAction(() => duplicateQuestion(quiz.id, q.id), 'Question duplicated.')}>Duplicate</Button>
                    <Button size="sm" variant="outline-danger" onClick={() => setDeleteQuestionId(q.id)}>Delete</Button>
                  </div>
                </div>
                <div className="core-card__body">
                  <p className="core-type--weight-semibold core-text--dark core-space--margin-bottom-3">{q.question_text}</p>
                  {q.choices && q.choices.length > 0 && (
                    <div className="core-list core-list--flush core-border core-radius">
                      {q.choices.map((ch) => (
                        <div
                          key={ch.id}
                          className={`core-list__item core-display-flex core-layout--align-center core-layout--justify-between core-space--padding-2 ${
                            ch.is_correct ? 'core-surface--success-subtle' : ''
                          }`}
                        >
                          <span className={ch.is_correct ? 'core-type--weight-bold core-text--success' : 'core-text--dark'}>
                            {ch.choice_text}
                          </span>
                          {ch.is_correct && (
                            <span className="core-badge core-surface--success">
                              <AppIcon name="check" className="core-space--margin-end-1" /> Correct Answer
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.correct_answer_text && <p className="core-type--small core-space--margin-bottom-1"><strong>Answer:</strong> {q.correct_answer_text}</p>}
                  {q.explanation && <p className="core-type--small core-text--muted core-space--margin-bottom-0"><strong>Explanation:</strong> {q.explanation}</p>}
                </div>
              </div>
            ))}
            {!quiz.questions.length && <div className="core-alert core-alert--info">No questions yet. Add a question or import a question file to get started.</div>}
          </div>
        </>
      ) : null}
      <ConfirmDialog
        isOpen={deleteQuizOpen}
        onClose={() => setDeleteQuizOpen(false)}
        onConfirm={handleDeleteQuiz}
        title="Delete Quiz"
        message={`Are you sure you want to delete "${quiz?.title}"? This cannot be undone.`}
        confirmLabel="Delete Quiz"
        confirmVariant="danger"
        loading={deleteQuizLoading}
      />

      <ConfirmDialog
        isOpen={deleteQuestionId !== null}
        onClose={() => setDeleteQuestionId(null)}
        onConfirm={async () => {
          if (!quiz || deleteQuestionId === null) return;
          setDeleteQuestionLoading(true);
          try {
            await performAction(() => deleteQuestion(quiz.id, deleteQuestionId), 'Question deleted.');
          } finally {
            setDeleteQuestionLoading(false);
            setDeleteQuestionId(null);
          }
        }}
        title="Delete Question"
        message="Are you sure you want to delete this question? Any student answers associated with it will also be deleted."
        confirmLabel="Delete Question"
        confirmVariant="danger"
        loading={deleteQuestionLoading}
      />
    </div>
  );
};
