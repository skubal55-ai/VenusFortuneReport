import React, { createContext, useContext, useEffect, useState } from "react";
import { subscribeToAuthChanges } from "../services/auth";
import { fetchProfile } from "../services/profile";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [initializing, setInitializing] = useState(true);

  async function refreshProfile(u) {
    if (!u) {
      setProfile(null);
      return;
    }
    try {
      const p = await fetchProfile();
      setProfile(p);
    } catch (e) {
      // e.g. offline, or Supabase not configured yet — leave profile as-is
      // rather than crashing; screens that need it will surface the error.
      // eslint-disable-next-line no-console
      console.warn("Could not fetch profile:", e.message);
    }
  }

  useEffect(() => {
    const unsub = subscribeToAuthChanges(async (u) => {
      setUser(u);
      await refreshProfile(u);
      setInitializing(false);
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        initializing,
        refreshProfile: () => refreshProfile(user),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
