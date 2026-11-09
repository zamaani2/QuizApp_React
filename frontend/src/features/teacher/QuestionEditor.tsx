import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchTeacherQuizDetail, saveQuestion } from '../../api/teacher';
import type { QuestionDetailItem, QuizDetailData } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

interface ChoiceDraft {
  id?: number;
  text: string;
  isCorrect: boolean;
}

const QUESTION_TYPES = [
  ['multiple_choice', 'Multiple choice'],
  ['true_false', 'True / False'],
  ['short_answer', 'Short answer'],
  ['fill_blank', 'Fill in the blank'],
  ['matching', 'Matching'],
  ['ordering', 'Ordering'],
  ['essay', 'Essay'],
] as const;

function initialChoices(question?: QuestionDetailItem): ChoiceDraft[] {
  if (question?.choices.length) {
    return question.choices.map((choice) => ({
      id: choice.id,
      text: choice.choice_text,
      isCorrect: choice.is_correct,
    }));
  }
  return [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ];
}

export const QuestionEditor: React.FC = () => {
  const { id, questionId } = useParams<{ id: string; questionId?: string }>();
  const quizId = Number(id);
  const parsedQuestionId = questionId ? Number(questionId) : null;
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizDetailData | null>(null);
  const [question, setQuestion] = useState<QuestionDetailItem | undefined>();
  const [questionType, setQuestionType] = useState('multiple_choice');
  const [choices, setChoices] = useState<ChoiceDraft[]>(initialChoices());
  const [tfCorrect, setTfCorrect] = useState('true');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchTeacherQuizDetail(quizId).then((data) => {
      if (!active) return;
      const currentQuestion = parsedQuestionId
        ? data.questions.find((item) => item.id === parsedQuestionId)
        : undefined;
      if (parsedQuestionId && !currentQuestion) {
        setError('Question not found in this quiz.');
      }
      setQuiz(data);
      setQuestion(currentQuestion);
      setQuestionType(currentQuestion?.question_type ?? 'multiple_choice');
      setChoices(initialChoices(currentQuestion));
      const correctTrueFalse = currentQuestion?.choices.find((choice) => choice.is_correct);
      setTfCorrect(correctTrueFalse?.choice_text.toLowerCase() === 'false' ? 'false' : 'true');
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Unable to load quiz question.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [quizId, parsedQuestionId]);

  function changeChoice(index: number, patch: Partial<ChoiceDraft>) {
    setChoices((current) => current.map((choice, choiceIndex) =>
      choiceIndex === index ? { ...choice, ...patch } : choice
    ));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set('question_type', questionType);
    formData.set('tf_correct', tfCorrect);
    if (questionType === 'multiple_choice') {
      const completedChoices = choices.filter((choice) => choice.text.trim());
      if (completedChoices.length < 2) {
        setError('Multiple-choice questions need at least two non-empty choices.');
        return;
      }
      if (!completedChoices.some((choice) => choice.isCorrect)) {
        setError('Mark at least one choice as correct.');
        return;
      }
      completedChoices.forEach((choice, index) => {
        formData.append('choice_id', choice.id ? String(choice.id) : '');
        formData.append('choice_text', choice.text);
        if (choice.isCorrect) formData.append('is_correct', String(index));
      });
    }

    setSaving(true);
    setError(null);
    try {
      await saveQuestion(quizId, parsedQuestionId, formData);
      navigate(`/teacher/quizzes/${quizId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save question.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner size="lg" message="Loading question editor..." />;
  if (!quiz) return <Alert variant="danger">{error || 'Quiz is unavailable.'}</Alert>;

  const answerFieldRequired = ['short_answer', 'fill_blank', 'matching', 'ordering'].includes(questionType);
  const isChoiceType = questionType === 'multiple_choice' || questionType === 'true_false';

  return (
    <div className="assessment-page core-container core-space--padding-y-4">
      <div className="core-space--margin-bottom-3">
        <Link to={`/teacher/quizzes/${quizId}`} className="core-text--decoration-none">&larr; Back to {quiz.title}</Link>
      </div>
      <h1 className="core-type--heading-3 core-space--margin-bottom-4">{parsedQuestionId ? 'Edit Question' : 'Add Question'}</h1>
      {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
      <form className="core-card core-shadow--sm core-border--none" onSubmit={handleSubmit}>
        <div className="core-card__body">
          <div className="core-grid core-grid--gap-3">
            {!parsedQuestionId && (
              <div className="core-grid__span-md-6">
                <label className="core-field__label" htmlFor="question-type">Question type</label>
                <select id="question-type" className="core-field__select" value={questionType} onChange={(event) => {
                  setQuestionType(event.target.value);
                  setChoices(initialChoices());
                }}>
                  {QUESTION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            )}
            <div className="core-grid__span-md-3">
              <label className="core-field__label" htmlFor="question-marks">Marks</label>
              <input id="question-marks" className="core-field__input" type="number" min="1" name="marks" required defaultValue={question?.marks ?? 1} />
            </div>
            <div className="core-grid__span-md-3">
              <label className="core-field__label" htmlFor="question-order">Order</label>
              <input id="question-order" className="core-field__input" type="number" min="1" name="order" defaultValue={question?.order ?? quiz.questions.length + 1} />
            </div>
            <div className="core-grid__span-12">
              <label className="core-field__label" htmlFor="question-text">Question *</label>
              <textarea id="question-text" className="core-field__input" name="question_text" rows={4} required defaultValue={question?.question_text ?? ''} />
            </div>
            {isChoiceType && (
              <div className="core-grid__span-12">
                <fieldset>
                  <legend className="core-field__label">Answer choices</legend>
                  {questionType === 'true_false' ? (
                    <div className="core-display-flex core-layout--gap-4">
                      {['true', 'false'].map((value) => (
                        <label className="core-field__check" key={value}>
                          <input className="core-field__check-input" type="radio" name="correct-true-false" value={value} checked={tfCorrect === value} onChange={() => setTfCorrect(value)} />
                          <span className="core-field__check-label core-text--capitalize">{value}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <>
                      {choices.map((choice, index) => (
                        <div className="core-grid core-grid--gap-2 core-layout--align-center core-space--margin-bottom-2 core-layout--wrap" key={choice.id ?? index}>
                          <div className="core-grid__span-12 core-grid__column-sm">
                            <label className="core-visually-hidden" htmlFor={`choice-${index}`}>Choice {index + 1}</label>
                            <input id={`choice-${index}`} className="core-field__input" value={choice.text} onChange={(event) => changeChoice(index, { text: event.target.value })} placeholder={`Choice ${index + 1}`} />
                          </div>
                          <div className="core-grid__column-auto">
                            <label className="core-field__check core-space--margin-bottom-0">
                              <input className="core-field__check-input" type="checkbox" checked={choice.isCorrect} onChange={(event) => changeChoice(index, { isCorrect: event.target.checked })} />
                              <span className="core-field__check-label">Correct</span>
                            </label>
                          </div>
                          <div className="core-grid__column-auto">
                            <Button type="button" variant="outline-danger" size="sm" disabled={choices.length <= 2} onClick={() => setChoices((current) => current.filter((_, choiceIndex) => choiceIndex !== index))}>Remove</Button>
                          </div>
                        </div>
                      ))}
                      <Button type="button" variant="outline-secondary" size="sm" onClick={() => setChoices((current) => [...current, { text: '', isCorrect: false }])}>Add choice</Button>
                    </>
                  )}
                </fieldset>
              </div>
            )}
            {answerFieldRequired && (
              <div className="core-grid__span-12">
                <label className="core-field__label" htmlFor="question-answer">
                  {questionType === 'matching' ? 'Correct pairs (left=right, separated by semicolons)' :
                    questionType === 'ordering' ? 'Correct order (items separated by semicolons)' : 'Accepted answer(s)'}
                </label>
                <textarea id="question-answer" className="core-field__input" rows={2} name="correct_answer" required={questionType === 'matching' || questionType === 'ordering'} defaultValue={question?.correct_answer_text ?? ''} />
              </div>
            )}
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="question-difficulty">Difficulty</label>
              <select id="question-difficulty" className="core-field__select" name="difficulty" defaultValue={question?.difficulty ?? 'medium'}>
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </div>
            <div className="core-grid__span-md-6">
              <label className="core-field__label" htmlFor="negative-marks">Negative marks</label>
              <input id="negative-marks" className="core-field__input" type="number" min="0" step="0.1" name="negative_marks" defaultValue={question?.negative_marks ?? 0} />
            </div>
            <div className="core-grid__span-12">
              <label className="core-field__label" htmlFor="question-explanation">Explanation</label>
              <textarea id="question-explanation" className="core-field__input" rows={2} name="explanation" defaultValue={question?.explanation ?? ''} />
            </div>
            <div className="core-grid__span-12">
              <label className="core-field__check">
                <input className="core-field__check-input" type="checkbox" name="is_required" defaultChecked={question?.is_required ?? true} />
                <span className="core-field__check-label">Required question</span>
              </label>
            </div>
          </div>
        </div>
        <div className="core-card__footer core-surface--white core-display-flex core-layout--wrap core-layout--justify-end core-layout--gap-2">
          <Link to={`/teacher/quizzes/${quizId}`} className="core-button core-button--outline-secondary">Cancel</Link>
          <Button type="submit" loading={saving}>{parsedQuestionId ? 'Save Question' : 'Add Question'}</Button>
        </div>
      </form>
    </div>
  );
};
