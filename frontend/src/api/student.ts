import { apiClient } from './client';
import type {
  StudentDashboardData,
  StudentQuizzesResponse,
  StudentQuizDetail,
  StudentQuizTakeData,
  StudentAttemptsData,
  StudentQuizResultData,
  StartQuizResponse,
  SaveResponseResult,
  SubmitQuizResponse,
  StudentProfileData,
  StudentAnswerData,
} from '../types/student';

export const studentApi = {
  getStudentDashboard(): Promise<StudentDashboardData> {
    return apiClient<StudentDashboardData>('/api/v1/dashboard/student/');
  },

  getStudentQuizzes(params?: {
    subject?: string;
    academic_year?: string;
    term?: string;
    status?: string;
    search?: string;
  }): Promise<StudentQuizzesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.subject) searchParams.append('subject', params.subject);
    if (params?.academic_year) searchParams.append('academic_year', params.academic_year);
    if (params?.term) searchParams.append('term', params.term);
    if (params?.status && params.status !== 'all') searchParams.append('status', params.status);
    if (params?.search) searchParams.append('search', params.search);

    const qs = searchParams.toString();
    const endpoint = `/api/v1/student/quizzes/${qs ? `?${qs}` : ''}`;
    return apiClient<StudentQuizzesResponse>(endpoint);
  },

  getStudentQuizDetail(quizId: number): Promise<StudentQuizDetail> {
    return apiClient<StudentQuizDetail>(`/api/v1/student/quizzes/${quizId}/`);
  },

  startStudentQuiz(quizId: number, password?: string): Promise<StartQuizResponse> {
    return apiClient<StartQuizResponse>(`/api/v1/student/quizzes/${quizId}/start/`, {
      method: 'POST',
      body: { password: password || '' },
    });
  },

  getStudentQuizTake(attemptId: number): Promise<StudentQuizTakeData> {
    return apiClient<StudentQuizTakeData>(`/api/v1/student/attempts/${attemptId}/take/`);
  },

  saveStudentResponse(
    attemptId: number,
    data: {
      question_id: number;
      choice_id?: number | null;
      choice_ids?: number[];
      text_answer?: string;
      answer_data?: StudentAnswerData;
    }
  ): Promise<SaveResponseResult> {
    return apiClient<SaveResponseResult>(`/api/v1/student/attempts/${attemptId}/save/`, {
      method: 'POST',
      body: data,
    });
  },

  submitStudentQuiz(attemptId: number): Promise<SubmitQuizResponse> {
    return apiClient<SubmitQuizResponse>(`/api/v1/student/attempts/${attemptId}/submit/`, {
      method: 'POST',
      body: {},
    });
  },

  submitStudentSection(attemptId: number, sectionId: number): Promise<{
    success: boolean;
    active_section_id: number | null;
    section_timing_enabled: boolean;
  }> {
    return apiClient(
      `/api/v1/student/attempts/${attemptId}/sections/${sectionId}/submit/`,
      { method: 'POST', body: {} }
    );
  },

  getStudentAttempts(params?: {
    quiz?: string;
    subject?: string;
    status?: string;
    search?: string;
  }): Promise<StudentAttemptsData> {
    const searchParams = new URLSearchParams();
    if (params?.quiz) searchParams.append('quiz', params.quiz);
    if (params?.subject) searchParams.append('subject', params.subject);
    if (params?.status && params.status !== 'all') searchParams.append('status', params.status);
    if (params?.search) searchParams.append('search', params.search);

    const qs = searchParams.toString();
    const endpoint = `/api/v1/student/attempts/${qs ? `?${qs}` : ''}`;
    return apiClient<StudentAttemptsData>(endpoint);
  },

  getStudentQuizResult(attemptId: number): Promise<StudentQuizResultData> {
    return apiClient<StudentQuizResultData>(`/api/v1/student/attempts/${attemptId}/result/`);
  },

  getStudentProfile(): Promise<StudentProfileData> {
    return apiClient<StudentProfileData>('/api/v1/student/profile/');
  },
};
