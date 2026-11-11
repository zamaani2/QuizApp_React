import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { TeacherDashboard } from './TeacherDashboard';
import { QuestionEditor } from './QuestionEditor';
import { QuizEditor } from './QuizEditor';
import { AdminDashboard } from '../admin/AdminDashboard';
import { TeacherAppLayout } from '../../components/layout/TeacherAppLayout';
import { AdminAppLayout } from '../../components/layout/AdminAppLayout';

const VIEWPORTS = [
  { width: 320, name: '320px (Small Mobile)' },
  { width: 360, name: '360px (Android Compact)' },
  { width: 375, name: '375px (iPhone SE)' },
  { width: 390, name: '390px (iPhone 12/13/14)' },
  { width: 430, name: '430px (iPhone Pro Max)' },
  { width: 768, name: '768px (Tablet)' },
  { width: 1024, name: '1024px (Desktop Small / iPad Pro)' },
  { width: 1440, name: '1440px (Desktop Large)' },
];

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  Object.defineProperty(document.documentElement, 'clientWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

const mockTeacherData = {
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
};

const mockAdminData = {
  school_name: 'Springfield Academy',
  total_students: 42,
  total_teachers: 5,
  total_classes: 3,
  total_quizzes: 12,
  current_academic_year: '2026/2027',
  current_term: 'First Term',
};

const mockQuizDetail = {
  id: 1,
  title: 'Transfiguration 101',
  description: 'Midterm assessment',
  subject_name: 'Magic',
  subject_id: 1,
  teacher_id: 2,
  academic_year_id: 1,
  term_id: 1,
  assigned_classes: [{ id: 1, name: 'Year 1 Gryffindor' }],
  questions: [
    {
      id: 101,
      order: 1,
      question_type: 'multiple_choice',
      question_text: 'What is the principal rule of Transfiguration?',
      marks: 5,
      negative_marks: 0,
      difficulty: 'medium',
      is_required: true,
      choices: [
        { id: 1, choice_text: 'Intention and clarity', is_correct: true },
        { id: 2, choice_text: 'Brute force', is_correct: false },
      ],
    },
  ],
};

const mockQuizFormOptions = {
  subjects: [{ id: 1, name: 'Magic' }],
  teachers: [{ id: 2, name: 'Prof. McGonagall' }],
  categories: [{ id: 1, name: 'Transfiguration' }],
  academic_years: [{ id: 1, name: '2026/2027' }],
  terms: [{ id: 1, name: 'Term 1', academic_year_id: 1 }],
  classes: [{ id: 1, name: 'Class 1A' }],
  is_admin: true,
};

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    data: {
      user: {
        id: 2,
        username: 'prof_mcgonagall',
        full_name: 'Minerva McGonagall',
        role: 'teacher',
        is_superadmin: false,
      },
      school: {
        id: 1,
        name: 'Hogwarts Academy',
        code: 'HGW-01',
        is_active: true,
      },
    },
    loading: false,
    error: null,
  }),
}));

describe('Teacher and Admin Responsive Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string') {
        if (url.includes('/api/v1/dashboard/teacher/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockTeacherData });
        }
        if (url.includes('/api/v1/dashboard/admin/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockAdminData });
        }
        if (url.includes('/api/v1/teacher/quiz-options/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockQuizFormOptions });
        }
        if (url.includes('/api/v1/teacher/quizzes/1/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockQuizDetail });
        }
        if (url.includes('/api/v1/teacher/quizzes/') && !url.includes('/api/v1/teacher/quizzes/1/')) {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ success: true, quiz_id: 99 }) });
        }
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
  });

  describe.each(VIEWPORTS)('Viewport: $name ($width px)', ({ width }) => {
    it(`renders TeacherAppLayout and TeacherDashboard cleanly at ${width}px`, async () => {
      setViewportWidth(width);
      render(
        <BrowserRouter>
          <TeacherAppLayout>
            <TeacherDashboard />
          </TeacherAppLayout>
        </BrowserRouter>
      );

      expect(await screen.findByTestId('teacher-dashboard')).toBeInTheDocument();
      expect(screen.getByText('Prof. Minerva McGonagall — Teaching Workspace')).toBeInTheDocument();
      expect(screen.getByText('Assessment Builder & Evaluation')).toBeInTheDocument();
      expect(screen.getAllByText('Quiz Catalog').length).toBeGreaterThanOrEqual(1);
    });

    it(`renders AdminAppLayout and AdminDashboard cleanly at ${width}px`, async () => {
      setViewportWidth(width);
      render(
        <BrowserRouter>
          <AdminAppLayout>
            <AdminDashboard />
          </AdminAppLayout>
        </BrowserRouter>
      );

      expect(await screen.findByTestId('admin-dashboard')).toBeInTheDocument();
      expect(screen.getByText('Springfield Academy — Overview')).toBeInTheDocument();
      expect(screen.getByText('Manage School Allocations & Cohorts')).toBeInTheDocument();
      expect(screen.getAllByText('Students Directory').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('390px Mobile Quiz & Question Editor Wrapping Verification', () => {
    it('renders QuestionEditor with wrapping choices and buttons at 390px', async () => {
      setViewportWidth(390);
      render(
        <MemoryRouter initialEntries={['/teacher/quizzes/1/questions/new']}>
          <Routes>
            <Route
              path="/teacher/quizzes/:id/questions/new"
              element={
                <TeacherAppLayout>
                  <QuestionEditor />
                </TeacherAppLayout>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      // Verify questions loaded and editor forms rendered
      expect(await screen.findByRole('heading', { name: 'Add Question' })).toBeInTheDocument();
      expect(screen.getByLabelText('Question *')).toBeInTheDocument();
      expect(screen.getByText('Add choice')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add Question' })).toBeInTheDocument();
    });

    it('renders QuizEditor with responsive grid fields at 390px', async () => {
      setViewportWidth(390);
      render(
        <MemoryRouter initialEntries={['/teacher/quizzes/new']}>
          <Routes>
            <Route
              path="/teacher/quizzes/new"
              element={
                <TeacherAppLayout>
                  <QuizEditor />
                </TeacherAppLayout>
              }
            />
            <Route path="/teacher/quizzes/:id" element={<div data-testid="saved-quiz-route" />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('Create Quiz')).toBeInTheDocument();
      expect(screen.getByLabelText('Title *')).toBeInTheDocument();
      expect(screen.getByLabelText('Subject *')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByText('Enter a quiz title before continuing.')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Midterm' } });
      fireEvent.change(screen.getByLabelText('Subject *'), { target: { value: '1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByText('Select a teacher before continuing.')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Teacher *'), { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByRole('region', { name: 'Academic year and classes' })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Category'), { target: { value: '1' } });

      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByRole('region', { name: 'Schedule and scoring' })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'published' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByRole('region', { name: 'Results and behavior' })).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Show results immediately'));
      expect(screen.getByRole('button', { name: 'Create Quiz' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Create Quiz' }));
      expect(await screen.findByTestId('saved-quiz-route')).toBeInTheDocument();
      await waitFor(() => {
        expect(vi.mocked(global.fetch).mock.calls.some(([url, options]) =>
          typeof url === 'string' && url === '/api/v1/teacher/quizzes/' && options?.method === 'POST'
        )).toBe(true);
      });
      const saveCall = vi.mocked(global.fetch).mock.calls.find(([url, options]) =>
        typeof url === 'string' && url === '/api/v1/teacher/quizzes/' && options?.method === 'POST'
      );
      const body = JSON.parse(String(saveCall?.[1]?.body));
      expect(body.title).toBe('Midterm');
      expect(body.subject).toBe('1');
      expect(body.teacher).toBe('2');
      expect(body.category).toBe('1');
      expect(body.status).toBe('published');
      expect(body.show_results_immediately).toBe(true);
    });
  });
});
