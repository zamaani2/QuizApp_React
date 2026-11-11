import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import App from './App';

describe('App Component (Phase 3 Routing & Integration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/app/');
  });

  it('renders loading state initially', () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<App />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(
      screen.getAllByText(/loading authenticated workspace/i).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders session expired alert on 401 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ code: 'UNAUTHORIZED', message: 'Authentication required' }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /log in to quizapp/i })).toHaveAttribute(
      'href',
      '/auth-app/?next=%2Fapp%2F'
    );
  });

  it('renders authenticated dashboard shell with sidebar on 200 response', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/dashboard/admin/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            school_name: 'Springfield Academy',
            total_students: 42,
            total_teachers: 5,
            total_classes: 3,
            total_quizzes: 12,
            current_academic_year: '2026/2027',
            current_term: 'First Term',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: 1,
            username: 'admin1',
            email: 'admin@school.edu',
            first_name: 'Jane',
            last_name: 'Smith',
            full_name: 'Jane Smith',
            role: 'admin',
            is_superadmin: false,
          },
          school: {
            id: 5,
            name: 'Springfield Academy',
            code: 'SPA-01',
            logo_url: null,
            is_active: true,
          },
          profile: {
            type: 'admin',
            id: 2,
            teacher_id: null,
            student_id: null,
            department: null,
            current_class: null,
          },
          ui_preferences: {
            theme: 'academic',
          },
        }),
      });

    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
    });

    // Check user info and role badge
    expect(screen.getAllByText('Jane Smith').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('School Management')).toBeInTheDocument();

    // Check sidebar navigation for Admin role
    expect(screen.getByRole('navigation', { name: /sidebar navigation/i })).toBeInTheDocument();
    expect(screen.getByText('All Students')).toBeInTheDocument();
    expect(screen.getByText('All Teachers')).toBeInTheDocument();

    // Check dashboard metrics rendered after async load
    await waitFor(() => {
      expect(screen.getByText('Springfield Academy — Overview')).toBeInTheDocument();
      expect(screen.getByText('Academic Year: 2026/2027')).toBeInTheDocument();
    });
  });

  it('routes superadmins to the React system overview', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/superadmin/dashboard/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            stats: {
              total_schools: 1,
              inactive_schools: 0,
              total_users: 1,
              total_admins: 0,
              total_teachers: 0,
              total_students: 0,
              total_superadmins: 1,
              total_students_all: 0,
              total_teachers_all: 0,
              total_classes: 0,
              total_subjects: 0,
              total_quizzes: 0,
              published_quizzes: 0,
              draft_quizzes: 0,
              total_attempts: 0,
              completed_attempts: 0,
            },
            recent_schools: [],
            schools_with_users: [],
            schools_with_students: [],
            recent_quizzes: [],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: 1,
            username: 'root',
            email: 'root@example.test',
            first_name: 'System',
            last_name: 'Admin',
            full_name: 'System Admin',
            role: 'superadmin',
            is_superadmin: true,
          },
          school: null,
          profile: {
            type: 'superadmin',
            id: 1,
            teacher_id: null,
            student_id: null,
            department: null,
            current_class: null,
          },
          ui_preferences: { theme: 'academic' },
        }),
      });
    });

    render(<App />);

    expect(await screen.findByText('Active schools')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'System overview' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Add a school' }));
    expect(await screen.findByTestId('superadmin-school-form')).toBeInTheDocument();
  });

  it('does not expose the component inventory route', async () => {
    window.history.pushState({}, '', '/app/components');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          id: 1,
          username: 'teacher1',
          email: 'teacher@school.edu',
          first_name: 'Jane',
          last_name: 'Smith',
          full_name: 'Jane Smith',
          role: 'teacher',
          is_superadmin: false,
        },
        school: {
          id: 5,
          name: 'Springfield Academy',
          code: 'SPA-01',
          logo_url: null,
          is_active: true,
        },
        profile: {
          type: 'teacher',
          id: 2,
          teacher_id: 'TCH-10',
          student_id: null,
          department: 'Mathematics',
          current_class: null,
        },
        ui_preferences: {
          theme: 'academic',
        },
      }),
    });

    render(<App />);

    expect(await screen.findByText('Page Not Found')).toBeInTheDocument();
  });

  it('blocks unauthorized access to admin route when role is student (RoleGuard)', async () => {
    window.history.pushState({}, '', '/app/admin/dashboard');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          id: 99,
          username: 'student1',
          email: 'student@school.edu',
          first_name: 'Alex',
          last_name: 'Rivera',
          full_name: 'Alex Rivera',
          role: 'student',
          is_superadmin: false,
        },
        school: {
          id: 5,
          name: 'Springfield Academy',
          code: 'SPA-01',
          logo_url: null,
          is_active: true,
        },
        profile: {
          type: 'student',
          id: 42,
          teacher_id: null,
          student_id: 'STU-001',
          department: null,
          current_class: 'Form 3A',
        },
        ui_preferences: {
          theme: 'academic',
        },
      }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Your current role \(student\) does not have permission to view this section/i)
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /go to my portal/i })).toHaveAttribute(
      'href',
      '/app/student/dashboard'
    );
  });
});
