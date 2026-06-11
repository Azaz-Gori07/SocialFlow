import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

interface AuthContextType {
  user: any | null;
  workspace: any | null;
  workspaces: any[];
  loading: boolean;
  pendingOtp: { userId: string; purpose: 'login' | 'account_activation' } | null;
  login: (email: string, password: string) => Promise<any>;
  register: (email: string, password: string, fullName: string) => Promise<any>;
  verifyOtp: (userId: string, code: string, purpose: 'login' | 'account_activation') => Promise<any>;
  logout: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const setupUserSession = (res: any) => {
  localStorage.setItem('access_token', res.accessToken);
  localStorage.setItem('refresh_token', res.refreshToken);
  localStorage.setItem('user', JSON.stringify(res.user));
  connectSocket(res.accessToken);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [workspace, setWorkspace] = useState<any | null>(null);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingOtp, setPendingOtp] = useState<{ userId: string; purpose: 'login' | 'account_activation' } | null>(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('access_token');
      const cachedUser = localStorage.getItem('user');
      const cachedWorkspace = localStorage.getItem('workspace');

      if (token && cachedUser) {
        try {
          setUser(JSON.parse(cachedUser));
        } catch {
          localStorage.removeItem('user');
        }
        if (cachedWorkspace) {
          try {
            setWorkspace(JSON.parse(cachedWorkspace));
          } catch {
            localStorage.removeItem('workspace');
          }
        }
        
        try {
          // Fetch fresh user profile
          const freshUser = await api.auth.me();
          setUser(freshUser);
          localStorage.setItem('user', JSON.stringify(freshUser));
          
          // Load workspaces
          const wsList = await api.workspaces.list();
          setWorkspaces(wsList);
          
          // If no active workspace or active is not in list, pick the first
          const currentWS = cachedWorkspace ? JSON.parse(cachedWorkspace) : null;
          if (wsList.length > 0) {
            const matchesCurrent = currentWS ? wsList.find(w => w.id === currentWS.id) : null;
            if (matchesCurrent) {
              setWorkspace(matchesCurrent);
              localStorage.setItem('workspace', JSON.stringify(matchesCurrent));
            } else {
              setWorkspace(wsList[0]);
              localStorage.setItem('workspace', JSON.stringify(wsList[0]));
            }
          }
        } catch (error) {
          console.error('Initialize auth error', error);
          // Token expired or invalid
          handleLogoutCleanup();
        }
      }
      setLoading(false);
    };

    initializeAuth();

    // Listen to global logout events from API handler
    const handleLogoutEvent = () => {
      handleLogoutCleanup();
    };

    window.addEventListener('auth-logout', handleLogoutEvent);
    return () => {
      window.removeEventListener('auth-logout', handleLogoutEvent);
    };
  }, []);

  const handleLogoutCleanup = () => {
    setUser(null);
    setWorkspace(null);
    setWorkspaces([]);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('workspace');
    setPendingOtp(null);
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      // Login now directly returns tokens without OTP
      const res = await api.auth.login({ email, password });
      if (res?.accessToken) {
        setupUserSession(res);
        setUser(res.user);
        
        const wsList = await api.workspaces.list();
        setWorkspaces(wsList);
        if (wsList.length > 0) {
          setWorkspace(wsList[0]);
          localStorage.setItem('workspace', JSON.stringify(wsList[0]));
        }
        return res;
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, fullName: string) => {
    setLoading(true);
    try {
      const res = await api.auth.register({ email, password, fullName });
      if (res?.userId) {
        setPendingOtp({ userId: res.userId, purpose: 'account_activation' });
        return res;
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (userId: string, code: string, purpose: 'login' | 'account_activation') => {
    setLoading(true);
    try {
      const res = await api.auth.verifyOtp({ userId, code, purpose });
      // Both login and account_activation now return tokens
      if (res?.accessToken) {
        setupUserSession(res);
        setUser(res.user);

        const wsList = await api.workspaces.list();
        setWorkspaces(wsList);
        if (wsList.length > 0) {
          setWorkspace(wsList[0]);
          localStorage.setItem('workspace', JSON.stringify(wsList[0]));
        }
      }
      setPendingOtp(null);
      return res;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await api.auth.logout();
    } catch (e) {
      // Clean up local state anyway
    } finally {
      disconnectSocket();
      handleLogoutCleanup();
      setLoading(false);
    }
  };

  const switchWorkspace = async (workspaceId: string) => {
    const found = workspaces.find(w => w.id === workspaceId);
    if (found) {
      setWorkspace(found);
      localStorage.setItem('workspace', JSON.stringify(found));
    }
  };

  const refreshWorkspaces = async () => {
    try {
      const wsList = await api.workspaces.list();
      setWorkspaces(wsList);
      
      if (workspace) {
        const found = wsList.find(w => w.id === workspace.id);
        if (found) {
          setWorkspace(found);
          localStorage.setItem('workspace', JSON.stringify(found));
        }
      }
    } catch (err) {
      console.error('Refresh workspaces error', err);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      workspace,
      workspaces,
      loading,
      pendingOtp,
      login,
      register,
      verifyOtp,
      logout,
      switchWorkspace,
      refreshWorkspaces
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
