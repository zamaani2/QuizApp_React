import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fetchSuperadminDashboard } from '../../api/admin';
import { SuperadminDashboard } from './SuperadminDashboard';

vi.mock('../../api/admin', () => ({
  fetchSuperadminDashboard: vi.fn(),
}));

describe('SuperadminDashboard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders platform metrics, school summaries, recent quizzes, and actions', async () => {
    vi.mocked(fetchSuperadminDashboard).mockResolvedValue({
      stats: {
        total_schools: 2,
        inactive_schools: 1,
        total_users: 14,
        total_admins: 2,
        total_teachers: 3,
        total_students: 8,
        total_superadmins: 1,
        total_students_all: 8,
        total_teachers_all: 3,
        total_classes: 4,
        total_subjects: 5,
        total_quizzes: 6,
        published_quizzes: 4,
        draft_quizzes: 2,
        total_attempts: 9,
        completed_attempts: 7,
      },
      recent_schools: [
        { id: 1, name: 'North School', is_active: true, created_at: '2026-11-07T10:00:00Z' },
      ],
      schools_with_users: [
        { id: 1, name: 'North School', is_active: true, user_count: 12 },
      ],
      schools_with_students: [
        { id: 1, name: 'North School', is_active: true, student_count: 8 },
      ],
      recent_quizzes: [
        {
          id: 14,
          title: 'Term Assessment',
          status: 'published',
          school_name: 'North School',
          teacher_name: 'Jane Teacher',
          subject_name: 'Mathematics',
          created_at: '2026-11-07T10:00:00Z',
        },
      ],
    });

    render(
      <MemoryRouter>
        <SuperadminDashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText('System overview')).toBeInTheDocument();
    expect(screen.getByText('Active schools')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getAllByText('North School').length).toBeGreaterThan(0);
    expect(screen.getByText('Term Assessment')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage administrators' })).toHaveAttribute(
      'href',
      '/superadmin/admins'
    );
    await waitFor(() => expect(fetchSuperadminDashboard).toHaveBeenCalledOnce());
  });
});
