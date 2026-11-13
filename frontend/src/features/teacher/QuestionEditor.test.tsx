import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QuestionEditor } from './QuestionEditor';
import type { QuestionDetailItem, QuizDetailData } from '../../types';

let savedQuestion: QuestionDetailItem | undefined;
let nextQuestionId = 40;

const quizBase = {
  id: 5,
  title: 'Biology quiz',
  description: '',
  subject_name: 'Biology',
  academic_year: '2026',
  term: 'Term 1',
  status: 'draft',
  duration_minutes: 30,
  pass_percentage: 50,
  max_attempts: 1,
  total_questions: 0,
  total_marks: 0,
  total_attempts: 0,
  assigned_classes: [],
  questions: [],
} as QuizDetailData;

function response(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200 });
}

function mountEditor(path = '/teacher/questions/5/new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/teacher/questions/:quizId/new" element={<QuestionEditor />} />
        <Route path="/teacher/questions/:quizId/:questionId/edit" element={<QuestionEditor />} />
        <Route path="/teacher/questions/:quizId" element={<div data-testid="questions-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

function postPayload(): Record<string, unknown> {
  const call = [...vi.mocked(global.fetch).mock.calls].reverse().find(([, options]) => options?.method === 'POST');
  if (!call) throw new Error('Question save request was not sent.');
  return JSON.parse(String(call[1]?.body)) as Record<string, unknown>;
}

beforeEach(() => {
  savedQuestion = undefined;
  nextQuestionId = 40;
  global.fetch = vi.fn(async (_input, init) => {
    if (init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
      const id = nextQuestionId++;
      const payloadChoices = Array.isArray(payload.choices)
        ? payload.choices as { id?: number; text: string; is_correct: boolean }[]
        : [];
      const savedChoices = payload.question_type === 'true_false'
        ? [
            { id: 1, choice_text: 'True', is_correct: payload.tf_correct === 'true' },
            { id: 2, choice_text: 'False', is_correct: payload.tf_correct === 'false' },
          ]
        : payloadChoices.map((choice, index) => ({
            id: choice.id ?? index + 1,
            choice_text: choice.text,
            is_correct: choice.is_correct,
          }));
      savedQuestion = {
        id,
        question_type: String(payload.question_type),
        question_text: String(payload.question_text),
        marks: Number(payload.marks),
        order: 1,
        difficulty: String(payload.difficulty) as QuestionDetailItem['difficulty'],
        negative_marks: Number(payload.negative_marks),
        is_required: Boolean(payload.is_required),
        explanation: String(payload.explanation),
        correct_answer_text: String(payload.correct_answer || ''),
        config: payload.config as Record<string, unknown>,
        choices: savedChoices,
      };
      return response({ success: true, question_id: id, message: 'Saved' });
    }
    return response({
      ...quizBase,
      questions: savedQuestion ? [savedQuestion] : [],
    });
  });
  vi.spyOn(window, 'confirm').mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('QuestionEditor', () => {
  it('shows inline validation, focuses the first invalid field, and uses the student player in preview', async () => {
    mountEditor();
    expect(await screen.findByRole('heading', { name: 'Add Question' })).toBeInTheDocument();
    expect(screen.getAllByRole('radiogroup', { name: 'Answer options' }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter the question text.')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Question *')));
    expect(screen.getByText('Add at least two non-empty choices.')).toBeInTheDocument();
  });

  it('saves and reloads structured matching pairs', async () => {
    const view = mountEditor();
    await screen.findByRole('heading', { name: 'Add Question' });
    fireEvent.click(screen.getByRole('button', { name: /Matching/ }));
    fireEvent.change(screen.getByLabelText('Question *'), { target: { value: 'Match each item' } });
    fireEvent.change(screen.getByLabelText('Pair 1, left side'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Pair 1, right side'), { target: { value: 'One' } });
    fireEvent.change(screen.getByLabelText('Pair 2, left side'), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText('Pair 2, right side'), { target: { value: 'Two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postPayload().config).toMatchObject({
      pairs: [
        { left: 'A', right: 'One' },
        { left: 'B', right: 'Two' },
      ],
    }));
    expect(postPayload().correct_answer).toBe('A=One; B=Two');

    view.unmount();
    mountEditor('/teacher/questions/5/40/edit');
    expect(await screen.findByLabelText('Pair 1, left side')).toHaveValue('A');
    expect(screen.getByLabelText('Pair 2, right side')).toHaveValue('Two');
  });

  it('saves ordering inputs in their correct order and preserves accepted-answer chips', async () => {
    const view = mountEditor();
    await screen.findByRole('heading', { name: 'Add Question' });
    fireEvent.click(screen.getByRole('button', { name: /Ordering/ }));
    fireEvent.change(screen.getByLabelText('Question *'), { target: { value: 'Order the steps' } });
    fireEvent.change(screen.getByLabelText('Correct order, item 1'), { target: { value: 'Second' } });
    fireEvent.change(screen.getByLabelText('Correct order, item 2'), { target: { value: 'First' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move item 1 down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postPayload().config).toMatchObject({
      items: ['First', 'Second'],
      item_ids: expect.any(Array),
    }));
    expect(postPayload().correct_answer).toBe('First; Second');
    view.unmount();
    mountEditor('/teacher/questions/5/40/edit');
    expect(await screen.findByLabelText('Correct order, item 1')).toHaveValue('First');
    expect(screen.getByLabelText('Correct order, item 2')).toHaveValue('Second');
  });

  it('saves short-answer chips and fill-in-the-blank groups in API config shapes', async () => {
    const view = mountEditor();
    await screen.findByRole('heading', { name: 'Add Question' });
    fireEvent.click(screen.getByRole('button', { name: /Short answer/ }));
    fireEvent.change(screen.getByLabelText('Question *'), { target: { value: 'Name this animal' } });
    fireEvent.change(screen.getByLabelText('Accepted answers'), { target: { value: 'Cat' } });
    fireEvent.keyDown(screen.getByLabelText('Accepted answers'), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Accepted answers'), { target: { value: 'Feline' } });
    fireEvent.keyDown(screen.getByLabelText('Accepted answers'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(postPayload().config).toMatchObject({ accepted_answers: ['Cat', 'Feline'] }));
    view.unmount();
    mountEditor('/teacher/questions/5/40/edit');
    expect(await screen.findByText('Cat')).toBeInTheDocument();
    expect(screen.getByText('Feline')).toBeInTheDocument();

    cleanup();
    savedQuestion = undefined;
    const fillView = mountEditor();
    await screen.findByRole('heading', { name: 'Add Question' });
    fireEvent.click(screen.getByRole('button', { name: /Fill in the blank/ }));
    fireEvent.change(screen.getByLabelText('Question *'), { target: { value: 'The sky is' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert blank (____)' }));
    fireEvent.change(document.getElementById('blank-answer-0') as HTMLInputElement, { target: { value: 'blue | azure' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postPayload().config).toMatchObject({ blanks: [['blue', 'azure']] }));
    fillView.unmount();
    mountEditor('/teacher/questions/5/41/edit');
    expect(await screen.findByDisplayValue('blue | azure')).toBeInTheDocument();
  });

  it('saves the correct choice mode, true/false answer, and essay rubric', async () => {
    mountEditor();
    await screen.findByRole('heading', { name: 'Add Question' });
    fireEvent.change(screen.getByLabelText('Question *'), { target: { value: 'Select all correct answers' } });
    fireEvent.change(document.getElementById('choice-0') as HTMLInputElement, { target: { value: 'Answer A' } });
    fireEvent.change(document.getElementById('choice-1') as HTMLInputElement, { target: { value: 'Answer B' } });
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(postPayload().config).toMatchObject({ allow_multiple: true }));

    cleanup();
    savedQuestion = undefined;
    mountEditor();
    await screen.findByRole('heading', { name: 'Add Question' });
    fireEvent.click(screen.getByRole('button', { name: /True \/ False/ }));
    fireEvent.change(screen.getByLabelText('Question *'), { target: { value: 'The earth orbits the sun.' } });
    fireEvent.click(document.querySelector('input[name="correct-true-false"][value="false"]') as HTMLInputElement);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(postPayload().tf_correct).toBe('false'));

    cleanup();
    savedQuestion = undefined;
    mountEditor();
    await screen.findByRole('heading', { name: 'Add Question' });
    fireEvent.click(screen.getByRole('button', { name: /Essay/ }));
    fireEvent.change(screen.getByLabelText('Question *'), { target: { value: 'Explain your reasoning.' } });
    fireEvent.change(screen.getByLabelText('Grading rubric'), { target: { value: 'Award marks for evidence.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(postPayload().config).toMatchObject({ rubric: 'Award marks for evidence.' }));
  });

  it('keeps type and marks after Save and add another and reports the new question count', async () => {
    mountEditor();
    await screen.findByRole('heading', { name: 'Add Question' });
    fireEvent.click(screen.getByRole('button', { name: /Short answer/ }));
    fireEvent.change(screen.getByLabelText('Question *'), { target: { value: 'First prompt' } });
    fireEvent.change(screen.getByLabelText('Marks *'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Accepted answers'), { target: { value: 'Answer' } });
    fireEvent.keyDown(screen.getByLabelText('Accepted answers'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save and add another' }));

    expect(await screen.findByRole('status')).toHaveTextContent('This quiz now has 1 question.');
    expect(screen.getByRole('button', { name: /Short answer/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Marks *')).toHaveValue(3);
    expect(screen.getByLabelText('Question *')).toHaveValue('');
  });

  it('asks before leaving when a draft has unsaved changes', async () => {
    mountEditor();
    await screen.findByRole('heading', { name: 'Add Question' });
    fireEvent.change(screen.getByLabelText('Question *'), { target: { value: 'Unsaved prompt' } });
    fireEvent.click(screen.getByRole('link', { name: 'Cancel' }));

    expect(window.confirm).toHaveBeenCalledWith('You have unsaved changes. Leave without saving?');
    expect(screen.getByLabelText('Question *')).toHaveValue('Unsaved prompt');
  });
});
