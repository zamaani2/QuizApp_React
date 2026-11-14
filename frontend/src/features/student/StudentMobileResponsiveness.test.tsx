import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { StudentDashboard } from './StudentDashboard';
import { StudentQuizList } from './StudentQuizList';
import { StudentQuizTake } from './StudentQuizTake';
import { StudentProgressView } from './StudentProgressView';
import { StudentAppLayout } from '../../components/layout/StudentAppLayout';

// Mock AuthContext
vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    data: {
      user: {
        id: 1,
        username: 'alhassan',
        full_name: 'Alhassan Mohammed',
        role: 'student',
      },
      school: {
        id: 10,
        name: 'Akontombra SHS',
        code: 'AK-SHS',
      },
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

const VIEWPORT_WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1440];

describe('Mobile-First Responsive Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  VIEWPORT_WIDTHS.forEach((width) => {
    describe(`Viewport width: ${width}px`, () => {
      beforeEach(() => {
        // Set window width and dispatch resize
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
        window.dispatchEvent(new Event('resize'));
      });

      it(`renders StudentDashboard without overflow at ${width}px`, async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            student_name: 'Alhassan Mohammed',
            admission_number: 'ADM-2026-001',
            class_name: 'Year 3 SHS',
            academic_year: '2026/2027',
            term: 'Term 1',
            total_available: 3,
            total_completed: 4,
            total_in_progress: 1,
            avg_score: 82.5,
            best_score: 95.0,
            available_quizzes: [
              {
                id: 1,
                title: 'Core Mathematics Mock Exam',
                subject_name: 'Mathematics',
                duration_minutes: 60,
                total_questions: 25,
                total_marks: 50,
                available_until: '2026-11-30T23:59:59Z',
              },
            ],
            in_progress_attempts: [
              {
                id: 101,
                quiz_id: 1,
                quiz_title: 'Core Mathematics Mock Exam',
                started_at: '2026-11-08T09:00:00Z',
                time_remaining_seconds: 1800,
              },
            ],
            recent_attempts: [
              {
                id: 99,
                quiz_id: 2,
                quiz_title: 'Integrated Science Midterm',
                subject_name: 'Science',
                score: 45,
                total_marks: 50,
                percentage: 90,
                is_passed: true,
                submitted_at: '2026-11-05T10:00:00Z',
              },
            ],
          }),
        });

        const { container } = render(
          <MemoryRouter initialEntries={['/student/dashboard']}>
            <StudentAppLayout>
              <StudentDashboard />
            </StudentAppLayout>
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByText('Welcome back, Alhassan Mohammed!')).toBeInTheDocument();
        });

        // Verification of Promotion Prep layout components
        expect(screen.getByText('Year 3 SHS')).toBeInTheDocument();
        expect(screen.getAllByText('Akontombra SHS').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Continue Assessment')).toBeInTheDocument();
        expect(screen.getByText('Core Mathematics Mock Exam')).toBeInTheDocument();

        // Mobile bottom navigation is rendered
        expect(screen.getByLabelText('Mobile Bottom Navigation')).toBeInTheDocument();

        // Verify container rendered properly
        const main = container.querySelector('#student-main-content');
        expect(main).toBeInTheDocument();
      });

      it(`renders StudentQuizList with clean cards at ${width}px`, async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            class_name: 'Year 3 SHS',
            quizzes: [
              {
                id: 1,
                title: 'Social Studies Assessment',
                description: 'Governance and Constitution review',
                subject_name: 'Social Studies',
                teacher_name: 'Mr. Mensah',
                academic_year: '2026/2027',
                term: 'Term 1',
                duration_minutes: 30,
                total_questions: 15,
                total_marks: 30,
                max_attempts: 2,
                attempts_count: 0,
                status: 'available',
                can_attempt: true,
                attempt_message: '',
                best_score: 0,
                best_percentage: 0,
                in_progress_attempt_id: null,
                available_from: null,
                available_until: null,
              },
            ],
          }),
        });

        render(
          <MemoryRouter initialEntries={['/student/quizzes']}>
            <StudentAppLayout>
              <StudentQuizList />
            </StudentAppLayout>
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByText('Available Quizzes')).toBeInTheDocument();
        });

        expect(screen.getByText('Social Studies Assessment')).toBeInTheDocument();
        expect(screen.getByText('Social Studies')).toBeInTheDocument();
        expect(screen.getByText('Take Quiz')).toBeInTheDocument();
      });

      it(`renders StudentQuizTake distraction-free assessment at ${width}px`, async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            attempt_id: 101,
            quiz_id: 1,
            quiz_title: 'Core Mathematics Mock Exam',
            started_at: '2026-11-08T09:00:00Z',
            server_time: new Date().toISOString(),
            attempt_deadline_at: new Date(Date.now() + 1800 * 1000).toISOString(),
            time_remaining_seconds: 1800,
            is_submitted: false,
            total_questions: 1,
            answered_count: 0,
            questions: [
              {
                id: 10,
                order: 1,
                question_type: 'multiple_choice',
                question_text: 'Solve for x: 2x + 6 = 14',
                marks: 2,
                choices: [
                  { id: 1, choice_text: 'x = 4' },
                  { id: 2, choice_text: 'x = 3' },
                  { id: 3, choice_text: 'x = 5' },
                ],
              },
            ],
            existing_responses: {},
          }),
        });

        const { container } = render(
          <MemoryRouter initialEntries={['/student/take/101']}>
            <Routes>
              <Route path="/student/take/:attemptId" element={<StudentQuizTake />} />
            </Routes>
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByText('Core Mathematics Mock Exam')).toBeInTheDocument();
        });

        // Verify readable question and touch-friendly choice targets
        expect(screen.getByText('Solve for x: 2x + 6 = 14')).toBeInTheDocument();
        expect(screen.getByText('x = 4')).toBeInTheDocument();
        expect(screen.getByTestId('quiz-timer')).toBeInTheDocument();

        // Assessment controls exist
        expect(screen.getByText('Submit Quiz')).toBeInTheDocument();
        expect(screen.getByText('Review & Submit')).toBeInTheDocument();

        // Dedicated distraction-free layout: NO ordinary dashboard bottom nav is present!
        expect(container.querySelector('.stu-bottom-nav')).toBeNull();
      });

      it(`renders StudentProgressView with stats at ${width}px`, async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            personal: {
              id: 1,
              full_name: 'Alhassan Mohammed',
              admission_number: 'ADM-2026-001',
              gender: 'M',
              gender_display: 'Male',
              date_of_birth: '2008-05-15',
              parent_contact: '+233201234567',
              email: 'alhassan@shs.edu.gh',
              admission_date: '2024-09-01',
              profile_picture_url: null,
              is_active: true,
            },
            academic: {
              school_name: 'Akontombra SHS',
              school_slug: 'akontombra-shs',
              form_name: 'Form 3',
              learning_area_name: 'General Arts',
              current_class: {
                id: 10,
                name: 'Year 3 Arts A',
                code: 'Y3-ART',
                academic_year: '2026/2027',
              },
            },
            enrollments: [],
            stats: {
              total_completed: 6,
              passed_count: 5,
              failed_count: 1,
              pass_rate: 83.3,
              avg_score: 79.5,
              best_score: 95.0,
              recent_activity: [],
            },
          }),
        });

        render(
          <MemoryRouter initialEntries={['/student/progress']}>
            <StudentAppLayout>
              <StudentProgressView />
            </StudentAppLayout>
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByText('Learning Progress')).toBeInTheDocument();
        });

        expect(screen.getByText('83.3%')).toBeInTheDocument();
        expect(screen.getByText('79.5%')).toBeInTheDocument();
        expect(screen.getByText('Personal Best: 95%')).toBeInTheDocument();
      });
    });
  });
});
