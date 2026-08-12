// src/providers/AuthProvider.tsx
import React from "react";
import { adminService } from "../services/adminService";
import { api } from "../services/api";
import { getErrorMessage } from "../utils/errors";

export interface User {
  id: string;
  identityId?: string;
  email: string;
  name?: string;
  organizationId?: string;
  organizationName?: string;
  role?: "OWNER" | "MANAGER" | "STAFF";
}

export interface OrganizationMembership {
  id: string;
  name: string;
  slug: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  current: boolean;
}

type AuthCtxType = {
  user: User | null;
  organizations: OrganizationMembership[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = React.createContext<AuthCtxType>({
  user: null,
  organizations: [],
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  switchOrganization: async () => {},
  signOut: async () => {},
});

export const useAuth = () => React.useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [organizations, setOrganizations] = React.useState<OrganizationMembership[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadOrganizations = React.useCallback(async () => {
    const memberships = await api.get("/auth/organizations");
    setOrganizations(Array.isArray(memberships) ? memberships : []);
  }, []);

  const initAuth = React.useCallback(async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const session = await api.get("/auth/session");
      if (session?.user) {
        setUser(session.user);
        await loadOrganizations();

        // Handle language preference
        const pref = session.profile?.preferredLanguage;
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
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [loadOrganizations]);

  React.useEffect(() => {
    void initAuth();
  }, [initAuth]);

  // methods
  const signIn = async (email: string, password: string) => {
    try {
      const { token, user: authUser } = await adminService.login({
        email,
        password,
      });
      localStorage.setItem("auth_token", token);
      setUser(authUser);
      await loadOrganizations();
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
    } catch (error) {
      console.error("Signup failed:", error);
      throw new Error(
        getErrorMessage(error, "Registration failed. If an admin already exists, please log in.")
      );
    }
  };

  const switchOrganization = async (organizationId: string) => {
    const { token, user: authUser } = await api.post("/auth/switch-organization", { organizationId });
    localStorage.setItem("auth_token", token);
    setUser(authUser);
    await loadOrganizations();
  };

  const signOut = async () => {
    localStorage.removeItem("auth_token");
    sessionStorage.clear();
    setUser(null);
    setOrganizations([]);
  };

  return (
    <AuthCtx.Provider value={{ user, organizations, loading, signIn, signUp, switchOrganization, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
export default AuthProvider;
