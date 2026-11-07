import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CurrentUserResponse, ApiError } from '../types';
import { getCurrentUser } from '../api/me';

interface AuthContextValue {
  data: CurrentUserResponse | null;
  loading: boolean;
  error: ApiError | null;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchUser = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getCurrentUser();
      setData(response);
      // Sync document theme if preferred
      if (response.ui_preferences?.theme) {
        document.documentElement.setAttribute('data-app-theme', response.ui_preferences.theme);
      }
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  return (
    <AuthContext.Provider value={{ data, loading, error, refetch: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    return { data: null, loading: false, error: null, refetch: async () => {} };
  }
  return context;
}
