import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SchoolList } from './superadmin/SchoolList';
import { AdminList } from './superadmin/AdminList';
import { StudentList } from './admin/StudentList';
import { TeacherList } from './admin/TeacherList';
import { AdminDashboard } from './admin/AdminDashboard';

describe('Phase 3 Feature Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('SchoolList Component', () => {
    it('renders school list with metrics on successful fetch', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 2,
          results: [
            {
              id: 1,
              name: 'St. Peters High School',
              short_name: 'SPHS',
              school_code: 'SP01',
              address: '123 Main St',
              phone_number: '1234567890',
              email: 'info@sphs.edu',
              website: 'https://sphs.edu',
              is_active: true,
              total_students: 250,
              total_teachers: 20,
              total_classes: 10,
            },
            {
              id: 2,
              name: 'Archived Academy',
              short_name: 'AA',
              school_code: 'AA02',
              address: '456 West St',
              phone_number: '9876543210',
              email: 'info@aa.edu',
              website: '',
              is_active: false,
              total_students: 0,
              total_teachers: 0,
              total_classes: 0,
            },
          ],
        }),
      });

      render(
        <BrowserRouter>
          <SchoolList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('St. Peters High School')).toBeInTheDocument();
      });

      expect(screen.getByText('Schools Registry')).toBeInTheDocument();
      expect(screen.getByText('SPHS')).toBeInTheDocument();
      expect(screen.getByText('SP01')).toBeInTheDocument();
      expect(screen.getByText('Archived Academy')).toBeInTheDocument();
      expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
    });

    it('displays error alert on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        json: async () => ({ code: 'ERROR', message: 'Failed to load schools' }),
      });

      render(
        <BrowserRouter>
          <SchoolList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to load schools')).toBeInTheDocument();
      });
    });
  });

  describe('AdminList Component', () => {
    it('renders admin accounts with school associations', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => url.includes('/api/v1/superadmin/admins/')
          ? {
            count: 1,
            results: [
              {
                id: 1,
                username: 'admin_john',
                email: 'john@sphs.edu',
                full_name: 'John Doe',
                is_active: true,
                date_joined: '2026-01-01T00:00:00Z',
                last_login: null,
                last_login_ip: null,
                school: {
                  id: 1,
                  name: 'St. Peters High School',
                  school_code: 'SP01',
                  address: '123 Main St',
                  phone_number: '1234567890',
                  is_active: true,
                },
              },
            ],
          }
          : {
            count: 1,
            results: [
              {
                id: 1,
                name: 'St. Peters High School',
                short_name: 'SPHS',
                school_code: 'SP01',
                address: '123 Main St',
                phone_number: '1234567890',
                email: 'info@sphs.edu',
                website: 'https://sphs.edu',
                is_active: true,
                total_students: 250,
                total_teachers: 20,
                total_classes: 10,
              },
            ],
          },
      }));

      render(
        <BrowserRouter>
          <AdminList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      expect(screen.getByText('@admin_john')).toBeInTheDocument();
      expect(screen.getAllByText('St. Peters High School').length).toBeGreaterThan(0);
      expect(screen.getByText('john@sphs.edu')).toBeInTheDocument();
    });
  });

  describe('StudentList Component', () => {
    it('renders students directory with admission details', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          results: [
            {
              id: 10,
              admission_number: 'STD-1001',
              full_name: 'Alice Wonder',
              gender: 'F',
              date_of_birth: '2010-05-15',
              parent_contact: '555-0123',
              email: 'alice@wonder.edu',
              is_active: true,
              form_name: 'Form 2',
              class_name: 'Class 2B',
              learning_area: 'General Science',
            },
          ],
        }),
      });

      render(
        <BrowserRouter>
          <StudentList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice Wonder')).toBeInTheDocument();
      });

      expect(screen.getByText('STD-1001')).toBeInTheDocument();
      expect(screen.getByText('Female')).toBeInTheDocument();
      expect(screen.getByText('Class 2B')).toBeInTheDocument();
      expect(screen.getByText('General Science')).toBeInTheDocument();
    });

    it('creates a student through the versioned JSON API', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/v1/structure-lookups/') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ academic_years: [], terms: [], forms: [], learning_areas: [], departments: [] }),
          });
        }
        if (url === '/api/v1/students/') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ message: 'Student created.' }) });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ count: 0, results: [] }),
        });
      });

      render(
        <BrowserRouter>
          <StudentList />
        </BrowserRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: /new student/i }));
      await screen.findByRole('dialog');
      fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Mina Patel' } });
      fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: '2011-04-03' } });
      fireEvent.change(screen.getByLabelText(/admission date/i), { target: { value: '2026-01-05' } });
      fireEvent.change(screen.getByLabelText(/gender/i), { target: { value: 'F' } });
      fireEvent.change(screen.getByLabelText(/parent contact/i), { target: { value: '5550100' } });
      fireEvent.click(screen.getByRole('button', { name: /create student/i }));

      await waitFor(() => {
        const createCall = vi.mocked(global.fetch).mock.calls.find(([url, options]) => url === '/api/v1/students/' && (options as RequestInit).method === 'POST');
        expect(createCall).toBeDefined();
        expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toMatchObject({ full_name: 'Mina Patel' });
      });
      expect(await screen.findByText('Student created.')).toBeInTheDocument();
    });

    it('archives a student from the directory', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/v1/students/10/archive/') {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ message: 'Student archived.' }) });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            count: 1,
            results: [{ id: 10, admission_number: 'STD-1001', full_name: 'Alice Wonder', gender: 'F', date_of_birth: '2010-05-15', admission_date: '2026-01-01', parent_contact: '555-0123', email: 'alice@wonder.edu', is_active: true, form_name: 'Form 2', class_name: 'Class 2B', learning_area: 'General Science' }],
          }),
        });
      });

      render(
        <BrowserRouter>
          <StudentList />
        </BrowserRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Archive Alice Wonder' }));
      fireEvent.click(screen.getByRole('button', { name: /^Archive$/ }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/v1/students/10/archive/', expect.objectContaining({ method: 'POST' }));
      });
      expect(await screen.findByText('Student archived.')).toBeInTheDocument();
    });
  });

  describe('TeacherList Component', () => {
    it('renders teachers directory with faculty details', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          results: [
            {
              id: 20,
              staff_id: 'TCH-2001',
              full_name: 'Prof. Alan Turing',
              gender: 'M',
              department_name: 'Computer Science',
              contact_number: '555-4321',
              email: 'alan@turing.edu',
              is_active: true,
              assigned_classes_count: 4,
            },
          ],
        }),
      });

      render(
        <BrowserRouter>
          <TeacherList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Prof. Alan Turing')).toBeInTheDocument();
      });

      expect(screen.getByText('TCH-2001')).toBeInTheDocument();
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
      expect(screen.getByText('4 classes')).toBeInTheDocument();
    });

    it('creates a teacher through the versioned JSON API', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/v1/structure-lookups/') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ academic_years: [], terms: [], forms: [], learning_areas: [], departments: [{ id: 8, name: 'Science' }] }),
          });
        }
        if (url === '/api/v1/teachers/') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ message: 'Teacher created.' }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ count: 0, results: [] }) });
      });

      render(
        <BrowserRouter>
          <TeacherList />
        </BrowserRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: /new teacher/i }));
      await screen.findByRole('dialog');
      fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Dr. Grace Hopper' } });
      fireEvent.change(screen.getByLabelText(/contact number/i), { target: { value: '5550101' } });
      fireEvent.click(screen.getByRole('button', { name: /create teacher/i }));

      await waitFor(() => {
        const createCall = vi.mocked(global.fetch).mock.calls.find(([url, options]) => url === '/api/v1/teachers/' && (options as RequestInit).method === 'POST');
        expect(createCall).toBeDefined();
        expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toMatchObject({ full_name: 'Dr. Grace Hopper' });
      });
      expect(await screen.findByText('Teacher created.')).toBeInTheDocument();
    });
  });

  describe('AdminDashboard Component', () => {
    it('renders dashboard metrics and quick actions', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          school_name: 'St. Peters High School',
          total_students: 350,
          total_teachers: 28,
          total_classes: 12,
          total_quizzes: 45,
          current_academic_year: '2026/2027',
          current_term: 'Term 1',
        }),
      });

      render(
        <BrowserRouter>
          <AdminDashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('St. Peters High School — Overview')).toBeInTheDocument();
      });

      expect(screen.getByText('Academic Year: 2026/2027')).toBeInTheDocument();
      expect(screen.getByText('Term: Term 1')).toBeInTheDocument();
      expect(screen.getByText('350')).toBeInTheDocument();
      expect(screen.getByText('28')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText(/Student directory/i)).toBeInTheDocument();
      expect(screen.getByText(/Teacher directory/i)).toBeInTheDocument();
    });
  });
});
