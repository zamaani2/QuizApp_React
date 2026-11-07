import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  StudentQuizResultPrint,
  TeacherQuizResultPrint,
  TeacherQuizResultsBulkPrint,
} from './QuizResultPrint';

describe('Quiz result print reports', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders teacher result details and answer key', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 17,
        quiz_title: 'Biology assessment',
        student_name: 'Alex Student',
        admission_number: 'ADM-17',
        score: 8,
        total_marks: 10,
        percentage: 80,
        submitted_at: '2026-11-06T12:00:00Z',
        is_graded: true,
        responses: [{
          id: 31,
          question_text: 'Name a mammal.',
          question_type: 'short_answer',
          marks: 10,
          marks_awarded: 8,
          text_answer: 'Dolphin',
          selected_choice: '',
          selected_choices: [],
          is_correct: true,
          answer_key: 'Whale',
          correct_choices: [],
          grading_notes: 'Good example.',
        }],
      }),
    });

    render(
      <MemoryRouter initialEntries={['/teacher/results/17/print']}>
        <Routes>
          <Route path="/teacher/results/:attemptId/print" element={<TeacherQuizResultPrint />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Biology assessment')).toBeInTheDocument());
    expect(screen.getByText('Alex Student')).toBeInTheDocument();
    expect(screen.getByText('Dolphin')).toBeInTheDocument();
    expect(screen.getByText('Whale')).toBeInTheDocument();
    expect(screen.getByText('Grading complete')).toBeInTheDocument();
  });

  it('does not print an answer key when the quiz policy hides it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        attempt_id: 24,
        quiz_id: 9,
        quiz_title: 'History assessment',
        subject_name: 'History',
        student_name: 'Alex Student',
        admission_number: 'ADM-24',
        score: 1,
        total_marks: 2,
        percentage: 50,
        passing_marks: 1,
        is_passed: true,
        started_at: null,
        submitted_at: null,
        allow_review: true,
        show_correct_answers: false,
        questions: [{
          id: 1,
          question_text: 'Who led the expedition?',
          question_type: 'short_answer',
          marks: 2,
          marks_obtained: 1,
          is_correct: false,
          student_answer: 'A student answer',
          correct_answer: 'Private answer key',
          explanation: 'Private explanation',
          choices: [],
        }],
      }),
    });

    render(
      <MemoryRouter initialEntries={['/student/attempts/24/result/print']}>
        <Routes>
          <Route path="/student/attempts/:id/result/print" element={<StudentQuizResultPrint />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('History assessment')).toBeInTheDocument());
    expect(screen.getByText('A student answer')).toBeInTheDocument();
    expect(screen.queryByText('Private answer key')).not.toBeInTheDocument();
    expect(screen.queryByText('Private explanation')).not.toBeInTheDocument();
  });

  it('renders each selected attempt in a bulk print report', async () => {
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const id = String(input).includes('/18/') ? 18 : 17;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          id,
          quiz_title: `Assessment ${id}`,
          student_name: `Student ${id}`,
          admission_number: `ADM-${id}`,
          score: 7,
          total_marks: 10,
          percentage: 70,
          submitted_at: null,
          is_graded: true,
          responses: [],
        }),
      });
    });

    render(
      <MemoryRouter initialEntries={['/teacher/results/print?attempt_ids=17&attempt_ids=18']}>
        <Routes>
          <Route path="/teacher/results/print" element={<TeacherQuizResultsBulkPrint />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Print 2 reports')).toBeInTheDocument());
    expect(screen.getByText('Assessment 17')).toBeInTheDocument();
    expect(screen.getByText('Assessment 18')).toBeInTheDocument();
  });
});
