import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

interface AuthContextType {
  user: any | null;
  workspace: any | null;
  workspaces: any[];
  loading: boolean;
  pendingOtp: { userId: string; purpose: 'account_activation' } | null;
  login: (email: string, password: string) => Promise<any>;
  exchangeCode: (code: string) => Promise<any>;
  register: (email: string, password: string, fullName: string) => Promise<any>;
  verifyOtp: (userId: string, code: string, purpose: 'account_activation') => Promise<any>;
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
  const [pendingOtp, setPendingOtp] = useState<{ userId: string; purpose: 'account_activation' } | null>(null);

  // Load user from localStorage on mount.
  // Hydration (and therefore the boot curtain lift) never waits on the
  // network: cached session renders immediately, the fresh profile fetch
  // runs in the background. A slow or cold server can no longer hold the
  // loading screen hostage.
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('access_token');
      const cachedUser = localStorage.getItem('user');
      const cachedWorkspace = localStorage.getItem('workspace');

      if (token && cachedUser) {
        connectSocket(token);
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

        setLoading(false);

        // Background refresh — never gates first paint.
        (async () => {
          try {
            const freshUser = await api.auth.me();
            setUser(freshUser);
            localStorage.setItem('user', JSON.stringify(freshUser));

            const wsList = await api.workspaces.list();
            setWorkspaces(wsList);

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
          } catch (error: any) {
            console.error('Initialize auth error', error);
            // Network failures keep the cached session; only a rejected
            // session (server said no) ends it.
            const isNetworkFailure = error instanceof TypeError || /fetch|network/i.test(error?.message || '');
            if (!isNetworkFailure) {
              handleLogoutCleanup();
            }
          }
        })();
        return;
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
    disconnectSocket();
    setUser(null);
    setWorkspace(null);
    setWorkspaces([]);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('workspace');
    setPendingOtp(null);
  };

  // NOTE: `loading` gates only the initial auth bootstrap (App.tsx boot
  // spinner). Auth actions must NOT toggle it — App replaces the whole tree
  // while loading=true, unmounting Auth and discarding its error state.

  const login = async (email: string, password: string) => {
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
    }

    return res;
  };

  const exchangeCode = async (code: string) => {
    const res = await api.auth.exchange(code);

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

    return res;
  };

  const register = async (email: string, password: string, fullName: string) => {
    const res = await api.auth.register({ email, password, fullName });
    if (res?.userId) {
      setPendingOtp({ userId: res.userId, purpose: 'account_activation' });
      return res;
    }
    return null;
  };

  const verifyOtp = async (userId: string, code: string, purpose: 'account_activation') => {
    const res = await api.auth.verifyOtp({ userId, code, purpose });
    // Account activation returns tokens
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
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (e) {
      // Clean up local state anyway
    } finally {
      disconnectSocket();
      handleLogoutCleanup();
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
      exchangeCode,
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
