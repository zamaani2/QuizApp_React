import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  createSuperadminSchool,
  deleteSuperadminSchool,
  fetchSuperadminSchool,
  fetchSuperadminSchools,
  updateSuperadminSchool,
} from '../../api/admin';
import type { SuperadminSchoolDetail } from '../../types';
import { SchoolDetail } from './SchoolDetail';
import { SchoolForm } from './SchoolForm';
import { SchoolList } from './SchoolList';

vi.mock('../../api/admin', () => ({
  createSuperadminSchool: vi.fn(),
  deleteSuperadminSchool: vi.fn(),
  fetchSuperadminSchool: vi.fn(),
  fetchSuperadminSchools: vi.fn(),
  updateSuperadminSchool: vi.fn(),
}));

const schoolDetail: SuperadminSchoolDetail = {
  id: 1,
  name: 'North School',
  short_name: 'NORTH',
  slug: 'north-school',
  address: '3 North Road',
  postal_code: 'N1',
  phone_number: '3333333333',
  email: 'office@north.test',
  website: 'https://north.test',
  school_code: 'NTH01',
  is_active: true,
  motto: 'Learn together',
  vision: 'A clear vision',
  mission: 'A clear mission',
  report_header: 'Report heading',
  report_footer: 'Report footer',
  grading_system_description: 'Grading details',
  logo_url: null,
  school_stamp_url: null,
  current_academic_year: { id: 1, name: '2026-2027' },
  current_term: {
    id: 1,
    name: 'Term 1',
    term_number: 1,
    academic_year_id: 1,
    academic_year_name: '2026-2027',
  },
  academic_years: [
    { id: 1, name: '2026-2027', start_date: '2026-01-01', end_date: '2026-12-31', is_current: true },
  ],
  terms: [
    {
      id: 1,
      name: 'Term 1',
      term_number: 1,
      academic_year_id: 1,
      academic_year_name: '2026-2027',
    },
  ],
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-02-01T10:00:00Z',
  created_by_name: 'System Admin',
};

const renderSchoolRoute = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/superadmin/schools" element={<SchoolList />} />
      <Route path="/superadmin/schools/new" element={<SchoolForm />} />
      <Route path="/superadmin/schools/:schoolId/edit" element={<SchoolForm />} />
      <Route path="/superadmin/schools/:schoolId" element={<SchoolDetail />} />
    </Routes>
  </MemoryRouter>
);

describe('Superadmin school management', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a school with the complete form payload', async () => {
    vi.mocked(createSuperadminSchool).mockResolvedValue({
      success: true,
      message: 'Created',
      school_id: 1,
    });
    vi.mocked(fetchSuperadminSchool).mockResolvedValue({ school: schoolDetail });

    renderSchoolRoute('/superadmin/schools/new');

    fireEvent.change(screen.getByRole('textbox', { name: /School name/ }), {
      target: { value: 'North School' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Short name/ }), {
      target: { value: 'NORTH' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Address/ }), {
      target: { value: '3 North Road' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Phone number/ }), {
      target: { value: '3333333333' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Vision/ }), {
      target: { value: 'A clear vision' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create school' }));

    await waitFor(() => expect(createSuperadminSchool).toHaveBeenCalledOnce());
    const body = vi.mocked(createSuperadminSchool).mock.calls[0][0];
    expect(body.get('name')).toBe('North School');
    expect(body.get('short_name')).toBe('NORTH');
    expect(body.get('vision')).toBe('A clear vision');
    expect(await screen.findByTestId('superadmin-school-detail')).toBeInTheDocument();
  });

  it('loads all school settings for edit and sends the active state', async () => {
    vi.mocked(fetchSuperadminSchool).mockResolvedValue({ school: schoolDetail });
    vi.mocked(updateSuperadminSchool).mockResolvedValue({
      success: true,
      message: 'Updated',
      school_id: 1,
    });

    renderSchoolRoute('/superadmin/schools/1/edit');

    expect(await screen.findByDisplayValue('2026-2027')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /School name/ }), {
      target: { value: 'North School Updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateSuperadminSchool).toHaveBeenCalledOnce());
    const body = vi.mocked(updateSuperadminSchool).mock.calls[0][1];
    expect(body.get('name')).toBe('North School Updated');
    expect(body.get('is_active')).toBe('true');
    expect(body.get('current_term')).toBe('1');
  });

  it('shows school details and academic information', async () => {
    vi.mocked(fetchSuperadminSchool).mockResolvedValue({ school: schoolDetail });

    renderSchoolRoute('/superadmin/schools/1');

    expect(await screen.findByRole('heading', { name: 'North School' })).toBeInTheDocument();
    expect(screen.getByText('3 North Road')).toBeInTheDocument();
    expect(screen.getByText('2026-2027')).toBeInTheDocument();
    expect(screen.getByText('Term 1')).toBeInTheDocument();
    expect(screen.getByText('Report heading')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit school' })).toHaveAttribute(
      'href',
      '/superadmin/schools/1/edit'
    );
  });

  it('deletes a school after confirmation', async () => {
    vi.mocked(fetchSuperadminSchools).mockResolvedValue({
      count: 1,
      results: [{
        id: 1,
        name: 'North School',
        short_name: 'NORTH',
        school_code: 'NTH01',
        address: '3 North Road',
        phone_number: '3333333333',
        email: 'office@north.test',
        website: 'https://north.test',
        is_active: true,
        total_students: 8,
        total_teachers: 3,
        total_classes: 4,
      }],
    });
    vi.mocked(deleteSuperadminSchool).mockResolvedValue({
      success: true,
      message: 'Deleted',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderSchoolRoute('/superadmin/schools');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteSuperadminSchool).toHaveBeenCalledWith(1));
  });
});
