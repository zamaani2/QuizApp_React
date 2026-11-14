import { apiClient } from './client';
import type { CurrentUserResponse } from '../types';

export async function getCurrentUser(): Promise<CurrentUserResponse> {
  return apiClient<CurrentUserResponse>('/api/v1/me/');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return apiClient<{ success: boolean; message: string }>('/api/v1/me/password/', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  });
}
