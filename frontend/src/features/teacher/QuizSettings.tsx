import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  fetchQuizFormOptions,
  fetchTeacherQuizDetail,
  saveQuiz,
} from '../../api/teacher';
import type { QuizDetailData, QuizFormOptions } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Modal } from '../../components/common/Modal';

type ResultsOption = 'answers_and_score' | 'score_only' | 'hidden';

function toLocalDateTimeString(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export const QuizSettings: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const quizId = id ? Number(id) : null;
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [options, setOptions] = useState<QuizFormOptions | null>(null);
  const [initialQuiz, setInitialQuiz] = useState<QuizDetailData | null>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  const [timeLimit, setTimeLimit] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [passPercentage, setPassPercentage] = useState(50);

  const [availabilityMode, setAvailabilityMode] = useState<'open' | 'schedule'>('open');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');

  const [resultsOption, setResultsOption] = useState<ResultsOption>('answers_and_score');

  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [randomizeAnswers, setRandomizeAnswers] = useState(false);

  const [requirePassword, setRequirePassword] = useState(false);
  const [quizPassword, setQuizPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);

  const [academicYearId, setAcademicYearId] = useState<number | null>(null);
  const [termId, setTermId] = useState<number | null>(null);
  const [academicYearName, setAcademicYearName] = useState('');
  const [termName, setTermName] = useState('');

  // Dialog state
  const [academicModalOpen, setAcademicModalOpen] = useState(false);
  const [modalYearId, setModalYearId] = useState('');
  const [modalTermId, setModalTermId] = useState('');

  // Collapsible section states
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    details: true,
    timing: true,
    availability: true,
    results: true,
    order: true,
    security: true,
    academic: true,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const populateForm = useCallback((quiz: QuizDetailData) => {
    setTitle(quiz.title || '');
    setSubjectId(quiz.subject_id ? String(quiz.subject_id) : '');
    setInstructions(quiz.instructions || '');
    setDescription(quiz.description || '');
    setCategoryId(quiz.category_id ? String(quiz.category_id) : '');
    setDifficulty(quiz.difficulty || 'medium');

    setTimeLimit(quiz.duration_minutes || 0);
    setMaxAttempts(quiz.max_attempts || 1);
    setPassPercentage(quiz.pass_percentage ?? 50);

    const hasSchedule = Boolean(quiz.available_from || quiz.available_until);
    setAvailabilityMode(hasSchedule ? 'schedule' : 'open');
    setAvailableFrom(toLocalDateTimeString(quiz.available_from));
    setAvailableUntil(toLocalDateTimeString(quiz.available_until));

    if (quiz.show_results_immediately && quiz.show_correct_answers) {
      setResultsOption('answers_and_score');
    } else if (quiz.show_results_immediately && !quiz.show_correct_answers) {
      setResultsOption('score_only');
    } else {
      setResultsOption('hidden');
    }

    setRandomizeQuestions(Boolean(quiz.randomize_questions));
    setRandomizeAnswers(Boolean(quiz.randomize_answers));

    setRequirePassword(Boolean(quiz.require_password));
    setQuizPassword(quiz.quiz_password || '');

    setAcademicYearId(quiz.academic_year_id ?? null);
    setTermId(quiz.term_id ?? null);
    setAcademicYearName(quiz.academic_year || 'Not specified');
    setTermName(quiz.term || 'Not specified');
  }, []);

  const loadData = useCallback(async () => {
    if (!quizId) return;
    setLoading(true);
    setError(null);
    try {
      const [formOptions, quizData] = await Promise.all([
        fetchQuizFormOptions(quizId),
        fetchTeacherQuizDetail(quizId),
      ]);
      setOptions(formOptions);
      setInitialQuiz(quizData);
      populateForm(quizData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load quiz settings.');
    } finally {
      setLoading(false);
    }
  }, [quizId, populateForm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Dirty detection
  const isDirty = useMemo(() => {
    if (!initialQuiz) return false;
    if (title !== (initialQuiz.title || '')) return true;
    if (subjectId !== (initialQuiz.subject_id ? String(initialQuiz.subject_id) : '')) return true;
    if (instructions !== (initialQuiz.instructions || '')) return true;
    if (description !== (initialQuiz.description || '')) return true;
    if (categoryId !== (initialQuiz.category_id ? String(initialQuiz.category_id) : '')) return true;
    if (difficulty !== (initialQuiz.difficulty || 'medium')) return true;

    if (timeLimit !== (initialQuiz.duration_minutes || 0)) return true;
    if (maxAttempts !== (initialQuiz.max_attempts || 1)) return true;
    if (passPercentage !== (initialQuiz.pass_percentage ?? 50)) return true;

    const initialHasSchedule = Boolean(initialQuiz.available_from || initialQuiz.available_until);
    const initialMode = initialHasSchedule ? 'schedule' : 'open';
    if (availabilityMode !== initialMode) return true;
    if (availabilityMode === 'schedule') {
      if (availableFrom !== toLocalDateTimeString(initialQuiz.available_from)) return true;
      if (availableUntil !== toLocalDateTimeString(initialQuiz.available_until)) return true;
    }

    let initialResults: ResultsOption = 'hidden';
    if (initialQuiz.show_results_immediately && initialQuiz.show_correct_answers) {
      initialResults = 'answers_and_score';
    } else if (initialQuiz.show_results_immediately && !initialQuiz.show_correct_answers) {
      initialResults = 'score_only';
    }
    if (resultsOption !== initialResults) return true;

    if (randomizeQuestions !== Boolean(initialQuiz.randomize_questions)) return true;
    if (randomizeAnswers !== Boolean(initialQuiz.randomize_answers)) return true;

    if (requirePassword !== Boolean(initialQuiz.require_password)) return true;
    if (requirePassword && quizPassword !== (initialQuiz.quiz_password || '')) return true;

    if (academicYearId !== (initialQuiz.academic_year_id ?? null)) return true;
    if (termId !== (initialQuiz.term_id ?? null)) return true;

    return false;
  }, [
    initialQuiz,
    title,
    subjectId,
    instructions,
    description,
    categoryId,
    difficulty,
    timeLimit,
    maxAttempts,
    passPercentage,
    availabilityMode,
    availableFrom,
    availableUntil,
    resultsOption,
    randomizeQuestions,
    randomizeAnswers,
    requirePassword,
    quizPassword,
    academicYearId,
    termId,
  ]);

  // Leaving guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const handleInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const nextPath = `${destination.pathname}${destination.search}${destination.hash}`;
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      if (nextPath === currentPath) return;
      event.preventDefault();
      event.stopPropagation();
      if (window.confirm('You have unsaved changes. Leave without saving?')) {
        navigate(nextPath);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    if (isDirty) {
      document.addEventListener('click', handleInternalNavigation, true);
    }
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleInternalNavigation, true);
    };
  }, [isDirty, location.hash, location.pathname, location.search, navigate]);

  const handleDiscard = () => {
    if (initialQuiz) {
      populateForm(initialQuiz);
      setError(null);
      setSuccessMessage(null);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quizId) return;

    if (!title.trim()) {
      setError('Quiz title is required.');
      return;
    }
    if (!subjectId) {
      setError('Subject is required.');
      return;
    }

    if (availabilityMode === 'schedule') {
      if (!availableFrom || !availableUntil) {
        setError('Choose both an availability start and end date.');
        return;
      }
      const fromDate = new Date(availableFrom);
      const untilDate = new Date(availableUntil);
      if (untilDate <= fromDate) {
        setError('Available until date must be after available from date.');
        return;
      }
    }

    if (requirePassword && !quizPassword.trim()) {
      setError('Password is required when password protection is enabled.');
      return;
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      subject_id: Number(subjectId),
      instructions: instructions.trim() || '',
      description: description.trim() || '',
      category_id: categoryId ? Number(categoryId) : null,
      difficulty,
      time_limit: Number(timeLimit) || 0,
      max_attempts: Number(maxAttempts) || 1,
      pass_percentage: Number(passPercentage),
      available_from: availabilityMode === 'schedule' && availableFrom ? new Date(availableFrom).toISOString() : null,
      available_until: availabilityMode === 'schedule' && availableUntil ? new Date(availableUntil).toISOString() : null,
      show_results_immediately: resultsOption === 'answers_and_score' || resultsOption === 'score_only',
      show_correct_answers: resultsOption === 'answers_and_score',
      allow_review: resultsOption !== 'score_only',
      randomize_questions: randomizeQuestions,
      randomize_answers: randomizeAnswers,
      require_password: requirePassword,
      quiz_password: requirePassword ? quizPassword.trim() : null,
      academic_year_id: academicYearId,
      term_id: termId,
    };

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await saveQuiz(quizId, payload);
      setSuccessMessage('Quiz settings saved successfully.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const openAcademicModal = () => {
    setModalYearId(academicYearId ? String(academicYearId) : '');
    setModalTermId(termId ? String(termId) : '');
    setAcademicModalOpen(true);
  };

  const handleAcademicConfirm = () => {
    const yearObj = options?.academic_years.find((y) => String(y.id) === modalYearId);
    const termObj = options?.terms.find((t) => String(t.id) === modalTermId);

    setAcademicYearId(modalYearId ? Number(modalYearId) : null);
    setTermId(modalTermId ? Number(modalTermId) : null);
    setAcademicYearName(yearObj ? yearObj.name : 'Not specified');
    setTermName(termObj ? termObj.name : 'Not specified');
    setAcademicModalOpen(false);
  };

  if (loading) {
    return (
      <div className="core-container core-space--padding-y-5 core-display-flex core-layout--justify-center">
        <LoadingSpinner size="lg" message="Loading settings..." />
      </div>
    );
  }

  if (!initialQuiz) {
    return (
      <div className="core-container core-space--padding-y-4">
        <Alert variant="danger">{error || 'Quiz not found.'}</Alert>
      </div>
    );
  }

  const subjectName =
    options?.subjects.find((s) => String(s.id) === subjectId)?.name || initialQuiz.subject_name || 'Subject';
  const totalMarks = initialQuiz.total_marks ?? 0;
  const calculatedPassingMarks = Math.round((passPercentage / 100) * totalMarks);

  return (
    <div className="assessment-page core-container core-space--padding-y-4 core-space--padding-bottom-6" data-testid="teacher-quiz-settings">
      <div className="core-space--margin-bottom-3">
        <Link to={`/teacher/quizzes/${quizId}`} className="core-text--decoration-none core-type--small core-text--muted">
          &larr; Back to Quiz Overview
        </Link>
      </div>

      <div className="core-space--margin-bottom-4">
        <h1 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">
          Quiz Settings
        </h1>
        <p className="core-text--muted core-space--margin-bottom-0">
          Configure details, timing, scoring thresholds, and review availability for &ldquo;{initialQuiz.title}&rdquo;.
        </p>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert variant="success" dismissible onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      <form onSubmit={handleSave} noValidate>
        {/* Section 1: Details */}
        <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-3">
          <div
            className="core-card__header core-surface--white core-cursor--pointer core-display-flex core-layout--justify-between core-layout--align-center"
            onClick={() => toggleSection('details')}
          >
            <div>
              <h2 className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-bottom-0">
                1. Details
              </h2>
              {!openSections.details && (
                <div className="core-type--small core-text--muted core-space--margin-top-1">
                  {title || 'Untitled'} · {subjectName}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('details');
              }}
              aria-label={openSections.details ? 'Collapse Details' : 'Expand Details'}
            >
              {openSections.details ? 'Collapse' : 'Expand'}
            </Button>
          </div>
          {openSections.details && (
            <div className="core-card__body">
              <div className="core-grid core-grid--gap-3">
                <div className="core-grid__span-12 core-grid__span-md-8">
                  <label className="core-field__label" htmlFor="settings-title">
                    Title *
                  </label>
                  <input
                    id="settings-title"
                    className="core-field__input"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    required
                  />
                </div>

                <div className="core-grid__span-12 core-grid__span-md-4">
                  <label className="core-field__label" htmlFor="settings-subject">
                    Subject *
                  </label>
                  <select
                    id="settings-subject"
                    className="core-field__select"
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    required
                  >
                    {options?.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="core-grid__span-12">
                  <label className="core-field__label" htmlFor="settings-instructions">
                    Student Instructions
                  </label>
                  <textarea
                    id="settings-instructions"
                    className="core-field__input"
                    rows={3}
                    placeholder="Instructions displayed to students before starting the quiz..."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </div>

                {/* More disclosure */}
                <div className="core-grid__span-12">
                  <details className="core-space--margin-top-1">
                    <summary className="core-cursor--pointer core-type--weight-semibold core-text--primary">
                      More options (description, category, difficulty)
                    </summary>
                    <div className="core-grid core-grid--gap-3 core-space--margin-top-3 core-space--padding-3 core-surface--light core-radius">
                      <div className="core-grid__span-12">
                        <label className="core-field__label" htmlFor="settings-description">
                          Description
                        </label>
                        <textarea
                          id="settings-description"
                          className="core-field__input"
                          rows={2}
                          placeholder="Brief description for teacher records..."
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>
                      <div className="core-grid__span-12 core-grid__span-md-6">
                        <label className="core-field__label" htmlFor="settings-category">
                          Category
                        </label>
                        <select
                          id="settings-category"
                          className="core-field__select"
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value)}
                        >
                          <option value="">None</option>
                          {options?.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="core-grid__span-12 core-grid__span-md-6">
                        <label className="core-field__label" htmlFor="settings-difficulty">
                          Difficulty
                        </label>
                        <select
                          id="settings-difficulty"
                          className="core-field__select"
                          value={difficulty}
                          onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Timing and attempts */}
        <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-3">
          <div
            className="core-card__header core-surface--white core-cursor--pointer core-display-flex core-layout--justify-between core-layout--align-center"
            onClick={() => toggleSection('timing')}
          >
            <div>
              <h2 className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-bottom-0">
                2. Timing and Attempts
              </h2>
              {!openSections.timing && (
                <div className="core-type--small core-text--muted core-space--margin-top-1">
                  {timeLimit > 0 ? `${timeLimit} mins` : 'Untimed'} · {maxAttempts} max attempt{maxAttempts > 1 ? 's' : ''} · {passPercentage}% pass mark
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('timing');
              }}
              aria-label={openSections.timing ? 'Collapse Timing' : 'Expand Timing'}
            >
              {openSections.timing ? 'Collapse' : 'Expand'}
            </Button>
          </div>
          {openSections.timing && (
            <div className="core-card__body">
              <div className="core-grid core-grid--gap-3">
                <div className="core-grid__span-12 core-grid__span-md-4">
                  <label className="core-field__label" htmlFor="settings-timelimit">
                    Time Limit (Minutes)
                  </label>
                  <input
                    id="settings-timelimit"
                    className="core-field__input"
                    type="number"
                    min={0}
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                  <div className="core-type--small core-text--muted core-space--margin-top-1">
                    Set to 0 for untimed quiz.
                  </div>
                </div>

                <div className="core-grid__span-12 core-grid__span-md-4">
                  <label className="core-field__label" htmlFor="settings-attempts">
                    Maximum Attempts
                  </label>
                  <input
                    id="settings-attempts"
                    className="core-field__input"
                    type="number"
                    min={1}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                  <div className="core-type--small core-text--muted core-space--margin-top-1">
                    Number of attempts allowed per student.
                  </div>
                </div>

                <div className="core-grid__span-12 core-grid__span-md-4">
                  <label className="core-field__label" htmlFor="settings-passmark">
                    Pass Mark Percentage (%)
                  </label>
                  <input
                    id="settings-passmark"
                    className="core-field__input"
                    type="number"
                    min={0}
                    max={100}
                    value={passPercentage}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                      setPassPercentage(val);
                    }}
                  />
                  <div className="core-type--small core-text--primary core-type--weight-semibold core-space--margin-top-1">
                    {passPercentage}% ({calculatedPassingMarks} of {totalMarks} marks)
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Availability */}
        <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-3">
          <div
            className="core-card__header core-surface--white core-cursor--pointer core-display-flex core-layout--justify-between core-layout--align-center"
            onClick={() => toggleSection('availability')}
          >
            <div>
              <h2 className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-bottom-0">
                3. Availability
              </h2>
              {!openSections.availability && (
                <div className="core-type--small core-text--muted core-space--margin-top-1">
                  {availabilityMode === 'open'
                    ? 'Open now (immediately available when published)'
                    : `Scheduled from ${availableFrom || 'start'} until ${availableUntil || 'end'}`}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('availability');
              }}
              aria-label={openSections.availability ? 'Collapse Availability' : 'Expand Availability'}
            >
              {openSections.availability ? 'Collapse' : 'Expand'}
            </Button>
          </div>
          {openSections.availability && (
            <div className="core-card__body">
              <div className="core-space--margin-bottom-3">
                <label className="core-field__check core-space--margin-end-4">
                  <input
                    type="radio"
                    name="availability_mode"
                    className="core-field__check-input"
                    checked={availabilityMode === 'open'}
                    onChange={() => setAvailabilityMode('open')}
                  />
                  <span className="core-field__check-label core-type--weight-semibold">Open now</span>
                </label>
                <label className="core-field__check">
                  <input
                    type="radio"
                    name="availability_mode"
                    className="core-field__check-input"
                    checked={availabilityMode === 'schedule'}
                    onChange={() => setAvailabilityMode('schedule')}
                  />
                  <span className="core-field__check-label core-type--weight-semibold">Schedule availability window</span>
                </label>
              </div>

              {availabilityMode === 'schedule' && (
                <div className="core-grid core-grid--gap-3 core-surface--light core-space--padding-3 core-radius">
                  <div className="core-grid__span-12 core-grid__span-md-6">
                    <label className="core-field__label" htmlFor="settings-from">
                      Available From
                    </label>
                    <input
                      id="settings-from"
                      type="datetime-local"
                      className="core-field__input"
                      value={availableFrom}
                      onChange={(e) => setAvailableFrom(e.target.value)}
                    />
                  </div>
                  <div className="core-grid__span-12 core-grid__span-md-6">
                    <label className="core-field__label" htmlFor="settings-until">
                      Available Until
                    </label>
                    <input
                      id="settings-until"
                      type="datetime-local"
                      className="core-field__input"
                      value={availableUntil}
                      onChange={(e) => setAvailableUntil(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 4: Results and review */}
        <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-3">
          <div
            className="core-card__header core-surface--white core-cursor--pointer core-display-flex core-layout--justify-between core-layout--align-center"
            onClick={() => toggleSection('results')}
          >
            <div>
              <h2 className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-bottom-0">
                4. Results and Review
              </h2>
              {!openSections.results && (
                <div className="core-type--small core-text--muted core-space--margin-top-1">
                  {resultsOption === 'answers_and_score'
                    ? 'Score and answers right away'
                    : resultsOption === 'score_only'
                    ? 'Score only'
                    : 'Hide until I release them'}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('results');
              }}
              aria-label={openSections.results ? 'Collapse Results' : 'Expand Results'}
            >
              {openSections.results ? 'Collapse' : 'Expand'}
            </Button>
          </div>
          {openSections.results && (
            <div className="core-card__body">
              <div className="core-display-flex core-layout--column core-layout--gap-2" role="radiogroup" aria-label="Results visibility options">
                <label className="core-field__check core-display-flex core-layout--align-start core-layout--gap-2">
                  <input
                    type="radio"
                    name="results_option"
                    className="core-field__check-input"
                    checked={resultsOption === 'answers_and_score'}
                    onChange={() => setResultsOption('answers_and_score')}
                  />
                  <div>
                    <span className="core-field__check-label core-type--weight-semibold">
                      Score and answers right away
                    </span>
                    <div className="core-type--small core-text--muted">
                      Students view their score, question responses, and correct answer keys immediately after submitting.
                    </div>
                  </div>
                </label>

                <label className="core-field__check core-display-flex core-layout--align-start core-layout--gap-2">
                  <input
                    type="radio"
                    name="results_option"
                    className="core-field__check-input"
                    checked={resultsOption === 'score_only'}
                    onChange={() => setResultsOption('score_only')}
                  />
                  <div>
                    <span className="core-field__check-label core-type--weight-semibold">
                      Score only
                    </span>
                    <div className="core-type--small core-text--muted">
                      Students see their numeric score and percentage, but correct answer keys and detailed review remain hidden.
                    </div>
                  </div>
                </label>

                <label className="core-field__check core-display-flex core-layout--align-start core-layout--gap-2">
                  <input
                    type="radio"
                    name="results_option"
                    className="core-field__check-input"
                    checked={resultsOption === 'hidden'}
                    onChange={() => setResultsOption('hidden')}
                  />
                  <div>
                    <span className="core-field__check-label core-type--weight-semibold">
                      Hide until I release them
                    </span>
                    <div className="core-type--small core-text--muted">
                      Results and reviews are withheld from students until explicitly made available.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Section 5: Question order */}
        <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-3">
          <div
            className="core-card__header core-surface--white core-cursor--pointer core-display-flex core-layout--justify-between core-layout--align-center"
            onClick={() => toggleSection('order')}
          >
            <div>
              <h2 className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-bottom-0">
                5. Question Order & Randomisation
              </h2>
              {!openSections.order && (
                <div className="core-type--small core-text--muted core-space--margin-top-1">
                  {randomizeQuestions ? 'Questions randomized' : 'Standard question order'} · {randomizeAnswers ? 'Choices randomized' : 'Standard choice order'}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('order');
              }}
              aria-label={openSections.order ? 'Collapse Question Order' : 'Expand Question Order'}
            >
              {openSections.order ? 'Collapse' : 'Expand'}
            </Button>
          </div>
          {openSections.order && (
            <div className="core-card__body">
              <div className="core-display-flex core-layout--column core-layout--gap-2">
                <label className="core-field__check">
                  <input
                    type="checkbox"
                    className="core-field__check-input"
                    checked={randomizeQuestions}
                    onChange={(e) => setRandomizeQuestions(e.target.checked)}
                  />
                  <span className="core-field__check-label core-type--weight-semibold">
                    Randomise questions for each attempt
                  </span>
                </label>

                <label className="core-field__check">
                  <input
                    type="checkbox"
                    className="core-field__check-input"
                    checked={randomizeAnswers}
                    onChange={(e) => setRandomizeAnswers(e.target.checked)}
                  />
                  <span className="core-field__check-label core-type--weight-semibold">
                    Randomise answer choices order
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Section 6: Security */}
        <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-3">
          <div
            className="core-card__header core-surface--white core-cursor--pointer core-display-flex core-layout--justify-between core-layout--align-center"
            onClick={() => toggleSection('security')}
          >
            <div>
              <h2 className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-bottom-0">
                6. Security & Access Control
              </h2>
              {!openSections.security && (
                <div className="core-type--small core-text--muted core-space--margin-top-1">
                  {requirePassword ? 'Password required' : 'No password required'}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('security');
              }}
              aria-label={openSections.security ? 'Collapse Security' : 'Expand Security'}
            >
              {openSections.security ? 'Collapse' : 'Expand'}
            </Button>
          </div>
          {openSections.security && (
            <div className="core-card__body">
              <label className="core-field__check core-space--margin-bottom-3">
                <input
                  type="checkbox"
                  className="core-field__check-input"
                  checked={requirePassword}
                  onChange={(e) => setRequirePassword(e.target.checked)}
                />
                <span className="core-field__check-label core-type--weight-semibold">
                  Require password to access quiz
                </span>
              </label>

              {requirePassword && (
                <div className="core-grid core-grid--gap-3 core-surface--light core-space--padding-3 core-radius">
                  <div className="core-grid__span-12 core-grid__span-md-6">
                    <label className="core-field__label" htmlFor="settings-password">
                      Quiz Password *
                    </label>
                    <div className="core-display-flex core-layout--gap-2">
                      <input
                        id="settings-password"
                        type={showPasswordText ? 'text' : 'password'}
                        className="core-field__input"
                        placeholder="Enter quiz password..."
                        value={quizPassword}
                        onChange={(e) => setQuizPassword(e.target.value)}
                        required={requirePassword}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowPasswordText(!showPasswordText)}
                      >
                        {showPasswordText ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 7: Academic Year & Term */}
        <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4">
          <div
            className="core-card__header core-surface--white core-cursor--pointer core-display-flex core-layout--justify-between core-layout--align-center"
            onClick={() => toggleSection('academic')}
          >
            <div>
              <h2 className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-bottom-0">
                7. Academic Year and Term
              </h2>
              <div className="core-type--small core-text--muted core-space--margin-top-1">
                {academicYearName} · {termName}
              </div>
            </div>
            <div className="core-display-flex core-layout--gap-2 core-layout--align-center">
              <Button
                type="button"
                variant="outline-primary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  openAcademicModal();
                }}
              >
                Change
              </Button>
            </div>
          </div>
        </div>

        {/* Sticky Save Bar */}
        <div
          className="core-surface--white core-border--top core-shadow--md core-space--padding-3"
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 100,
            marginTop: '2rem',
          }}
        >
          <div className="core-container core-display-flex core-layout--justify-between core-layout--align-center">
            <div>
              {isDirty ? (
                <span className="core-text--warning core-type--weight-semibold">
                  ● You have unsaved changes
                </span>
              ) : (
                <span className="core-text--muted core-type--small">All changes saved</span>
              )}
            </div>
            <div className="core-display-flex core-layout--gap-2">
              <Button
                type="button"
                variant="outline-secondary"
                disabled={!isDirty || saving}
                onClick={handleDiscard}
              >
                Discard
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!isDirty || saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      </form>

      {/* Modal for Changing Academic Year and Term */}
      {academicModalOpen && (
        <Modal
          title="Change Academic Year & Term"
          isOpen={academicModalOpen}
          onClose={() => setAcademicModalOpen(false)}
        >
          <div className="core-space--margin-bottom-3">
            <label className="core-field__label" htmlFor="modal-academic-year">
              Academic Year
            </label>
            <select
              id="modal-academic-year"
              className="core-field__select"
              value={modalYearId}
              onChange={(e) => {
                setModalYearId(e.target.value);
                setModalTermId('');
              }}
            >
              <option value="">Select year...</option>
              {options?.academic_years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>

          <div className="core-space--margin-bottom-4">
            <label className="core-field__label" htmlFor="modal-term">
              Term
            </label>
            <select
              id="modal-term"
              className="core-field__select"
              value={modalTermId}
              onChange={(e) => setModalTermId(e.target.value)}
            >
              <option value="">Select term...</option>
              {options?.terms
                .filter((t) => !modalYearId || t.academic_year_id === Number(modalYearId))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="core-display-flex core-layout--justify-end core-layout--gap-2">
            <Button variant="secondary" onClick={() => setAcademicModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAcademicConfirm}>
              Apply
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};
