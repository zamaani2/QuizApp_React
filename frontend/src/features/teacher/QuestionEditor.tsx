import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  GitCompareArrows,
  ListChecks,
  ListOrdered,
  Type,
  X,
} from 'lucide-react';
import { fetchTeacherQuizDetail, saveQuestion } from '../../api/teacher';
import { ApiError, type QuestionDetailItem, type QuizDetailData } from '../../types';
import type { StudentQuestionResponse, StudentTakeQuestion } from '../../types/student';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { getQuestionType, type QuestionConfig } from '../../question-types';
import './QuestionEditor.css';
import '../student/student.css';

interface ChoiceDraft {
  id?: number;
  text: string;
  isCorrect: boolean;
}

interface MatchingPairDraft {
  id: string;
  left_id: string;
  right_id: string;
  left: string;
  right: string;
}

const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice', description: 'Choose one or more options.', icon: ListChecks },
  { value: 'true_false', label: 'True / False', description: 'Choose between two answers.', icon: CheckCircle2 },
  { value: 'short_answer', label: 'Short answer', description: 'Accept one or more text answers.', icon: Type },
  { value: 'fill_blank', label: 'Fill in the blank', description: 'Add answer fields to a sentence.', icon: AlignLeft },
  { value: 'matching', label: 'Matching', description: 'Connect related pairs.', icon: GitCompareArrows },
  { value: 'ordering', label: 'Ordering', description: 'Arrange items in the correct order.', icon: ListOrdered },
  { value: 'essay', label: 'Essay', description: 'Collect a longer written response.', icon: FileText },
] as const;

const QUESTION_TEXT_MARKER = '_____';

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

function splitLegacyAnswers(value: string): string[] {
  return value.split(/[;\n]/).map((answer) => answer.trim()).filter(Boolean);
}

function readMatchingPairs(config: QuestionConfig, legacyAnswer: string): MatchingPairDraft[] {
  const configured = Array.isArray(config.pairs)
    ? config.pairs as Partial<MatchingPairDraft>[]
    : [];
  if (configured.length) {
    return configured.map((pair, index) => ({
      id: pair.id || `pair-${index + 1}`,
      left_id: pair.left_id || `left-${index + 1}`,
      right_id: pair.right_id || `right-${index + 1}`,
      left: pair.left || '',
      right: pair.right || '',
    }));
  }
  const legacy = legacyAnswer.split(/[;\n]/).map((row) => {
    const [left = '', ...right] = row.split('=');
    return { left: left.trim(), right: right.join('=').trim() };
  }).filter((pair) => pair.left || pair.right);
  return legacy.map((pair, index) => ({
    id: `pair-${index + 1}`,
    left_id: `left-${index + 1}`,
    right_id: `right-${index + 1}`,
    ...pair,
  }));
}

function readOrderingItems(config: QuestionConfig, legacyAnswer: string): { items: string[]; ids: string[] } {
  const configuredItems = Array.isArray(config.items)
    ? (config.items as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  const items = configuredItems.length ? configuredItems : splitLegacyAnswers(legacyAnswer);
  const configuredIds = Array.isArray(config.item_ids)
    ? (config.item_ids as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  return {
    items,
    ids: items.map((_, index) => configuredIds[index] || `item-${index + 1}`),
  };
}

function readBlankGroups(config: QuestionConfig, legacyAnswer: string): string[][] {
  if (Array.isArray(config.blanks) && config.blanks.length) {
    return (config.blanks as unknown[]).map((group) =>
      Array.isArray(group)
        ? group.filter((answer): answer is string => typeof answer === 'string')
        : []
    );
  }
  return legacyAnswer.split('\n')
    .map((group) => group.split('|').map((answer) => answer.trim()).filter(Boolean))
    .filter((group) => group.length > 0);
}

function moveItem<T>(items: T[], index: number, offset: number): T[] {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function questionTextForPreview(text: string): string {
  return text.replace(/_{5,}/g, '__________');
}

function countTextMarkers(text: string): number {
  return text.match(/_{5,}/g)?.length ?? 0;
}

function addMatchingPair(index: number): MatchingPairDraft {
  return {
    id: `pair-${Date.now()}-${index}`,
    left_id: `left-${Date.now()}-${index}`,
    right_id: `right-${Date.now()}-${index}`,
    left: '',
    right: '',
  };
}

function makeSnapshot(value: {
  questionType: string;
  questionText: string;
  marks: string;
  negativeMarks: string;
  difficulty: string;
  isRequired: boolean;
  explanation: string;
  choices: ChoiceDraft[];
  tfCorrect: string;
  config: QuestionConfig;
  matchingPairs: MatchingPairDraft[];
  orderingItems: string[];
  orderingIds: string[];
  acceptedAnswers: string[];
  acceptedAnswerDraft: string;
  blankGroups: string[][];
}): string {
  return JSON.stringify(value);
}

export const QuestionEditor: React.FC = () => {
  const { id, quizId: quizRouteId, questionId } = useParams<{ id?: string; quizId?: string; questionId?: string }>();
  const quizId = Number(id ?? quizRouteId);
  const parsedQuestionId = questionId ? Number(questionId) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const questionTextRef = useRef<HTMLTextAreaElement>(null);

  const [quiz, setQuiz] = useState<QuizDetailData | null>(null);
  const [question, setQuestion] = useState<QuestionDetailItem | undefined>();
  const [questionType, setQuestionType] = useState('multiple_choice');
  const [questionText, setQuestionText] = useState('');
  const [marks, setMarks] = useState('1');
  const [negativeMarks, setNegativeMarks] = useState('0');
  const [difficulty, setDifficulty] = useState('medium');
  const [isRequired, setIsRequired] = useState(true);
  const [explanation, setExplanation] = useState('');
  const [choices, setChoices] = useState<ChoiceDraft[]>(initialChoices());
  const [tfCorrect, setTfCorrect] = useState('true');
  const [config, setConfig] = useState<QuestionConfig>({});
  const [matchingPairs, setMatchingPairs] = useState<MatchingPairDraft[]>([
    addMatchingPair(1), addMatchingPair(2),
  ]);
  const [orderingItems, setOrderingItems] = useState(['', '']);
  const [orderingIds, setOrderingIds] = useState(['item-1', 'item-2']);
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>([]);
  const [acceptedAnswerDraft, setAcceptedAnswerDraft] = useState('');
  const [blankGroups, setBlankGroups] = useState<string[][]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState('');
  const [previewResponse, setPreviewResponse] = useState<StudentQuestionResponse>({
    selected_choice_id: null,
    selected_choice_ids: [],
    text_answer: '',
  });

  const snapshot = useMemo(() => makeSnapshot({
    questionType, questionText, marks, negativeMarks, difficulty, isRequired,
    explanation, choices, tfCorrect, config, matchingPairs, orderingItems,
    orderingIds, acceptedAnswers, acceptedAnswerDraft, blankGroups,
  }), [
    questionType, questionText, marks, negativeMarks, difficulty, isRequired,
    explanation, choices, tfCorrect, config, matchingPairs, orderingItems,
    orderingIds, acceptedAnswers, acceptedAnswerDraft, blankGroups,
  ]);
  const isDirty = initialized && baseline !== null && baseline !== snapshot;
  const blankCount = Math.max(countTextMarkers(questionText), blankGroups.length);

  useEffect(() => {
    if (initialized && baseline === null) setBaseline(snapshot);
  }, [initialized, baseline, snapshot]);

  useEffect(() => {
    const textarea = questionTextRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [questionText]);

  useEffect(() => {
    if (!statusMessage) return;
    const timeout = window.setTimeout(() => setStatusMessage(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setInitialized(false);
    setBaseline(null);
    setError(null);
    fetchTeacherQuizDetail(quizId).then((data) => {
      if (!active) return;
      const currentQuestion = parsedQuestionId
        ? data.questions.find((item) => item.id === parsedQuestionId)
        : undefined;
      if (parsedQuestionId && !currentQuestion) {
        setError('Question not found in this quiz.');
      }
      const currentConfig = currentQuestion?.config ?? {};
      const legacyAnswer = currentQuestion?.correct_answer_text ?? '';
      const currentMatchingPairs = readMatchingPairs(currentConfig, legacyAnswer);
      const currentOrdering = readOrderingItems(currentConfig, legacyAnswer);
      const configuredAnswers = Array.isArray(currentConfig.accepted_answers)
        ? (currentConfig.accepted_answers as unknown[]).filter((answer): answer is string => typeof answer === 'string')
        : [];
      const currentAcceptedAnswers = configuredAnswers.length ? configuredAnswers : splitLegacyAnswers(legacyAnswer);
      const currentBlankGroups = readBlankGroups(currentConfig, legacyAnswer);
      const trueFalseChoice = currentQuestion?.choices.find((choice) => choice.is_correct);

      setQuiz(data);
      setQuestion(currentQuestion);
      setQuestionType(currentQuestion?.question_type ?? 'multiple_choice');
      setQuestionText(currentQuestion?.question_text ?? '');
      setMarks(String(currentQuestion?.marks ?? 1));
      setNegativeMarks(String(currentQuestion?.negative_marks ?? 0));
      setDifficulty(currentQuestion?.difficulty ?? 'medium');
      setIsRequired(currentQuestion?.is_required ?? true);
      setExplanation(currentQuestion?.explanation ?? '');
      setChoices(initialChoices(currentQuestion));
      setConfig(currentConfig);
      setMatchingPairs(currentMatchingPairs.length ? currentMatchingPairs : [addMatchingPair(1), addMatchingPair(2)]);
      setOrderingItems(currentOrdering.items.length ? currentOrdering.items : ['', '']);
      setOrderingIds(currentOrdering.items.length ? currentOrdering.ids : ['item-1', 'item-2']);
      setAcceptedAnswers(currentAcceptedAnswers);
      setAcceptedAnswerDraft('');
      setBlankGroups(currentBlankGroups);
      setTfCorrect(trueFalseChoice?.choice_text.toLowerCase() === 'false' ? 'false' : 'true');
      setQuestionCount(data.questions.length);
      setFieldErrors({});
      setPreviewResponse({ selected_choice_id: null, selected_choice_ids: [], text_answer: '' });
      setInitialized(true);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Unable to load quiz question.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [quizId, parsedQuestionId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || saving) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const handleInternalNavigation = (event: MouseEvent) => {
      if (!isDirty || saving || event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
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
      if (window.confirm('You have unsaved changes. Leave without saving?')) navigate(nextPath);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    if (isDirty) document.addEventListener('click', handleInternalNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleInternalNavigation, true);
    };
  }, [isDirty, saving, location.hash, location.pathname, location.search, navigate]);

  function updateFieldError(name: string) {
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function changeChoice(index: number, patch: Partial<ChoiceDraft>) {
    setChoices((current) => current.map((choice, choiceIndex) =>
      choiceIndex === index ? { ...choice, ...patch } : choice
    ));
    updateFieldError('choices');
  }

  function changeQuestionType(type: string) {
    setQuestionType(type);
    setChoices(initialChoices());
    setConfig({});
    setMatchingPairs([addMatchingPair(1), addMatchingPair(2)]);
    setOrderingItems(['', '']);
    setOrderingIds(['item-1', 'item-2']);
    setAcceptedAnswers([]);
    setAcceptedAnswerDraft('');
    setBlankGroups([]);
    setPreviewResponse({ selected_choice_id: null, selected_choice_ids: [], text_answer: '' });
    setFieldErrors({});
  }

  function insertBlank() {
    const textarea = questionTextRef.current;
    const start = textarea?.selectionStart ?? questionText.length;
    const end = textarea?.selectionEnd ?? start;
    const nextText = `${questionText.slice(0, start)}${QUESTION_TEXT_MARKER}${questionText.slice(end)}`;
    setQuestionText(nextText);
    setBlankGroups((current) => [...current, []]);
    updateFieldError('blanks');
    requestAnimationFrame(() => {
      if (!textarea) return;
      const cursor = start + QUESTION_TEXT_MARKER.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function addAcceptedAnswer() {
    const value = acceptedAnswerDraft.trim();
    if (!value) return;
    if (!acceptedAnswers.includes(value)) setAcceptedAnswers((current) => [...current, value]);
    setAcceptedAnswerDraft('');
    updateFieldError('accepted_answers');
  }

  function previewQuestion(): StudentTakeQuestion {
    const maxChoiceId = choices.reduce((max, choice) => Math.max(max, choice.id ?? 0), 0);
    const studentChoices = questionType === 'true_false'
      ? [
          { id: 1, choice_text: 'True' },
          { id: 2, choice_text: 'False' },
        ]
      : choices.map((choice, index) => ({
          id: choice.id ?? maxChoiceId + index + 1,
          choice_text: choice.text || `Choice ${index + 1}`,
        }));
    let studentConfig: Record<string, unknown> = {};
    if (questionType === 'multiple_choice') {
      studentConfig = { allow_multiple: choices.filter((choice) => choice.isCorrect && choice.text.trim()).length > 1 };
    } else if (questionType === 'matching') {
      studentConfig = {
        pairs: matchingPairs.filter((pair) => pair.left.trim() && pair.right.trim()).map((pair) => ({
          id: `left:${pair.left_id}`,
          text: pair.left,
        })),
        right_options: matchingPairs.filter((pair) => pair.left.trim() && pair.right.trim()).map((pair) => ({
          id: `right:${pair.right_id}`,
          text: pair.right,
        })),
      };
    } else if (questionType === 'ordering') {
      studentConfig = {
        items: orderingItems.map((text, index) => ({
          id: `item:${orderingIds[index]}`,
          text: text || `Item ${index + 1}`,
        })),
      };
    } else if (questionType === 'fill_blank') {
      studentConfig = { answer_format: 'blanks', blank_count: blankCount };
    } else if (questionType === 'essay') {
      studentConfig = { rubric: String(config.rubric || '') };
    }
    return {
      id: parsedQuestionId ?? 0,
      order: question?.order ?? questionCount + 1,
      question_type: questionType,
      question_text: questionTextForPreview(questionText) || 'Your question will appear here.',
      marks: Number(marks) || 0,
      choices: studentChoices,
      config: studentConfig,
    };
  }

  const liveQuestion = previewQuestion();

  function updatePreviewResponse(next: Partial<StudentQuestionResponse>) {
    setPreviewResponse((current) => ({
      ...current,
      ...next,
      answer_data: next.answer_data
        ? { ...current.answer_data, ...next.answer_data }
        : current.answer_data,
    }));
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!questionText.trim()) next.question_text = 'Enter the question text.';
    if (!Number.isFinite(Number(marks)) || Number(marks) <= 0) next.marks = 'Marks must be greater than zero.';
    if (!Number.isFinite(Number(negativeMarks)) || Number(negativeMarks) < 0) next.negative_marks = 'Negative marks cannot be less than zero.';
    if (questionType === 'multiple_choice') {
      const completed = choices.filter((choice) => choice.text.trim());
      if (completed.length < 2) next.choices = 'Add at least two non-empty choices.';
      else if (!completed.some((choice) => choice.isCorrect)) next.choices = 'Mark at least one choice as correct.';
    } else if (questionType === 'matching') {
      const incomplete = matchingPairs.some((pair) => Boolean(pair.left.trim()) !== Boolean(pair.right.trim()));
      const completed = matchingPairs.filter((pair) => pair.left.trim() && pair.right.trim());
      if (incomplete) next.matching = 'Complete both sides of each pair or remove the empty row.';
      else if (completed.length < 2) next.matching = 'Add at least two complete matching pairs.';
    } else if (questionType === 'ordering') {
      const completed = orderingItems.map((item) => item.trim()).filter(Boolean);
      if (completed.length < 2 || new Set(completed.map((item) => item.toLocaleLowerCase())).size !== completed.length) {
        next.ordering = 'Add at least two distinct items in the correct order.';
      }
    } else if (questionType === 'short_answer') {
      const answers = [...acceptedAnswers, acceptedAnswerDraft.trim()].filter(Boolean);
      if (!answers.length) next.accepted_answers = 'Add at least one accepted answer.';
    } else if (questionType === 'fill_blank') {
      if (!blankCount) next.blanks = 'Insert a blank in the question text.';
      else if (blankGroups.slice(0, blankCount).some((group) => !group.some((answer) => answer.trim()))) {
        next.blanks = 'Enter at least one accepted answer for each blank.';
      }
    }
    return next;
  }

  function focusFirstError(next: Record<string, string>) {
    const order = ['question_text', 'marks', 'negative_marks', 'choices', 'matching', 'ordering', 'accepted_answers', 'blanks'];
    const field = order.find((name) => next[name]);
    if (!field) return;
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-error-field="${field}"]`);
      target?.focus();
    });
  }

  async function handleSave(mode: 'save' | 'add'): Promise<void> {
    if (!quiz || saving) return;
    const nextErrors = validate();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      focusFirstError(nextErrors);
      return;
    }

    const payload: Record<string, unknown> = {
      question_type: questionType,
      question_text: questionText.trim(),
      marks: Number(marks),
      difficulty,
      negative_marks: Number(negativeMarks),
      explanation: explanation.trim(),
      is_required: isRequired,
      tf_correct: tfCorrect,
    };
    if (questionType === 'multiple_choice') {
      const completedChoices = choices.filter((choice) => choice.text.trim());
      payload.choices = completedChoices.map((choice) => ({
        id: choice.id,
        text: choice.text.trim(),
        is_correct: choice.isCorrect,
      }));
      payload.config = { allow_multiple: completedChoices.filter((choice) => choice.isCorrect).length > 1 };
    } else if (questionType === 'true_false') {
      payload.config = {};
    } else if (questionType === 'matching') {
      const pairs = matchingPairs.filter((pair) => pair.left.trim() && pair.right.trim()).map((pair) => ({
        id: pair.id,
        left_id: pair.left_id,
        right_id: pair.right_id,
        left: pair.left.trim(),
        right: pair.right.trim(),
      }));
      payload.correct_answer = pairs.map((pair) => `${pair.left}=${pair.right}`).join('; ');
      payload.config = { pairs };
    } else if (questionType === 'ordering') {
      const rows = orderingItems.map((item, index) => ({ item: item.trim(), id: orderingIds[index] }))
        .filter((row) => row.item);
      payload.correct_answer = rows.map((row) => row.item).join('; ');
      payload.config = { items: rows.map((row) => row.item), item_ids: rows.map((row) => row.id) };
    } else if (questionType === 'short_answer') {
      const answers = [...acceptedAnswers, acceptedAnswerDraft.trim()].filter(Boolean);
      payload.correct_answer = answers.join('; ');
      payload.config = { ...config, accepted_answers: answers };
    } else if (questionType === 'fill_blank') {
      const groups = blankGroups.slice(0, blankCount).map((group) => group.map((answer) => answer.trim()).filter(Boolean));
      payload.config = { ...config, accepted_answers: [], blanks: groups };
    } else {
      payload.config = { ...config, rubric: String(config.rubric || '') };
    }

    setSaving(true);
    setError(null);
    setStatusMessage('');
    try {
      const result = await saveQuestion(quizId, mode === 'add' ? null : parsedQuestionId, payload);
      if (mode === 'add') {
        const nextCount = questionCount + 1;
        setQuestionCount(nextCount);
        setQuestion(undefined);
        setQuestionText('');
        setExplanation('');
        setChoices(initialChoices());
        setTfCorrect('true');
        setConfig({});
        setMatchingPairs([addMatchingPair(1), addMatchingPair(2)]);
        setOrderingItems(['', '']);
        setOrderingIds(['item-1', 'item-2']);
        setAcceptedAnswers([]);
        setAcceptedAnswerDraft('');
        setBlankGroups([]);
        setFieldErrors({});
        setPreviewResponse({ selected_choice_id: null, selected_choice_ids: [], text_answer: '' });
        setBaseline(null);
        setStatusMessage(`Question saved. This quiz now has ${nextCount} ${nextCount === 1 ? 'question' : 'questions'}.`);
        questionTextRef.current?.focus();
      } else {
        setBaseline(snapshot);
        navigate(`/teacher/questions/${quizId}?highlight=${result.question_id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        const answerField = questionType === 'matching' ? 'matching'
          : questionType === 'ordering' ? 'ordering'
            : questionType === 'short_answer' ? 'accepted_answers'
              : questionType === 'fill_blank' ? 'blanks'
                : questionType === 'multiple_choice' || questionType === 'true_false' ? 'choices'
                  : null;
        const fieldMap: Record<string, string | null> = {
          question_text: 'question_text',
          marks: 'marks',
          negative_marks: 'negative_marks',
          choices: 'choices',
          correct_answer: answerField,
          config: answerField,
        };
        const mapped: Record<string, string> = {};
        const unmapped: string[] = [];
        for (const [name, messages] of Object.entries(err.fields)) {
          const field = fieldMap[name];
          const message = messages[0] || err.message;
          if (field) mapped[field] = message;
          else unmapped.push(message);
        }
        if (Object.keys(mapped).length) {
          setFieldErrors((current) => ({ ...current, ...mapped }));
          focusFirstError(mapped);
        }
        setError(unmapped.length ? unmapped.join(' ') : Object.keys(mapped).length ? null : err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to save question.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner size="lg" message="Loading question editor..." />;
  if (!quiz) return <Alert variant="danger">{error || 'Quiz is unavailable.'}</Alert>;

  const typeLabel = QUESTION_TYPES.find((item) => item.value === questionType)?.label ?? questionType;
  const preview = (
    <div className="question-editor-preview__card">
      <div className="question-editor-preview__meta">
        <span className="stu-badge stu-badge--sky">Question preview</span>
        <span className="stu-badge stu-badge--muted">{liveQuestion.marks} {liveQuestion.marks === 1 ? 'mark' : 'marks'}</span>
      </div>
      <div className="stu-exam-question-text">{liveQuestion.question_text}</div>
      {(() => {
        const Player = getQuestionType(questionType).Player;
        return <Player question={liveQuestion} response={previewResponse} onChange={updatePreviewResponse} />;
      })()}
    </div>
  );

  return (
    <div className="assessment-page core-container core-space--padding-y-4 question-editor">
      <div className="core-space--margin-bottom-3">
        <Link to={`/teacher/questions/${quizId}`} className="core-text--decoration-none">&larr; Back to {quiz.title}</Link>
      </div>
      <h1 className="core-type--heading-3 core-space--margin-bottom-2">{parsedQuestionId ? 'Edit Question' : 'Add Question'}</h1>
      <p className="core-text--muted core-space--margin-bottom-4">{parsedQuestionId ? 'Update the question and check how it appears to students.' : 'Build a question and preview the student experience as you go.'}</p>
      {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
      {statusMessage && <div className="question-editor-toast" role="status" aria-live="polite">{statusMessage}</div>}

      <div className="question-editor-layout">
        <form className="question-editor-form" noValidate onSubmit={(event) => {
          event.preventDefault();
          void handleSave('save');
        }}>
          {!parsedQuestionId ? (
            <section className="core-card question-editor-section">
              <div className="core-card__body">
                <h2 className="question-editor-section__title">1. Type</h2>
                <p className="question-editor-section__hint">Choose how students will answer.</p>
                <div className="question-editor-type-grid">
                  {QUESTION_TYPES.map(({ value, label, description, icon: Icon }) => (
                    <button
                      type="button"
                      key={value}
                      className={`question-editor-type-card${questionType === value ? ' is-selected' : ''}`}
                      aria-pressed={questionType === value}
                      onClick={() => changeQuestionType(value)}
                    >
                      <Icon aria-hidden="true" size={20} />
                      <span className="question-editor-type-card__label">{label}</span>
                      <span className="question-editor-type-card__description">{description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <div className="question-editor-readonly-type">
              <span className="core-text--muted">Question type</span>
              <span className="core-badge core-surface--light core-text--dark core-border">{typeLabel}</span>
            </div>
          )}

          <section className="core-card question-editor-section">
            <div className="core-card__body">
              <h2 className="question-editor-section__title">{parsedQuestionId ? '1.' : '2.'} Question text</h2>
              <div className="question-editor-field">
                <label className="core-field__label" htmlFor="question-text">Question *</label>
                <textarea
                  ref={questionTextRef}
                  id="question-text"
                  className="core-field__input question-editor-autosize"
                  name="question_text"
                  rows={2}
                  value={questionText}
                  aria-invalid={Boolean(fieldErrors.question_text)}
                  aria-describedby={fieldErrors.question_text ? 'question-text-error' : undefined}
                  data-error-field="question_text"
                  onChange={(event) => {
                    setQuestionText(event.target.value);
                    event.currentTarget.style.height = 'auto';
                    event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
                    updateFieldError('question_text');
                  }}
                  placeholder="Write the question students will see"
                />
                {fieldErrors.question_text && <span className="question-editor-error" id="question-text-error" role="alert">{fieldErrors.question_text}</span>}
                {questionType === 'fill_blank' && (
                  <Button type="button" variant="outline-secondary" size="sm" onClick={insertBlank}>Insert blank (____)</Button>
                )}
              </div>
            </div>
          </section>

          <section className="core-card question-editor-section">
            <div className="core-card__body">
              <h2 className="question-editor-section__title">{parsedQuestionId ? '2.' : '3.'} Answer</h2>
              {questionType === 'multiple_choice' && (
                <fieldset className="question-editor-fieldset" data-error-field="choices" tabIndex={-1}>
                  <legend className="core-field__label">Answer choices</legend>
                  <p className="question-editor-section__hint">One correct choice means students select a single answer. Mark more than one correct choice to let students select several.</p>
                  {choices.map((choice, index) => (
                    <div className="question-editor-choice-row" key={choice.id ?? index}>
                      <label className="core-visually-hidden" htmlFor={`choice-${index}`}>Choice {index + 1}</label>
                      <input
                        id={`choice-${index}`}
                        className="core-field__input"
                        value={choice.text}
                        aria-invalid={Boolean(fieldErrors.choices)}
                        onChange={(event) => changeChoice(index, { text: event.target.value })}
                        placeholder={`Choice ${index + 1}`}
                      />
                      <label className="core-field__check core-space--margin-bottom-0">
                        <input className="core-field__check-input" type="checkbox" checked={choice.isCorrect} aria-invalid={Boolean(fieldErrors.choices)} onChange={(event) => changeChoice(index, { isCorrect: event.target.checked })} />
                        <span className="core-field__check-label">Correct</span>
                      </label>
                      <Button type="button" variant="outline-secondary" size="sm" aria-label={`Move choice ${index + 1} up`} disabled={index === 0} onClick={() => setChoices((current) => moveItem(current, index, -1))}><ArrowUp size={16} aria-hidden="true" /></Button>
                      <Button type="button" variant="outline-secondary" size="sm" aria-label={`Move choice ${index + 1} down`} disabled={index === choices.length - 1} onClick={() => setChoices((current) => moveItem(current, index, 1))}><ArrowDown size={16} aria-hidden="true" /></Button>
                      <Button type="button" variant="outline-danger" size="sm" aria-label={`Remove choice ${index + 1}`} disabled={choices.length <= 2} onClick={() => setChoices((current) => current.filter((_, choiceIndex) => choiceIndex !== index))}><X size={16} aria-hidden="true" /></Button>
                    </div>
                  ))}
                  {fieldErrors.choices && <span className="question-editor-error" role="alert">{fieldErrors.choices}</span>}
                  <Button type="button" variant="outline-secondary" size="sm" onClick={() => setChoices((current) => [...current, { text: '', isCorrect: false }])}>Add choice</Button>
                </fieldset>
              )}

              {questionType === 'true_false' && (
                <fieldset className="question-editor-fieldset">
                  <legend className="core-field__label">Correct answer</legend>
                  <div className="question-editor-radio-row">
                    {['true', 'false'].map((value) => (
                      <label className="core-field__check" key={value}>
                        <input className="core-field__check-input" type="radio" name="correct-true-false" value={value} checked={tfCorrect === value} onChange={() => setTfCorrect(value)} />
                        <span className="core-field__check-label core-text--capitalize">{value}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {questionType === 'matching' && (
                <fieldset className="question-editor-fieldset" data-error-field="matching" tabIndex={-1}>
                  <legend className="core-field__label">Matching pairs</legend>
                  {matchingPairs.map((pair, index) => (
                    <div className="question-editor-matching-row" key={pair.id}>
                      <label className="core-visually-hidden" htmlFor={`matching-left-${index}`}>Pair {index + 1}, left side</label>
                      <input id={`matching-left-${index}`} className="core-field__input" value={pair.left} aria-invalid={Boolean(fieldErrors.matching)} placeholder="Left item" onChange={(event) => {
                        setMatchingPairs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, left: event.target.value } : item));
                        updateFieldError('matching');
                      }} />
                      <span aria-hidden="true">↔</span>
                      <label className="core-visually-hidden" htmlFor={`matching-right-${index}`}>Pair {index + 1}, right side</label>
                      <input id={`matching-right-${index}`} className="core-field__input" value={pair.right} aria-invalid={Boolean(fieldErrors.matching)} placeholder="Right item" onChange={(event) => {
                        setMatchingPairs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, right: event.target.value } : item));
                        updateFieldError('matching');
                      }} />
                      <Button type="button" variant="outline-secondary" size="sm" aria-label={`Move pair ${index + 1} up`} disabled={index === 0} onClick={() => setMatchingPairs((current) => moveItem(current, index, -1))}><ArrowUp size={16} aria-hidden="true" /></Button>
                      <Button type="button" variant="outline-secondary" size="sm" aria-label={`Move pair ${index + 1} down`} disabled={index === matchingPairs.length - 1} onClick={() => setMatchingPairs((current) => moveItem(current, index, 1))}><ArrowDown size={16} aria-hidden="true" /></Button>
                      <Button type="button" variant="outline-danger" size="sm" aria-label={`Remove pair ${index + 1}`} disabled={matchingPairs.length <= 2} onClick={() => setMatchingPairs((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} aria-hidden="true" /></Button>
                    </div>
                  ))}
                  {fieldErrors.matching && <span className="question-editor-error" role="alert">{fieldErrors.matching}</span>}
                  <Button type="button" variant="outline-secondary" size="sm" onClick={() => setMatchingPairs((current) => [...current, addMatchingPair(current.length + 1)])}>Add pair</Button>
                </fieldset>
              )}

              {questionType === 'ordering' && (
                <fieldset className="question-editor-fieldset" data-error-field="ordering" tabIndex={-1}>
                  <legend className="core-field__label">Correct order</legend>
                  {orderingItems.map((item, index) => (
                    <div className="question-editor-order-row" key={orderingIds[index]}>
                      <span className="question-editor-order-row__number">{index + 1}</span>
                      <label className="core-visually-hidden" htmlFor={`ordering-item-${index}`}>Correct order, item {index + 1}</label>
                      <input id={`ordering-item-${index}`} className="core-field__input" value={item} aria-invalid={Boolean(fieldErrors.ordering)} placeholder={`Item ${index + 1}`} onChange={(event) => {
                        setOrderingItems((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value));
                        updateFieldError('ordering');
                      }} />
                      <Button type="button" variant="outline-secondary" size="sm" aria-label={`Move item ${index + 1} up`} disabled={index === 0} onClick={() => {
                        setOrderingItems((current) => moveItem(current, index, -1));
                        setOrderingIds((current) => moveItem(current, index, -1));
                      }}><ArrowUp size={16} aria-hidden="true" /></Button>
                      <Button type="button" variant="outline-secondary" size="sm" aria-label={`Move item ${index + 1} down`} disabled={index === orderingItems.length - 1} onClick={() => {
                        setOrderingItems((current) => moveItem(current, index, 1));
                        setOrderingIds((current) => moveItem(current, index, 1));
                      }}><ArrowDown size={16} aria-hidden="true" /></Button>
                      <Button type="button" variant="outline-danger" size="sm" aria-label={`Remove item ${index + 1}`} disabled={orderingItems.length <= 2} onClick={() => {
                        setOrderingItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
                        setOrderingIds((current) => current.filter((_, itemIndex) => itemIndex !== index));
                      }}><X size={16} aria-hidden="true" /></Button>
                    </div>
                  ))}
                  {fieldErrors.ordering && <span className="question-editor-error" role="alert">{fieldErrors.ordering}</span>}
                  <Button type="button" variant="outline-secondary" size="sm" onClick={() => {
                    setOrderingItems((current) => [...current, '']);
                    setOrderingIds((current) => [...current, `item-${Date.now()}`]);
                  }}>Add item</Button>
                </fieldset>
              )}

              {questionType === 'short_answer' && (
                <div className="question-editor-field" data-error-field="accepted_answers">
                  <label className="core-field__label" htmlFor="accepted-answer-input">Accepted answers</label>
                  <p className="question-editor-section__hint">Press Enter to add each accepted answer. Existing case-sensitivity rules are preserved.</p>
                  <div className="question-editor-chip-list">
                    {acceptedAnswers.map((answer, index) => (
                      <span className="question-editor-chip" key={`${answer}-${index}`}>
                        {answer}
                        <button type="button" aria-label={`Remove accepted answer ${answer}`} onClick={() => setAcceptedAnswers((current) => current.filter((_, answerIndex) => answerIndex !== index))}><X size={14} aria-hidden="true" /></button>
                      </span>
                    ))}
                  </div>
                  <input id="accepted-answer-input" className="core-field__input" value={acceptedAnswerDraft} aria-invalid={Boolean(fieldErrors.accepted_answers)} onChange={(event) => setAcceptedAnswerDraft(event.target.value)} onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addAcceptedAnswer();
                    }
                  }} placeholder="Type an answer and press Enter" />
                  {fieldErrors.accepted_answers && <span className="question-editor-error" role="alert">{fieldErrors.accepted_answers}</span>}
                </div>
              )}

              {questionType === 'fill_blank' && (
                <fieldset className="question-editor-fieldset" data-error-field="blanks" tabIndex={-1}>
                  <legend className="core-field__label">Accepted answers for each blank</legend>
                  <p className="question-editor-section__hint">Separate accepted alternatives with a vertical bar ( | ).</p>
                  {Array.from({ length: blankCount }, (_, index) => (
                    <div className="question-editor-field" key={index}>
                      <label className="core-field__label" htmlFor={`blank-answer-${index}`}>Blank {index + 1}</label>
                      <input id={`blank-answer-${index}`} className="core-field__input" value={(blankGroups[index] || []).join(' | ')} aria-invalid={Boolean(fieldErrors.blanks)} onChange={(event) => {
                        const answers = event.target.value.split('|').map((answer) => answer.trim()).filter(Boolean);
                        setBlankGroups((current) => Array.from({ length: Math.max(current.length, blankCount) }, (_, groupIndex) =>
                          groupIndex === index ? answers : current[groupIndex] || []
                        ));
                        updateFieldError('blanks');
                      }} placeholder="Answer | alternative" />
                    </div>
                  ))}
                  {fieldErrors.blanks && <span className="question-editor-error" role="alert">{fieldErrors.blanks}</span>}
                </fieldset>
              )}

              {questionType === 'essay' && (
                <div className="question-editor-field">
                  <label className="core-field__label" htmlFor="question-rubric">Grading rubric</label>
                  <textarea id="question-rubric" className="core-field__input" rows={3} value={String(config.rubric || '')} onChange={(event) => setConfig((current) => ({ ...current, rubric: event.target.value }))} />
                </div>
              )}
            </div>
          </section>

          <section className="core-card question-editor-section">
            <div className="core-card__body">
              <h2 className="question-editor-section__title">{parsedQuestionId ? '3.' : '4.'} Scoring</h2>
              <div className="question-editor-scoring-grid">
                <div className="question-editor-field">
                  <label className="core-field__label" htmlFor="question-marks">Marks *</label>
                  <input id="question-marks" className="core-field__input" type="number" min="0.1" step="any" value={marks} aria-invalid={Boolean(fieldErrors.marks)} aria-describedby={fieldErrors.marks ? 'question-marks-error' : undefined} data-error-field="marks" onChange={(event) => {
                    setMarks(event.target.value);
                    updateFieldError('marks');
                  }} />
                  {fieldErrors.marks && <span className="question-editor-error" id="question-marks-error" role="alert">{fieldErrors.marks}</span>}
                </div>
                <div className="question-editor-field">
                  <label className="core-field__label" htmlFor="negative-marks">Negative marks</label>
                  <input id="negative-marks" className="core-field__input" type="number" min="0" step="any" value={negativeMarks} aria-invalid={Boolean(fieldErrors.negative_marks)} aria-describedby={fieldErrors.negative_marks ? 'negative-marks-error' : undefined} data-error-field="negative_marks" onChange={(event) => {
                    setNegativeMarks(event.target.value);
                    updateFieldError('negative_marks');
                  }} />
                  {fieldErrors.negative_marks && <span className="question-editor-error" id="negative-marks-error" role="alert">{fieldErrors.negative_marks}</span>}
                </div>
                <div className="question-editor-field">
                  <label className="core-field__label" htmlFor="question-difficulty">Difficulty</label>
                  <select id="question-difficulty" className="core-field__select" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                    <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                  </select>
                </div>
                <label className="core-field__check question-editor-required">
                  <input className="core-field__check-input" type="checkbox" checked={isRequired} onChange={(event) => setIsRequired(event.target.checked)} />
                  <span className="core-field__check-label">Required question</span>
                </label>
              </div>
            </div>
          </section>

          <details className="core-card question-editor-section question-editor-advanced">
            <summary className="core-card__body question-editor-advanced__summary">
              <span>
                <span className="question-editor-section__title">{parsedQuestionId ? '4.' : '5.'} Feedback</span>
                <span className="question-editor-section__hint">Advanced · explanation shown with answer feedback</span>
              </span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="core-card__body question-editor-advanced__body">
              <label className="core-field__label" htmlFor="question-explanation">Explanation</label>
              <textarea id="question-explanation" className="core-field__input" rows={3} value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Explain why the answer is correct" />
            </div>
          </details>

          <div className="question-editor-footer">
            <Link to={`/teacher/questions/${quizId}`} className="core-button core-button--outline-secondary">Cancel</Link>
            {!parsedQuestionId && <Button type="button" variant="outline-secondary" loading={saving} onClick={() => void handleSave('add')}>Save and add another</Button>}
            <Button type="submit" loading={saving}>Save</Button>
          </div>
        </form>

        <aside className="question-editor-preview question-editor-preview--desktop" aria-label="Live student preview">
          <h2 className="question-editor-section__title">Student preview</h2>
          <p className="question-editor-section__hint">This uses the same answer control students see.</p>
          {preview}
        </aside>
      </div>

      <details className="question-editor-preview-mobile">
        <summary>Preview as a student</summary>
        <div className="question-editor-preview-mobile__body">
          {preview}
        </div>
      </details>
    </div>
  );
};
