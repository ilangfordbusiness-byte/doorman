import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/client';
import { base44 } from '@/api/base44Client';

// Auth state backed by Supabase Auth. Keeps the same context surface the app
// already consumes (user, isAuthenticated, isLoadingAuth, authError,
// navigateToLogin, logout) — authError.type === 'auth_required' makes the app
// shell render the login screen.
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadSession(session) {
      if (!session) {
        if (!mounted) return;
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        setIsLoadingAuth(false);
        return;
      }
      try {
        const me = await base44.auth.me();
        if (!mounted) return;
        setUser(me);
        setIsAuthenticated(true);
        setAuthError(null);
      } catch (e) {
        console.error('Failed to load profile:', e);
        if (!mounted) return;
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: e.message });
      }
      if (mounted) setIsLoadingAuth(false);
    }

    supabase.auth.getSession().then(({ data }) => loadSession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        loadSession(session);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    await supabase.auth.signOut();
    window.location.assign('/');
  };

  const navigateToLogin = () => {
    // The app shell renders the Login screen when authError.type is
    // 'auth_required'; nothing to do beyond ensuring the state is set.
    setAuthError({ type: 'auth_required', message: 'Authentication required' });
  };

  const checkAppState = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      try {
        const me = await base44.auth.me();
        setUser(me);
        setIsAuthenticated(true);
        setAuthError(null);
      } catch {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: null,
      logout,
      navigateToLogin,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
