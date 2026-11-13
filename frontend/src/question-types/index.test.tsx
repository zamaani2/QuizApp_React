import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  getQuestionType,
  isQuestionAnswered,
} from './index';
import type { StudentQuestionResponse, StudentTakeQuestion } from '../types/student';

const emptyResponse: StudentQuestionResponse = {
  selected_choice_id: null,
  selected_choice_ids: [],
  text_answer: '',
};

describe('question type registry', () => {
  it('renders multiple-correct choices as a checkbox group', () => {
    const onChange = vi.fn();
    const Player = getQuestionType('multiple_choice').Player;
    const question: StudentTakeQuestion = {
      id: 1,
      order: 1,
      question_type: 'multiple_choice',
      question_text: 'Select all that apply',
      marks: 2,
      config: { allow_multiple: true },
      choices: [{ id: 10, choice_text: 'First' }, { id: 20, choice_text: 'Second' }],
    };

    render(<Player question={question} response={emptyResponse} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'First' }));

    expect(onChange).toHaveBeenCalledWith({
      selected_choice_id: null,
      selected_choice_ids: [10],
      answer_data: { choice_ids: [10] },
    });
  });

  it('saves matching selections and exposes keyboard-operable controls', () => {
    const onChange = vi.fn();
    const Player = getQuestionType('matching').Player;
    const question: StudentTakeQuestion = {
      id: 2,
      order: 1,
      question_type: 'matching',
      question_text: 'Match each item',
      marks: 2,
      choices: [],
      config: {
        pairs: [{ id: 'left:a', text: 'A' }],
        right_options: [{ id: 'right:x', text: 'X' }],
      },
    };

    render(<Player question={question} response={emptyResponse} onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Match items' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Match for A' }), {
      target: { value: 'right:x' },
    });

    expect(onChange).toHaveBeenCalledWith({
      answer_data: { matches: { 'left:a': 'right:x' } },
    });
    expect(isQuestionAnswered('matching', {
      ...emptyResponse,
      answer_data: { matches: { 'left:a': 'right:x' } },
    })).toBe(true);
  });

  it('renders fill-in-the-blank answers as separate labelled fields', () => {
    const Player = getQuestionType('fill_blank').Player;
    const question: StudentTakeQuestion = {
      id: 4,
      order: 1,
      question_type: 'fill_blank',
      question_text: 'Complete the sentence',
      marks: 2,
      choices: [],
      config: { blank_count: 2 },
    };

    render(<Player question={question} response={emptyResponse} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Blank 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Blank 2')).toBeInTheDocument();
  });

  it('reorders items using focusable move buttons', () => {
    const onChange = vi.fn();
    const Player = getQuestionType('ordering').Player;
    const question: StudentTakeQuestion = {
      id: 3,
      order: 1,
      question_type: 'ordering',
      question_text: 'Order the steps',
      marks: 2,
      choices: [],
      config: {
        items: [
          { id: 'item:0', text: 'First' },
          { id: 'item:1', text: 'Second' },
        ],
      },
    };

    render(<Player question={question} response={emptyResponse} onChange={onChange} />);
    expect(screen.getByRole('list', { name: 'Reorder items' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move Second up' }));

    expect(onChange).toHaveBeenCalledWith({
      answer_data: { items: ['item:1', 'item:0'] },
    });
  });
});
