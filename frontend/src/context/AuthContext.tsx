import { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../services/api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("pharmabrain_token")) {
      return setLoading(false);
    }
    authApi
      .me()
      .then((r) => setUser(r.data.data))
      .catch(() => localStorage.removeItem("pharmabrain_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = (token: string, nextUser: User) => {
    localStorage.setItem("pharmabrain_token", token);
    setUser(nextUser);
  };

  const logout = () => {
    localStorage.removeItem("pharmabrain_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return value;
};

