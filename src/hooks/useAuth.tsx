import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContext {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isInstructor: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContext | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isInstructor, setIsInstructor] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const checkRoles = async (userId: string) => {
    const [adminRes, instRes] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" } as any),
      supabase.rpc("has_role", { _user_id: userId, _role: "instructor" } as any),
    ]);
    return {
      admin: !adminRes.error && !!adminRes.data,
      instructor: !instRes.error && !!instRes.data,
    };
  };

  useEffect(() => {
    let isMounted = true;

    const applySession = async (nextSession: Session | null) => {
      const requestId = ++requestIdRef.current;

      if (!isMounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setIsAdmin(false);
        setIsInstructor(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { admin, instructor } = await checkRoles(nextSession.user.id);

      if (!isMounted || requestId !== requestIdRef.current) return;

      setIsAdmin(admin);
      setIsInstructor(instructor);
      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    void supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      void applySession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setIsInstructor(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, isInstructor, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
