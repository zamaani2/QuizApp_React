export interface SuperadminSchool {
  id: number;
  name: string;
  short_name: string;
  school_code: string;
  address: string;
  phone_number: string;
  email: string;
  website: string;
  is_active: boolean;
  current_academic_year?: string | null;
  total_students: number;
  total_teachers: number;
  total_classes: number;
}

export interface SuperadminSchoolAcademicYear {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface SuperadminSchoolTerm {
  id: number;
  name: string;
  term_number: number;
  academic_year_id: number;
  academic_year_name: string;
}

export interface SuperadminSchoolDetail {
  id: number;
  name: string;
  short_name: string;
  slug: string;
  address: string;
  postal_code: string;
  phone_number: string;
  email: string;
  website: string;
  school_code: string;
  is_active: boolean;
  motto: string;
  vision: string;
  mission: string;
  report_header: string;
  report_footer: string;
  grading_system_description: string;
  logo_url: string | null;
  school_stamp_url: string | null;
  current_academic_year: Pick<SuperadminSchoolAcademicYear, 'id' | 'name'> | null;
  current_term: Pick<
    SuperadminSchoolTerm,
    'id' | 'name' | 'term_number' | 'academic_year_id' | 'academic_year_name'
  > | null;
  academic_years: SuperadminSchoolAcademicYear[];
  terms: SuperadminSchoolTerm[];
  created_at: string;
  updated_at: string;
  created_by_name: string;
}

export interface SuperadminSchoolDetailResponse {
  school: SuperadminSchoolDetail;
}

export interface SuperadminAdmin {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  date_joined: string;
  last_login: string | null;
  last_login_ip: string | null;
  school: {
    id: number;
    name: string;
    school_code: string;
    address: string;
    phone_number: string;
    is_active: boolean;
  } | null;
}

export interface SuperadminAdminDetailResponse {
  admin: SuperadminAdmin;
}

export interface StudentListItem {
  id: number;
  admission_number: string;
  full_name: string;
  gender: string;
  date_of_birth: string | null;
  admission_date?: string | null;
  parent_contact: string;
  email?: string;
  is_active: boolean;
  form_name?: string | null;
  form_id?: number | null;
  learning_area_id?: number | null;
  school_id?: number | null;
  school_name?: string;
  class_name?: string;
  learning_area?: string | null;
}

export interface TeacherListItem {
  id: number;
  staff_id: string;
  full_name: string;
  gender: string;
  department_name?: string;
  department_id?: number | null;
  contact_number: string;
  email: string;
  is_active: boolean;
  assigned_classes_count?: number;
}

export interface StudentAdminInput {
  full_name: string;
  date_of_birth: string;
  gender: string;
  parent_contact: string;
  admission_date: string;
  email: string;
  form: number | '';
  learning_area: number | '';
  school_id?: number | '';
}

export interface TeacherAdminInput {
  full_name: string;
  gender: string;
  contact_number: string;
  email: string;
  department: number | '';
}

export interface AdminDashboardOverview {
  school_name: string;
  total_students: number;
  total_teachers: number;
  total_classes: number;
  total_quizzes: number;
  active_academic_year: string | null;
  active_term: string | null;
  current_academic_year?: string | null;
  current_term?: string | null;
}

export interface SuperadminDashboardStats {
  total_schools: number;
  inactive_schools: number;
  total_users: number;
  total_admins: number;
  total_teachers: number;
  total_students: number;
  total_superadmins: number;
  total_students_all: number;
  total_teachers_all: number;
  total_classes: number;
  total_subjects: number;
  total_quizzes: number;
  published_quizzes: number;
  draft_quizzes: number;
  total_attempts: number;
  completed_attempts: number;
}

export interface SuperadminDashboardSchool {
  id: number;
  name: string;
  is_active: boolean;
  created_at?: string | null;
  user_count?: number;
  student_count?: number;
}

export interface SuperadminDashboardQuiz {
  id: number;
  title: string;
  status: string;
  school_name: string;
  teacher_name: string;
  subject_name: string;
  created_at: string | null;
}

export interface SuperadminDashboardResponse {
  stats: SuperadminDashboardStats;
  recent_schools: SuperadminDashboardSchool[];
  schools_with_users: SuperadminDashboardSchool[];
  schools_with_students: SuperadminDashboardSchool[];
  recent_quizzes: SuperadminDashboardQuiz[];
}

export interface PaginatedResponse<T> {
  count: number;
  page?: number;
  total_pages?: number;
  results: T[];
}
