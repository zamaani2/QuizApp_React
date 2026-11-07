export type UserRole = 'superadmin' | 'admin' | 'teacher' | 'student';

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: UserRole;
  is_superadmin: boolean;
}

export interface School {
  id: number;
  name: string;
  code: string;
  logo_url: string | null;
  is_active: boolean;
}

export interface UserProfile {
  type: UserRole;
  id: number;
  teacher_id: string | null;
  student_id: string | null;
  department: string | null;
  current_class: {
    id: number;
    name: string;
  } | null;
}

export interface UIPreferences {
  theme: 'academic' | 'green' | 'purple' | 'red';
}

export interface CurrentUserResponse {
  user: User;
  school: School | null;
  profile: UserProfile;
  ui_preferences: UIPreferences;
}

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  error?: string;
  fields?: Record<string, string[]>;
}

export class ApiError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string[]>;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message || payload.error || 'The request could not be completed.');
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code || 'HTTP_ERROR';
    this.fields = payload.fields;
  }
}

export * from './admin';
export * from './teacher';
export * from './student';
export * from './academic';
export * from './allocations';


