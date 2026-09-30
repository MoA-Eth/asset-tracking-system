import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthUser, UserRole } from '../types/asset-management';
import { api } from '../api/client';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (usernameOrEmail: string, password?: string) => Promise<void>;
  loginAsPersona: (role: UserRole) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'moa_token';
const USER_KEY = 'moa_user';

export const normalizeRole = (r: any): UserRole => {
  if (!r) return UserRole.MANAGER;
  if (r === 'TOP_MANAGEMENT' || r === 'manager' || r === 'MANAGER') {
    return UserRole.MANAGER;
  }
  return r as UserRole;
};

export const normalizeUser = (u: any): AuthUser | null => {
  if (!u) return null;
  return {
    ...u,
    role: normalizeRole(u.role),
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem(USER_KEY);
    if (saved) {
      try {
        return normalizeUser(JSON.parse(saved));
      } catch {
        return null;
      }
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Validate active token on initial load
  useEffect(() => {
    const verifySession = async () => {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await api.getMe();
        const normalized = normalizeUser(currentUser);
        setUser(normalized);
        if (normalized) {
          localStorage.setItem(USER_KEY, JSON.stringify(normalized));
        }
      } catch (err) {
        console.warn('Session verification failed, clearing auth:', err);
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    verifySession();
  }, []);

  const login = async (usernameOrEmail: string, password?: string) => {
    setIsLoading(true);
    try {
      const res = await api.login({ usernameOrEmail, password });
      const normalizedUser = normalizeUser(res.user);
      setUser(normalizedUser);
      setToken(res.token);
      localStorage.setItem(TOKEN_KEY, res.token);
      if (normalizedUser) {
        localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser));
      }
      localStorage.removeItem('moa_active_tab');
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsPersona = async (role: UserRole) => {
    setIsLoading(true);
    try {
      const res = await api.login({ usernameOrEmail: '', personaRole: role });
      const normalizedUser = normalizeUser(res.user);
      setUser(normalizedUser);
      setToken(res.token);
      localStorage.setItem(TOKEN_KEY, res.token);
      if (normalizedUser) {
        localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser));
      }
      localStorage.removeItem('moa_active_tab');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('moa_active_tab');
  };

  const hasRole = (...roles: UserRole[]): boolean => {
    if (!user) return false;
    const current = normalizeRole(user.role);
    return roles.map(normalizeRole).includes(current);
  };

  const value: AuthContextType = {
    user,
    token,
    role: normalizeRole(user?.role),
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    loginAsPersona,
    logout,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
