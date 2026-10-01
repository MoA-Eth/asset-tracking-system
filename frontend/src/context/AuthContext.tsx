import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AuthUser, UserRole } from '../types/asset-management';
import { api, getErrorStatus } from '../api/client';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (usernameOrEmail: string, password?: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
  hasPermission: (permission: string) => boolean;
  canAccessTab: (tabId: string) => boolean;
  /** Why the user was signed out, shown on the login page */
  sessionNotice: string | null;
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
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const refreshVersion = useRef(0);
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('moa_active_tab');
  }, []);

  const refreshSession = useCallback(async () => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) { setIsLoading(false); return; }
    const version = ++refreshVersion.current;
    try {
      const currentUser = normalizeUser(await api.getMe());
      if (localStorage.getItem(TOKEN_KEY) !== savedToken || version !== refreshVersion.current) return;
      setUser(currentUser);
      if (currentUser) localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    } catch (err: any) {
      const status = getErrorStatus(err);
      if ((status === 401 || status === 404) && localStorage.getItem(TOKEN_KEY) === savedToken && version === refreshVersion.current) {
        logout();
        setSessionNotice('Your session has ended. Please sign in again.');
      }
    } finally {
      if (version === refreshVersion.current) setIsLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    void refreshSession();
    const onFocus = () => { void refreshSession(); };
    const onVisible = () => { if (document.visibilityState === 'visible') onFocus(); };
    const timer = window.setInterval(onVisible, 30000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('moa_access_changed', onFocus);
    window.addEventListener('moa_session_expired', logout);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('moa_access_changed', onFocus);
      window.removeEventListener('moa_session_expired', logout);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshSession, logout]);

  const login = async (usernameOrEmail: string, password?: string) => {
    const res = await api.login({ usernameOrEmail, password });
    setSessionNotice(null);
    const normalizedUser = normalizeUser(res.user);
    setUser(normalizedUser);
    setToken(res.token);
    localStorage.setItem(TOKEN_KEY, res.token);
    if (normalizedUser) {
      localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser));
    }
    localStorage.removeItem('moa_active_tab');
  };

  const hasRole = (...roles: UserRole[]): boolean => {
    if (!user) return false;
    const current = normalizeRole(user.role);
    return roles.map(normalizeRole).includes(current);
  };

  const hasPermission = useCallback((permission: string): boolean => {
    return !!user?.permissions?.includes(permission);
  }, [user?.permissions]);

  const canAccessTab = useCallback((tabId: string): boolean => {
    return !!user?.allowedTabs?.includes(tabId);
  }, [user?.allowedTabs]);

  const value: AuthContextType = {
    user,
    token,
    role: normalizeRole(user?.role),
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    refreshSession,
    logout,
    hasRole,
    hasPermission,
    canAccessTab,
    sessionNotice,
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
