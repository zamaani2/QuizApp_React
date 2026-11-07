export interface AcademicYear {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  terms_count?: number;
  classes_count?: number;
  quizzes_count?: number;
}

export interface AcademicYearInput {
  name: string;
  start_date: string;
  end_date: string;
  is_current?: boolean;
}

export interface Term {
  id: number;
  academic_year_id: number;
  academic_year_name: string;
  term_number: number;
  term_display: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface TermInput {
  academic_year_id: number;
  term_number: number;
  start_date: string;
  end_date: string;
  is_current?: boolean;
}

export interface ClassItem {
  id: number;
  class_id: string;
  name: string;
  form_id: number | null;
  form_name: string;
  learning_area_id: number | null;
  learning_area_name: string;
  academic_year_id: number | null;
  academic_year_name: string;
  maximum_students: number;
  is_active: boolean;
  student_count: number;
  subject_count: number;
}

export interface ClassInput {
  name: string;
  form_id?: number | null;
  learning_area_id?: number | null;
  academic_year_id?: number | null;
  maximum_students?: number;
}

export interface EnrolledStudent {
  id: number;
  admission_number: string;
  full_name: string;
  gender: string;
  is_active: boolean;
}

export interface AssignedSubject {
  id: number; // class_subject_id
  subject_id: number;
  subject_code: string;
  subject_name: string;
  department_name: string;
  learning_area_name: string;
}

export interface ClassDetailData {
  class: ClassItem;
  students: EnrolledStudent[];
  subjects: AssignedSubject[];
}

export interface SubjectItem {
  id: number;
  subject_code: string;
  subject_name: string;
  learning_area_id: number | null;
  learning_area_name: string;
  department_id: number | null;
  department_name: string;
  is_active: boolean;
  class_count: number;
  quiz_count: number;
  school_id: number | null;
  school_name: string;
}

export interface SubjectInput {
  subject_name: string;
  learning_area_id?: number | null;
  department_id?: number | null;
  school_id?: number | null;
}

export interface SchoolSettingsData {
  school: {
    id: number;
    name: string;
    short_name: string;
    school_code: string | null;
    address: string;
    postal_code: string;
    phone_number: string;
    email: string;
    website: string;
    motto: string;
    vision: string;
    mission: string;
    report_header: string;
    report_footer: string;
    grading_system_description: string;
    current_academic_year_id: number | null;
    current_academic_year_name: string | null;
    current_term_id: number | null;
    current_term_name: string | null;
    is_active: boolean;
    logo_url: string | null;
    school_stamp_url: string | null;
  };
  stats: {
    total_students: number;
    total_teachers: number;
    total_classes: number;
    total_subjects: number;
    total_quizzes: number;
  };
}

export interface SchoolSettingsInput {
  name: string;
  school_code?: string;
  short_name?: string;
  address?: string;
  postal_code?: string;
  phone_number?: string;
  email?: string;
  website?: string;
  motto?: string;
  vision?: string;
  mission?: string;
  report_header?: string;
  report_footer?: string;
  grading_system_description?: string;
  is_active?: boolean;
  current_academic_year_id?: number | null;
  current_term_id?: number | null;
  logo?: File | null;
  school_stamp?: File | null;
}

export interface StructureLookups {
  schools?: SchoolStructureSchool[];
  academic_years: Array<{ id: number; name: string; is_current: boolean }>;
  terms: Array<{
    id: number;
    academic_year_id: number;
    term_number: number;
    term_display: string;
    is_current: boolean;
  }>;
  forms: Array<{ id: number; form_number: number; name: string }>;
  learning_areas: Array<{ id: number; code: string; name: string }>;
  classes?: Array<{ id: number; name: string; academic_year_id: number | null }>;
  departments: Array<{ id: number; code: string; name: string }>;
  available_subjects?: Array<{ id: number; subject_code: string; subject_name: string }>;
}

export interface SchoolStructureItem {
  id: number;
  name: string;
  description: string;
  school_id: number | null;
  school_name: string;
  form_number?: number;
  code?: string;
  student_count?: number;
  teacher_count?: number;
  head_of_department_id?: number | null;
  head_of_department_name?: string;
}

export interface SchoolStructureInput {
  name: string;
  description?: string;
  school_id?: number;
  form_number?: number;
  code?: string;
  head_of_department_id?: number | null;
}

export interface SchoolStructureSchool {
  id: number;
  name: string;
}

export interface SchoolStructureTeacher {
  id: number;
  full_name: string;
  school_id: number | null;
}
