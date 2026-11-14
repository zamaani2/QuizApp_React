import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TeacherProfileView } from './TeacherProfileView';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    data: {
      user: { full_name: 'Mina Teacher', email: 'mina@example.test' },
      school: { name: 'Example School' },
      profile: { type: 'teacher', teacher_id: 'TCH-10', department: 'Science' },
    },
  }),
}));

describe('TeacherProfileView', () => {
  it('shows teacher identity and a link to account settings', () => {
    render(
      <MemoryRouter>
        <TeacherProfileView />
      </MemoryRouter>
    );

    expect(screen.getByTestId('teacher-profile')).toBeInTheDocument();
    expect(screen.getByText('Mina Teacher')).toBeInTheDocument();
    expect(screen.getByText('TCH-10')).toBeInTheDocument();
    expect(screen.getByText('Science')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage password' })).toHaveAttribute('href', '/account');
  });
});
