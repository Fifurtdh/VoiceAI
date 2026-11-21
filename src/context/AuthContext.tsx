import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  fetchCurrentSession,
  logoutStore,
  type AuthSessionResponse,
  type StoreProfile,
} from '../utils/api';

export interface AuthUser {
  id: number;
  phoneNumber: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  store: StoreProfile | null;
  authChecking: boolean;
  authBanner: string | null;
  recoveryCode: string | null;
  showRecoveryBanner: boolean;
  setAuthBanner: (msg: string | null) => void;
  setRecoveryCode: (code: string | null) => void;
  dismissRecoveryBanner: () => void;
  applyAuthSuccess: (session: AuthSessionResponse, isNewRegistration: boolean) => void;
  updateStoreLocal: (store: StoreProfile) => void;
  refreshSession: () => Promise<boolean>;
  logout: () => Promise<void>;
  handleUnauthorized: (bannerMsg?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Dedicated authentication provider holding user session & store profile independently
 * of theme toggles, page navigation, or component re-renders.
 * Never stores passwords or tokens in localStorage or sessionStorage.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authBanner, setAuthBanner] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const session = await fetchCurrentSession();
      setUser(session.user);
      setStore(session.store);
      return true;
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        setUser(null);
        setStore(null);
      }
      return false;
    }
  }, []);

  // Verify HTTP-only JWT cookie session once on initial app mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await fetchCurrentSession();
        if (!active) return;
        setUser(session.user);
        setStore(session.store);
      } catch {
        if (!active) return;
        setUser(null);
        setStore(null);
      } finally {
        if (active) setAuthChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const applyAuthSuccess = useCallback(
    (session: AuthSessionResponse, isNewRegistration: boolean) => {
      setAuthBanner(null);
      setUser(session.user);
      setStore(session.store);
      if (isNewRegistration && session.recoveryCode) {
        setRecoveryCode(session.recoveryCode);
        setShowRecoveryBanner(true);
      } else {
        setRecoveryCode(null);
        setShowRecoveryBanner(false);
      }
    },
    []
  );

  const updateStoreLocal = useCallback((nextStore: StoreProfile) => {
    setStore(nextStore);
  }, []);

  const dismissRecoveryBanner = useCallback(() => {
    setShowRecoveryBanner(false);
  }, []);

  const handleUnauthorized = useCallback((bannerMsg?: string) => {
    setUser(null);
    setStore(null);
    setRecoveryCode(null);
    setShowRecoveryBanner(false);
    setAuthBanner(bannerMsg || 'Your session expired. Please log in again.');
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutStore();
    } catch {
      // Clear local session state even if network request fails
    }
    setUser(null);
    setStore(null);
    setRecoveryCode(null);
    setShowRecoveryBanner(false);
    setAuthBanner('You have logged out safely.');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      store,
      authChecking,
      authBanner,
      recoveryCode,
      showRecoveryBanner,
      setAuthBanner,
      setRecoveryCode,
      dismissRecoveryBanner,
      applyAuthSuccess,
      updateStoreLocal,
      refreshSession,
      logout,
      handleUnauthorized,
    }),
    [
      user,
      store,
      authChecking,
      authBanner,
      recoveryCode,
      showRecoveryBanner,
      dismissRecoveryBanner,
      applyAuthSuccess,
      updateStoreLocal,
      refreshSession,
      logout,
      handleUnauthorized,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
