import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useState
} from "react";
import { supabase, requireSupabase } from "../lib/supabase";
import { setAuthToken } from "../lib/api";

export type UserRole = "Admin" | "Staff";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  firstName: string | null;
  phone: string | null;
  providerType: string | null;
  notesSignature: string | null;
};

type AuthState = {
  configured: boolean;
  configError: string | null;
  initializing: boolean;
  authError: string | null;
  token: string | null;
  user: AuthUser | null;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    profile: { firstName: string; phone?: string; providerType: string }
  ) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider(props: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const configured = Boolean(supabase);
  const configError = configured
    ? null
    : "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env, then restart the frontend dev server.";

  const refreshUser = useCallback(async () => {
    setAuthError(null);
    if (!supabase || !token) {
      setUser(null);
      return;
    }

    try {
      const { data: authUserData } = await supabase.auth.getUser();
      const authUser = authUserData?.user;
      if (!authUser) {
        setUser(null);
        return;
      }

      const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
      const metaFirstName =
        typeof meta.first_name === "string" && meta.first_name.trim()
          ? meta.first_name.trim()
          : null;
      const metaPhone =
        typeof meta.phone === "string" && meta.phone.trim()
          ? meta.phone.trim()
          : null;
      const metaProviderType =
        typeof meta.provider_type === "string" && meta.provider_type.trim()
          ? meta.provider_type.trim()
          : null;
      const metaRole =
        typeof meta.role === "string" && meta.role.trim()
          ? meta.role.trim()
          : null;

      try {
        await supabase.rpc("sync_profile");
      } catch {
        // Ignore sync errors and fall back to auth metadata.
      }

      let displayName = metaFirstName;
      let profilePhone = metaPhone;
      let profileProviderType = metaProviderType;
      let notesSignature: string | null = null;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name,phone,provider_type,notes_signature")
          .eq("id", authUser.id)
          .maybeSingle();
        if (profile?.display_name) displayName = profile.display_name;
        if (profile?.phone) profilePhone = profile.phone;
        if (profile?.provider_type) profileProviderType = profile.provider_type;
        if (profile?.notes_signature) notesSignature = profile.notes_signature;
      } catch {
        // Ignore and fall back to auth metadata.
      }

      const role: UserRole = metaRole === "Admin" ? "Admin" : "Staff";
      setUser({
        id: authUser.id,
        email: authUser.email ?? "",
        role,
        firstName: displayName,
        phone: profilePhone,
        providerType: profileProviderType,
        notesSignature
      });
    } catch (err: any) {
      setAuthError("Signed in, but your profile could not be loaded.");
      setUser(null);
    }
  }, [token]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setToken(null);
        setUser(null);
        setInitializing(false);
        return;
      }
      setToken(data.session?.access_token ?? null);
      setInitializing(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setToken(session?.access_token ?? null);
      setInitializing(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    void refreshUser();
  }, [token, refreshUser]);

  const login = async (email: string, password: string) => {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;

    const nextToken = data.session?.access_token ?? null;
    if (!nextToken) throw new Error("Sign in failed: missing access token");

    setToken(nextToken);
    await refreshUser();
  };

  const register = async (
    email: string,
    password: string,
    profile: { firstName: string; phone?: string; providerType: string }
  ) => {
    const client = requireSupabase();
    const emailRedirectTo = `${window.location.origin}/login`;
    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          first_name: profile.firstName,
          phone: profile.phone,
          provider_type: profile.providerType
        }
      }
    });
    if (error) throw error;
  };

  const logout = () => {
    supabase?.auth.signOut();
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  const value = useMemo<AuthState>(() => {
    return {
      configured,
      configError,
      initializing,
      authError,
      token,
      user,
      refreshUser,
      login,
      register,
      logout
    };
  }, [configured, configError, initializing, authError, token, user, refreshUser]);

  return (
    <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
