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
    <div className="assessment-page container-fluid py-4" data-testid="teacher-quiz-detail">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <div className="mb-2">
            <Link to="/teacher/quizzes" className="text-decoration-none small text-muted">
              &larr; Back to Quiz Catalog
            </Link>
          </div>
          <h2 className="h3 fw-bold text-dark mb-1">{quiz?.title || 'Quiz Details'}</h2>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
            {quiz && (
              <>
                <span
                  className={`badge ${
                    quiz.status === 'published'
                      ? 'bg-success'
                      : quiz.status === 'draft'
                      ? 'bg-warning text-dark'
                      : 'bg-secondary'
                  }`}
                >
                  {quiz.status.toUpperCase()}
                </span>
                <span className="badge bg-primary-subtle text-primary border">
                  {quiz.subject_name || 'Subject'}
                </span>
                {quiz.academic_year && (
                  <span className="badge bg-light text-dark border">
                    {quiz.academic_year} {quiz.term && `· ${quiz.term}`}
                  </span>
                )}
                <span className="badge bg-info-subtle text-info border">
                  {quiz.duration_minutes ? `${quiz.duration_minutes} Minutes` : 'Untimed'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="d-flex gap-2">
          <Button variant="secondary" size="sm" onClick={loadDetail} disabled={loading}>
            Refresh
          </Button>
          {quiz && (
            <>
              <Link to={`/teacher/results?quiz_id=${quiz.id}`} className="btn btn-sm btn-outline-success">
                View Results ({quiz.total_attempts})
              </Link>
              <Link to={`/teacher/quizzes/${quiz.id}/assignments`} className="btn btn-sm btn-outline-primary">
                Class Assignments
              </Link>
              <Link to={`/teacher/quizzes/${quiz.id}/edit`} className="btn btn-sm btn-primary">
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
        <div className="d-flex justify-content-center py-5">
          <LoadingSpinner size="lg" message="Loading quiz details..." />
        </div>
      ) : quiz ? (
        <>
          {/* Metadata Card */}
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-body">
              {quiz.description && (
                <p className="text-secondary mb-3">{quiz.description}</p>
              )}
              {quiz.instructions && <div className="alert alert-light border"><strong>Instructions:</strong><br />{quiz.instructions}</div>}
              <div className="row g-3">
                <div className="col-6 col-md-3">
                  <div className="text-muted small">Total Questions</div>
                  <div className="h5 fw-bold mb-0">{quiz.total_questions}</div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="text-muted small">Total Marks</div>
                  <div className="h5 fw-bold mb-0">{quiz.total_marks}</div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="text-muted small">Pass Threshold</div>
                  <div className="h5 fw-bold mb-0">{quiz.pass_percentage}%</div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="text-muted small">Max Attempts</div>
                  <div className="h5 fw-bold mb-0">{quiz.max_attempts}</div>
                </div>
              </div>
              <div className="d-flex flex-wrap gap-2 mt-3">
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
                <Link to={`/teacher/quizzes/${quiz.id}/questions/import`} className="btn btn-sm btn-outline-secondary">Import Questions</Link>
                <Link to={`/teacher/quizzes/${quiz.id}/questions/new`} className="btn btn-sm btn-primary">Add Question</Link>
              </div>

              {quiz.assigned_classes && quiz.assigned_classes.length > 0 && (
                <div className="mt-3 pt-3 border-top">
                  <div className="small text-muted mb-2">Assigned Classes:</div>
                  <div className="d-flex flex-wrap gap-2">
                    {quiz.assigned_classes.map((c) => (
                      <span key={c.id} className="badge bg-secondary-subtle text-secondary border">
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Questions Breakdown */}
          <h4 className="h5 fw-bold text-dark mb-3">Questions & Answer Keys ({quiz.questions.length})</h4>
          <div className="d-flex flex-column gap-3 mb-4">
            {quiz.questions.map((q, idx) => (
              <div key={q.id} className="card shadow-sm border-0">
                <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
                  <span className="fw-bold">
                    Question {idx + 1}
                    <span className="badge bg-light text-secondary border ms-2 text-capitalize">
                      {q.question_type.replace('_', ' ')}
                    </span>
                  </span>
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-primary-subtle text-primary border">{q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}</span>
                    <Button size="sm" variant="outline-secondary" disabled={idx === 0} onClick={() => void moveQuestion(idx, -1)} aria-label="Move question up">↑</Button>
                    <Button size="sm" variant="outline-secondary" disabled={idx === quiz.questions.length - 1} onClick={() => void moveQuestion(idx, 1)} aria-label="Move question down">↓</Button>
                    <Link to={`/teacher/quizzes/${quiz.id}/questions/${q.id}/edit`} className="btn btn-sm btn-outline-primary">Edit</Link>
                    <Button size="sm" variant="outline-secondary" onClick={() => void performAction(() => duplicateQuestion(quiz.id, q.id), 'Question duplicated.')}>Duplicate</Button>
                    <Button size="sm" variant="outline-danger" onClick={() => setDeleteQuestionId(q.id)}>Delete</Button>
                  </div>
                </div>
                <div className="card-body">
                  <p className="fw-semibold text-dark mb-3">{q.question_text}</p>
                  {q.choices && q.choices.length > 0 && (
                    <div className="list-group list-group-flush border rounded">
                      {q.choices.map((ch) => (
                        <div
                          key={ch.id}
                          className={`list-group-item d-flex align-items-center justify-content-between p-2 ${
                            ch.is_correct ? 'bg-success-subtle' : ''
                          }`}
                        >
                          <span className={ch.is_correct ? 'fw-bold text-success' : 'text-dark'}>
                            {ch.choice_text}
                          </span>
                          {ch.is_correct && (
                            <span className="badge bg-success">
                              <i className="bi bi-check-lg me-1"></i> Correct Answer
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.correct_answer_text && <p className="small mb-1"><strong>Answer:</strong> {q.correct_answer_text}</p>}
                  {q.explanation && <p className="small text-muted mb-0"><strong>Explanation:</strong> {q.explanation}</p>}
                </div>
              </div>
            ))}
            {!quiz.questions.length && <div className="alert alert-info">No questions yet. Add a question or import a question file to get started.</div>}
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
