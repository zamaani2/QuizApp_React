import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { StudentDashboard } from './student/StudentDashboard';
import { StudentQuizList } from './student/StudentQuizList';
import { StudentQuizDetail } from './student/StudentQuizDetail';
import { StudentAttemptsList } from './student/StudentAttemptsList';
import { StudentQuizResult } from './student/StudentQuizResult';
import { StudentQuizTake } from './student/StudentQuizTake';
import { StudentProfileView } from './student/StudentProfileView';
import { fireEvent } from '@testing-library/react';

describe('Phase 5 Student Feature Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('StudentDashboard Component', () => {
    it('renders dashboard metrics, class info, and available assessments', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          student_name: 'Harry Potter',
          admission_number: 'ADM-001',
          class_name: 'Year 1',
          academic_year: '2026/2027',
          term: 'Term 1',
          total_available: 2,
          total_completed: 5,
          total_in_progress: 1,
          avg_score: 88.5,
          best_score: 98.0,
          available_quizzes: [
            {
              id: 10,
              title: 'Defense Against the Dark Arts Quiz',
              subject_name: 'DADA',
              duration_minutes: 30,
              total_questions: 10,
              total_marks: 20,
              available_until: '2026-11-20T23:59:59Z',
            },
          ],
          in_progress_attempts: [
            {
              id: 101,
              quiz_id: 10,
              quiz_title: 'Defense Against the Dark Arts Quiz',
              started_at: '2026-11-07T05:00:00Z',
              time_remaining_seconds: 1500,
            },
          ],
          recent_attempts: [
            {
              id: 99,
              quiz_id: 8,
              quiz_title: 'Potions Basics',
              subject_name: 'Potions',
              score: 18,
              total_marks: 20,
              percentage: 90,
              is_passed: true,
              submitted_at: '2026-11-05T10:00:00Z',
            },
          ],
        }),
      });

      render(
        <BrowserRouter>
          <StudentDashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Welcome back, Harry Potter!')).toBeInTheDocument();
      });

      expect(screen.getByText('Year 1')).toBeInTheDocument();
      expect(screen.getAllByText('ADM-001').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('88.5%')).toBeInTheDocument();
      expect(screen.getByText('98%')).toBeInTheDocument();
      expect(screen.getByText('Defense Against the Dark Arts Quiz')).toBeInTheDocument();
      expect(screen.getByText('Potions Basics')).toBeInTheDocument();
      expect(screen.getByText('Resume Defense Against the Dark Arts Quiz')).toBeInTheDocument();
    });
  });

  describe('StudentQuizList Component', () => {
    it('renders list of available quizzes with action buttons and filter tabs', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          class_name: 'Year 1',
          quizzes: [
            {
              id: 10,
              title: 'Transfiguration Fundamentals',
              description: 'Inanimate to animate object transfiguration test',
              subject_name: 'Transfiguration',
              teacher_name: 'Prof. McGonagall',
              academic_year: '2026/2027',
              term: 'Term 1',
              duration_minutes: 45,
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
        <BrowserRouter>
          <StudentQuizList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Transfiguration Fundamentals')).toBeInTheDocument();
      });

      expect(screen.getByText('Available Quizzes')).toBeInTheDocument();
      expect(screen.getByText('Transfiguration')).toBeInTheDocument();
      expect(screen.getByText('By Prof. McGonagall')).toBeInTheDocument();
      expect(screen.getByText('45 mins')).toBeInTheDocument();
      expect(screen.getByText('Take Quiz')).toBeInTheDocument();
    });
  });

  describe('StudentQuizDetail Component', () => {
    it('renders quiz instructions, assessment rules grid, and start button', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 10,
          title: 'Charms Midterm',
          description: 'Basic levitation and lighting assessment',
          instructions: 'Read questions carefully. Choose the single best answer.',
          subject_name: 'Charms',
          teacher_name: 'Prof. Flitwick',
          duration_minutes: 40,
          total_questions: 20,
          total_marks: 50,
          passing_marks: 25,
          pass_percentage: 50,
          max_attempts: 2,
          attempts_count: 0,
          remaining_attempts: 2,
          can_attempt: true,
          attempt_message: '',
          require_password: false,
          in_progress_attempt_id: null,
          best_score: 0,
          best_percentage: 0,
          available_from: null,
          available_until: null,
          past_attempts: [],
        }),
      });

      render(
        <MemoryRouter initialEntries={['/student/quizzes/10']}>
          <Routes>
            <Route path="/student/quizzes/:id" element={<StudentQuizDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Charms Midterm')).toBeInTheDocument();
      });

      expect(
        screen.getByText('Basic levitation and lighting assessment')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Read questions carefully. Choose the single best answer.')
      ).toBeInTheDocument();
      expect(screen.getByText('Start Assessment Now')).toBeInTheDocument();
    });
  });

  describe('StudentAttemptsList Component', () => {
    it('renders past attempt records with pass/fail badges and score metrics', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total_attempts: 3,
          completed_attempts_count: 3,
          avg_score: 22.5,
          avg_percentage: 90.0,
          best_percentage: 96.0,
          attempts: [
            {
              id: 101,
              quiz_id: 5,
              quiz_title: 'Herbology Practical',
              subject_name: 'Herbology',
              attempt_number: 1,
              score: 24,
              total_marks: 25,
              percentage: 96,
              is_passed: true,
              is_submitted: true,
              is_completed: true,
              results_available: true,
              started_at: '2026-11-04T09:00:00Z',
              submitted_at: '2026-11-04T09:25:00Z',
            },
          ],
        }),
      });

      render(
        <BrowserRouter>
          <StudentAttemptsList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Herbology Practical')).toBeInTheDocument();
      });

      expect(screen.getByText('My Quiz Attempts')).toBeInTheDocument();
      expect(screen.getByText('Herbology')).toBeInTheDocument();
      expect(screen.getAllByText('96%').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Review Result')).toBeInTheDocument();
    });
  });

  describe('StudentQuizResult Component', () => {
    it('renders outcome card and question review with explanation', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          attempt_id: 101,
          quiz_id: 5,
          quiz_title: 'Herbology Practical',
          subject_name: 'Herbology',
          student_name: 'Harry Potter',
          admission_number: 'ADM-001',
          score: 10,
          total_marks: 10,
          percentage: 100,
          passing_marks: 5,
          is_passed: true,
          started_at: '2026-11-04T09:00:00Z',
          submitted_at: '2026-11-04T09:25:00Z',
          allow_review: true,
          show_correct_answers: true,
          questions: [
            {
              id: 1,
              question_text: 'What earmuffs color protects against Mandrake cries?',
              question_type: 'multiple_choice',
              marks: 10,
              marks_obtained: 10,
              is_correct: true,
              student_answer: 'Fluffy pink',
              correct_answer: 'Fluffy pink',
              explanation: 'Mandrake cries can be fatal to anyone hearing them unprotected.',
              choices: [
                { id: 1, choice_text: 'Fluffy pink', is_correct: true, is_selected: true },
                { id: 2, choice_text: 'Black leather', is_correct: false, is_selected: false },
              ],
            },
          ],
        }),
      });

      render(
        <MemoryRouter initialEntries={['/student/attempts/101/result']}>
          <Routes>
            <Route path="/student/attempts/:id/result" element={<StudentQuizResult />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Herbology Practical')).toBeInTheDocument();
      });

      expect(screen.getByText('Passed')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(
        screen.getByText(/What earmuffs color protects against Mandrake cries/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Fluffy pink')).toBeInTheDocument();
      expect(screen.getByText('Correct answer')).toBeInTheDocument();
    });
  });

  describe('StudentQuizTake Component', () => {
    const draftStorage = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => draftStorage.get(key) ?? null,
      setItem: (key: string, value: string) => draftStorage.set(key, value),
      removeItem: (key: string) => draftStorage.delete(key),
      clear: () => draftStorage.clear(),
    };

    const renderQuizWithDraft = async (savedAt: number, serverUpdatedAt: string) => {
      localStorage.setItem('quiz_draft_202', JSON.stringify({
        responses: {
          '50': {
            selected_choice_id: 2,
            selected_choice_ids: [2],
            text_answer: '',
            answer_data: { choice_ids: [2] },
          },
        },
        savedAt,
      }));
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          attempt_id: 202,
          quiz_id: 12,
          quiz_title: 'Draft merge test',
          started_at: '2026-11-07T05:00:00Z',
          time_remaining_seconds: 1800,
          is_submitted: false,
          total_questions: 1,
          answered_count: 1,
          questions: [{
            id: 50,
            order: 1,
            question_type: 'multiple_choice',
            question_text: 'Choose a saved answer.',
            marks: 1,
            choices: [
              { id: 1, choice_text: 'Server answer' },
              { id: 2, choice_text: 'Local answer' },
            ],
          }],
          existing_responses: {
            '50': {
              selected_choice_id: 1,
              selected_choice_ids: [1],
              text_answer: '',
              answer_data: { choice_ids: [1] },
            },
          },
          existing_response_timestamps: { '50': serverUpdatedAt },
        }),
      });

      render(
        <MemoryRouter initialEntries={['/student/take/202']}>
          <Routes>
            <Route path="/student/take/:attemptId" element={<StudentQuizTake />} />
          </Routes>
        </MemoryRouter>
      );
      await screen.findByText('Choose a saved answer.');
    };

    beforeEach(() => {
      draftStorage.clear();
      vi.stubGlobal('localStorage', localStorageMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('prefers the server answer when the saved local draft is older', async () => {
      const serverUpdatedAt = new Date(Date.now() - 1000).toISOString();
      await renderQuizWithDraft(Date.now() - 2000, serverUpdatedAt);

      expect(screen.getByRole('radio', { name: 'Server answer' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Local answer' })).not.toBeChecked();
    });

    it('restores a local answer only when the saved draft is newer', async () => {
      const serverUpdatedAt = new Date(Date.now() - 1000).toISOString();
      await renderQuizWithDraft(Date.now(), serverUpdatedAt);

      expect(screen.getByRole('radio', { name: 'Local answer' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Server answer' })).not.toBeChecked();
    });

    it('renders quiz taking session with timer countdown and choice options without leaking correct keys', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          attempt_id: 202,
          quiz_id: 12,
          quiz_title: 'Care of Magical Creatures Test',
          started_at: '2026-11-07T05:00:00Z',
          time_remaining_seconds: 1800,
          is_submitted: false,
          total_questions: 1,
          answered_count: 0,
          questions: [
            {
              id: 50,
              order: 1,
              question_type: 'multiple_choice',
              question_text: 'How should one approach a Hippogriff?',
              marks: 10,
              choices: [
                { id: 1, choice_text: 'Bowing with continuous eye contact' },
                { id: 2, choice_text: 'Running towards it yelling' },
              ],
            },
          ],
          existing_responses: {},
        }),
      });

      render(
        <MemoryRouter initialEntries={['/student/take/202']}>
          <Routes>
            <Route path="/student/take/:attemptId" element={<StudentQuizTake />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Care of Magical Creatures Test')).toBeInTheDocument();
      });

      expect(screen.getByText('How should one approach a Hippogriff?')).toBeInTheDocument();
      expect(screen.getByText('Bowing with continuous eye contact')).toBeInTheDocument();
      expect(screen.getByText('Submit Quiz')).toBeInTheDocument();
      expect(screen.getByTestId('quiz-timer')).toBeInTheDocument();
    });

    it('advances untimed sections directly and confirms before leaving a timed section', async () => {
      const questions = [
        { id: 61, order: 1, question_type: 'essay', question_text: 'Reading question', marks: 1, choices: [] },
        { id: 62, order: 2, question_type: 'essay', question_text: 'Timed question', marks: 1, choices: [] },
        { id: 63, order: 3, question_type: 'essay', question_text: 'Final question', marks: 1, choices: [] },
      ];
      const sections = [
        {
          id: 301,
          title: 'Reading',
          instructions: 'Read the passage.',
          order: 1,
          time_limit_minutes: null,
          choose_n: 1,
          questions: [questions[0]],
          groups: [{
            id: 401,
            title: 'Shared passage',
            stimulus_text: 'A short passage.',
            order: 1,
            questions: [questions[0]],
          }],
          started_at: null,
          submitted_at: null,
          is_active: true,
          is_locked: false,
          remaining_seconds: null,
          time_expired: false,
        },
        {
          id: 302,
          title: 'Timed section',
          instructions: '',
          order: 2,
          time_limit_minutes: 2,
          choose_n: null,
          questions: [questions[1]],
          groups: [],
          started_at: '2026-11-07T05:00:00Z',
          submitted_at: null,
          is_active: false,
          is_locked: false,
          remaining_seconds: 120,
          time_expired: false,
        },
        {
          id: 303,
          title: 'Final section',
          instructions: '',
          order: 3,
          time_limit_minutes: null,
          choose_n: null,
          questions: [questions[2]],
          groups: [],
          started_at: null,
          submitted_at: null,
          is_active: false,
          is_locked: false,
          remaining_seconds: null,
          time_expired: false,
        },
      ];
      let activeSectionId = 301;
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/sections/301/submit/')) activeSectionId = 302;
        if (url.includes('/sections/302/submit/')) activeSectionId = 303;
        const takeData = {
          attempt_id: 202,
          quiz_id: 12,
          quiz_title: 'Sectioned assessment',
          started_at: '2026-11-07T05:00:00Z',
          time_remaining_seconds: 1800,
          is_submitted: false,
          total_questions: questions.length,
          answered_count: 0,
          questions,
          sections: sections.map((section) => ({
            ...section,
            is_active: section.id === activeSectionId,
            is_locked: section.id < activeSectionId,
          })),
          active_section_id: activeSectionId,
          section_timing_enabled: true,
          existing_responses: {},
        };
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => url.includes('/sections/') ? {
            success: true,
            active_section_id: activeSectionId,
            section_timing_enabled: true,
          } : takeData,
        });
      });
      global.fetch = fetchMock as typeof fetch;

      render(
        <MemoryRouter initialEntries={['/student/take/202']}>
          <Routes>
            <Route path="/student/take/:attemptId" element={<StudentQuizTake />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('Reading question')).toBeInTheDocument();
      expect(screen.getByText('A short passage.')).toBeInTheDocument();
      expect(screen.getByText(/Answer 0 of 1 questions/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Next section →' }));
      expect(await screen.findByText('Timed question')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Leave this timed section?' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Next section →' }));
      expect(await screen.findByRole('heading', { name: 'Leave this timed section?' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Submit section and continue' }));
      expect(await screen.findByText('Final question')).toBeInTheDocument();
      expect(screen.getByText('Question 1 of 1')).toBeInTheDocument();
    });
  });

  describe('StudentProfileView Component', () => {
    it('renders student profile, enrollment history, and performance analytics', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/student/profile/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              personal: {
                id: 1,
                full_name: 'Harry Potter',
                admission_number: 'ADM-001',
                gender: 'M',
                gender_display: 'Male',
                date_of_birth: '2010-07-31',
                parent_contact: '+1234567890',
                email: 'harry@hogwarts.edu',
                admission_date: '2026-01-01',
                profile_picture_url: null,
                is_active: true,
              },
              academic: {
                school_name: 'Gryffindor Academy',
                school_slug: 'gryffindor-academy',
                form_name: 'Grade 10',
                learning_area_name: 'Magic & Defense',
                current_class: {
                  id: 101,
                  name: 'Year 1 Gryffindor',
                  code: 'Y1-GRY',
                  academic_year: '2026/2027',
                },
              },
              enrollments: [
                {
                  id: 501,
                  class_id: 101,
                  class_name: 'Year 1 Gryffindor',
                  class_code: 'Y1-GRY',
                  academic_year: '2026/2027',
                  date_assigned: '2026-01-10',
                  is_active: true,
                  assigned_by_name: 'Minerva McGonagall',
                },
              ],
              stats: {
                total_completed: 8,
                passed_count: 7,
                failed_count: 1,
                pass_rate: 87.5,
                avg_score: 84.2,
                best_score: 98.0,
                recent_activity: [
                  {
                    id: 901,
                    attempt_id: 'ATT-0901',
                    quiz_id: 20,
                    quiz_title: 'Defense Against Dark Arts Final',
                    subject_name: 'DADA',
                    score: 49,
                    total_marks: 50,
                    percentage: 98,
                    is_passed: true,
                    submitted_at: '2026-02-15T10:00:00Z',
                  },
                ],
              },
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <StudentProfileView />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Student Profile')).toBeInTheDocument();
        expect(screen.getByText('Harry Potter')).toBeInTheDocument();
        expect(screen.getAllByText('ADM-001').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Gryffindor Academy')).toBeInTheDocument();
        expect(screen.getAllByText('Year 1 Gryffindor').length).toBeGreaterThanOrEqual(1);
      });

      // Assert metrics
      expect(screen.getByText('87.5%')).toBeInTheDocument();
      expect(screen.getByText('84.2%')).toBeInTheDocument();
      expect(screen.getByText('98%')).toBeInTheDocument();

      // Assert enrollment history
      expect(screen.getByText('Minerva McGonagall')).toBeInTheDocument();

      // Switch to performance tab
      const perfTab = screen.getByText(/Performance & Assessment Records/i);
      fireEvent.click(perfTab);

      await waitFor(() => {
        expect(screen.getByText('Defense Against Dark Arts Final')).toBeInTheDocument();
        expect(screen.getByText('DADA')).toBeInTheDocument();
        expect(screen.getByText('Scorecard')).toBeInTheDocument();
      });
    });
  });

});
