/**
 * Type definitions for Student Workspace and Quiz Taking.
 * Governed by REACT_FRONTEND_MIGRATION_PLAN.md and docs/REACT_API_CONTRACTS.md.
 */
import type { QuizResultSchoolInfo } from './teacher';

export interface StudentDashboardQuiz {
  id: number;
  title: string;
  subject_name: string;
  duration_minutes: number;
  total_questions: number;
  total_marks: number;
  available_until: string | null;
}

export interface StudentDashboardInProgressAttempt {
  id: number;
  quiz_id: number;
  quiz_title: string;
  started_at: string | null;
  time_remaining_seconds: number | null;
}

export interface StudentDashboardRecentAttempt {
  id: number;
  quiz_id: number;
  quiz_title: string;
  subject_name: string;
  score: number;
  total_marks: number;
  percentage: number;
  is_passed: boolean;
  submitted_at: string | null;
}

export interface StudentDashboardData {
  student_name: string;
  admission_number: string;
  class_name: string | null;
  academic_year: string | null;
  term: string | null;
  total_available: number;
  total_completed: number;
  total_in_progress: number;
  avg_score: number;
  best_score: number;
  available_quizzes: StudentDashboardQuiz[];
  in_progress_attempts: StudentDashboardInProgressAttempt[];
  recent_attempts: StudentDashboardRecentAttempt[];
}

export type StudentQuizStatus =
  | 'available'
  | 'in_progress'
  | 'completed'
  | 'upcoming'
  | 'expired'
  | 'unavailable';

export interface StudentQuiz {
  id: number;
  title: string;
  description: string;
  subject_name: string;
  teacher_name: string;
  academic_year: string;
  term: string;
  duration_minutes: number;
  total_questions: number;
  total_marks: number;
  max_attempts: number;
  attempts_count: number;
  status: StudentQuizStatus;
  can_attempt: boolean;
  attempt_message: string;
  best_score: number;
  best_percentage: number;
  in_progress_attempt_id: number | null;
  available_from: string | null;
  available_until: string | null;
}

export interface StudentQuizzesResponse {
  class_name: string | null;
  quizzes: StudentQuiz[];
}

export interface StudentPastAttempt {
  id: number;
  attempt_number: number;
  score: number;
  total_marks: number;
  percentage: number;
  is_passed: boolean;
  is_submitted: boolean;
  started_at: string | null;
  submitted_at: string | null;
}

export interface StudentQuizDetail {
  id: number;
  title: string;
  description: string;
  instructions: string;
  subject_name: string;
  teacher_name: string;
  duration_minutes: number;
  total_questions: number;
  total_marks: number;
  passing_marks: number;
  pass_percentage: number;
  max_attempts: number;
  attempts_count: number;
  remaining_attempts: number;
  can_attempt: boolean;
  attempt_message: string;
  require_password: boolean;
  in_progress_attempt_id: number | null;
  best_score: number;
  best_percentage: number;
  available_from: string | null;
  available_until: string | null;
  past_attempts: StudentPastAttempt[];
}

export interface StudentTakeChoice {
  id: number;
  choice_text: string;
}

export interface StudentTakeQuestion {
  id: number;
  order: number;
  question_type: string;
  question_text: string;
  marks: number;
  section_id?: number | null;
  group_id?: number | null;
  choices: StudentTakeChoice[];
  config?: Record<string, unknown>;
}

<<<<<<< HEAD
export interface StudentTakeGroup {
  id: number;
  title: string;
  stimulus_text: string;
  order: number;
  questions: StudentTakeQuestion[];
}

export interface StudentTakeSection {
  id: number | null;
  title: string;
  instructions: string;
  order: number;
  time_limit_minutes: number | null;
  choose_n: number | null;
  questions: StudentTakeQuestion[];
  groups: StudentTakeGroup[];
  started_at: string | null;
  submitted_at: string | null;
  is_active: boolean;
  is_locked: boolean;
  remaining_seconds: number | null;
  time_expired: boolean;
}

=======
>>>>>>> 92c7848b7ae0d1cbc9f2cd6123c6ba97d96f8810
export interface StudentAnswerData {
  choice_ids?: number[];
  text?: string | string[];
  matches?: Record<string, string>;
  items?: string[];
}

export interface StudentQuestionResponse {
  selected_choice_id: number | null;
  selected_choice_ids: number[];
  text_answer: string;
  answer_data?: StudentAnswerData;
}

export interface StudentQuizTakeData {
  attempt_id: number;
  quiz_id: number;
  quiz_title: string;
  started_at: string | null;
  time_remaining_seconds: number | null;
  is_submitted: boolean;
  time_expired?: boolean;
  message?: string;
  total_questions: number;
  answered_count: number;
  questions: StudentTakeQuestion[];
  sections?: StudentTakeSection[];
  active_section_id?: number | null;
  section_timing_enabled?: boolean;
  existing_responses: Record<string, StudentQuestionResponse>;
}

export interface StudentAttemptHistoryItem {
  id: number;
  quiz_id: number;
  quiz_title: string;
  subject_name: string;
  attempt_number: number;
  score: number;
  total_marks: number;
  percentage: number;
  is_passed: boolean;
  is_submitted: boolean;
  is_completed: boolean;
  started_at: string | null;
  submitted_at: string | null;
}

export interface StudentAttemptsData {
  total_attempts: number;
  completed_attempts_count: number;
  avg_score: number;
  avg_percentage: number;
  best_percentage: number;
  attempts: StudentAttemptHistoryItem[];
}

export interface StudentReviewChoice {
  id: number;
  choice_text: string;
  is_selected: boolean;
  is_correct?: boolean;
}

export interface StudentReviewQuestion {
  id: number;
  question_text: string;
  question_type: string;
  marks: number;
  marks_obtained: number;
  is_correct: boolean;
  student_answer: string;
  correct_answer?: string;
  review_data?: {
    student_answer: unknown;
    correct_answer: unknown;
    correct_choice_ids?: number[];
  };
  explanation?: string;
  choices: StudentReviewChoice[];
}

export interface StudentQuizResultData {
  attempt_id: number;
  quiz_id: number;
  quiz_title: string;
  subject_name: string;
  student_name: string;
  admission_number: string;
  teacher_name?: string;
  academic_year?: string;
  score: number;
  total_marks: number;
  section_scores?: Array<{
    section_id: number;
    title: string;
    score: number;
    total_marks: number;
  }>;
  percentage: number;
  passing_marks: number;
  is_passed: boolean;
  started_at: string | null;
  submitted_at: string | null;
  duration_minutes?: number | null;
  correct_answers?: number;
  wrong_answers?: number;
  unanswered?: number;
  school_info?: QuizResultSchoolInfo;
  allow_review: boolean;
  show_correct_answers: boolean;
  questions: StudentReviewQuestion[];
}

export interface StartQuizResponse {
  success: boolean;
  attempt_id: number;
  resumed: boolean;
  message: string;
}

export interface SaveResponseResult {
  success: boolean;
  message?: string;
  error?: string;
  submitted?: boolean;
  answered_count?: number;
}

export interface SubmitQuizResponse {
  success: boolean;
  attempt_id: number;
  score: number;
  total_marks: number;
  section_scores?: Array<{
    section_id: number;
    title: string;
    score: number;
    total_marks: number;
  }>;
  percentage: number;
  is_passed: boolean;
  message: string;
}


export interface StudentProfilePersonal {
  id: number;
  full_name: string;
  admission_number: string;
  gender: string;
  gender_display: string;
  date_of_birth: string | null;
  parent_contact: string;
  email: string;
  admission_date: string | null;
  profile_picture_url: string | null;
  is_active: boolean;
}

export interface StudentProfileCurrentClass {
  id: number;
  name: string;
  code: string;
  academic_year: string | null;
}

export interface StudentProfileAcademic {
  school_name: string;
  school_slug: string;
  form_name: string | null;
  learning_area_name: string | null;
  current_class: StudentProfileCurrentClass | null;
}

export interface StudentProfileEnrollment {
  id: number;
  class_id: number | null;
  class_name: string;
  class_code: string;
  academic_year: string | null;
  date_assigned: string | null;
  is_active: boolean;
  assigned_by_name: string | null;
}

export interface StudentProfileRecentActivity {
  id: number;
  attempt_id: string;
  quiz_id: number | null;
  quiz_title: string;
  subject_name: string;
  score: number;
  total_marks: number;
  percentage: number;
  is_passed: boolean;
  submitted_at: string | null;
}

export interface StudentProfileStats {
  total_completed: number;
  passed_count: number;
  failed_count: number;
  pass_rate: number;
  avg_score: number;
  best_score: number;
  recent_activity: StudentProfileRecentActivity[];
}

export interface StudentProfileData {
  personal: StudentProfilePersonal;
  academic: StudentProfileAcademic;
  enrollments: StudentProfileEnrollment[];
  stats: StudentProfileStats;
}
