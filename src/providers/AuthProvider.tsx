// src/providers/AuthProvider.tsx
import React from "react";
import { adminService, type LoginResponse } from "../services/adminService";
import { api, isUnauthenticatedError } from "../services/api";

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

// GET /api/auth/session (server/index.js)
interface SessionResponse {
  user: User;
  profile: {
    id: string;
    restaurantName: string | null;
    preferredLanguage: string | null;
  };
}

type AuthCtxType = {
  user: User | null;
  organizations: OrganizationMembership[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = React.createContext<AuthCtxType>({
  user: null,
  organizations: [],
  loading: true,
  signIn: async () => {},
  switchOrganization: async () => {},
  signOut: async () => {},
});

export const useAuth = () => React.useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [organizations, setOrganizations] = React.useState<OrganizationMembership[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadOrganizations = React.useCallback(async () => {
    const memberships = await api.get<OrganizationMembership[]>("/auth/organizations");
    setOrganizations(Array.isArray(memberships) ? memberships : []);
  }, []);

  const initAuth = React.useCallback(async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const session = await api.get<SessionResponse>("/auth/session");
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
      if (isUnauthenticatedError(error)) {
        localStorage.removeItem("auth_token");
        setOrganizations([]);
      }
      // Network/server errors leave the token in place; the user stays
      // signed in locally and can retry once connectivity is restored.
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

  const switchOrganization = async (organizationId: string) => {
    const { token, user: authUser } = await api.post<LoginResponse>("/auth/switch-organization", { organizationId });
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
    <AuthCtx.Provider value={{ user, organizations, loading, signIn, switchOrganization, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
export default AuthProvider;
