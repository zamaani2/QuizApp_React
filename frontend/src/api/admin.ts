import { apiClient } from './client';
import type {
  SuperadminSchool,
  SuperadminAdmin,
  StudentListItem,
  TeacherListItem,
  StudentAdminInput,
  TeacherAdminInput,
  AdminDashboardOverview,
  PaginatedResponse,
  SuperadminDashboardResponse,
  SuperadminSchoolDetailResponse,
  SuperadminAdminDetailResponse,
} from '../types';

export type UserRole = 'admin' | 'superadmin' | 'teacher' | 'student';

export interface UserFilters {
  search?: string;
  role?: UserRole | 'all';
  school_id?: number;
  page?: number;
}

export interface UserAdminRecord {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  last_login: string | null;
  school: {
    id: number;
    name: string;
    school_code: string;
  } | null;
}

export interface UserAdminInput {
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  school?: number | '';
  password?: string;
}

export interface StudentFilters {
  class_id?: number;
  form_id?: number;
  learning_area_id?: number;
  gender?: string;
  search?: string;
  page?: number;
  status?: 'active' | 'archived' | 'all';
  school_id?: number;
}

export interface TeacherFilters {
  department_id?: number;
  search?: string;
  page?: number;
  is_active?: boolean;
  school_id?: number;
}

export async function fetchSuperadminSchools(): Promise<PaginatedResponse<SuperadminSchool>> {
  return apiClient<PaginatedResponse<SuperadminSchool>>('/api/v1/superadmin/schools/');
}

export async function fetchSuperadminSchool(id: number): Promise<SuperadminSchoolDetailResponse> {
  return apiClient<SuperadminSchoolDetailResponse>(`/api/v1/superadmin/schools/${id}/`);
}

export async function createSuperadminSchool(body: FormData) {
  return apiClient<{ success: boolean; message: string; school_id: number }>(
    '/api/v1/superadmin/schools/',
    { method: 'POST', body }
  );
}

export async function updateSuperadminSchool(id: number, body: FormData) {
  return apiClient<{ success: boolean; message: string; school_id: number }>(
    `/api/v1/superadmin/schools/${id}/`,
    { method: 'POST', body }
  );
}

export async function deleteSuperadminSchool(id: number) {
  return apiClient<{ success: boolean; message: string }>(
    `/api/v1/superadmin/schools/${id}/`,
    { method: 'DELETE' }
  );
}

export async function fetchSuperadminAdmins(): Promise<PaginatedResponse<SuperadminAdmin>> {
  return apiClient<PaginatedResponse<SuperadminAdmin>>('/api/v1/superadmin/admins/');
}

export async function fetchSuperadminAdmin(id: number): Promise<SuperadminAdminDetailResponse> {
  return apiClient<SuperadminAdminDetailResponse>(`/api/v1/superadmin/admins/${id}/`);
}

export async function createSuperadminAdmin(body: FormData) {
  return apiClient<{
    success: boolean;
    message: string;
    admin_id: number;
    password_setup_email_scheduled: boolean;
  }>('/api/v1/superadmin/admins/', { method: 'POST', body });
}

export async function updateSuperadminAdmin(id: number, body: FormData) {
  return apiClient<{ success: boolean; message: string; admin_id: number }>(
    `/api/v1/superadmin/admins/${id}/`,
    { method: 'POST', body }
  );
}

export async function deleteSuperadminAdmin(id: number) {
  return apiClient<{ success: boolean; message: string }>(
    `/api/v1/superadmin/admins/${id}/`,
    { method: 'DELETE' }
  );
}

export async function fetchSuperadminDashboard(): Promise<SuperadminDashboardResponse> {
  return apiClient<SuperadminDashboardResponse>('/api/v1/superadmin/dashboard/');
}

export async function fetchUsers(filters: UserFilters = {}): Promise<PaginatedResponse<UserAdminRecord>> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.role && filters.role !== 'all') params.set('role', filters.role);
  if (filters.school_id) params.set('school_id', String(filters.school_id));
  if (filters.page) params.set('page', String(filters.page));
  const queryString = params.toString();
  const url = queryString ? `/api/v1/users/?${queryString}` : '/api/v1/users/';
  return apiClient<PaginatedResponse<UserAdminRecord>>(url);
}

export async function createUser(data: UserAdminInput) {
  return apiClient<{ message: string; user_id: number }>('/api/v1/users/', {
    method: 'POST',
    body: data,
  });
}

export async function updateUser(id: number, data: UserAdminInput) {
  return apiClient<{ message: string }>(`/api/v1/users/${id}/`, {
    method: 'PATCH',
    body: { ...data, id },
  });
}

export async function deleteUser(id: number) {
  return apiClient<{ message: string }>(`/api/v1/users/${id}/`, {
    method: 'DELETE',
  });
}

export async function bulkResetUserPasswords(userIds: number[], schoolId?: number) {
  return apiClient<{ message: string }>('/api/v1/users/bulk-password-reset/', {
    method: 'POST',
    body: { user_ids: userIds, school_id: schoolId ?? null },
  });
}

export async function fetchStudents(
  filters: StudentFilters = {}
): Promise<PaginatedResponse<StudentListItem>> {
  const params = new URLSearchParams();
  if (filters.class_id) params.set('class_id', String(filters.class_id));
  if (filters.form_id) params.set('form_id', String(filters.form_id));
  if (filters.learning_area_id) params.set('learning_area_id', String(filters.learning_area_id));
  if (filters.gender) params.set('gender', filters.gender);
  if (filters.search) params.set('search', filters.search);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.status) params.set('status', filters.status);
  if (filters.school_id) params.set('school_id', String(filters.school_id));

  const queryString = params.toString();
  const url = queryString ? `/api/v1/students/?${queryString}` : '/api/v1/students/';
  return apiClient<PaginatedResponse<StudentListItem>>(url);
}

export async function fetchTeachers(
  filters: TeacherFilters = {}
): Promise<PaginatedResponse<TeacherListItem>> {
  const params = new URLSearchParams();
  if (filters.department_id) params.set('department_id', String(filters.department_id));
  if (filters.search) params.set('search', filters.search);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.is_active !== undefined) params.set('is_active', String(filters.is_active));
  if (filters.school_id) params.set('school_id', String(filters.school_id));

  const queryString = params.toString();
  const url = queryString ? `/api/v1/teachers/?${queryString}` : '/api/v1/teachers/';
  return apiClient<PaginatedResponse<TeacherListItem>>(url);
}

export async function fetchAdminDashboard(): Promise<AdminDashboardOverview> {
  return apiClient<AdminDashboardOverview>('/api/v1/dashboard/admin/');
}

export async function createStudent(data: StudentAdminInput) {
  return apiClient<{ message: string; student_id: number; admission_number: string }>(
    '/api/v1/students/',
    { method: 'POST', body: data }
  );
}

export async function updateStudent(id: number, data: StudentAdminInput) {
  return apiClient<{ message: string; student_id: number }>(
    `/api/v1/students/${id}/`,
    { method: 'PATCH', body: data }
  );
}

export async function archiveStudent(id: number) {
  return apiClient<{ message: string }>(`/api/v1/students/${id}/archive/`, { method: 'POST' });
}

export async function restoreStudent(id: number) {
  return apiClient<{ message: string }>(`/api/v1/students/${id}/restore/`, { method: 'POST' });
}

export async function bulkArchiveStudents(studentIds: number[], action: 'archive' | 'restore', schoolId?: number) {
  return apiClient<{ updated: number; message: string }>('/api/v1/students/bulk-archive/', {
    method: 'POST',
    body: { student_ids: studentIds, action, ...(schoolId ? { school_id: schoolId } : {}) },
  });
}

export interface StudentImportPreview {
  success: boolean;
  headers: string[];
  preview_rows: Array<Record<string, string>>;
}

export interface StudentImportResult {
  success: boolean;
  complete: boolean;
  partial_success: boolean;
  imported: number;
  assigned_to_class: number;
  errors: string[];
  message: string;
  error_summary?: string;
}

export async function previewStudentImport(file: File): Promise<StudentImportPreview> {
  const body = new FormData();
  body.set('file', file);
  return apiClient<StudentImportPreview>('/api/v1/students/import/preview/', {
    method: 'POST',
    body,
  });
}

export async function bulkImportStudents(
  file: File,
  mappings: Record<string, string>,
  classId?: number,
  schoolId?: number
): Promise<StudentImportResult> {
  const body = new FormData();
  body.set('file', file);
  body.set('column_mappings', JSON.stringify(mappings));
  if (classId) body.set('assign_class', String(classId));
  if (schoolId) body.set('school_id', String(schoolId));
  return apiClient<StudentImportResult>('/api/v1/students/import/', {
    method: 'POST',
    body,
  });
}

export async function createTeacher(data: TeacherAdminInput) {
  return apiClient<{ message: string; teacher_id: number; staff_id: string }>(
    '/api/v1/teachers/',
    { method: 'POST', body: data }
  );
}

export async function updateTeacher(id: number, data: TeacherAdminInput) {
  return apiClient<{ message: string; teacher_id: number }>(
    `/api/v1/teachers/${id}/`,
    { method: 'PATCH', body: data }
  );
}

export async function archiveTeacher(id: number) {
  return apiClient<{ message: string }>(`/api/v1/teachers/${id}/archive/`, { method: 'POST' });
}

export async function restoreTeacher(id: number) {
  return apiClient<{ message: string }>(`/api/v1/teachers/${id}/restore/`, { method: 'POST' });
}

export async function bulkArchiveTeachers(
  teacherIds: number[],
  action: 'archive' | 'restore',
  schoolId?: number
) {
  return apiClient<{ updated: number; message: string }>('/api/v1/teachers/bulk-archive/', {
    method: 'POST',
    body: { teacher_ids: teacherIds, action, ...(schoolId ? { school_id: schoolId } : {}) },
  });
}

export interface TeacherImportPreview {
  headers: string[];
  preview_rows: Array<Record<string, string>>;
}

export interface TeacherImportResult {
  imported: number;
  errors: string[];
  message: string;
  partial_success: boolean;
}

export async function previewTeacherImport(file: File): Promise<TeacherImportPreview> {
  const body = new FormData();
  body.set('file', file);
  return apiClient<TeacherImportPreview>(
    '/api/v1/teachers/import/preview/',
    { method: 'POST', body }
  );
}

export async function bulkImportTeachers(
  file: File,
  mappings: Record<string, string>,
  schoolId?: number,
  defaultDepartment?: number
): Promise<TeacherImportResult> {
  const body = new FormData();
  body.set('file', file);
  body.set('column_mappings', JSON.stringify(mappings));
  if (schoolId) body.set('school_id', String(schoolId));
  if (defaultDepartment) body.set('default_department', String(defaultDepartment));
  return apiClient<TeacherImportResult>(
    '/api/v1/teachers/import/',
    { method: 'POST', body }
  );
}
