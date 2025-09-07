// src/providers/AuthProvider.tsx
import React from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { adminService } from "../services/adminService";

type AuthCtxType = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<{ error: any | null }>;
};

const AuthCtx = React.createContext<AuthCtxType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => ({ error: null }),
});

export const useAuth = () => React.useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  // keep only ONE subscription; guard duplicate work in StrictMode
  const hasInitRef = React.useRef(false);
  const langLoadedForRef = React.useRef<string | null>(null);
  const inflightLangRef = React.useRef<Promise<void> | null>(null);

  React.useEffect(() => {
    if (hasInitRef.current) return;
    hasInitRef.current = true;

    const loadLangOnce = (uid: string) => {
      if (!uid) return;
      if (langLoadedForRef.current === uid && !import.meta.env.DEV) return;
      // dedupe in-flight
      if (inflightLangRef.current) return;
      inflightLangRef.current = (async () => {
        try {
          const adminProfile = await adminService.getAdminProfile(uid);
          const pref = adminProfile?.preferred_language;
          if (pref) {
            const saved = localStorage.getItem("restaurant-language");
            if (saved !== pref) {
              localStorage.setItem("restaurant-language", pref);
              window.dispatchEvent(
                new CustomEvent("admin-language-loaded", {
                  detail: { language: pref },
                })
              );
            }
          }
          langLoadedForRef.current = uid;
        } catch (e) {
          console.error("load admin language failed:", e);
        } finally {
          inflightLangRef.current = null;
        }
      })();
    };

    // initial session
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) loadLangOnce(u.id);
      setLoading(false);
    });

    // subscribe to changes ONCE
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (event === "SIGNED_IN" && u) loadLangOnce(u.id);
      if (event !== "TOKEN_REFRESHED") setLoading(false);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // methods
  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: undefined },
    });

    if (data.user && !error) {
      const { error: profileError } = await supabase.from("admins").insert([
        {
          id: data.user.id,
          email: data.user.email,
          name: email.split("@")[0],
          preferred_language: "en",
        },
      ]);
      if (profileError)
        console.error("Error creating admin profile:", profileError);
    }
    return { data, error };
  };

  const signOut = async () => {
    sessionStorage.clear();
    const { error } = await supabase.auth.signOut();
    if (
      error &&
      error.message === "Session from session_id claim in JWT does not exist"
    ) {
      return { error: null };
    }
    return { error };
  };

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
export default AuthProvider;
