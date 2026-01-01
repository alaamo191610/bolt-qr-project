// src/providers/AuthProvider.tsx
import React from "react";
import { adminService } from "../services/adminService";
import { api } from "../services/api";

export interface User {
  id: string;
  email: string;
  name?: string;
}

type AuthCtxType = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = React.createContext<AuthCtxType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export const useAuth = () => React.useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const initAuth = async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      // Fetch profile using the token to validate session and get user info
      const profile = await api.get("/admin/profile");
      if (profile) {
        setUser({
          id: profile.id,
          email: profile.email,
          name: profile.restaurant_name,
        });

        // Handle language preference
        const pref = profile.preferred_language;
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
      }
    } catch (error) {
      console.error("Session restoration failed:", error);
      localStorage.removeItem("auth_token");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    initAuth();
  }, []);

  // methods
  const signIn = async (email: string, password: string) => {
    try {
      const { token, user: authUser } = await adminService.login({
        email,
        password,
      });
      localStorage.setItem("auth_token", token);
      setUser({
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
      });
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      // Try to create the first admin (backend will block if admins already exist)
      await adminService.createAdmin({
        email,
        password,
        restaurant_name: email.split("@")[0],
      });
      // Auto login after sign up
      await signIn(email, password);
    } catch (error: any) {
      console.error("Signup failed:", error);
      throw new Error(
        error.message ||
          "Registration failed. If an admin already exists, please log in."
      );
    }
  };

  const signOut = async () => {
    localStorage.removeItem("auth_token");
    sessionStorage.clear();
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
export default AuthProvider;
