import { apiClient } from './client';
import type {
  TeacherDashboardData,
  QuizListItem,
  QuizDetailData,
  QuizResultItem,
  GradingQueueItem,
  PaginatedResponse,
  QuizFormOptions,
  QuizAssignmentsData,
  GradingAttemptData,
  TeacherResultDetail,
  QuizSectionData,
  QuestionGroupData,
} from '../types';

export interface QuizFilters {
  status?: string;
  search?: string;
  page?: number;
}

export interface ResultFilters {
  quiz_id?: number;
  search?: string;
  page?: number;
}

export async function fetchTeacherDashboard(): Promise<TeacherDashboardData> {
  return apiClient<TeacherDashboardData>('/api/v1/dashboard/teacher/');
}

export async function fetchTeacherQuizzes(
  filters: QuizFilters = {}
): Promise<PaginatedResponse<QuizListItem>> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.page) params.set('page', String(filters.page));

  const qs = params.toString();
  const url = qs ? `/api/v1/teacher/quizzes/?${qs}` : '/api/v1/teacher/quizzes/';
  return apiClient<PaginatedResponse<QuizListItem>>(url);
}

export async function fetchTeacherQuizDetail(quizId: number): Promise<QuizDetailData> {
  return apiClient<QuizDetailData>(`/api/v1/teacher/quizzes/${quizId}/`);
}

export async function fetchQuizFormOptions(quizId?: number): Promise<QuizFormOptions> {
  const query = quizId ? `?quiz_id=${quizId}` : '';
  return apiClient<QuizFormOptions>(`/api/v1/teacher/quiz-options/${query}`);
}

const QUIZ_FLAGS = [
  'randomize_questions',
  'randomize_answers',
  'show_results_immediately',
  'show_correct_answers',
  'allow_review',
  'require_password',
] as const;

function quizPayloadFromForm(formData: FormData): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    const existing = data[key];
    if (existing === undefined) data[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else data[key] = [existing, value];
  }
  for (const flag of QUIZ_FLAGS) {
    data[flag] = formData.get(flag) === 'on';
  }
  data.classes = formData.getAll('classes').map(String).filter(Boolean);
  return data;
}

export async function saveQuiz(
  quizId: number | null,
  data: FormData | Record<string, unknown>
): Promise<{ success: boolean; quiz_id: number; message: string }> {
  const payload = data instanceof FormData ? quizPayloadFromForm(data) : data;
  if (quizId) {
    return apiClient(`/api/v1/teacher/quizzes/${quizId}/`, {
      method: 'PATCH',
      body: payload,
    });
  }
  return apiClient('/api/v1/teacher/quizzes/', {
    method: 'POST',
    body: payload,
  });
}

export async function updateQuizStatus(quizId: number, status: string): Promise<{success: boolean; message: string}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/status/`, {
    method: 'POST',
    body: { status },
  });
}

export async function releaseQuizResults(
  quizId: number
): Promise<{ success: boolean; results_released_at: string; message: string }> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/release-results/`, {
    method: 'POST',
    body: {},
  });
}

export async function deleteQuiz(quizId: number): Promise<{success: boolean; message: string}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/`, {
    method: 'DELETE',
  });
}

export async function fetchQuizAssignments(quizId: number): Promise<QuizAssignmentsData> {
  return apiClient<QuizAssignmentsData>(`/api/v1/teacher/quizzes/${quizId}/assignments/`);
}

export async function assignQuizClasses(quizId: number, classIds: number[]): Promise<{success: boolean; message: string}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/assignments/`, {
    method: 'POST',
    body: { class_ids: classIds },
  });
}

export async function unassignQuizClass(quizId: number, classId: number): Promise<{success: boolean; message: string}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/assignments/${classId}/`, {
    method: 'DELETE',
  });
}

export async function setQuizClasses(quizId: number, classIds: number[]): Promise<{
  success: boolean;
  added_count: number;
  removed_count: number;
  message: string;
}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/assignments/set/`, {
    method: 'POST',
    body: { class_ids: classIds },
  });
}

export async function saveQuestion(
  quizId: number,
  questionId: number | null,
  payload: Record<string, unknown>
): Promise<{success: boolean; question_id: number; message: string}> {
  if (questionId) {
    return apiClient(`/api/v1/teacher/quizzes/${quizId}/questions/${questionId}/`, {
      method: 'PATCH',
      body: payload,
    });
  }
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/questions/`, {
    method: 'POST',
    body: payload,
  });
}

export async function deleteQuestion(quizId: number, questionId: number): Promise<{success: boolean; message: string}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/questions/${questionId}/`, {
    method: 'DELETE',
  });
}

export async function duplicateQuestion(quizId: number, questionId: number): Promise<{success: boolean; question_id: number; message: string}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/questions/${questionId}/duplicate/`, {
    method: 'POST',
  });
}

export async function reorderQuizQuestions(
  quizId: number,
  questionIds: number[]
): Promise<{success: boolean; message: string}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/questions/reorder/`, {
    method: 'POST',
    body: { question_ids: questionIds },
  });
}

export async function bulkDeleteQuestions(
  quizId: number,
  questionIds: number[]
): Promise<{ success: boolean; message: string }> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/questions/bulk-delete/`, {
    method: 'POST',
    body: { question_ids: questionIds },
  });
}

export async function createQuizSection(
  quizId: number,
  payload: { title: string; instructions?: string; order?: number; time_limit_minutes?: number | null; choose_n?: number | null }
): Promise<{success: boolean; section: QuizSectionData}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/sections/`, {
    method: 'POST',
    body: payload,
  });
}

export async function updateQuizSection(
  quizId: number,
  sectionId: number,
  payload: { title: string; instructions?: string; order?: number; time_limit_minutes?: number | null; choose_n?: number | null }
): Promise<{success: boolean; section: QuizSectionData}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/sections/${sectionId}/`, {
    method: 'PATCH',
    body: payload,
  });
}

export async function deleteQuizSection(quizId: number, sectionId: number): Promise<{success: boolean}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/sections/${sectionId}/`, {
    method: 'DELETE',
  });
}

export async function reorderQuizSections(quizId: number, sectionIds: number[]): Promise<{success: boolean}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/sections/reorder/`, {
    method: 'POST',
    body: { section_ids: sectionIds },
  });
}

export async function createQuizQuestionGroup(
  quizId: number,
  payload: { section_id: number | null; title: string; stimulus_text: string; order?: number }
): Promise<{success: boolean; group: QuestionGroupData}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/groups/`, {
    method: 'POST',
    body: payload,
  });
}

export async function updateQuizQuestionGroup(
  quizId: number,
  groupId: number,
  payload: { section_id: number | null; title: string; stimulus_text: string; order?: number }
): Promise<{success: boolean; group: QuestionGroupData}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/groups/${groupId}/`, {
    method: 'PATCH',
    body: payload,
  });
}

export async function deleteQuizQuestionGroup(quizId: number, groupId: number): Promise<{success: boolean}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/groups/${groupId}/`, {
    method: 'DELETE',
  });
}

export async function reorderQuizQuestionGroups(
  quizId: number,
  sectionId: number,
  groupIds: number[]
): Promise<{success: boolean}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/groups/reorder/`, {
    method: 'POST',
    body: { section_id: sectionId, group_ids: groupIds },
  });
}

export async function assignQuizQuestions(
  quizId: number,
  payload: { question_ids: number[]; section_id: number | null; group_id?: number | null; replace?: boolean }
): Promise<{success: boolean; assigned_count: number}> {
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/questions/assign/`, {
    method: 'POST',
    body: payload,
  });
}

export interface QuestionImportRow {
  row: number;
  status: 'valid' | 'invalid';
  type: string;
  text_preview: string;
  errors: { field: string; message: string }[];
}

export interface QuestionImportSummary {
  total: number;
  valid: number;
  invalid: number;
}

export interface QuestionImportPreview {
  rows: QuestionImportRow[];
  summary: QuestionImportSummary;
}

export async function previewQuizQuestions(quizId: number, file: File): Promise<QuestionImportPreview> {
  const formData = new FormData();
  formData.set('import_file', file);
  formData.set('dry_run', 'true');
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/questions/import/`, {
    method: 'POST',
    body: formData,
  });
}

export async function importQuizQuestions(quizId: number, formData: FormData, skipInvalid = false): Promise<{
  success: boolean;
  message: string;
  imported: number;
  errors?: string[];
  skipped: number;
  rows: QuestionImportRow[];
  summary: QuestionImportSummary;
}> {
  formData.set('skip_invalid', String(skipInvalid));
  return apiClient(`/api/v1/teacher/quizzes/${quizId}/questions/import/`, {
    method: 'POST',
    body: formData,
  });
}

export async function updateQuizResponseGrade(
  responseId: number,
  marksAwarded: number,
  gradingNotes: string
): Promise<{success: boolean; message: string}> {
  return apiClient(`/api/v1/teacher/responses/${responseId}/grade/`, {
    method: 'POST',
    body: { marks_awarded: marksAwarded, grading_notes: gradingNotes },
  });
}

export async function bulkGradeAttempt(
  attemptId: number,
  grades: Array<{ response_id: number; marks_awarded: number; grading_notes?: string }>
): Promise<{success: boolean; message: string; graded_count: number}> {
  return apiClient(`/api/v1/teacher/grading/${attemptId}/bulk/`, {
    method: 'POST',
    body: { grades },
  });
}

export async function fetchTeacherResults(
  filters: ResultFilters = {}
): Promise<PaginatedResponse<QuizResultItem>> {
  const params = new URLSearchParams();
  if (filters.quiz_id) params.set('quiz_id', String(filters.quiz_id));
  if (filters.search) params.set('search', filters.search);
  if (filters.page) params.set('page', String(filters.page));

  const qs = params.toString();
  const url = qs ? `/api/v1/teacher/results/?${qs}` : '/api/v1/teacher/results/';
  return apiClient<PaginatedResponse<QuizResultItem>>(url);
}

export async function fetchTeacherGradingQueue(): Promise<PaginatedResponse<GradingQueueItem>> {
  return apiClient<PaginatedResponse<GradingQueueItem>>('/api/v1/teacher/grading/');
}

export async function fetchGradingAttempt(attemptId: number): Promise<GradingAttemptData> {
  return apiClient<GradingAttemptData>(`/api/v1/teacher/grading/${attemptId}/`);
}

export async function fetchTeacherResult(attemptId: number): Promise<TeacherResultDetail> {
  return apiClient<TeacherResultDetail>(`/api/v1/teacher/results/${attemptId}/`);
}
