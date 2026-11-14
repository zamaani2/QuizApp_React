import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { StudentEnrollmentsManager } from './admin/StudentEnrollmentsManager';
import { TeacherAssignmentsManager } from './admin/TeacherAssignmentsManager';

describe('Academic Allocations Feature Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('StudentEnrollmentsManager Component', () => {
    const mockLookups = {
      classes: [
        {
          id: 101,
          class_id: 'CLS-10A',
          name: 'Grade 10-A',
          academic_year_name: '2026/2027',
          maximum_students: 40,
          current_students: 35,
          is_full: false,
        },
        {
          id: 102,
          class_id: 'CLS-10B',
          name: 'Grade 10-B',
          academic_year_name: '2026/2027',
          maximum_students: 30,
          current_students: 30,
          is_full: true,
        },
      ],
      students: [
        {
          id: 201,
          admission_number: 'ADM-001',
          full_name: 'Alice Johnson',
          gender: 'F',
          current_class: 'Grade 10-A',
        },
        {
          id: 202,
          admission_number: 'ADM-002',
          full_name: 'Bob Smith',
          gender: 'M',
          current_class: null,
        },
      ],
    };

    const mockEnrollments = {
      enrollments: [
        {
          id: 1,
          student_id: 201,
          student_name: 'Alice Johnson',
          admission_number: 'ADM-001',
          gender: 'F',
          assigned_class_id: 101,
          class_name: 'Grade 10-A',
          academic_year_name: '2026/2027',
          date_assigned: '2026-02-01',
          is_active: true,
          assigned_by_name: 'Admin User',
        },
      ],
      total_count: 1,
    };

    it('renders enrollments list and class stats accurately', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/enrollments/lookups/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockLookups,
          });
        }
        if (url.includes('/api/v1/enrollments/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockEnrollments,
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <StudentEnrollmentsManager />
        </BrowserRouter>
      );

      expect(screen.getByText('Student Class Enrollments')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('ADM-001')).toBeInTheDocument();
        expect(screen.getAllByText('Grade 10-A').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Female')).toBeInTheDocument();
      });

      // Check class option in filter dropdown
      expect(screen.getByText('Grade 10-A (35/40)')).toBeInTheDocument();
      expect(screen.getByText('Grade 10-B (30/30)')).toBeInTheDocument();

      fireEvent.click(await screen.findByRole('button', { name: 'Transfer' }));
      const drawer = await screen.findByRole('dialog', { name: 'Transfer Alice Johnson' });
      expect(within(drawer).getByText('ADM-001')).toBeInTheDocument();
      expect(within(drawer).getByText('Current class')).toBeInTheDocument();
    });

    it('opens single enrollment drawer and displays unassigned/transfer options', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/enrollments/lookups/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockLookups,
          });
        }
        if (url.includes('/api/v1/enrollments/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockEnrollments,
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <StudentEnrollmentsManager />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Enroll Student')).toBeInTheDocument();
      });

      const enrollBtn = screen.getByText('Enroll Student');
      fireEvent.click(enrollBtn);

      const drawer = await screen.findByRole('dialog', { name: 'Enroll Student in Class' });
      expect(within(drawer).getByLabelText(/Select Student/i)).toBeInTheDocument();
      expect(within(drawer).getByLabelText(/Target Class Cohort/i)).toBeInTheDocument();
    });

    it('opens bulk enrollment drawer and toggles selection', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/enrollments/lookups/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockLookups,
          });
        }
        if (url.includes('/api/v1/enrollments/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockEnrollments,
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <StudentEnrollmentsManager />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Bulk Enroll')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Bulk Enroll'));

      const drawer = await screen.findByRole('dialog', { name: 'Bulk Enroll Students' });
      expect(within(drawer).getByLabelText(/Target Class Cohort/i)).toBeInTheDocument();
      expect(within(drawer).getByText(/Select Students/i)).toBeInTheDocument();
    });

    it('shows individual failures when a bulk enrollment has partial results', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/v1/enrollments/bulk/') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              created: 1,
              enrolled_count: 1,
              skipped: 0,
              skipped_count: 0,
              errors: ['Alice Johnson: Cross-year promotion is not available.'],
              error_count: 1,
              message: 'Assigned 1 student.',
            }),
          });
        }
        if (url.includes('/api/v1/enrollments/lookups/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockLookups });
        }
        if (url.includes('/api/v1/enrollments/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockEnrollments });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <StudentEnrollmentsManager />
        </BrowserRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Bulk Enroll' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alice Johnson' }));
      fireEvent.click(screen.getByRole('button', { name: /Enroll Selected \(1\)/i }));

      expect(
        await screen.findByText('Alice Johnson: Cross-year promotion is not available.'),
      ).toBeInTheDocument();
    });

    it('removes selected enrollment records through the bulk endpoint', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/enrollments/lookups/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockLookups });
        }
        if (url === '/api/v1/enrollments/bulk-delete/') {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, deleted_count: 1, message: 'Enrollment removed.' }) });
        }
        if (url.includes('/api/v1/enrollments/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockEnrollments });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <StudentEnrollmentsManager />
        </BrowserRouter>
      );

      fireEvent.click(await screen.findByRole('checkbox', { name: /select enrollment for alice johnson/i }));
      fireEvent.click(screen.getByRole('button', { name: /remove selected \(1\)/i }));
      fireEvent.click(screen.getByRole('button', { name: /^Remove selected$/ }));

      await waitFor(() => {
        const bulkCall = vi.mocked(global.fetch).mock.calls.find(([url]) => url === '/api/v1/enrollments/bulk-delete/');
        expect(bulkCall).toBeDefined();
        expect((bulkCall?.[1] as RequestInit).body).toBe(JSON.stringify({ enrollment_ids: [1] }));
      });
      expect(await screen.findByText('Enrollment removed.')).toBeInTheDocument();
    });

    it('filters superadmin enrollments by school and sends the selected school for bulk removal', async () => {
      const schoolLookups = {
        ...mockLookups,
        classes: mockLookups.classes.map((classItem) => ({ ...classItem, school_id: 2 })),
        students: mockLookups.students.map((student) => ({ ...student, school_id: 2 })),
        schools: [{ id: 2, name: 'Beacon High' }],
      };
      const schoolEnrollments = {
        enrollments: [{ ...mockEnrollments.enrollments[0], school_id: 2, school_name: 'Beacon High' }],
        count: 1,
      };
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/v1/enrollments/bulk-delete/') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true, unassigned_count: 1, message: 'Enrollment removed.' }),
          });
        }
        if (url.includes('/api/v1/enrollments/lookups/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => schoolLookups });
        }
        if (url.includes('/api/v1/enrollments/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => schoolEnrollments });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <StudentEnrollmentsManager />
        </BrowserRouter>
      );

      fireEvent.change(await screen.findByRole('combobox', { name: 'School' }), {
        target: { value: '2' },
      });
      await waitFor(() => {
        expect(vi.mocked(global.fetch).mock.calls.some(([url]) => String(url).includes('school_id=2'))).toBe(true);
      });

      fireEvent.click(await screen.findByRole('checkbox', { name: /select enrollment for alice johnson/i }));
      fireEvent.click(screen.getByRole('button', { name: /remove selected \(1\)/i }));
      fireEvent.click(screen.getByRole('button', { name: /^Remove selected$/ }));

      await waitFor(() => {
        const request = vi.mocked(global.fetch).mock.calls.find(
          ([url]) => url === '/api/v1/enrollments/bulk-delete/',
        );
        expect(request).toBeDefined();
        expect((request?.[1] as RequestInit).body).toBe(
          JSON.stringify({ enrollment_ids: [1], target_school_id: 2 }),
        );
      });
    });
  });

  describe('TeacherAssignmentsManager Component', () => {
    const mockLookups = {
      academic_years: [
        { id: 1, name: '2026/2027', is_current: true },
        { id: 2, name: '2025/2026', is_current: false },
      ],
      classes: [
        { id: 10, class_id: 'CLS-10', name: 'Form 1-Alpha' },
        { id: 11, class_id: 'CLS-11', name: 'Form 2-Beta' },
      ],
      teachers: [
        { id: 50, staff_id: 'EMP-050', full_name: 'Dr. Jane Smith' },
        { id: 51, staff_id: 'EMP-051', full_name: 'Prof. John Doe' },
      ],
    };

    const mockClassSubjects = {
      subjects: [
        { id: 301, subject_code: 'PHY-101', subject_name: 'Advanced Physics' },
        { id: 302, subject_code: 'MTH-101', subject_name: 'Pure Mathematics' },
      ],
    };

    const mockAssignments = {
      assignments: [
        {
          id: 5,
          assignment_id: 'ASN-0005',
          teacher_id: 50,
          teacher_name: 'Dr. Jane Smith',
          staff_id: 'EMP-050',
          subject_id: 301,
          subject_name: 'Advanced Physics',
          subject_code: 'PHY-101',
          class_id: 10,
          class_name: 'Form 1-Alpha',
          academic_year_id: 1,
          academic_year_name: '2026/2027',
          date_assigned: '2026-01-15',
          is_active: true,
          previous_teacher_name: 'Prof. John Doe',
          assigned_by_name: 'Admin User',
        },
      ],
      total_count: 1,
    };

    it('renders teacher assignments and displays previous teacher audit info', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/teacher-assignments/lookups/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockLookups,
          });
        }
        if (url.includes('/api/v1/teacher-assignments/class-subjects/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockClassSubjects,
          });
        }
        if (url.includes('/api/v1/teacher-assignments/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockAssignments,
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <TeacherAssignmentsManager />
        </BrowserRouter>
      );

      expect(screen.getByText('Teacher Subject Assignments')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
        expect(screen.getByText('Advanced Physics')).toBeInTheDocument();
        expect(screen.getByText('PHY-101')).toBeInTheDocument();
        expect(screen.getAllByText('Form 1-Alpha').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Reassigned from/i)).toBeInTheDocument();
        expect(screen.getByText('Prof. John Doe')).toBeInTheDocument();
      });
    });

    it('opens the assignment drawer and dynamically queries class subjects', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/teacher-assignments/lookups/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockLookups,
          });
        }
        if (url.includes('/api/v1/teacher-assignments/class-subjects/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockClassSubjects,
          });
        }
        if (url.includes('/api/v1/teacher-assignments/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockAssignments,
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <TeacherAssignmentsManager />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Assign Teacher')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Assign Teacher'));

      expect(await screen.findByRole('dialog', { name: 'Assign Teacher to Subject & Class' })).toBeInTheDocument();

      // Select Class
      const classSelect = screen.getByLabelText(/Target Class/i);
      fireEvent.change(classSelect, { target: { value: '10' } });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/teacher-assignments/class-subjects/?class_id=10'),
          expect.anything()
        );
      });
    });

    it('bulk assigns selected class subjects to a teacher', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/teacher-assignments/lookups/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockLookups });
        }
        if (url.includes('/api/v1/teacher-assignments/class-subjects/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockClassSubjects });
        }
        if (url === '/api/v1/teacher-assignments/bulk/') {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, assigned_count: 1, skipped_count: 0, errors: [], message: 'Assigned 1 class-subject pair.' }) });
        }
        if (url.includes('/api/v1/teacher-assignments/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockAssignments });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(
        <BrowserRouter>
          <TeacherAssignmentsManager />
        </BrowserRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: /bulk assign/i }));
      const bulkDialog = await screen.findByRole('dialog', { name: 'Bulk Assign Teacher' });
      fireEvent.change(within(bulkDialog).getByLabelText(/Teacher/), { target: { value: '50' } });
      fireEvent.change(within(bulkDialog).getByLabelText(/Academic year/), { target: { value: '1' } });
      fireEvent.change(within(bulkDialog).getByLabelText(/^Class$/), { target: { value: '10' } });
      fireEvent.click(await screen.findByRole('checkbox', { name: /advanced physics/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Assign selected' }));

      await waitFor(() => {
        const bulkCall = vi.mocked(global.fetch).mock.calls.find(([url]) => url === '/api/v1/teacher-assignments/bulk/');
        expect(bulkCall).toBeDefined();
        expect(JSON.parse(String((bulkCall?.[1] as RequestInit).body))).toEqual({
          teacher_id: 50,
          academic_year_id: 1,
          assignments: [{ class_id: 10, subject_id: 301 }],
        });
      });
      expect(await screen.findByText('Assigned 1 class-subject pair.')).toBeInTheDocument();
    });
  });
});
