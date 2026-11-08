import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchQuizFormOptions, fetchTeacherQuizDetail, saveQuiz } from '../../api/teacher';
import type { QuizDetailData, QuizFormOptions } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

function localDateTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export const QuizEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const quizId = id ? Number(id) : null;
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizDetailData | null>(null);
  const [options, setOptions] = useState<QuizFormOptions | null>(null);
  const [academicYearId, setAcademicYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetchQuizFormOptions(quizId || undefined),
      quizId ? fetchTeacherQuizDetail(quizId) : Promise.resolve(null),
    ]).then(([formOptions, quizData]) => {
      if (!active) return;
      setOptions(formOptions);
      setQuiz(quizData);
      setAcademicYearId(quizData?.academic_year_id ? String(quizData.academic_year_id) : '');
      setTermId(quizData?.term_id ? String(quizData.term_id) : '');
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Unable to load quiz form.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [quizId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await saveQuiz(quizId, new FormData(event.currentTarget));
      navigate(`/teacher/quizzes/${result.quiz_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save quiz.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner size="lg" message="Loading quiz editor..." />;
  if (!options) return <Alert variant="danger">{error || 'Quiz form data is unavailable.'}</Alert>;

  const selectedClassIds = new Set(quiz?.assigned_classes.map((item) => String(item.id)) ?? []);
  const availableTerms = options.terms.filter(
    (term) => !academicYearId || term.academic_year_id === Number(academicYearId)
  );

  return (
    <div className="assessment-page container-fluid py-4">
      <div className="mb-3">
        <Link to={quizId ? `/teacher/quizzes/${quizId}` : '/teacher/quizzes'} className="text-decoration-none">
          &larr; Back to {quizId ? 'Quiz' : 'Quiz Catalog'}
        </Link>
      </div>
      <h1 className="h3 mb-4">{quizId ? 'Edit Quiz' : 'Create Quiz'}</h1>
      {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}

      <form className="card shadow-sm border-0" onSubmit={handleSubmit}>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label" htmlFor="quiz-title">Title *</label>
              <input id="quiz-title" className="form-control" name="title" required maxLength={200} defaultValue={quiz?.title ?? ''} />
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="quiz-description">Description</label>
              <textarea id="quiz-description" className="form-control" name="description" rows={3} defaultValue={quiz?.description ?? ''} />
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="quiz-instructions">Student instructions</label>
              <textarea id="quiz-instructions" className="form-control" name="instructions" rows={3} defaultValue={quiz?.instructions ?? ''} />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="quiz-subject">Subject *</label>
              <select id="quiz-subject" className="form-select" name="subject" required defaultValue={quiz?.subject_id ?? ''}>
                <option value="">Select a subject</option>
                {options.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            {options.is_admin && (
              <div className="col-md-6">
                <label className="form-label" htmlFor="quiz-teacher">Teacher *</label>
                <select id="quiz-teacher" className="form-select" name="teacher" required defaultValue={quiz?.teacher_id ?? ''}>
                  <option value="">Select a teacher</option>
                  {options.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
            )}
            <div className="col-md-6">
              <label className="form-label" htmlFor="quiz-category">Category</label>
              <select id="quiz-category" className="form-select" name="category" defaultValue={quiz?.category_id ?? ''}>
                <option value="">No category</option>
                {options.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="quiz-year">Academic year</label>
              <select id="quiz-year" className="form-select" name="academic_year" value={academicYearId} onChange={(event) => {
                setAcademicYearId(event.target.value);
                setTermId('');
              }}>
                <option value="">No academic year</option>
                {options.academic_years.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="quiz-term">Term</label>
              <select id="quiz-term" className="form-select" name="term" value={termId} onChange={(event) => setTermId(event.target.value)}>
                <option value="">No term</option>
                {availableTerms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <div className="form-text">Choose an academic year before selecting a term.</div>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="quiz-classes">Assigned classes</label>
              <select id="quiz-classes" className="form-select" name="classes" multiple size={5} defaultValue={[...selectedClassIds]}>
                {options.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="quiz-status">Status</label>
              <select id="quiz-status" className="form-select" name="status" defaultValue={quiz?.status ?? 'draft'}>
                <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="quiz-difficulty">Difficulty</label>
              <select id="quiz-difficulty" className="form-select" name="difficulty" defaultValue={quiz?.difficulty ?? 'medium'}>
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="quiz-duration">Time limit (minutes)</label>
              <input id="quiz-duration" className="form-control" type="number" min="0" name="time_limit" defaultValue={quiz?.duration_minutes ?? 0} />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="quiz-passing">Passing marks</label>
              <input id="quiz-passing" className="form-control" type="number" min="0" name="passing_marks" defaultValue={quiz?.passing_marks ?? 0} />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="quiz-attempts">Maximum attempts</label>
              <input id="quiz-attempts" className="form-control" type="number" min="1" name="max_attempts" defaultValue={quiz?.max_attempts ?? 1} />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="quiz-from">Available from</label>
              <input id="quiz-from" className="form-control" type="datetime-local" name="available_from" defaultValue={localDateTime(quiz?.available_from)} />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="quiz-until">Available until</label>
              <input id="quiz-until" className="form-control" type="datetime-local" name="available_until" defaultValue={localDateTime(quiz?.available_until)} />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="quiz-password">Quiz password</label>
              <input id="quiz-password" className="form-control" type="password" name="quiz_password" autoComplete="new-password" defaultValue={quiz?.quiz_password ?? ''} />
              <label className="form-check mt-2">
                <input className="form-check-input" type="checkbox" name="require_password" defaultChecked={quiz?.require_password ?? false} />
                <span className="form-check-label">Require password</span>
              </label>
            </div>
            <div className="col-md-6 d-flex flex-column gap-2">
              {([
                ['randomize_questions', 'Randomize question order', quiz?.randomize_questions],
                ['randomize_answers', 'Randomize answer choices', quiz?.randomize_answers],
                ['show_results_immediately', 'Show results immediately', quiz?.show_results_immediately],
                ['show_correct_answers', 'Show correct answers', quiz?.show_correct_answers],
                ['allow_review', 'Allow review after submission', quiz?.allow_review],
              ] as const).map(([name, label, checked]) => (
                <label className="form-check" key={name}>
                  <input className="form-check-input" type="checkbox" name={name} defaultChecked={checked ?? false} />
                  <span className="form-check-label">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="card-footer bg-white d-flex flex-wrap justify-content-end gap-2">
          <Link to={quizId ? `/teacher/quizzes/${quizId}` : '/teacher/quizzes'} className="btn btn-outline-secondary">Cancel</Link>
          <Button type="submit" loading={saving}>{quizId ? 'Save Changes' : 'Create Quiz'}</Button>
        </div>
      </form>
    </div>
  );
};
