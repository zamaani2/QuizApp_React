import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  createSuperadminAdmin,
  deleteSuperadminAdmin,
  fetchSuperadminAdmin,
  fetchSuperadminAdmins,
  fetchSuperadminSchools,
  updateSuperadminAdmin,
} from '../../api/admin';
import type { SuperadminAdmin } from '../../types';
import { AdminDetail } from './AdminDetail';
import { AdminForm } from './AdminForm';
import { AdminList } from './AdminList';

vi.mock('../../api/admin', () => ({
  createSuperadminAdmin: vi.fn(),
  deleteSuperadminAdmin: vi.fn(),
  fetchSuperadminAdmin: vi.fn(),
  fetchSuperadminAdmins: vi.fn(),
  fetchSuperadminSchools: vi.fn(),
  updateSuperadminAdmin: vi.fn(),
}));

const school = {
  id: 1,
  name: 'North School',
  short_name: 'NORTH',
  school_code: 'NTH01',
  address: '3 North Road',
  phone_number: '3333333333',
  email: 'office@north.test',
  website: '',
  is_active: true,
  total_students: 20,
  total_teachers: 3,
  total_classes: 2,
};

const secondSchool = {
  ...school,
  id: 2,
  name: 'South School',
  short_name: 'SOUTH',
  school_code: 'STH02',
};

const admin: SuperadminAdmin = {
  id: 7,
  username: 'north_admin',
  email: 'admin@north.test',
  full_name: 'North Administrator',
  is_active: true,
  date_joined: '2026-01-10T09:00:00Z',
  last_login: '2026-02-01T10:00:00Z',
  last_login_ip: '192.0.2.10',
  school: {
    id: school.id,
    name: school.name,
    school_code: school.school_code,
    address: school.address,
    phone_number: school.phone_number,
    is_active: true,
  },
};

const renderAdminRoute = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/superadmin/admins" element={<AdminList />} />
        <Route path="/superadmin/admins/new" element={<AdminForm />} />
        <Route path="/superadmin/admins/:adminId/edit" element={<AdminForm />} />
        <Route path="/superadmin/admins/:adminId" element={<AdminDetail />} />
      </Routes>
    </MemoryRouter>
  );

describe('Superadmin administrator management', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists administrators and filters by account status', async () => {
    vi.mocked(fetchSuperadminAdmins).mockResolvedValue({
      count: 2,
      results: [
        admin,
        {
          ...admin,
          id: 8,
          username: 'inactive_admin',
          full_name: 'Inactive Administrator',
          is_active: false,
          school: {
            id: secondSchool.id,
            name: secondSchool.name,
            school_code: secondSchool.school_code,
            address: secondSchool.address,
            phone_number: secondSchool.phone_number,
            is_active: true,
          },
        },
      ],
    });
    vi.mocked(fetchSuperadminSchools).mockResolvedValue({
      count: 2,
      results: [school, secondSchool],
    });

    renderAdminRoute('/superadmin/admins');

    expect(await screen.findByText('North Administrator')).toBeInTheDocument();
    expect(screen.getByText('Inactive Administrator')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'inactive' },
    });
    expect(screen.queryByText('North Administrator')).not.toBeInTheDocument();
    expect(screen.getByText('Inactive Administrator')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'all' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'School' }), {
      target: { value: String(secondSchool.id) },
    });
    expect(screen.queryByText('North Administrator')).not.toBeInTheDocument();
    expect(screen.getByText('Inactive Administrator')).toBeInTheDocument();
  });

  it('creates an administrator without accepting a password from the creator', async () => {
    vi.mocked(fetchSuperadminSchools).mockResolvedValue({ count: 1, results: [school] });
    vi.mocked(createSuperadminAdmin).mockResolvedValue({
      success: true,
      message: 'Created and setup email scheduled.',
      admin_id: admin.id,
      password_setup_email_scheduled: true,
    });
    vi.mocked(fetchSuperadminAdmin).mockResolvedValue({ admin });

    renderAdminRoute('/superadmin/admins/new');

    fireEvent.change(await screen.findByLabelText('Username'), {
      target: { value: 'north_admin' },
    });
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'North Administrator' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@north.test' },
    });
    fireEvent.change(screen.getByLabelText('School'), {
      target: { value: String(school.id) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Administrator' }));

    await waitFor(() => expect(createSuperadminAdmin).toHaveBeenCalledOnce());
    const body = vi.mocked(createSuperadminAdmin).mock.calls[0][0];
    expect(body.get('username')).toBe('north_admin');
    expect(body.get('full_name')).toBe('North Administrator');
    expect(body.get('email')).toBe('admin@north.test');
    expect(body.get('school')).toBe(String(school.id));
    expect(body.has('password')).toBe(false);
  });

  it('updates email, active state, school, and optional password', async () => {
    vi.mocked(fetchSuperadminSchools).mockResolvedValue({ count: 1, results: [school] });
    vi.mocked(fetchSuperadminAdmin).mockResolvedValue({ admin });
    vi.mocked(updateSuperadminAdmin).mockResolvedValue({
      success: true,
      message: 'Updated.',
      admin_id: admin.id,
    });

    renderAdminRoute(`/superadmin/admins/${admin.id}/edit`);

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'updated@north.test' },
    });
    fireEvent.click(screen.getByLabelText('Account is active'));
    fireEvent.change(screen.getByLabelText('New password (optional)'), {
      target: { value: 'New-Password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(updateSuperadminAdmin).toHaveBeenCalledOnce());
    const body = vi.mocked(updateSuperadminAdmin).mock.calls[0][1];
    expect(body.get('email')).toBe('updated@north.test');
    expect(body.get('is_active')).toBe('false');
    expect(body.get('password')).toBe('New-Password-123!');
    expect(body.get('school')).toBe(String(school.id));
  });

  it('shows administrator account and school details', async () => {
    vi.mocked(fetchSuperadminAdmin).mockResolvedValue({ admin });

    renderAdminRoute(`/superadmin/admins/${admin.id}`);

    expect(await screen.findByText('Administrator Details')).toBeInTheDocument();
    expect(screen.getByText('North Administrator')).toBeInTheDocument();
    expect(screen.getByText('north_admin')).toBeInTheDocument();
    expect(screen.getByText('192.0.2.10')).toBeInTheDocument();
    expect(screen.getByText('North School')).toBeInTheDocument();
  });

  it('deletes the administrator after confirmation', async () => {
    vi.mocked(fetchSuperadminAdmin).mockResolvedValue({ admin });
    vi.mocked(deleteSuperadminAdmin).mockResolvedValue({ success: true, message: 'Deleted.' });
    vi.mocked(fetchSuperadminAdmins).mockResolvedValue({ count: 0, results: [] });
    vi.mocked(fetchSuperadminSchools).mockResolvedValue({ count: 1, results: [school] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderAdminRoute(`/superadmin/admins/${admin.id}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Administrator' }));
    await waitFor(() => expect(deleteSuperadminAdmin).toHaveBeenCalledWith(admin.id));
    expect(await screen.findByTestId('superadmin-admin-list')).toBeInTheDocument();
  });
});
