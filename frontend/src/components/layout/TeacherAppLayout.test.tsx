import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { TEACHER_NAV_ITEMS, TeacherAppLayout } from './TeacherAppLayout';

const mockTeacherAuth = {
  data: {
    user: {
      id: 2,
      username: 'teacher1',
      email: 'teacher@school.edu',
      first_name: 'Minerva',
      last_name: 'McGonagall',
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
  login: vi.fn(),
  logout: vi.fn(),
  refetch: vi.fn(),
};

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => mockTeacherAuth,
}));

describe('TeacherAppLayout Component', () => {
  it('marks quiz, question and assignment routes precisely', () => {
    const nav = Object.fromEntries(TEACHER_NAV_ITEMS.map((item) => [item.id, item]));
    expect(nav.quizzes.isActive('/teacher/quizzes')).toBe(true);
    expect(nav.quizzes.isActive('/teacher/quizzes/12/settings')).toBe(true);
    expect(nav.quizzes.isActive('/teacher/quizzes/new')).toBe(false);
    expect(nav.quizzes.isActive('/teacher/quizzes/12/assignments')).toBe(false);
    expect(nav.questions.isActive('/teacher/questions/12/new')).toBe(true);
    expect(nav.assignments.isActive('/teacher/assignments')).toBe(true);
    expect(nav.assignments.isActive('/teacher/quizzes/12/assignments')).toBe(false);
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/app/teacher/dashboard');
  });

  it('renders teacher context, greeting, and main navigation', () => {
    render(
      <BrowserRouter>
        <TeacherAppLayout>
          <div>Teacher Content Area</div>
        </TeacherAppLayout>
      </BrowserRouter>
    );

    expect(screen.getByText('Teacher Content Area')).toBeInTheDocument();
    expect(screen.getByText('Teacher Content Area').closest('.core-content')).toBeInTheDocument();
    expect(screen.getAllByText('Minerva McGonagall').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Hogwarts Academy · Teacher/i)).toBeInTheDocument();
  });

  it('renders desktop sidebar with workspace and assessment groups', () => {
    render(
      <BrowserRouter>
        <TeacherAppLayout>
          <div>Content</div>
        </TeacherAppLayout>
      </BrowserRouter>
    );

    const sidebar = screen.getByTestId('teacher-desktop-sidebar');
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveClass('portal-sidebar--expanded');

    // Both groups rendered
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Assessments & Grading')).toBeInTheDocument();

    // Navigation links present
    expect(screen.getAllByText('Home').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Quizzes').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Questions').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Assignments').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Grading').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Results').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Create Quiz')).not.toBeInTheDocument();
  });

  it('supports collapsible desktop sidebar toggle', () => {
    render(
      <BrowserRouter>
        <TeacherAppLayout>
          <div>Content</div>
        </TeacherAppLayout>
      </BrowserRouter>
    );

    const sidebar = screen.getByTestId('teacher-desktop-sidebar');
    expect(sidebar).toHaveClass('portal-sidebar--expanded');

    const collapseBtn = screen.getByLabelText('Collapse sidebar');
    fireEvent.click(collapseBtn);
    expect(sidebar).toHaveClass('portal-sidebar--collapsed');

    const expandBtn = screen.getByLabelText('Expand sidebar');
    fireEvent.click(expandBtn);
    expect(sidebar).toHaveClass('portal-sidebar--expanded');
  });

  it('renders fixed mobile bottom navigation with 4 primary destinations and More button', () => {
    render(
      <BrowserRouter>
        <TeacherAppLayout>
          <div>Content</div>
        </TeacherAppLayout>
      </BrowserRouter>
    );

    const bottomNav = screen.getByTestId('teacher-mobile-bottom-nav');
    expect(bottomNav).toBeInTheDocument();

    // Keep frequent destinations visible; put Questions and Assignments in More.
    expect(within(bottomNav).getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(within(bottomNav).getByRole('link', { name: 'Quizzes' })).toBeInTheDocument();
    expect(within(bottomNav).getByRole('link', { name: 'Grading' })).toBeInTheDocument();
    expect(within(bottomNav).getByRole('link', { name: 'Results' })).toBeInTheDocument();

    // More button opens sheet
    const moreBtn = screen.getByRole('button', { name: /more navigation options/i });
    expect(moreBtn).toBeInTheDocument();
    fireEvent.click(moreBtn);

    // Dialog sheet opens
    const dialog = screen.getByRole('dialog', { name: /more options/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Questions' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Assignments' })).toBeInTheDocument();

    // Close button dismisses sheet
    fireEvent.click(within(dialog).getByRole('button', { name: /close menu/i }));
    expect(screen.queryByRole('dialog', { name: /more options/i })).toBeNull();
  });

  it('does NOT display administrative or superadmin items to teacher', () => {
    render(
      <BrowserRouter>
        <TeacherAppLayout>
          <div>Content</div>
        </TeacherAppLayout>
      </BrowserRouter>
    );

    expect(screen.queryByText('School Registry')).toBeNull();
    expect(screen.queryByText('School Admins')).toBeNull();
    expect(screen.queryByText('School Settings')).toBeNull();
    expect(screen.queryByText('Users & Passwords')).toBeNull();
    expect(screen.queryByText('Class Enrollments')).toBeNull();
  });
});
