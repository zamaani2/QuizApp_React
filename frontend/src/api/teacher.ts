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

export async function saveQuiz(quizId: number | null, formData: FormData): Promise<{success: boolean; quiz_id: number; message: string}> {
  return apiClient(quizId ? `/quizzes/${quizId}/edit/` : '/quizzes/create/', {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: formData,
  });
}

export async function updateQuizStatus(quizId: number, status: string): Promise<{success: boolean; message: string}> {
  const body = new FormData();
  body.set('status', status);
  return apiClient(`/quizzes/${quizId}/update-status/`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body,
  });
}

export async function deleteQuiz(quizId: number): Promise<{success: boolean; message: string}> {
  return apiClient(`/quizzes/${quizId}/delete/`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
}

export async function fetchQuizAssignments(quizId: number): Promise<QuizAssignmentsData> {
  return apiClient<QuizAssignmentsData>(`/api/v1/teacher/quizzes/${quizId}/assignments/`);
}

export async function assignQuizClasses(quizId: number, classIds: number[]): Promise<{success: boolean; message: string}> {
  const body = new FormData();
  classIds.forEach((id) => body.append('classes', String(id)));
  return apiClient(`/quizzes/${quizId}/assignments/create/`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body,
  });
}

export async function unassignQuizClass(quizId: number, classId: number): Promise<{success: boolean; message: string}> {
  return apiClient(`/quizzes/${quizId}/assignments/${classId}/delete/`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
}

export async function saveQuestion(
  quizId: number,
  questionId: number | null,
  formData: FormData
): Promise<{success: boolean; question_id: number; message: string}> {
  const url = questionId
    ? `/quizzes/${quizId}/questions/${questionId}/edit/`
    : `/quizzes/${quizId}/questions/create/`;
  return apiClient(url, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: formData,
  });
}

export async function deleteQuestion(quizId: number, questionId: number): Promise<{success: boolean; message: string}> {
  return apiClient(`/quizzes/${quizId}/questions/${questionId}/delete/`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
}

export async function duplicateQuestion(quizId: number, questionId: number): Promise<{success: boolean; question_id: number; message: string}> {
  return apiClient(`/quizzes/${quizId}/questions/${questionId}/duplicate/`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
}

export async function reorderQuizQuestions(
  quizId: number,
  questionIds: number[]
): Promise<{success: boolean; message: string}> {
  return apiClient(`/quizzes/${quizId}/questions/reorder/`, {
    method: 'POST',
    body: {
      question_orders: questionIds.map((question_id, index) => ({
        question_id,
        order: index + 1,
      })),
    },
  });
}

export async function importQuizQuestions(quizId: number, formData: FormData): Promise<{
  success: boolean;
  message: string;
  imported: number;
  errors?: string[];
}> {
  return apiClient(`/quizzes/${quizId}/questions/import/`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: formData,
  });
}

export async function updateQuizResponseGrade(
  responseId: number,
  marksAwarded: number,
  gradingNotes: string
): Promise<{success: boolean; message: string}> {
  return apiClient(`/quizzes/responses/${responseId}/grade/`, {
    method: 'POST',
    body: { marks_awarded: marksAwarded, grading_notes: gradingNotes },
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
