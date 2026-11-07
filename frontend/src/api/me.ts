import { apiClient } from './client';
import type { CurrentUserResponse } from '../types';

export async function getCurrentUser(): Promise<CurrentUserResponse> {
  return apiClient<CurrentUserResponse>('/api/v1/me/');
}
