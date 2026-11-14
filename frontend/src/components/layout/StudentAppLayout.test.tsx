import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StudentAppLayout, STUDENT_NAV_ITEMS } from './StudentAppLayout';

// Mock useAuth
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

describe('StudentAppLayout Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders student-specific compact header with avatar and school badge', () => {
    render(
      <MemoryRouter initialEntries={['/student/dashboard']}>
        <StudentAppLayout>
          <div>Dashboard Content</div>
        </StudentAppLayout>
      </MemoryRouter>
    );

    // Initial in avatar pill
    expect(screen.getByText('Dashboard Content').closest('.core-content')).toBeInTheDocument();
    expect(screen.getAllByText('A').length).toBeGreaterThanOrEqual(1);
    // School pill badge
    expect(screen.getAllByText('Akontombra SHS').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Account settings')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search Quizzes')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Notifications')).not.toBeInTheDocument();
    expect(document.querySelector('.stu-icon-btn__badge')).toBeNull();
    // Children content
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('uses CSRF-protected POST forms for both sign-out actions', () => {
    document.cookie = 'csrftoken=student-csrf-token; path=/';
    render(
      <MemoryRouter initialEntries={['/student/dashboard']}>
        <StudentAppLayout>
          <div>Dashboard Content</div>
        </StudentAppLayout>
      </MemoryRouter>
    );

    const signOutButtons = screen.getAllByRole('button', { name: /sign out/i });
    expect(signOutButtons).toHaveLength(2);
    signOutButtons.forEach((button) => {
      const form = button.closest('form');
      expect(form).toHaveAttribute('method', 'post');
      expect(form).toHaveAttribute('action', '/logout/');
      expect(form?.querySelector('input[name="csrfmiddlewaretoken"]')).toHaveValue('student-csrf-token');
    });
    expect(screen.queryByRole('link', { name: /sign out/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/logout/"]')).toBeNull();
    document.cookie = 'csrftoken=; max-age=0; path=/';
  });

  it('renders primary navigation destinations on both desktop sidebar and mobile bottom bar', () => {
    render(
      <MemoryRouter initialEntries={['/student/dashboard']}>
        <StudentAppLayout>
          <div>Content</div>
        </StudentAppLayout>
      </MemoryRouter>
    );

    const bottomNav = screen.getByLabelText('Mobile Bottom Navigation');
    expect(bottomNav).toBeInTheDocument();

    const sidebar = screen.getByTestId('student-desktop-sidebar');
    expect(sidebar).toBeInTheDocument();

    // Primary destinations appear in both desktop and mobile navigation.
    ['Home', 'Quizzes', 'Assignments', 'Results', 'Progress', 'Account'].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(2); // In sidebar & bottom nav
    });
  });

  it('supports collapsible desktop sidebar toggle', () => {
    render(
      <MemoryRouter initialEntries={['/student/dashboard']}>
        <StudentAppLayout>
          <div>Workspace Content</div>
        </StudentAppLayout>
      </MemoryRouter>
    );

    const sidebar = screen.getByTestId('student-desktop-sidebar');
    expect(sidebar).toHaveClass('stu-sidebar--expanded');

    const toggleBtn = screen.getByLabelText('Collapse sidebar');
    fireEvent.click(toggleBtn);

    // Should now be collapsed
    expect(sidebar).toHaveClass('stu-sidebar--collapsed');
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();

    // Click again to expand
    fireEvent.click(screen.getByLabelText('Expand sidebar'));
    expect(sidebar).toHaveClass('stu-sidebar--expanded');
  });

  it('does NOT render administrative sidebar, admin breadcrumbs or admin menus', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/student/dashboard']}>
        <StudentAppLayout>
          <div>Student Workspace</div>
        </StudentAppLayout>
      </MemoryRouter>
    );

    // Ensure no admin sidebar exists
    expect(container.querySelector('.core-sidebar')).toBeNull();
    expect(container.querySelector('.core-page-head')).toBeNull();
    expect(screen.queryByText('QUIZAPP WORKSPACE')).toBeNull();
    expect(screen.queryByText('Superadmin Overview')).toBeNull();
    expect(screen.queryByText('Teachers Directory')).toBeNull();
  });

  it('activates Quizzes tab when on quizzes route', () => {
    render(
      <MemoryRouter initialEntries={['/student/quizzes']}>
        <StudentAppLayout>
          <div>Quizzes List</div>
        </StudentAppLayout>
      </MemoryRouter>
    );

    const quizzesTabs = screen.getAllByLabelText('Quizzes');
    expect(quizzesTabs.some((el) => el.classList.contains('stu-bottom-tab--active'))).toBe(true);
    expect(quizzesTabs.some((el) => el.classList.contains('stu-sidebar__link--active'))).toBe(true);
  });

  it('activates Assignments tab when on assignments route', () => {
    render(
      <MemoryRouter initialEntries={['/student/assignments']}>
        <StudentAppLayout>
          <div>Assignments List</div>
        </StudentAppLayout>
      </MemoryRouter>
    );

    const assignmentsTabs = screen.getAllByLabelText('Assignments');
    expect(assignmentsTabs.some((el) => el.classList.contains('stu-bottom-tab--active'))).toBe(true);
    expect(assignmentsTabs.some((el) => el.classList.contains('stu-sidebar__link--active'))).toBe(true);
  });

  it('uses shared STUDENT_NAV_ITEMS configuration without duplication', () => {
    expect(STUDENT_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Home',
      'Quizzes',
      'Assignments',
      'Results',
      'Progress',
      'Account',
    ]);
  });
});
