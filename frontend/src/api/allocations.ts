import { apiClient } from './client';
import type {
  StudentEnrollment,
  StudentEnrollmentInput,
  BulkEnrollmentInput,
  EnrollmentLookups,
  TeacherAssignment,
  TeacherAssignmentInput,
  BulkTeacherAssignmentInput,
  TeacherAssignmentLookups,
  ClassSubjectOption,
} from '../types';

export interface EnrollmentsResponse {
  enrollments: StudentEnrollment[];
  count: number;
}

export interface TeacherAssignmentsResponse {
  assignments: TeacherAssignment[];
  count: number;
}

export const allocationsApi = {
  // Student Class Enrollments
  getEnrollments: async (params?: {
    search?: string;
    class_id?: number;
    student_id?: number;
    is_active?: boolean;
    school_id?: number;
  }): Promise<EnrollmentsResponse> => {
    const sp = new URLSearchParams();
    if (params?.search) sp.set('search', params.search);
    if (params?.class_id) sp.set('class_id', String(params.class_id));
    if (params?.student_id) sp.set('student_id', String(params.student_id));
    if (params?.is_active !== undefined) sp.set('is_active', String(params.is_active));
    if (params?.school_id) sp.set('school_id', String(params.school_id));
    const qs = sp.toString();
    return apiClient<EnrollmentsResponse>(qs ? `/api/v1/enrollments/?${qs}` : '/api/v1/enrollments/');
  },

  createEnrollment: async (
    data: StudentEnrollmentInput
  ): Promise<{ success: boolean; message: string; enrollment: StudentEnrollment }> => {
    return apiClient('/api/v1/enrollments/', {
      method: 'POST',
      body: data,
    });
  },

  bulkEnrollStudents: async (
    data: BulkEnrollmentInput
  ): Promise<{
    success: boolean;
    created: number;
    enrolled_count: number;
    skipped: number;
    skipped_count: number;
    errors: string[];
    error_count: number;
    message: string;
  }> => {
    return apiClient('/api/v1/enrollments/bulk/', {
      method: 'POST',
      body: data,
    });
  },

  updateEnrollment: async (
    id: number,
    data: { class_id?: number; is_active?: boolean }
  ): Promise<{ success: boolean; message: string; enrollment: StudentEnrollment }> => {
    return apiClient(`/api/v1/enrollments/${id}/`, {
      method: 'PUT',
      body: data,
    });
  },

  deleteEnrollment: async (id: number): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/enrollments/${id}/`, {
      method: 'DELETE',
    });
  },

  bulkDeleteEnrollments: async (
    enrollmentIds: number[],
    targetSchoolId?: number,
  ): Promise<{ success: boolean; unassigned_count: number; message: string }> => {
    return apiClient('/api/v1/enrollments/bulk-delete/', {
      method: 'POST',
      body: {
        enrollment_ids: enrollmentIds,
        ...(targetSchoolId ? { target_school_id: targetSchoolId } : {}),
      },
    });
  },

  getEnrollmentLookups: async (schoolId?: number): Promise<EnrollmentLookups> => {
    const query = schoolId ? `?school_id=${schoolId}` : '';
    return apiClient<EnrollmentLookups>(`/api/v1/enrollments/lookups/${query}`);
  },

  // Teacher Subject Assignments
  getTeacherAssignments: async (params?: {
    search?: string;
    teacher_id?: number;
    subject_id?: number;
    class_id?: number;
    academic_year_id?: number;
    is_active?: boolean;
  }): Promise<TeacherAssignmentsResponse> => {
    const sp = new URLSearchParams();
    if (params?.search) sp.set('search', params.search);
    if (params?.teacher_id) sp.set('teacher_id', String(params.teacher_id));
    if (params?.subject_id) sp.set('subject_id', String(params.subject_id));
    if (params?.class_id) sp.set('class_id', String(params.class_id));
    if (params?.academic_year_id) sp.set('academic_year_id', String(params.academic_year_id));
    if (params?.is_active !== undefined) sp.set('is_active', String(params.is_active));
    const qs = sp.toString();
    return apiClient<TeacherAssignmentsResponse>(
      qs ? `/api/v1/teacher-assignments/?${qs}` : '/api/v1/teacher-assignments/'
    );
  },

  createTeacherAssignment: async (
    data: TeacherAssignmentInput
  ): Promise<{ success: boolean; message: string; assignment: TeacherAssignment }> => {
    return apiClient('/api/v1/teacher-assignments/', {
      method: 'POST',
      body: data,
    });
  },

  bulkAssignTeacher: async (
    data: BulkTeacherAssignmentInput
  ): Promise<{
    success: boolean;
    assigned_count: number;
    skipped_count: number;
    errors: string[];
    message: string;
  }> => {
    return apiClient('/api/v1/teacher-assignments/bulk/', {
      method: 'POST',
      body: data,
    });
  },

  updateTeacherAssignment: async (
    id: number,
    data: { teacher_id?: number; is_active?: boolean }
  ): Promise<{ success: boolean; message: string; assignment: TeacherAssignment }> => {
    return apiClient(`/api/v1/teacher-assignments/${id}/`, {
      method: 'PUT',
      body: data,
    });
  },

  deleteTeacherAssignment: async (id: number): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/teacher-assignments/${id}/`, {
      method: 'DELETE',
    });
  },

  getTeacherAssignmentLookups: async (): Promise<TeacherAssignmentLookups> => {
    return apiClient<TeacherAssignmentLookups>('/api/v1/teacher-assignments/lookups/');
  },

  getClassSubjects: async (
    classId: number,
    academicYearId?: number
  ): Promise<{ subjects: ClassSubjectOption[] }> => {
    const sp = new URLSearchParams({ class_id: String(classId) });
    if (academicYearId) sp.set('academic_year_id', String(academicYearId));
    return apiClient<{ subjects: ClassSubjectOption[] }>(
      `/api/v1/teacher-assignments/class-subjects/?${sp.toString()}`
    );
  },
};
