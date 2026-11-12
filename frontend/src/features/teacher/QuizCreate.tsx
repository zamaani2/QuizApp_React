import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchQuizFormOptions, saveQuiz } from '../../api/teacher';
import type { QuizFormOptions } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { QUIZ_PRESETS, type QuizPresetType } from './quizPresets';

export const QuizCreate: React.FC = () => {
  const navigate = useNavigate();
  const [options, setOptions] = useState<QuizFormOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<QuizPresetType>('practice');
  const [revealCorrectAnswers, setRevealCorrectAnswers] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchQuizFormOptions()
      .then((data) => {
        if (!active) return;
        setOptions(data);
        if (data.subjects.length > 0) {
          setSubjectId(String(data.subjects[0].id));
        }
        if (data.is_admin && data.teachers.length > 0) {
          setTeacherId(String(data.teachers[0].id));
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load quiz creation form.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Quiz title is required.');
      return;
    }
    if (!subjectId) {
      setError('Subject is required.');
      return;
    }
    if (options?.is_admin && !teacherId) {
      setError('Teacher is required for admin quiz creation.');
      return;
    }

    const preset = QUIZ_PRESETS[selectedPreset];
    const payload: Record<string, unknown> = {
      title: title.trim(),
      subject_id: Number(subjectId),
      time_limit: preset.defaults.time_limit,
      max_attempts: preset.defaults.max_attempts,
      randomize_questions: preset.defaults.randomize_questions,
      randomize_answers: preset.defaults.randomize_answers,
      show_results_immediately: preset.defaults.show_results_immediately,
      show_correct_answers:
        selectedPreset === 'practice' ? revealCorrectAnswers : preset.defaults.show_correct_answers,
      allow_review: preset.defaults.allow_review,
      status: 'draft',
    };

    if (options?.is_admin && teacherId) {
      payload.teacher_id = Number(teacherId);
    }

    setSaving(true);
    setError(null);
    try {
      const result = await saveQuiz(null, payload);
      navigate(`/teacher/quizzes/${result.quiz_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create quiz.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="core-container core-space--padding-y-5 core-display-flex core-layout--justify-center">
        <LoadingSpinner size="lg" message="Loading form options..." />
      </div>
    );
  }

  if (!options) {
    return (
      <div className="core-container core-space--padding-y-4">
        <Alert variant="danger">{error || 'Unable to load quiz options.'}</Alert>
      </div>
    );
  }

  return (
    <div className="assessment-page core-container core-space--padding-y-4" data-testid="teacher-quiz-create">
      <div className="core-space--margin-bottom-3">
        <Link to="/teacher/quizzes" className="core-text--decoration-none core-type--small core-text--muted">
          &larr; Back to Quizzes
        </Link>
      </div>

      <div className="core-space--margin-bottom-4">
        <h1 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">
          New Quiz
        </h1>
        <p className="core-text--muted core-space--margin-bottom-0">
          Create a new assessment with title, subject, and quiz type defaults.
        </p>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Core fields card */}
        <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4">
          <div className="core-card__body">
            <div className="core-grid core-grid--gap-3">
              <div className="core-grid__span-12">
                <label className="core-field__label" htmlFor="create-quiz-title">
                  Quiz Title *
                </label>
                <input
                  id="create-quiz-title"
                  className="core-field__input"
                  type="text"
                  placeholder="e.g. Unit 3 Biology Review"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                />
              </div>

              <div className={options.is_admin ? 'core-grid__span-12 core-grid__span-md-6' : 'core-grid__span-12'}>
                <label className="core-field__label" htmlFor="create-quiz-subject">
                  Subject *
                </label>
                <select
                  id="create-quiz-subject"
                  className="core-field__select"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  required
                >
                  <option value="">Select subject...</option>
                  {options.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {options.is_admin && (
                <div className="core-grid__span-12 core-grid__span-md-6">
                  <label className="core-field__label" htmlFor="create-quiz-teacher">
                    Teacher *
                  </label>
                  <select
                    id="create-quiz-teacher"
                    className="core-field__select"
                    value={teacherId}
                    onChange={(e) => setTeacherId(e.target.value)}
                    required
                  >
                    <option value="">Select teacher...</option>
                    {options.teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Type Picker Cards */}
        <div className="core-space--margin-bottom-4">
          <label className="core-field__label core-space--margin-bottom-2">
            Quiz Type Preset
          </label>
          <div
            className="core-grid core-grid--gap-3"
            role="radiogroup"
            aria-label="Quiz type presets"
          >
            {(Object.keys(QUIZ_PRESETS) as QuizPresetType[]).map((key) => {
              const preset = QUIZ_PRESETS[key];
              const isSelected = selectedPreset === key;
              return (
                <div
                  key={key}
                  className="core-grid__span-12 core-grid__span-md-4"
                >
                  <div
                    tabIndex={0}
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedPreset(key)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setSelectedPreset(key);
                      }
                    }}
                    className={`core-card core-shadow--sm core-border core-radius--lg core-cursor--pointer ${
                      isSelected
                        ? 'core-border--primary core-surface--primary-subtle'
                        : 'core-border--light core-surface--white'
                    }`}
                    style={{ outline: isSelected ? '2px solid var(--core-primary, #0d6efd)' : 'none' }}
                  >
                    <div className="core-card__body">
                      <div className="core-display-flex core-layout--justify-between core-layout--align-center core-space--margin-bottom-2">
                        <span className="core-type--weight-bold core-type--heading-5 core-text--dark">
                          {preset.title}
                        </span>
                        <span
                          className={`core-badge ${
                            isSelected ? 'core-surface--primary core-text--white' : 'core-surface--secondary-subtle'
                          }`}
                        >
                          {preset.tagline}
                        </span>
                      </div>
                      <p className="core-type--small core-text--muted core-space--margin-bottom-3">
                        {preset.description}
                      </p>
                      <div className="core-list core-list--flush core-type--small core-space--margin-bottom-0">
                        <div className="core-space--padding-y-1 core-border--top core-display-flex core-layout--justify-between">
                          <span className="core-text--muted">Timer</span>
                          <span className="core-type--weight-semibold core-text--dark">{preset.timerLabel}</span>
                        </div>
                        <div className="core-space--padding-y-1 core-border--top core-display-flex core-layout--justify-between">
                          <span className="core-text--muted">Attempts</span>
                          <span className="core-type--weight-semibold core-text--dark">{preset.attemptsLabel}</span>
                        </div>
                        <div className="core-space--padding-y-1 core-border--top core-display-flex core-layout--justify-between">
                          <span className="core-text--muted">Results</span>
                          <span className="core-type--weight-semibold core-text--dark">{preset.resultsLabel}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedPreset === 'practice' && (
            <div className="core-card core-shadow--sm core-border--none core-surface--white core-space--margin-top-3">
              <div className="core-card__body core-space--padding-3">
                <label className="core-field__check core-display-flex core-layout--align-center core-layout--gap-2 core-space--margin-bottom-0">
                  <input
                    type="checkbox"
                    className="core-field__check-input"
                    checked={revealCorrectAnswers}
                    onChange={(e) => setRevealCorrectAnswers(e.target.checked)}
                  />
                  <span className="core-field__check-label core-type--weight-semibold">
                    Reveal correct answers to students after submission
                  </span>
                </label>
                <p className="core-type--small core-text--muted core-space--margin-start-4 core-space--margin-top-1 core-space--margin-bottom-0">
                  By default, students see their score and which questions they got right/wrong without showing the correct answers.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="core-display-flex core-layout--justify-end core-layout--gap-2">
          <Link to="/teacher/quizzes" className="core-button core-button--outline-secondary">
            Cancel
          </Link>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Creating Quiz...' : 'Create Quiz'}
          </Button>
        </div>
      </form>
    </div>
  );
};
