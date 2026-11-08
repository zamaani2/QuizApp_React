import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AdminAppLayout } from './AdminAppLayout';

let mockAuthRole = 'admin';
let mockAuthIsSuperadmin = false;

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    data: {
      user: {
        id: 1,
        username: mockAuthRole === 'superadmin' ? 'root' : 'admin1',
        email: 'admin@school.edu',
        first_name: mockAuthRole === 'superadmin' ? 'System' : 'Jane',
        last_name: mockAuthRole === 'superadmin' ? 'Superadmin' : 'Smith',
        full_name: mockAuthRole === 'superadmin' ? 'System Superadmin' : 'Jane Smith',
        role: mockAuthRole,
        is_superadmin: mockAuthIsSuperadmin,
      },
      school: mockAuthRole === 'superadmin' ? null : {
        id: 5,
        name: 'Springfield Academy',
        code: 'SPA-01',
        is_active: true,
      },
    },
    loading: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
    refetch: vi.fn(),
  }),
}));

describe('AdminAppLayout Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuthRole = 'admin';
    mockAuthIsSuperadmin = false;
    window.history.pushState({}, '', '/app/admin/dashboard');
  });

  it('renders admin school management context and user profile', () => {
    render(
      <BrowserRouter>
        <AdminAppLayout>
          <div>Admin Content</div>
        </AdminAppLayout>
      </BrowserRouter>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
    expect(screen.getByText('Admin Content').closest('.core-content')).toBeInTheDocument();
    expect(screen.getAllByText('Jane Smith').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('School Management')).toBeInTheDocument();
  });

  it('renders grouped navigation for School Admin', () => {
    render(
      <BrowserRouter>
        <AdminAppLayout>
          <div>Admin Content</div>
        </AdminAppLayout>
      </BrowserRouter>
    );

    const sidebar = screen.getByTestId('admin-desktop-sidebar');
    expect(sidebar).toBeInTheDocument();

    // 3 clean labeled groups
    expect(screen.getByText('PEOPLE & DIRECTORY')).toBeInTheDocument();
    expect(screen.getByText('ACADEMIC STRUCTURE')).toBeInTheDocument();
    expect(screen.getByText('SETTINGS & ACCESS')).toBeInTheDocument();

    // Primary and secondary items
    expect(screen.getAllByText('All Students').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('All Teachers').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Classes').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Class Enrollments')).toBeInTheDocument();
    expect(screen.getByText('Subject Assignments')).toBeInTheDocument();
    expect(screen.getByText('Academic Years')).toBeInTheDocument();
    expect(screen.getByText('School Settings')).toBeInTheDocument();
  });

  it('does NOT display Superadmin-only items to School Admin', () => {
    render(
      <BrowserRouter>
        <AdminAppLayout>
          <div>Admin Content</div>
        </AdminAppLayout>
      </BrowserRouter>
    );

    expect(screen.queryByText('School Registry')).toBeNull();
    expect(screen.queryByText('School Admins')).toBeNull();
    expect(screen.queryByText('SUPERADMIN CONSOLE')).toBeNull();
  });

  it('renders Superadmin navigation when user is superadmin', () => {
    mockAuthRole = 'superadmin';
    mockAuthIsSuperadmin = true;
    window.history.pushState({}, '', '/app/superadmin/dashboard');

    render(
      <BrowserRouter>
        <AdminAppLayout>
          <div>Superadmin Area</div>
        </AdminAppLayout>
      </BrowserRouter>
    );

    expect(screen.getByText('Superadmin Area')).toBeInTheDocument();
    expect(screen.getByText('Superadmin Console')).toBeInTheDocument();
    expect(screen.getAllByText('School Registry').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('School Admins').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('User Accounts').length).toBeGreaterThanOrEqual(1);

    // School admin items like Class Enrollments are NOT shown
    expect(screen.queryByText('Class Enrollments')).toBeNull();
    expect(screen.queryByText('Subject Assignments')).toBeNull();
  });

  it('supports collapsible desktop sidebar toggle', () => {
    render(
      <BrowserRouter>
        <AdminAppLayout>
          <div>Content</div>
        </AdminAppLayout>
      </BrowserRouter>
    );

    const sidebar = screen.getByTestId('admin-desktop-sidebar');
    expect(sidebar).toHaveClass('portal-sidebar--expanded');

    const collapseBtn = screen.getByLabelText('Collapse sidebar');
    fireEvent.click(collapseBtn);
    expect(sidebar).toHaveClass('portal-sidebar--collapsed');

    const expandBtn = screen.getByLabelText('Expand sidebar');
    fireEvent.click(expandBtn);
    expect(sidebar).toHaveClass('portal-sidebar--expanded');
  });

  it('renders mobile bottom navigation with 4 destinations and More drawer', () => {
    render(
      <BrowserRouter>
        <AdminAppLayout>
          <div>Content</div>
        </AdminAppLayout>
      </BrowserRouter>
    );

    const bottomNav = screen.getByTestId('admin-mobile-bottom-nav');
    expect(bottomNav).toBeInTheDocument();

    // 4 primary destinations in bottom nav
    expect(within(bottomNav).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(within(bottomNav).getByRole('link', { name: 'All Students' })).toBeInTheDocument();
    expect(within(bottomNav).getByRole('link', { name: 'All Teachers' })).toBeInTheDocument();
    expect(within(bottomNav).getByRole('link', { name: 'Classes' })).toBeInTheDocument();

    // More button opens drawer
    const moreBtn = screen.getByRole('button', { name: /more navigation options/i });
    expect(moreBtn).toBeInTheDocument();
    fireEvent.click(moreBtn);

    // Dialog sheet opens with secondary links
    const dialog = screen.getByRole('dialog', { name: /more options/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Class Enrollments' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Subject Assignments' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Academic Years' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'School Settings' })).toBeInTheDocument();

    // Close button dismisses sheet
    fireEvent.click(within(dialog).getByRole('button', { name: /close menu/i }));
    expect(screen.queryByRole('dialog', { name: /more options/i })).toBeNull();
  });
});
