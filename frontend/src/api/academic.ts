import { apiClient } from './client';
import type {
  AcademicYear,
  AcademicYearInput,
  Term,
  TermInput,
  ClassItem,
  ClassInput,
  ClassDetailData,
  EnrolledStudent,
  AssignedSubject,
  SubjectItem,
  SubjectInput,
  SchoolSettingsData,
  SchoolSettingsInput,
  StructureLookups,
  SchoolStructureInput,
  SchoolStructureItem,
  SchoolStructureSchool,
  SchoolStructureTeacher,
} from '../types';

export interface AcademicYearsResponse {
  academic_years: AcademicYear[];
}

export interface TermsResponse {
  terms: Term[];
}

export interface ClassesResponse {
  classes: ClassItem[];
}

export interface SubjectsResponse {
  subjects: SubjectItem[];
}

export interface SchoolStructureResponse {
  forms?: SchoolStructureItem[];
  learning_areas?: SchoolStructureItem[];
  departments?: SchoolStructureItem[];
  schools?: SchoolStructureSchool[];
  teachers?: SchoolStructureTeacher[];
}

interface ClassDetailApiResponse {
  class: Omit<ClassItem, 'form_name' | 'learning_area_name' | 'student_count' | 'subject_count'> & {
    form_name: string | null;
    learning_area_name: string | null;
    students_count: number;
    subjects_count: number;
  };
  enrolled_students: Array<Omit<EnrolledStudent, 'is_active'> & {
    student_id: number;
    date_assigned: string | null;
  }>;
  assigned_subjects: Array<Omit<AssignedSubject, 'learning_area_name'> & {
    class_subject_id: number;
    subject_name: string | null;
    subject_code: string | null;
    department_name: string | null;
    learning_area_name?: string | null;
  }>;
}

export const academicApi = {
  // Academic Years
  getAcademicYears: async (params?: { search?: string; is_current?: boolean }): Promise<AcademicYearsResponse> => {
    const sp = new URLSearchParams();
    if (params?.search) sp.set('search', params.search);
    if (params?.is_current !== undefined) sp.set('is_current', String(params.is_current));
    const qs = sp.toString();
    return apiClient<AcademicYearsResponse>(qs ? `/api/v1/academic-years/?${qs}` : '/api/v1/academic-years/');
  },

  createAcademicYear: async (data: AcademicYearInput): Promise<{ success: boolean; message: string; academic_year: AcademicYear }> => {
    return apiClient('/api/v1/academic-years/', {
      method: 'POST',
      body: data,
    });
  },

  updateAcademicYear: async (id: number, data: AcademicYearInput): Promise<{ success: boolean; message: string; academic_year: AcademicYear }> => {
    return apiClient(`/api/v1/academic-years/${id}/`, {
      method: 'PUT',
      body: data,
    });
  },

  deleteAcademicYear: async (id: number): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/academic-years/${id}/`, {
      method: 'DELETE',
    });
  },

  setAcademicYearCurrent: async (id: number): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/academic-years/${id}/set-current/`, {
      method: 'POST',
    });
  },

  // Terms
  getTerms: async (yearId?: number): Promise<TermsResponse> => {
    const sp = new URLSearchParams();
    if (yearId) sp.set('academic_year_id', String(yearId));
    const qs = sp.toString();
    return apiClient<TermsResponse>(qs ? `/api/v1/terms/?${qs}` : '/api/v1/terms/');
  },

  createTerm: async (data: TermInput): Promise<{ success: boolean; message: string; term: Term }> => {
    return apiClient('/api/v1/terms/', {
      method: 'POST',
      body: data,
    });
  },

  updateTerm: async (id: number, data: Partial<TermInput>): Promise<{ success: boolean; message: string; term: Term }> => {
    return apiClient(`/api/v1/terms/${id}/`, {
      method: 'PUT',
      body: data,
    });
  },

  deleteTerm: async (id: number): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/terms/${id}/`, {
      method: 'DELETE',
    });
  },

  setTermCurrent: async (id: number): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/terms/${id}/set-current/`, {
      method: 'POST',
    });
  },

  // Classes
  getClasses: async (params?: {
    academic_year_id?: number;
    form_id?: number;
    is_active?: boolean;
    search?: string;
  }): Promise<ClassesResponse> => {
    const sp = new URLSearchParams();
    if (params?.academic_year_id) sp.set('academic_year_id', String(params.academic_year_id));
    if (params?.form_id) sp.set('form_id', String(params.form_id));
    if (params?.is_active !== undefined) sp.set('is_active', String(params.is_active));
    if (params?.search) sp.set('search', params.search);
    const qs = sp.toString();
    return apiClient<ClassesResponse>(qs ? `/api/v1/classes/?${qs}` : '/api/v1/classes/');
  },

  getClassDetail: async (id: number): Promise<ClassDetailData> => {
    const response = await apiClient<ClassDetailApiResponse>(`/api/v1/classes/${id}/`);
    const { students_count, subjects_count, ...classData } = response.class;

    return {
      class: {
        ...classData,
        form_name: classData.form_name ?? '',
        learning_area_name: classData.learning_area_name ?? '',
        student_count: students_count,
        subject_count: subjects_count,
      },
      students: response.enrolled_students.map((student) => ({
        ...student,
        is_active: true,
      })),
      subjects: response.assigned_subjects.map((subject) => ({
        ...subject,
        subject_name: subject.subject_name ?? '',
        subject_code: subject.subject_code ?? '',
        department_name: subject.department_name ?? '',
        learning_area_name: subject.learning_area_name ?? '',
      })),
    };
  },

  createClass: async (data: ClassInput): Promise<{ success: boolean; message: string; class: ClassItem }> => {
    return apiClient('/api/v1/classes/', {
      method: 'POST',
      body: data,
    });
  },

  updateClass: async (id: number, data: Partial<ClassInput>): Promise<{ success: boolean; message: string; class: ClassItem }> => {
    return apiClient(`/api/v1/classes/${id}/`, {
      method: 'PUT',
      body: data,
    });
  },

  archiveClass: async (id: number): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/classes/${id}/`, {
      method: 'DELETE',
    });
  },

  restoreClass: async (id: number): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/classes/${id}/restore/`, {
      method: 'POST',
    });
  },

  assignClassSubject: async (classId: number, subjectId: number): Promise<{ success: boolean; message: string; assigned_subject: any }> => {
    return apiClient(`/api/v1/classes/${classId}/subjects/add/`, {
      method: 'POST',
      body: { subject_id: subjectId },
    });
  },

  removeClassSubject: async (classId: number, classSubjectId: number): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/classes/${classId}/subjects/${classSubjectId}/remove/`, {
      method: 'DELETE',
    });
  },

  // Subjects
  getSubjects: async (params?: {
    department_id?: number;
    learning_area_id?: number;
    school_id?: number;
    status?: 'active' | 'archived' | 'all';
    search?: string;
  }): Promise<SubjectsResponse> => {
    const sp = new URLSearchParams();
    if (params?.department_id) sp.set('department_id', String(params.department_id));
    if (params?.learning_area_id) sp.set('learning_area_id', String(params.learning_area_id));
    if (params?.school_id) sp.set('school_id', String(params.school_id));
    if (params?.status) sp.set('status', params.status);
    if (params?.search) sp.set('search', params.search);
    const qs = sp.toString();
    return apiClient<SubjectsResponse>(qs ? `/api/v1/subjects/?${qs}` : '/api/v1/subjects/');
  },

  createSubject: async (data: SubjectInput): Promise<{ success: boolean; message: string; subject: SubjectItem }> => {
    return apiClient('/api/v1/subjects/', {
      method: 'POST',
      body: data,
    });
  },

  updateSubject: async (id: number, data: Partial<SubjectInput>): Promise<{ success: boolean; message: string; subject: SubjectItem }> => {
    return apiClient(`/api/v1/subjects/${id}/`, {
      method: 'PUT',
      body: data,
    });
  },

  archiveSubject: async (id: number): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/subjects/${id}/`, {
      method: 'DELETE',
    });
  },

  restoreSubject: async (id: number): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/subjects/${id}/restore/`, {
      method: 'POST',
    });
  },

  // Forms, learning areas, and departments
  getSchoolStructure: async (
    resource: 'forms' | 'learning-areas' | 'departments',
    schoolId?: number,
  ): Promise<SchoolStructureResponse> => {
    const query = schoolId ? `?school_id=${schoolId}` : '';
    return apiClient<SchoolStructureResponse>(
      `/api/v1/school-structure/${resource}/${query}`,
    );
  },

  createSchoolStructureItem: async (
    resource: 'forms' | 'learning-areas' | 'departments',
    data: SchoolStructureInput,
  ): Promise<{ success: boolean; message: string; item: SchoolStructureItem }> => {
    return apiClient(`/api/v1/school-structure/${resource}/`, {
      method: 'POST',
      body: data,
    });
  },

  updateSchoolStructureItem: async (
    resource: 'forms' | 'learning-areas' | 'departments',
    id: number,
    data: SchoolStructureInput,
  ): Promise<{ success: boolean; message: string; item: SchoolStructureItem }> => {
    return apiClient(`/api/v1/school-structure/${resource}/${id}/`, {
      method: 'PUT',
      body: data,
    });
  },

  deleteSchoolStructureItem: async (
    resource: 'forms' | 'learning-areas' | 'departments',
    id: number,
  ): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/api/v1/school-structure/${resource}/${id}/`, {
      method: 'DELETE',
    });
  },

  // School Settings
  getSchoolSettings: async (): Promise<SchoolSettingsData> => {
    return apiClient<SchoolSettingsData>('/api/v1/school/');
  },

  updateSchoolSettings: async (data: SchoolSettingsInput): Promise<{
    success: boolean;
    message: string;
    school: { id: number; name: string; short_name: string; school_code: string | null };
  }> => {
    const body = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) {
        if (key.endsWith('_id')) body.set(key, '');
      } else if (value instanceof File) {
        body.set(key, value);
      } else {
        body.set(key, String(value));
      }
    }
    return apiClient('/api/v1/school/', {
      method: 'POST',
      body,
    });
  },

  // Lookups
  getStructureLookups: async (params?: { class_id?: number; academic_year_id?: number; school_id?: number }): Promise<StructureLookups> => {
    const sp = new URLSearchParams();
    if (params?.class_id) sp.set('class_id', String(params.class_id));
    if (params?.academic_year_id) sp.set('academic_year_id', String(params.academic_year_id));
    if (params?.school_id) sp.set('school_id', String(params.school_id));
    const qs = sp.toString();
    return apiClient<StructureLookups>(qs ? `/api/v1/structure-lookups/?${qs}` : '/api/v1/structure-lookups/');
  },
};
