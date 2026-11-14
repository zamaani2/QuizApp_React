export interface TeacherRecentQuiz {
  id: number;
  title: string;
  subject_name: string;
  status: 'draft' | 'published' | 'archived';
  total_questions: number;
  total_marks: number;
  created_at: string | null;
}

export interface TeacherRecentAttempt {
  id: number;
  quiz_title: string;
  student_name: string;
  admission_number: string;
  score: number;
  total_marks: number;
  percentage: number;
  submitted_at: string | null;
  is_graded: boolean;
}

export interface TeacherDashboardData {
  teacher_name: string;
  total_quizzes: number;
  published_quizzes: number;
  draft_quizzes: number;
  archived_quizzes: number;
  total_attempts: number;
  completed_attempts_count: number;
  quizzes_needing_grading_count: number;
  avg_score: number;
  recent_quizzes: TeacherRecentQuiz[];
  recent_attempts: TeacherRecentAttempt[];
}

export interface QuizListItem {
  id: number;
  title: string;
  subject_name: string;
  academic_year: string;
  term: string;
  status: 'draft' | 'published' | 'archived';
  duration_minutes: number;
  total_questions: number;
  total_marks: number;
  total_attempts: number;
  has_attempts?: boolean;
  avg_score: number;
  created_at: string | null;
  classes?: { id: number; name: string }[];
  available_from?: string | null;
  available_until?: string | null;
}

export interface AnswerChoiceItem {
  id: number;
  choice_text: string;
  is_correct: boolean;
}

export interface QuestionDetailItem {
  id: number;
  question_text: string;
  question_type: string;
  marks: number;
  order: number;
  explanation?: string;
  correct_answer_text?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  negative_marks?: number;
  is_required?: boolean;
  section_id?: number | null;
  group_id?: number | null;
  choices: AnswerChoiceItem[];
  config?: Record<string, unknown>;
}

export interface QuestionGroupData {
  id: number;
  title: string;
  stimulus_text: string;
  order: number;
}

export interface QuizSectionData {
  id: number;
  title: string;
  instructions: string;
  order: number;
  time_limit_minutes: number | null;
  choose_n: number | null;
  question_ids: number[];
  groups: QuestionGroupData[];
}

export interface QuizDetailData {
  id: number;
  title: string;
  description: string;
  instructions?: string;
  subject_name: string;
  subject_id?: number;
  category_id?: number | null;
  teacher_id?: number;
  academic_year: string;
  academic_year_id?: number | null;
  term: string;
  term_id?: number | null;
  status: 'draft' | 'published' | 'archived';
  difficulty?: 'easy' | 'medium' | 'hard';
  duration_minutes: number;
  passing_marks?: number;
  pass_percentage: number;
  max_attempts: number;
  available_from?: string | null;
  available_until?: string | null;
  randomize_questions?: boolean;
  randomize_answers?: boolean;
  show_results_immediately?: boolean;
  results_released_at?: string | null;
  show_correct_answers?: boolean;
  allow_review?: boolean;
  require_password?: boolean;
  quiz_password?: string;
  total_questions: number;
  total_marks: number;
  total_attempts: number;
  has_attempts?: boolean;
  assigned_classes: { id: number; name: string }[];
  questions: QuestionDetailItem[];
  sections?: QuizSectionData[];
}

export interface QuizResultItem {
  id: number;
  quiz_id: number;
  quiz_title: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  score: number;
  total_marks: number;
  percentage: number;
  attempt_number: number;
  is_passed: boolean;
  needs_grading: boolean;
  is_graded: boolean;
  has_pending_essay: boolean;
  started_at: string | null;
  submitted_at: string | null;
}

export interface GradingQueueItem {
  id: number;
  quiz_id: number;
  quiz_title: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  submitted_at: string | null;
  ungraded_responses_count: number;
  is_graded: boolean;
}

export interface QuizFormOptions {
  subjects: { id: number; name: string }[];
  classes: { id: number; name: string }[];
  academic_years: { id: number; name: string }[];
  terms: { id: number; academic_year_id: number; name: string }[];
  categories: { id: number; name: string }[];
  teachers: { id: number; name: string }[];
  is_admin: boolean;
}

export interface QuizAssignmentsData {
  quiz_id: number;
  quiz_title: string;
  assigned_classes: { id: number; name: string }[];
  available_classes: { id: number; name: string }[];
}

export interface GradingResponse {
  id: number;
  question_text: string;
  question_type?: string;
  question_marks: number;
  marks_awarded: number;
  text_answer: string;
  student_answer?: unknown;
  grading_notes: string;
  is_graded: boolean;
}

export interface GradingAttemptData {
  id: number;
  quiz_id: number;
  quiz_title: string;
  student_name: string;
  admission_number: string;
  score: number;
  total_marks: number;
  responses: GradingResponse[];
}

export interface TeacherResultResponse {
  id: number;
  question_text: string;
  question_type: string;
  marks: number;
  marks_awarded: number;
  text_answer: string;
  selected_choice: string;
  selected_choices: string[];
  is_correct: boolean;
  is_answered?: boolean;
  answer_key: string;
  correct_choices: string[];
  grading_notes: string;
  answer_data?: Record<string, unknown>;
  review_data?: {
    student_answer: unknown;
    correct_answer: unknown;
  };
}

export interface QuizResultSchoolInfo {
  name: string;
  address: string;
  phone_number: string;
  email: string;
  logo_url: string | null;
}

export interface TeacherResultDetail {
  id: number;
  quiz_title: string;
  student_name: string;
  admission_number: string;
  subject_name?: string;
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
  submitted_at: string | null;
  duration_minutes?: number | null;
  correct_answers?: number;
  wrong_answers?: number;
  unanswered?: number;
  school_info?: QuizResultSchoolInfo;
  is_graded: boolean;
  responses: TeacherResultResponse[];
}
