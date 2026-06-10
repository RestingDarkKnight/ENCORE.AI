import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api, { tokenStore } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [manager, setManager] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setManager(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setManager(data);
    } catch {
      tokenStore.clear();
      setManager(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    tokenStore.set(data.access_token);
    setManager(data.manager);
    return data.manager;
  };

  const signup = async (payload) => {
    const { data } = await api.post("/auth/signup", payload);
    tokenStore.set(data.access_token);
    setManager(data.manager);
    return data.manager;
  };

  const logout = () => {
    tokenStore.clear();
    setManager(null);
  };

  return (
    <AuthCtx.Provider value={{ manager, loading, login, signup, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
