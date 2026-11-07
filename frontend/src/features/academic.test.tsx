import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { AcademicYearsManager } from './admin/AcademicYearsManager';
import { TermsManager } from './admin/TermsManager';
import { ClassesManager } from './admin/ClassesManager';
import { ClassDetailView } from './admin/ClassDetailView';
import { SubjectsManager } from './admin/SubjectsManager';
import { SchoolSettingsView } from './admin/SchoolSettingsView';

describe('Academic Structure & School Setup Feature Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('AcademicYearsManager Component', () => {
    it('renders academic years list with active badges and dates', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/academic-years/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              academic_years: [
                {
                  id: 1,
                  name: '2026/2027',
                  start_date: '2026-01-10',
                  end_date: '2026-11-30',
                  is_current: true,
                  terms_count: 3,
                  classes_count: 8,
                  quizzes_count: 14,
                },
                {
                  id: 2,
                  name: '2025/2026',
                  start_date: '2025-01-10',
                  end_date: '2025-11-30',
                  is_current: false,
                  terms_count: 3,
                  classes_count: 6,
                  quizzes_count: 10,
                },
              ],
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <AcademicYearsManager />
        </BrowserRouter>
      );

      expect(screen.getByText('Academic Years')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('2026/2027')).toBeInTheDocument();
        expect(screen.getAllByText('Current Active').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText('2025/2026')).toBeInTheDocument();
      });

      expect(screen.getAllByText(/3 Terms/).length).toBe(2);
      expect(screen.getByText(/8 Classes/)).toBeInTheDocument();
    });

    it('opens create modal when clicking New Academic Year button', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ academic_years: [] }),
      });

      render(
        <BrowserRouter>
          <AcademicYearsManager />
        </BrowserRouter>
      );

      const createBtn = screen.getByText('New Academic Year');
      fireEvent.click(createBtn);

      expect(screen.getByText('Create Academic Year')).toBeInTheDocument();
      expect(screen.getByLabelText(/Academic Year Name/i)).toBeInTheDocument();
    });
  });

  describe('TermsManager Component', () => {
    it('renders terms with academic year lookups and active status', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/structure-lookups/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              academic_years: [{ id: 1, name: '2026/2027', is_current: true }],
              terms: [],
              forms: [],
              learning_areas: [],
              departments: [],
            }),
          });
        }
        if (url.includes('/api/v1/terms/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              terms: [
                {
                  id: 10,
                  academic_year_id: 1,
                  academic_year_name: '2026/2027',
                  term_number: 1,
                  term_display: 'Term 1',
                  start_date: '2026-01-10',
                  end_date: '2026-04-15',
                  is_current: true,
                },
              ],
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <TermsManager />
        </BrowserRouter>
      );

      expect(screen.getByText('Academic Terms')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Term 1')).toBeInTheDocument();
        expect(screen.getByText('Active Term')).toBeInTheDocument();
      });
    });
  });

  describe('ClassesManager Component', () => {
    it('renders classes list with cohort cap and assigned count', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/structure-lookups/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              academic_years: [{ id: 1, name: '2026/2027', is_current: true }],
              terms: [],
              forms: [{ id: 1, form_number: 1, name: 'Form 1' }],
              learning_areas: [{ id: 1, code: 'SCI', name: 'Sciences' }],
              departments: [],
            }),
          });
        }
        if (url.includes('/api/v1/classes/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              classes: [
                {
                  id: 5,
                  class_id: 'CLS005',
                  name: 'Form 1 Alpha',
                  form_id: 1,
                  form_name: 'Form 1',
                  learning_area_id: 1,
                  learning_area_name: 'Sciences',
                  academic_year_id: 1,
                  academic_year_name: '2026/2027',
                  maximum_students: 45,
                  is_active: true,
                  student_count: 40,
                  subject_count: 7,
                },
              ],
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <ClassesManager />
        </BrowserRouter>
      );

      expect(screen.getByText('Classes Management')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Form 1 Alpha')).toBeInTheDocument();
        expect(screen.getByText('CLS005')).toBeInTheDocument();
        expect(screen.getByText('7 Assigned')).toBeInTheDocument();
      });
    });
  });

  describe('ClassDetailView Component', () => {
    it('renders class detail metrics, assigned subjects, and enrolled students', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/structure-lookups/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              academic_years: [],
              terms: [],
              forms: [],
              learning_areas: [],
              departments: [],
              available_subjects: [{ id: 20, subject_code: 'HIST', subject_name: 'History' }],
            }),
          });
        }
        if (url.includes('/api/v1/classes/5/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              class: {
                id: 5,
                class_id: 'CLS005',
                name: 'Form 1 Alpha',
                form_id: 1,
                form_name: 'Form 1',
                learning_area_id: 1,
                learning_area_name: 'Sciences',
                academic_year_id: 1,
                academic_year_name: '2026/2027',
                maximum_students: 45,
                is_active: true,
                student_count: 2,
                subject_count: 1,
              },
              students: [
                {
                  id: 101,
                  admission_number: 'ADM-101',
                  full_name: 'Jane Doe',
                  gender: 'F',
                  is_active: true,
                },
              ],
              subjects: [
                {
                  id: 1,
                  subject_id: 10,
                  subject_code: 'BIO',
                  subject_name: 'Biology',
                  department_name: 'Science Dept',
                  learning_area_name: 'Sciences',
                },
              ],
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <MemoryRouter initialEntries={['/admin/classes/5']}>
          <Routes>
            <Route path="/admin/classes/:id" element={<ClassDetailView />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('Form 1 Alpha').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Biology')).toBeInTheDocument();
        expect(screen.getByText('BIO')).toBeInTheDocument();
      });

      // Switch to Students tab
      const studentsTab = screen.getByRole('button', { name: /Enrolled Students/i });
      fireEvent.click(studentsTab);

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        expect(screen.getByText('ADM-101')).toBeInTheDocument();
      });
    });
  });

  describe('SubjectsManager Component', () => {
    it('renders subjects catalog with department, class, and quiz counts', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/structure-lookups/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              academic_years: [],
              terms: [],
              forms: [],
              learning_areas: [],
              departments: [{ id: 1, code: 'MATH', name: 'Mathematics Department' }],
            }),
          });
        }
        if (url.includes('/api/v1/subjects/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              subjects: [
                {
                  id: 1,
                  subject_code: 'MTH101',
                  subject_name: 'Pure Mathematics',
                  learning_area_id: 1,
                  learning_area_name: 'STEM',
                  department_id: 1,
                  department_name: 'Mathematics Department',
                  is_active: true,
                  class_count: 4,
                  quiz_count: 7,
                  school_id: 1,
                  school_name: 'Alpha High',
                },
              ],
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <SubjectsManager />
        </BrowserRouter>
      );

      expect(screen.getByText('Subjects Catalog')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Pure Mathematics')).toBeInTheDocument();
        expect(screen.getByText('MTH101')).toBeInTheDocument();
        expect(screen.getByText('4 Classes')).toBeInTheDocument();
        expect(screen.getByText('7 Quizzes')).toBeInTheDocument();
      });
    });

    it('filters superadmin subjects by school and creates a subject for the selected school', async () => {
      const subject = {
        id: 1,
        subject_code: 'MTH101',
        subject_name: 'Pure Mathematics',
        learning_area_id: 1,
        learning_area_name: 'STEM',
        department_id: 1,
        department_name: 'Mathematics Department',
        is_active: true,
        class_count: 4,
        quiz_count: 7,
        school_id: 2,
        school_name: 'Beta High',
      };
      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/structure-lookups/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              academic_years: [],
              terms: [],
              forms: [],
              learning_areas: [{ id: 1, code: 'STEM', name: 'Science' }],
              departments: [{ id: 1, code: 'SCI', name: 'Science Department' }],
              schools: [{ id: 1, name: 'Alpha High' }, { id: 2, name: 'Beta High' }],
            }),
          });
        }
        if (url === '/api/v1/subjects/' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({ success: true, message: 'Subject created.', subject }),
          });
        }
        if (url.includes('/api/v1/subjects/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ subjects: [subject] }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <SubjectsManager />
        </BrowserRouter>
      );

      fireEvent.change(await screen.findByLabelText('School:'), {
        target: { value: '2' },
      });
      await waitFor(() => {
        expect(
          vi.mocked(global.fetch).mock.calls.some(([url]) => String(url).includes('school_id=2')),
        ).toBe(true);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add Subject' }));
      expect(await screen.findByLabelText('Target School *')).toHaveValue('2');
      fireEvent.change(screen.getByLabelText(/Subject Name/), {
        target: { value: 'Visual Art' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create Subject' }));

      await waitFor(() => {
        const request = vi.mocked(global.fetch).mock.calls.find(
          ([url, options]) => url === '/api/v1/subjects/' && options?.method === 'POST',
        );
        expect(request).toBeDefined();
        expect((request?.[1] as RequestInit).body).toBe(
          JSON.stringify({
            subject_name: 'Visual Art',
            department_id: 1,
            learning_area_id: 1,
            school_id: 2,
          }),
        );
      });
    });
  });

  describe('SchoolSettingsView Component', () => {
    it('renders school profile statistics and bound form fields', async () => {
      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/v1/structure-lookups/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              academic_years: [{ id: 1, name: '2026/2027', is_current: true }],
              terms: [{ id: 1, academic_year_id: 1, term_number: 1, term_display: 'Term 1', is_current: true }],
              forms: [],
              learning_areas: [],
              departments: [],
            }),
          });
        }
        if (url.includes('/api/v1/school/')) {
          if (options?.method === 'POST') {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                message: 'School profile updated successfully.',
                school: { id: 1, name: 'Springfield High Academy' },
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              school: {
                id: 1,
                name: 'Springfield High Academy',
                short_name: 'Springfield High',
                school_code: 'SCH-001',
                address: '742 Evergreen Terrace',
                postal_code: '97477',
                phone_number: '+1-555-0199',
                email: 'contact@springfield.edu',
                website: 'https://springfield.edu',
                motto: 'Knowledge is Power',
                vision: 'To educate and empower all learners',
                mission: 'Fostering lifelong inquiry and integrity',
                current_academic_year_id: 1,
                current_academic_year_name: '2026/2027',
                current_term_id: 1,
                current_term_name: 'Term 1',
                is_active: true,
                logo_url: null,
                school_stamp_url: null,
                report_header: 'Original report heading',
                report_footer: 'Original report footer',
                grading_system_description: 'Original grading details',
              },
              stats: {
                total_students: 450,
                total_teachers: 35,
                total_classes: 12,
                total_subjects: 18,
                total_quizzes: 64,
              },
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <SchoolSettingsView />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('School Settings & Profile')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Springfield High Academy')).toBeInTheDocument();
        expect(screen.getByDisplayValue('SCH-001')).toBeInTheDocument();
        expect(screen.getByDisplayValue('contact@springfield.edu')).toBeInTheDocument();
      });

      expect(screen.getByText('450')).toBeInTheDocument();
      expect(screen.getByText('35')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Original report heading')).toBeInTheDocument();
      expect(screen.getByLabelText('Institution is active')).toBeChecked();

      fireEvent.change(screen.getByLabelText('Report Header'), {
        target: { value: 'New report header' },
      });
      fireEvent.change(screen.getByLabelText('School Logo'), {
        target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] },
      });
      fireEvent.click(screen.getByRole('button', { name: /save school settings/i }));

      await waitFor(() => {
        const request = vi.mocked(global.fetch).mock.calls.find(
          ([url, options]) =>
            String(url).includes('/api/v1/school/') && options?.method === 'POST'
        );
        expect(request).toBeDefined();
        const body = request?.[1]?.body as FormData;
        expect(body.get('report_header')).toBe('New report header');
        expect(body.get('logo')).toBeInstanceOf(File);
      });
    });
  });
});
