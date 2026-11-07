import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { TeacherDashboard } from './teacher/TeacherDashboard';
import { QuizList } from './teacher/QuizList';
import { QuizDetail } from './teacher/QuizDetail';
import { QuizResultsList } from './teacher/QuizResultsList';
import { GradingQueue } from './teacher/GradingQueue';

describe('Phase 4 Teacher Feature Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('TeacherDashboard Component', () => {
    it('renders dashboard metrics and recent activity', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          teacher_name: 'Prof. Minerva McGonagall',
          total_quizzes: 12,
          published_quizzes: 8,
          draft_quizzes: 3,
          archived_quizzes: 1,
          total_attempts: 140,
          completed_attempts_count: 135,
          quizzes_needing_grading_count: 4,
          avg_score: 82.5,
          recent_quizzes: [
            {
              id: 10,
              title: 'Transfiguration Exam',
              subject_name: 'Magic',
              status: 'published',
              total_questions: 15,
              total_marks: 75,
              created_at: '2026-11-01T10:00:00Z',
            },
          ],
          recent_attempts: [
            {
              id: 101,
              quiz_title: 'Transfiguration Exam',
              student_name: 'Hermione Granger',
              admission_number: 'STD-007',
              score: 74,
              total_marks: 75,
              percentage: 98.7,
              submitted_at: '2026-11-06T12:00:00Z',
              is_graded: true,
            },
          ],
        }),
      });

      render(
        <BrowserRouter>
          <TeacherDashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Prof. Minerva McGonagall — Teaching Workspace')
        ).toBeInTheDocument();
      });

      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('135')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('82.5%')).toBeInTheDocument();
      expect(screen.getByText('Transfiguration Exam')).toBeInTheDocument();
      expect(screen.getByText('Hermione Granger')).toBeInTheDocument();
    });
  });

  describe('QuizList Component', () => {
    it('renders quiz catalog with filter tabs', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          results: [
            {
              id: 1,
              title: 'Potions Midterm',
              subject_name: 'Chemistry',
              academic_year: '2026/2027',
              term: 'Term 1',
              status: 'published',
              duration_minutes: 60,
              total_questions: 20,
              total_marks: 100,
              total_attempts: 28,
              avg_score: 79.4,
              created_at: '2026-10-15T09:00:00Z',
            },
          ],
        }),
      });

      render(
        <BrowserRouter>
          <QuizList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Potions Midterm')).toBeInTheDocument();
      });

      expect(screen.getByText('Quiz Catalog')).toBeInTheDocument();
      expect(screen.getByText('Chemistry')).toBeInTheDocument();
      expect(screen.getByText('60 mins')).toBeInTheDocument();
      expect(screen.getByText('28 attempts')).toBeInTheDocument();
      expect(screen.getAllByText('published').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('QuizDetail Component', () => {
    it('renders quiz metadata and question breakdown with correct answer keys', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 1,
          title: 'Charms Practical',
          description: 'Levitation and illumination spells assessment',
          subject_name: 'Spellcraft',
          academic_year: '2026/2027',
          term: 'Term 1',
          status: 'published',
          duration_minutes: 45,
          pass_percentage: 60,
          max_attempts: 1,
          total_questions: 1,
          total_marks: 10,
          total_attempts: 22,
          assigned_classes: [{ id: 3, name: 'Gryffindor Year 1' }],
          questions: [
            {
              id: 101,
              question_text: 'What incantation is used to levitate objects?',
              question_type: 'multiple_choice',
              marks: 10,
              order: 1,
              choices: [
                { id: 1, choice_text: 'Wingardium Leviosa', is_correct: true },
                { id: 2, choice_text: 'Alohomora', is_correct: false },
              ],
            },
          ],
        }),
      });

      render(
        <MemoryRouter initialEntries={['/teacher/quizzes/1']}>
          <Routes>
            <Route path="/teacher/quizzes/:id" element={<QuizDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Charms Practical')).toBeInTheDocument();
      });

      expect(
        screen.getByText('Levitation and illumination spells assessment')
      ).toBeInTheDocument();
      expect(
        screen.getByText('What incantation is used to levitate objects?')
      ).toBeInTheDocument();
      expect(screen.getByText('Wingardium Leviosa')).toBeInTheDocument();
      expect(screen.getByText('Correct Answer')).toBeInTheDocument();
      expect(screen.getByText('Gryffindor Year 1')).toBeInTheDocument();
    });
  });

  describe('QuizResultsList Component', () => {
    it('renders attempts list with student scores and pass rate metrics', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 2,
          results: [
            {
              id: 1,
              quiz_id: 5,
              quiz_title: 'Arithmancy Quiz',
              student_name: 'Ron Weasley',
              admission_number: 'STD-008',
              class_name: 'Class 3A',
              score: 80,
              total_marks: 100,
              percentage: 80,
              is_passed: true,
              needs_grading: false,
              is_graded: true,
              started_at: '2026-11-05T09:00:00Z',
              submitted_at: '2026-11-05T09:40:00Z',
            },
            {
              id: 2,
              quiz_id: 5,
              quiz_title: 'Arithmancy Quiz',
              student_name: 'Draco Malfoy',
              admission_number: 'STD-009',
              class_name: 'Class 3A',
              score: 45,
              total_marks: 100,
              percentage: 45,
              is_passed: false,
              needs_grading: false,
              is_graded: true,
              started_at: '2026-11-05T09:00:00Z',
              submitted_at: '2026-11-05T09:50:00Z',
            },
          ],
        }),
      });

      render(
        <BrowserRouter>
          <QuizResultsList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Ron Weasley')).toBeInTheDocument();
      });

      expect(screen.getByText('Draco Malfoy')).toBeInTheDocument();
      expect(screen.getByText('Passed')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument(); // 1 of 2 passed = 50%
    });
  });

  describe('GradingQueue Component', () => {
    it('renders attempts awaiting evaluation with essay counts', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          results: [
            {
              id: 88,
              quiz_id: 12,
              quiz_title: 'History of Magic Essay',
              student_name: 'Harry Potter',
              admission_number: 'STD-001',
              class_name: 'Class 4B',
              submitted_at: '2026-11-06T16:00:00Z',
              ungraded_responses_count: 2,
            },
          ],
        }),
      });

      render(
        <BrowserRouter>
          <GradingQueue />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Harry Potter')).toBeInTheDocument();
      });

      expect(screen.getByText('History of Magic Essay')).toBeInTheDocument();
      expect(screen.getByText('2 essay questions')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Grade/i })).toHaveAttribute(
        'href',
        '/teacher/grading/88'
      );
    });
  });
});
