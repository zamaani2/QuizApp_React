import React from 'react';
import './review.css';
import type {
  StudentQuestionResponse,
  StudentReviewChoice,
  StudentTakeQuestion,
} from '../types/student';

export type QuestionConfig = Record<string, unknown>;

export interface QuestionTypeEditorProps {
  questionType: string;
  config: QuestionConfig;
  onChange: (config: QuestionConfig) => void;
  answerKey: string;
  onAnswerKeyChange: (value: string) => void;
}

export interface QuestionTypePlayerProps {
  question: StudentTakeQuestion;
  response: StudentQuestionResponse;
  onChange: (response: Partial<StudentQuestionResponse>, persist?: boolean) => void;
}

export interface QuestionTypeReviewProps {
  answer: unknown;
  correctAnswer: unknown;
  choices?: StudentReviewChoice[];
  showCorrectAnswers?: boolean;
}

interface QuestionTypeDefinition {
  Editor: React.FC<QuestionTypeEditorProps>;
  Player: React.FC<QuestionTypePlayerProps>;
  Review: React.FC<QuestionTypeReviewProps>;
  isAnswered: (response: StudentQuestionResponse) => boolean;
}

const ChoiceEditor: React.FC<QuestionTypeEditorProps> = ({ config, onChange }) => (
  <label className="core-field__check core-space--margin-top-2">
    <input className="core-field__check-input" type="checkbox"
      checked={config.allow_multiple === true}
      onChange={(event) => onChange({ ...config, allow_multiple: event.target.checked })} />
    <span className="core-field__check-label">Allow multiple answers</span>
  </label>
);

const AnswerKeyEditor: React.FC<QuestionTypeEditorProps> = ({
  questionType,
  config,
  onChange,
  answerKey,
  onAnswerKeyChange,
}) => {
  if (questionType === 'true_false') return null;
  if (questionType === 'essay') {
    return (
      <div className="core-grid__span-12">
        <label className="core-field__label" htmlFor="question-rubric">Grading rubric</label>
        <textarea id="question-rubric" className="core-field__input" rows={3}
          value={String(config.rubric || '')}
          onChange={(event) => onChange({ ...config, rubric: event.target.value })} />
      </div>
    );
  }
  const label = questionType === 'matching'
    ? 'Pairs (one left=right pair per line)'
    : questionType === 'ordering'
      ? 'Items in the correct order'
      : questionType === 'fill_blank'
        ? 'Answers per blank (one line per blank; separate alternatives with |)'
        : 'Accepted answer(s)';
  return (
    <div className="core-grid__span-12">
      <label className="core-field__label" htmlFor="question-answer">{label}</label>
      <textarea id="question-answer" className="core-field__input" rows={3}
        name="correct_answer"
        required={questionType === 'matching' || questionType === 'ordering'
          || questionType === 'short_answer' || questionType === 'fill_blank'}
        value={answerKey} onChange={(event) => onAnswerKeyChange(event.target.value)} />
    </div>
  );
};

const EmptyEditor: React.FC<QuestionTypeEditorProps> = () => null;
const hasReviewValue = (value: unknown) =>
  value !== null
  && value !== undefined
  && !(typeof value === 'string' && !value.trim())
  && !(Array.isArray(value) && value.length === 0);

const ChoicePlayer: React.FC<QuestionTypePlayerProps> = ({
  question,
  response,
  onChange,
}) => {
  const multiple = question.config?.allow_multiple === true;
  const answerIds = response.answer_data?.choice_ids;
  const selectedIds = Array.isArray(answerIds)
    ? answerIds.map(Number)
    : response.selected_choice_ids?.length
      ? response.selected_choice_ids
      : response.selected_choice_id === null ? [] : [response.selected_choice_id];

  return (
    <div
      className="core-display-flex core-layout--column"
      role={multiple ? 'group' : 'radiogroup'}
      aria-label="Answer options"
    >
      {question.choices.map((choice) => {
        const selected = selectedIds.includes(choice.id);
        const control = (
          <input
            type={multiple ? 'checkbox' : 'radio'}
            name={`question_${question.id}`}
            value={choice.id}
            checked={selected}
            onChange={(event) => {
              const nextIds = multiple
                ? event.target.checked
                  ? [...selectedIds, choice.id]
                  : selectedIds.filter((id) => id !== choice.id)
                : [choice.id];
              onChange({
                selected_choice_id: multiple ? null : choice.id,
                selected_choice_ids: nextIds,
                answer_data: { choice_ids: nextIds },
              });
            }}
            className="stu-exam-choice__input"
            aria-label={choice.choice_text}
          />
        );
        return (
          <label
            key={choice.id}
            className={`stu-exam-choice ${selected ? 'stu-exam-choice--selected' : ''}`}
          >
            {control}
            <span className="stu-exam-choice__label">{choice.choice_text}</span>
          </label>
        );
      })}
    </div>
  );
};

const TextPlayer: React.FC<QuestionTypePlayerProps> = ({ question, response, onChange }) => {
  const text = response.answer_data?.text;
  const blankCount = Number(question.config?.blank_count || 0);
  if (question.question_type === 'fill_blank' && blankCount > 0) {
    const answers = Array.isArray(text) ? text : [];
    return (
      <div className="stu-exam-fill-blank">
        {Array.from({ length: blankCount }, (_, index) => (
          <label key={index} className="stu-exam-fill-blank__field">
            <span>Blank {index + 1}</span>
            <input className="core-field__input" value={answers[index] || ''}
              onChange={(event) => {
                const next = Array.from({ length: blankCount }, (_, itemIndex) =>
                  itemIndex === index ? event.target.value : answers[itemIndex] || ''
                );
                onChange({ answer_data: { text: next } }, false);
              }}
              onBlur={(event) => {
                const next = Array.from({ length: blankCount }, (_, itemIndex) =>
                  itemIndex === index ? event.target.value : answers[itemIndex] || ''
                );
                onChange({ answer_data: { text: next } });
              }} />
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className="stu-exam-text-answer">
      <label htmlFor={`answer-${question.id}`} className="stu-exam-text-answer__label">
        {question.question_type === 'essay' ? 'Write your response:' : 'Type your response:'}
      </label>
      <textarea
        id={`answer-${question.id}`}
        className="core-field__input stu-exam-text-answer__input"
        rows={question.question_type === 'essay' ? 8 : 3}
        value={typeof text === 'string' ? text : response.text_answer || ''}
        onChange={(event) => onChange({
          text_answer: event.target.value,
          answer_data: { text: event.target.value },
        }, false)}
        onBlur={(event) => onChange({
          text_answer: event.target.value,
          answer_data: { text: event.target.value },
        })}
      />
    </div>
  );
};

const MatchingPlayer: React.FC<QuestionTypePlayerProps> = ({ question, response, onChange }) => {
  const pairs = question.config?.pairs;
  const options = question.config?.right_options;
  if (!Array.isArray(pairs) || !Array.isArray(options)) return null;
  const current = response.answer_data?.matches;
  const matches: Record<string, string> = current && typeof current === 'object'
    ? { ...current }
    : {};
  if (!Object.keys(matches).length && response.text_answer) {
    const leftIdsByText = new Map(
      pairs.map((pair) => {
        const item = pair as { id: string; text: string };
        return [item.text.trim().toLocaleLowerCase(), item.id] as const;
      })
    );
    const rightIdsByText = new Map(
      options.map((option) => {
        const item = option as { id: string; text: string };
        return [item.text.trim().toLocaleLowerCase(), item.id] as const;
      })
    );
    for (const pair of response.text_answer.split(';')) {
      const [leftValue = '', rightValue = ''] = pair.split('=');
      const leftId = leftIdsByText.get(leftValue.trim().toLocaleLowerCase())
        || (pairs.some((item) => (item as { id: string }).id === leftValue.trim()) ? leftValue.trim() : '');
      const rightId = rightIdsByText.get(rightValue.trim().toLocaleLowerCase())
        || (options.some((item) => (item as { id: string }).id === rightValue.trim()) ? rightValue.trim() : '');
      if (leftId && rightId) matches[leftId] = rightId;
    }
  }

  return (
    <div className="stu-exam-matching" role="group" aria-label="Match items">
      {pairs.map((pair) => {
        const item = pair as { id: string; text: string };
        return (
          <div key={item.id} className="stu-exam-matching__row">
            <span className="stu-exam-matching__prompt">{item.text}</span>
            <select
              className="core-field__select stu-exam-matching__select"
              aria-label={`Match for ${item.text}`}
              value={matches[item.id] || ''}
              onChange={(event) => onChange({
                answer_data: {
                  matches: { ...matches, [item.id]: event.target.value },
                },
              })}
            >
              <option value="">Select a match</option>
              {options.map((option) => {
                const right = option as { id: string; text: string };
                const usedByAnotherPair = Object.entries(matches).some(
                  ([leftId, rightId]) => leftId !== item.id && rightId === right.id
                );
                return (
                  <option
                    key={right.id}
                    value={right.id}
                    disabled={usedByAnotherPair}
                  >
                    {right.text}
                  </option>
                );
              })}
            </select>
          </div>
        );
      })}
    </div>
  );
};

const OrderingPlayer: React.FC<QuestionTypePlayerProps> = ({ question, response, onChange }) => {
  const configItems = Array.isArray(question.config?.items)
    ? question.config.items as { id: string; text: string }[]
    : [];
  const savedItems = response.answer_data?.items;
  const restoredItems = () => {
    if (Array.isArray(savedItems)) return savedItems;
    if (response.text_answer) {
      const idsByText = new Map(configItems.map((item) => [
        item.text.trim().toLocaleLowerCase(),
        item.id,
      ] as const));
      return response.text_answer.split(';').map((item) => item.trim()).map((value) =>
        configItems.some((item) => item.id === value)
          ? value
          : idsByText.get(value.toLocaleLowerCase())
      ).filter((item): item is string => Boolean(item));
    }
    return configItems.map((item) => item.id);
  };
  const [items, setItems] = React.useState<string[]>(restoredItems);

  React.useEffect(() => {
    setItems(restoredItems());
  }, [question.id, response.answer_data, question.config, response.text_answer]);

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    onChange({ answer_data: { items: next } });
  };
  const labels = new Map(configItems.map((item) => [item.id, item.text]));

  return (
    <ol aria-label="Reorder items" className="stu-exam-ordering">
      {items.map((itemId, index) => (
        <li key={itemId} className="stu-exam-ordering__item">
          <span className="stu-exam-ordering__label">{labels.get(itemId) || itemId}</span>
          <div className="stu-exam-ordering__actions">
            <button type="button" className="stu-btn-outline"
              aria-label={`Move ${labels.get(itemId) || itemId} up`}
              disabled={index === 0} onClick={() => move(index, -1)}>Move up</button>
            <button type="button" className="stu-btn-outline"
              aria-label={`Move ${labels.get(itemId) || itemId} down`}
              disabled={index === items.length - 1} onClick={() => move(index, 1)}>Move down</button>
          </div>
        </li>
      ))}
    </ol>
  );
};

const DefaultReview: React.FC<QuestionTypeReviewProps> = ({ answer, correctAnswer }) => (
  <div className="question-review">
    <p className="question-review__answer"><strong className="question-review__label">Your answer:</strong> {formatAnswer(answer)}</p>
    {hasReviewValue(correctAnswer) && (
      <p className="question-review__answer"><strong className="question-review__label">Correct answer:</strong> {formatAnswer(correctAnswer)}</p>
    )}
  </div>
);

const ChoiceReview: React.FC<QuestionTypeReviewProps> = ({
  answer,
  correctAnswer,
  choices = [],
  showCorrectAnswers = false,
}) => {
  if (!choices.length) {
    return <DefaultReview answer={answer} correctAnswer={correctAnswer} />;
  }
  return (
    <div className="question-review question-review--choices">
      {choices.map((choice) => {
        const choiceState = choice.is_selected && choice.is_correct === true
          ? 'question-review__choice--selected-correct'
          : choice.is_selected && choice.is_correct === false
            ? 'question-review__choice--selected-incorrect'
            : showCorrectAnswers && choice.is_correct === true
              ? 'question-review__choice--correct'
              : '';
        return (
          <div key={choice.id} className={`question-review__choice ${choiceState}`}>
            <span>{choice.choice_text}</span>
            <div className="question-review__badges">
              {choice.is_selected && <span className="question-review__badge question-review__badge--muted">Your answer</span>}
              {showCorrectAnswers && choice.is_correct && <span className="question-review__badge question-review__badge--success">Correct answer</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const MatchingReview: React.FC<QuestionTypeReviewProps> = ({ answer, correctAnswer }) => {
  const rows = Array.isArray(answer) ? answer as { left: string; right: string }[] : [];
  const correctRows = Array.isArray(correctAnswer)
    ? correctAnswer as { left: string; right: string }[]
    : [];
  if (!rows.length && !correctRows.length) {
    return <DefaultReview answer={answer} correctAnswer={correctAnswer} />;
  }
  return (
    <div className="question-review">
      <p className="question-review__label">Your matches:</p>
      {rows.length ? (
        <ul className="question-review__list">{rows.map((pair, index) => <li key={`${pair.left}-${index}`}>{pair.left} <span aria-hidden="true">→</span> {pair.right || 'No match'}</li>)}</ul>
      ) : <p className="question-review__answer">No matches submitted.</p>}
      {hasReviewValue(correctAnswer) && (
        <>
          <p className="question-review__label">Correct matches:</p>
          <ul className="question-review__list">{correctRows.map((pair, index) => <li key={`${pair.left}-${index}`}>{pair.left} <span aria-hidden="true">→</span> {pair.right}</li>)}</ul>
        </>
      )}
    </div>
  );
};

const OrderingReview: React.FC<QuestionTypeReviewProps> = ({ answer, correctAnswer }) => (
  <div className="question-review">
    <p className="question-review__label">Your order:</p>
    {Array.isArray(answer) ? <ol className="question-review__list">{answer.map((item, index) => <li key={index}>{formatAnswer(item)}</li>)}</ol> : <p className="question-review__answer">{formatAnswer(answer)}</p>}
    {hasReviewValue(correctAnswer) && (
      <>
        <p className="question-review__label">Correct order:</p>
        {Array.isArray(correctAnswer)
          ? <ol className="question-review__list">{correctAnswer.map((item, index) => <li key={index}>{formatAnswer(item)}</li>)}</ol>
          : <p className="question-review__answer">{formatAnswer(correctAnswer)}</p>}
      </>
    )}
  </div>
);

function formatAnswer(value: unknown): string {
  if (typeof value === 'string') return value || 'No answer';
  if (Array.isArray(value)) return value.map(formatAnswer).join(', ') || 'No answer';
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${formatAnswer(item)}`).join('; ') || 'No answer';
  }
  return 'No answer';
}

const textAnswered = (response: StudentQuestionResponse) => {
  const answer = response.answer_data?.text;
  return typeof answer === 'string'
    ? answer.trim().length > 0
    : Array.isArray(answer) ? answer.some((item) => String(item).trim()) : Boolean(response.text_answer?.trim());
};
const choiceAnswered = (response: StudentQuestionResponse) =>
  Boolean(response.selected_choice_id !== null
    || response.selected_choice_ids?.length
    || response.answer_data?.choice_ids?.length);
const matchingAnswered = (response: StudentQuestionResponse) => {
  const matches = response.answer_data?.matches;
  return Boolean(matches && typeof matches === 'object'
    && Object.values(matches as Record<string, string>).some(Boolean));
};
const orderingAnswered = (response: StudentQuestionResponse) =>
  Array.isArray(response.answer_data?.items) && response.answer_data.items.length > 0;

export const questionTypeRegistry: Record<string, QuestionTypeDefinition> = {
  multiple_choice: {
    Editor: ChoiceEditor,
    Player: ChoicePlayer,
    Review: ChoiceReview,
    isAnswered: choiceAnswered,
  },
  true_false: {
    Editor: EmptyEditor,
    Player: ChoicePlayer,
    Review: ChoiceReview,
    isAnswered: choiceAnswered,
  },
  short_answer: {
    Editor: AnswerKeyEditor,
    Player: TextPlayer,
    Review: DefaultReview,
    isAnswered: textAnswered,
  },
  fill_blank: {
    Editor: AnswerKeyEditor,
    Player: TextPlayer,
    Review: DefaultReview,
    isAnswered: textAnswered,
  },
  matching: {
    Editor: AnswerKeyEditor,
    Player: MatchingPlayer,
    Review: MatchingReview,
    isAnswered: matchingAnswered,
  },
  ordering: {
    Editor: AnswerKeyEditor,
    Player: OrderingPlayer,
    Review: OrderingReview,
    isAnswered: orderingAnswered,
  },
  essay: {
    Editor: AnswerKeyEditor,
    Player: TextPlayer,
    Review: DefaultReview,
    isAnswered: textAnswered,
  },
};

export function getQuestionType(type: string): QuestionTypeDefinition {
  const definition = questionTypeRegistry[type];
  if (!definition) {
    throw new Error(`Unsupported question type: ${type}`);
  }
  return definition;
}

export function isQuestionAnswered(type: string, response: StudentQuestionResponse): boolean {
  return getQuestionType(type).isAnswered(response);
}
