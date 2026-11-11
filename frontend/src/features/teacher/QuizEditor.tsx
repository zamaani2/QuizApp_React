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
  const [step, setStep] = useState(0);

  const steps = ['Basics', 'Academic & classes', 'Schedule & scoring', 'Results & behavior'];

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

  function getRequiredFieldError(form: HTMLFormElement): string | null {
    const formData = new FormData(form);
    if (!String(formData.get('title') || '').trim()) return 'Enter a quiz title before continuing.';
    if (!String(formData.get('subject') || '').trim()) return 'Select a subject before continuing.';
    if (options?.is_admin && !String(formData.get('teacher') || '').trim()) {
      return 'Select a teacher before continuing.';
    }
    return null;
  }

  function handleNext(form: HTMLFormElement) {
    if (step === 0) {
      const validationError = getRequiredFieldError(form);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setError(null);
    setStep((current) => Math.min(steps.length - 1, current + 1));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (step < steps.length - 1) {
      handleNext(form);
      return;
    }
    const validationError = getRequiredFieldError(form);
    if (validationError) {
      setError(validationError);
      setStep(0);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveQuiz(quizId, new FormData(form));
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
    <div className="assessment-page core-container core-space--padding-y-4">
      <div className="core-space--margin-bottom-3">
        <Link to={quizId ? `/teacher/quizzes/${quizId}` : '/teacher/quizzes'} className="core-text--decoration-none">
          &larr; Back to {quizId ? 'Quiz' : 'Quiz Catalog'}
        </Link>
      </div>
      <h1 className="core-type--heading-3 core-space--margin-bottom-4">{quizId ? 'Edit Quiz' : 'Create Quiz'}</h1>
      {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}

      <form className="core-card core-shadow--sm core-border--none" onSubmit={handleSubmit} noValidate>
        <div className="core-card__body">
          <nav aria-label="Quiz setup steps" className="core-display-flex core-layout--wrap core-layout--gap-2 core-space--margin-bottom-4">
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                className={`core-button core-button--sm ${step === index ? 'core-button--primary' : 'core-button--outline-secondary'}`}
                aria-current={step === index ? 'step' : undefined}
                disabled={index > step || saving}
                onClick={() => { setError(null); setStep(index); }}
              >
                {index + 1}. {label}
              </button>
            ))}
          </nav>
          <div className="core-type--small core-text--muted core-space--margin-bottom-3">
            Step {step + 1} of {steps.length}
          </div>
          <div className="core-grid core-grid--gap-3">
            <section hidden={step !== 0} className="core-grid__span-12 core-grid core-grid--gap-3" aria-label="Quiz basics">
            <div className="core-grid__span-12">
              <label className="core-field__label" htmlFor="quiz-title">Title *</label>
              <input id="quiz-title" className="core-field__input" name="title" maxLength={200} defaultValue={quiz?.title ?? ''} />
            </div>
            <div className="core-grid__span-12">
              <label className="core-field__label" htmlFor="quiz-description">Description</label>
              <textarea id="quiz-description" className="core-field__input" name="description" rows={3} defaultValue={quiz?.description ?? ''} />
            </div>
            <div className="core-grid__span-12">
              <label className="core-field__label" htmlFor="quiz-instructions">Student instructions</label>
              <textarea id="quiz-instructions" className="core-field__input" name="instructions" rows={3} defaultValue={quiz?.instructions ?? ''} />
            </div>
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="quiz-subject">Subject *</label>
              <select id="quiz-subject" className="core-field__select" name="subject" required defaultValue={quiz?.subject_id ?? ''}>
                <option value="">Select a subject</option>
                {options.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            {options.is_admin && (
              <div className="core-grid__span-md-6">
                <label className="core-field__label" htmlFor="quiz-teacher">Teacher *</label>
                <select id="quiz-teacher" className="core-field__select" name="teacher" required defaultValue={quiz?.teacher_id ?? ''}>
                  <option value="">Select a teacher</option>
                  {options.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
            )}
            </section>
            <section hidden={step !== 1} className="core-grid__span-12 core-grid core-grid--gap-3" aria-label="Academic year and classes">
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="quiz-category">Category</label>
              <select id="quiz-category" className="core-field__select" name="category" defaultValue={quiz?.category_id ?? ''}>
                <option value="">No category</option>
                {options.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="quiz-year">Academic year</label>
              <select id="quiz-year" className="core-field__select" name="academic_year" value={academicYearId} onChange={(event) => {
                setAcademicYearId(event.target.value);
                setTermId('');
              }}>
                <option value="">No academic year</option>
                {options.academic_years.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="quiz-term">Term</label>
              <select id="quiz-term" className="core-field__select" name="term" value={termId} onChange={(event) => setTermId(event.target.value)}>
                <option value="">No term</option>
                {availableTerms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <div className="core-field__helper">Choose an academic year before selecting a term.</div>
            </div>
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="quiz-classes">Assigned classes</label>
              <select id="quiz-classes" className="core-field__select" name="classes" multiple size={5} defaultValue={[...selectedClassIds]}>
                {options.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            </section>
            <section hidden={step !== 2} className="core-grid__span-12 core-grid core-grid--gap-3" aria-label="Schedule and scoring">
            <div className="core-grid__span-md-4">
              <label className="core-field__label" htmlFor="quiz-status">Status</label>
              <select id="quiz-status" className="core-field__select" name="status" defaultValue={quiz?.status ?? 'draft'}>
                <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
              </select>
            </div>
            <div className="core-grid__span-md-4">
              <label className="core-field__label" htmlFor="quiz-difficulty">Difficulty</label>
              <select id="quiz-difficulty" className="core-field__select" name="difficulty" defaultValue={quiz?.difficulty ?? 'medium'}>
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </div>
            <div className="core-grid__span-md-4">
              <label className="core-field__label" htmlFor="quiz-duration">Time limit (minutes)</label>
              <input id="quiz-duration" className="core-field__input" type="number" min="0" name="time_limit" defaultValue={quiz?.duration_minutes ?? 0} />
            </div>
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="quiz-passing">Passing marks</label>
              <input id="quiz-passing" className="core-field__input" type="number" min="0" name="passing_marks" defaultValue={quiz?.passing_marks ?? 0} />
            </div>
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="quiz-attempts">Maximum attempts</label>
              <input id="quiz-attempts" className="core-field__input" type="number" min="1" name="max_attempts" defaultValue={quiz?.max_attempts ?? 1} />
            </div>
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="quiz-from">Available from</label>
              <input id="quiz-from" className="core-field__input" type="datetime-local" name="available_from" defaultValue={localDateTime(quiz?.available_from)} />
            </div>
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="quiz-until">Available until</label>
              <input id="quiz-until" className="core-field__input" type="datetime-local" name="available_until" defaultValue={localDateTime(quiz?.available_until)} />
            </div>
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="quiz-password">Quiz password</label>
              <input id="quiz-password" className="core-field__input" type="password" name="quiz_password" autoComplete="new-password" defaultValue={quiz?.quiz_password ?? ''} />
              <label className="core-field__check core-space--margin-top-2">
                <input className="core-field__check-input" type="checkbox" name="require_password" defaultChecked={quiz?.require_password ?? false} />
                <span className="core-field__check-label">Require password</span>
              </label>
            </div>
            </section>
            <section hidden={step !== 3} className="core-grid__span-12 core-grid core-grid--gap-3" aria-label="Results and behavior">
            <div className="core-grid__span-md-6 core-display-flex core-layout--column core-layout--gap-2">
              {([
                ['randomize_questions', 'Randomize question order', quiz?.randomize_questions],
                ['randomize_answers', 'Randomize answer choices', quiz?.randomize_answers],
                ['show_results_immediately', 'Show results immediately', quiz?.show_results_immediately],
                ['show_correct_answers', 'Show correct answers', quiz?.show_correct_answers],
                ['allow_review', 'Allow review after submission', quiz?.allow_review],
              ] as const).map(([name, label, checked]) => (
                <label className="core-field__check" key={name}>
                  <input className="core-field__check-input" type="checkbox" name={name} defaultChecked={checked ?? false} />
                  <span className="core-field__check-label">{label}</span>
                </label>
              ))}
            </div>
            </section>
          </div>
        </div>
        <div className="core-card__footer core-surface--white core-display-flex core-layout--wrap core-layout--justify-between core-layout--gap-2">
          <Link to={quizId ? `/teacher/quizzes/${quizId}` : '/teacher/quizzes'} className="core-button core-button--outline-secondary">Cancel</Link>
          <div className="core-display-flex core-layout--gap-2">
            <Button type="button" variant="outline-secondary" disabled={step === 0 || saving}
              onClick={() => { setError(null); setStep((current) => Math.max(0, current - 1)); }}>
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button type="button" onClick={(event) => {
                const form = event.currentTarget.form;
                if (form) handleNext(form);
              }}>
                Continue
              </Button>
            ) : (
              <Button type="submit" loading={saving}>{quizId ? 'Save Changes' : 'Create Quiz'}</Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
