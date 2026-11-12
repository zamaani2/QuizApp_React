import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { TeacherDashboard } from './teacher/TeacherDashboard';
import { QuizList } from './teacher/QuizList';
import { QuizDetail } from './teacher/QuizDetail';
import { QuizQuestionsPage } from './teacher/QuizQuestionsPage';
import { QuizSettings } from './teacher/QuizSettings';
import { QuizResultsList } from './teacher/QuizResultsList';
import { GradingQueue } from './teacher/GradingQueue';
import { GradingAttempt } from './teacher/GradingAttempt';

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
        expect(screen.getAllByText('Potions Midterm').length).toBeGreaterThanOrEqual(1);
      });

      expect(screen.getByText(/Quiz Catalog/)).toBeInTheDocument();
      expect(screen.getAllByText('Chemistry').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole('button', { name: /^(All|Draft|Published|Archived)$/ })).toHaveLength(4);
      expect(screen.getByText('100 marks')).toBeInTheDocument();
      expect(screen.getAllByText('20').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('PUBLISHED').length).toBeGreaterThanOrEqual(1);
    });

    it('filters by search and status and shows an empty state', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => ({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          results: String(url).includes('status=draft')
            ? []
            : [{
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
              }],
        }),
      }));
      global.fetch = fetchMock as typeof fetch;

      render(
        <BrowserRouter>
          <QuizList />
        </BrowserRouter>
      );

      expect(await screen.findAllByText('Potions Midterm')).not.toHaveLength(0);
      fireEvent.change(screen.getByRole('textbox', { name: 'Search quizzes' }), {
        target: { value: 'No match' },
      });
      expect(screen.getByText('No quizzes matched "No match".')).toBeInTheDocument();

      fireEvent.change(screen.getByRole('textbox', { name: 'Search quizzes' }), {
        target: { value: '' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
      expect(await screen.findByText('There are no draft quizzes yet.')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/teacher/quizzes/?status=draft',
        expect.anything()
      );
    });
  });

  describe('QuizDetail Component', () => {
    it('renders the quiz overview without the question list', async () => {
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

      expect(screen.getByText('Spellcraft')).toBeInTheDocument();
      expect(screen.getByText('Setup Checklist')).toBeInTheDocument();
      expect(screen.getByText('Submissions & Results')).toBeInTheDocument();
      expect(screen.queryByText('What incantation is used to levitate objects?')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    });

    it('shows one disabled publish action and the reason while a draft is incomplete', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 2,
          title: 'Draft Quiz',
          description: '',
          subject_name: 'Spellcraft',
          academic_year: '2026/2027',
          term: 'Term 1',
          status: 'draft',
          duration_minutes: 0,
          pass_percentage: 50,
          passing_marks: 0,
          max_attempts: 3,
          total_questions: 0,
          total_marks: 0,
          total_attempts: 0,
          assigned_classes: [],
          questions: [],
        }),
      });

      render(
        <MemoryRouter initialEntries={['/teacher/quizzes/2']}>
          <Routes>
            <Route path="/teacher/quizzes/:id" element={<QuizDetail />} />
          </Routes>
        </MemoryRouter>
      );

      const publishButton = await screen.findByRole('button', { name: 'Publish' });
      expect(publishButton).toBeDisabled();
      expect(screen.getAllByText(/Add at least one question before publishing/).length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByRole('button', { name: 'Unpublish' })).not.toBeInTheDocument();
    });
  });

  describe('QuizQuestionsPage Component', () => {
    const quizListResponse = {
      count: 1,
      results: [{
        id: 1,
        title: 'Potions Midterm',
        subject_name: 'Chemistry',
        academic_year: '2026/2027',
        term: 'Term 1',
        status: 'draft',
        duration_minutes: 0,
        total_questions: 2,
        total_marks: 4,
        total_attempts: 0,
        avg_score: 0,
        created_at: null,
      }],
    };
    const quizDetailResponse = {
      id: 1,
      title: 'Potions Midterm',
      subject_name: 'Chemistry',
      academic_year: '2026/2027',
      term: 'Term 1',
      status: 'draft',
      duration_minutes: 0,
      pass_percentage: 50,
      max_attempts: 3,
      total_questions: 2,
      total_marks: 4,
      total_attempts: 0,
      assigned_classes: [],
      questions: [
        { id: 11, question_text: 'First question', question_type: 'essay', marks: 2, order: 1, choices: [] },
        { id: 12, question_text: 'Second question', question_type: 'essay', marks: 2, order: 2, choices: [] },
      ],
    };

    it('honors a quiz deep link and shows the question empty state', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        const detail = String(url).includes('/teacher/quizzes/1/');
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => detail
            ? {
                id: 1,
                title: 'Potions Midterm',
                subject_name: 'Chemistry',
                academic_year: '2026/2027',
                term: 'Term 1',
                status: 'draft',
                duration_minutes: 0,
                pass_percentage: 50,
                max_attempts: 3,
                total_questions: 0,
                total_marks: 0,
                total_attempts: 0,
                assigned_classes: [],
                questions: [],
              }
            : {
                count: 1,
                results: [{
                  id: 1,
                  title: 'Potions Midterm',
                  subject_name: 'Chemistry',
                  academic_year: '2026/2027',
                  term: 'Term 1',
                  status: 'draft',
                  duration_minutes: 0,
                  total_questions: 0,
                  total_marks: 0,
                  total_attempts: 0,
                  avg_score: 0,
                  created_at: null,
                }],
              },
        });
      });

      render(
        <MemoryRouter initialEntries={['/teacher/questions/1']}>
          <Routes>
            <Route path="/teacher/questions/:quizId" element={<QuizQuestionsPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect((await screen.findAllByText('Write a question')).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByLabelText('Select Quiz:')).toHaveValue('1');
      expect(screen.getAllByText('Import from file').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('link', { name: '+ Add question' })).toHaveAttribute(
        'href',
        '/teacher/questions/1/new'
      );
    });

    it('rolls back a keyboard reorder when the API rejects it', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/questions/reorder/')) {
          return Promise.resolve({
            ok: false,
            status: 409,
            statusText: 'Conflict',
            json: async () => ({ code: 'QUIZ_CONFLICT', message: 'Order rejected.' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => String(url).endsWith('/1/') ? quizDetailResponse : quizListResponse,
        });
      });
      global.fetch = fetchMock as typeof fetch;

      const { container } = render(
        <MemoryRouter initialEntries={['/teacher/questions/1']}>
          <Routes>
            <Route path="/teacher/questions/:quizId" element={<QuizQuestionsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await screen.findByText('First question');
      fireEvent.click(screen.getByRole('button', { name: 'Move question 2 up' }));
      expect(await screen.findByText('Order rejected.')).toBeInTheDocument();

      const questionRows = Array.from(container.querySelectorAll('article'));
      expect(questionRows[0]).toHaveTextContent('First question');
      expect(questionRows[1]).toHaveTextContent('Second question');
    });

    it('surfaces a 409 bulk-delete refusal', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/questions/bulk-delete/')) {
          return Promise.resolve({
            ok: false,
            status: 409,
            statusText: 'Conflict',
            json: async () => ({ code: 'QUIZ_DELETE_CONFLICT', message: 'Questions cannot be deleted after attempts.' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => String(url).endsWith('/1/')
            ? { ...quizDetailResponse, questions: [quizDetailResponse.questions[0]], total_questions: 1 }
            : quizListResponse,
        });
      });
      global.fetch = fetchMock as typeof fetch;

      render(
        <MemoryRouter initialEntries={['/teacher/questions/1']}>
          <Routes>
            <Route path="/teacher/questions/:quizId" element={<QuizQuestionsPage />} />
          </Routes>
        </MemoryRouter>
      );

      await screen.findByText('First question');
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete selected (1)' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Delete 1 Questions' }));
      expect(await screen.findByText('Questions cannot be deleted after attempts.')).toBeInTheDocument();
    });

    it('prompts quiz creation when no quizzes are available', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ count: 0, results: [] }),
      });

      render(
        <MemoryRouter initialEntries={['/teacher/questions']}>
          <Routes>
            <Route path="/teacher/questions" element={<QuizQuestionsPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('No Quizzes Available')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Create a quiz' })).toHaveAttribute(
        'href',
        '/teacher/quizzes/new'
      );
    });
  });

  describe('QuizSettings Component', () => {
    it('saves and reloads the hidden-results option', async () => {
      let savedQuiz: Record<string, unknown> = {
        id: 3,
        title: 'Settings Quiz',
        description: '',
        subject_name: 'Chemistry',
        subject_id: 1,
        academic_year: '2026/2027',
        academic_year_id: 5,
        term: 'Term 1',
        term_id: 6,
        status: 'draft',
        duration_minutes: 30,
        passing_marks: 10,
        pass_percentage: 50,
        max_attempts: 1,
        total_questions: 2,
        total_marks: 20,
        total_attempts: 0,
        assigned_classes: [],
        questions: [],
        show_results_immediately: true,
        show_correct_answers: true,
        allow_review: true,
      };
      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (String(url).includes('/quiz-options/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              subjects: [{ id: 1, name: 'Chemistry' }],
              classes: [],
              academic_years: [{ id: 5, name: '2026/2027' }],
              terms: [{ id: 6, academic_year_id: 5, name: 'Term 1' }],
              categories: [],
              teachers: [],
              is_admin: false,
            }),
          });
        }
        if (options?.method === 'PATCH') {
          savedQuiz = { ...savedQuiz, ...JSON.parse(String(options.body)) };
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true, quiz_id: 3, message: 'Saved' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => savedQuiz,
        });
      });
      global.fetch = fetchMock as typeof fetch;

      render(
        <MemoryRouter initialEntries={['/teacher/quizzes/3/settings']}>
          <Routes>
            <Route path="/teacher/quizzes/:id/settings" element={<QuizSettings />} />
          </Routes>
        </MemoryRouter>
      );

      const hiddenResults = await screen.findByRole('radio', { name: /Hide until I release them/ });
      fireEvent.click(hiddenResults);
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await screen.findByText('Quiz settings saved successfully.');
      expect(savedQuiz.show_results_immediately).toBe(false);
      expect(savedQuiz.show_correct_answers).toBe(false);
      expect(savedQuiz.allow_review).toBe(true);
      await waitFor(() => {
        expect(screen.getByRole('radio', { name: /Hide until I release them/ })).toBeChecked();
      });
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
      expect(screen.getByText('2 responses')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Grade/i })).toHaveAttribute(
        'href',
        '/teacher/grading/88'
      );
    });

    describe('GradingAttempt Component', () => {
      it('saves an essay grade and its feedback through the response endpoint', async () => {
        let response = {
          id: 501,
          question_text: 'Order the preparation steps.',
          question_type: 'ordering',
          question_marks: 5,
          marks_awarded: 0,
          text_answer: '',
          student_answer: ['Measure the ingredients', 'Mix them'],
          grading_notes: '',
          is_graded: false,
        };
        const fetchMock = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
          if (options?.method === 'POST') {
            const body = JSON.parse(String(options.body));
            response = {
              ...response,
              marks_awarded: body.marks_awarded,
              grading_notes: body.grading_notes,
              is_graded: true,
            };
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ success: true, message: 'Response graded successfully.' }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 88,
              quiz_id: 12,
              quiz_title: 'History of Magic Essay',
              student_name: 'Harry Potter',
              admission_number: 'STD-001',
              score: response.marks_awarded,
              total_marks: 5,
              responses: [response],
            }),
          });
        });
        global.fetch = fetchMock as typeof fetch;

        render(
          <MemoryRouter initialEntries={['/teacher/grading/88']}>
            <Routes>
              <Route path="/teacher/grading/:attemptId" element={<GradingAttempt />} />
            </Routes>
          </MemoryRouter>
        );

        fireEvent.change(await screen.findByLabelText('Marks (maximum 5)'), {
          target: { value: '4' },
        });
        fireEvent.change(screen.getByLabelText('Grading notes'), {
          target: { value: 'Good explanation.' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save grade' }));

        expect(screen.getByText('Ordering response 1')).toBeInTheDocument();
        expect(screen.getByText(/Measure the ingredients/)).toBeInTheDocument();
        expect(await screen.findByText('Response graded successfully.')).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/v1/teacher/responses/501/grade/',
          expect.objectContaining({ method: 'POST' })
        );
        const gradeCall = fetchMock.mock.calls.find(([url, options]) =>
          url === '/api/v1/teacher/responses/501/grade/' && options?.method === 'POST'
        );
        expect(JSON.parse(String(gradeCall?.[1]?.body))).toEqual({
          marks_awarded: 4,
          grading_notes: 'Good explanation.',
        });
      });
    });
  });
});
