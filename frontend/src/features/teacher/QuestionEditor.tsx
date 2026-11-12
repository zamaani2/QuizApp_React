import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchTeacherQuizDetail, saveQuestion } from '../../api/teacher';
import type { QuestionDetailItem, QuizDetailData } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { getQuestionType, type QuestionConfig } from '../../question-types';

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
  const { id, quizId: quizRouteId, questionId } = useParams<{ id?: string; quizId?: string; questionId?: string }>();
  const quizId = Number(id ?? quizRouteId);
  const parsedQuestionId = questionId ? Number(questionId) : null;
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizDetailData | null>(null);
  const [question, setQuestion] = useState<QuestionDetailItem | undefined>();
  const [questionType, setQuestionType] = useState('multiple_choice');
  const [choices, setChoices] = useState<ChoiceDraft[]>(initialChoices());
  const [tfCorrect, setTfCorrect] = useState('true');
  const [config, setConfig] = useState<QuestionConfig>({});
  const [answerKey, setAnswerKey] = useState('');
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
      const currentConfig = currentQuestion?.config ?? {};
      setConfig(currentConfig);
      if (currentQuestion?.question_type === 'matching' && Array.isArray(currentConfig.pairs)) {
        setAnswerKey((currentConfig.pairs as { left: string; right: string }[])
          .map((pair) => `${pair.left}=${pair.right}`).join('\n'));
      } else if (currentQuestion?.question_type === 'ordering' && Array.isArray(currentConfig.items)) {
        setAnswerKey((currentConfig.items as string[]).join('; '));
      } else if (Array.isArray(currentConfig.accepted_answers)) {
        setAnswerKey((currentConfig.accepted_answers as string[]).join('; '));
      } else {
        setAnswerKey(currentQuestion?.correct_answer_text ?? '');
      }
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
    const payload: Record<string, unknown> = {
      question_type: questionType,
      question_text: String(formData.get('question_text') || ''),
      marks: formData.get('marks'),
      order: formData.get('order'),
      difficulty: formData.get('difficulty'),
      negative_marks: formData.get('negative_marks'),
      explanation: formData.get('explanation'),
      is_required: formData.get('is_required') === 'on',
      tf_correct: tfCorrect,
      correct_answer: answerKey,
      config: {},
    };
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
      payload.choices = completedChoices.map((choice) => ({
        id: choice.id,
        text: choice.text,
        is_correct: choice.isCorrect,
      }));
      payload.config = {
        ...config,
        allow_multiple: config.allow_multiple === true
          || completedChoices.filter((choice) => choice.isCorrect).length > 1,
      };
    } else if (questionType === 'true_false') {
      payload.config = {};
    } else if (questionType === 'matching') {
      const existingPairs = Array.isArray(config.pairs)
        ? config.pairs as { id?: string; left: string; right: string }[]
        : [];
      const pairs = answerKey.split(/[;\n]/).map((pair, index) => {
        const [left = '', ...rightParts] = pair.split('=');
        return {
          id: existingPairs[index]?.id || `pair-${index + 1}`,
          left: left.trim(),
          right: rightParts.join('=').trim(),
        };
      }).filter((pair) => pair.left && pair.right);
      if (pairs.length < 2) {
        setError('Matching questions need at least two complete left=right pairs.');
        return;
      }
      payload.config = { pairs };
    } else if (questionType === 'ordering') {
      const items = answerKey.split(/[;\n]/).map((item) => item.trim()).filter(Boolean);
      if (items.length < 2 || new Set(items.map((item) => item.toLocaleLowerCase())).size !== items.length) {
        setError('Ordering questions need at least two distinct items.');
        return;
      }
      payload.config = { items };
    } else if (questionType === 'short_answer') {
      const accepted_answers = answerKey.split(/[;\n]/).map((answer) => answer.trim()).filter(Boolean);
      if (!accepted_answers.length) {
        setError('At least one accepted answer is required.');
        return;
      }
      payload.config = { ...config, accepted_answers };
    } else if (questionType === 'fill_blank') {
      const blanks = answerKey.split('\n').map((blank) =>
        blank.split('|').map((answer) => answer.trim()).filter(Boolean)
      ).filter((blank) => blank.length);
      if (!blanks.length) {
        setError('Enter at least one answer for each blank.');
        return;
      }
      payload.config = { ...config, blanks };
    } else {
      payload.config = config;
    }

    setSaving(true);
    setError(null);
    try {
      await saveQuestion(quizId, parsedQuestionId, payload);
      navigate(`/teacher/quizzes/${quizId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save question.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner size="lg" message="Loading question editor..." />;
  if (!quiz) return <Alert variant="danger">{error || 'Quiz is unavailable.'}</Alert>;

  const isChoiceType = questionType === 'multiple_choice' || questionType === 'true_false';
  const Editor = getQuestionType(questionType).Editor;

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
                  setConfig({});
                  setAnswerKey('');
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
                  {questionType === 'multiple_choice' && (
                    <Editor questionType={questionType} config={config}
                      onChange={setConfig} answerKey={answerKey} onAnswerKeyChange={setAnswerKey} />
                  )}
                </fieldset>
              </div>
            )}
            {questionType !== 'multiple_choice' && questionType !== 'true_false' && (
              <Editor questionType={questionType} config={config} onChange={setConfig}
                answerKey={answerKey} onAnswerKeyChange={setAnswerKey} />
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
