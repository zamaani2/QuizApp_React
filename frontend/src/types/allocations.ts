export interface StudentEnrollment {
  id: number;
  student_id: number;
  student_name: string;
  admission_number: string;
  gender: string;
  assigned_class_id: number;
  class_name: string;
  academic_year_name: string;
  date_assigned: string | null;
  is_active: boolean;
  assigned_by_name: string | null;
  school_id: number | null;
  school_name: string;
}

export interface StudentEnrollmentInput {
  student_id: number;
  class_id: number;
}

export interface BulkEnrollmentInput {
  class_id: number;
  student_ids: number[];
}

export interface EnrollmentLookups {
  classes: Array<{
    id: number;
    class_id: string;
    name: string;
    academic_year_name: string;
    maximum_students: number;
    current_students: number;
    is_full: boolean;
    school_id: number | null;
  }>;
  students: Array<{
    id: number;
    admission_number: string;
    full_name: string;
    gender: string;
    current_class: string | null;
    school_id: number | null;
  }>;
  schools?: Array<{ id: number; name: string }>;
}

export interface TeacherAssignment {
  id: number;
  assignment_id: string;
  teacher_id: number;
  teacher_name: string;
  staff_id: string;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  class_id: number;
  class_name: string;
  academic_year_id: number;
  academic_year_name: string;
  date_assigned: string | null;
  is_active: boolean;
  previous_teacher_name: string | null;
}

export interface TeacherAssignmentInput {
  teacher_id: number;
  subject_id: number;
  class_id: number;
  academic_year_id: number;
}

export interface BulkTeacherAssignmentInput {
  teacher_id: number;
  academic_year_id: number;
  assignments: Array<{
    subject_id: number;
    class_id: number;
  }>;
}

export interface TeacherAssignmentLookups {
  teachers: Array<{ id: number; staff_id: string; full_name: string }>;
  classes: Array<{ id: number; class_id: string; name: string }>;
  academic_years: Array<{ id: number; name: string; is_current: boolean }>;
}

export interface ClassSubjectOption {
  id: number;
  subject_code: string;
  subject_name: string;
}
