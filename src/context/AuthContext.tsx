import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "@/lib/supabase/client";

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  profileImage?: string | null;
  onboardingCompleted?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  needsPasswordReset: boolean;
  signUp: (email: string, password: string, termsVersion?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  clearPasswordReset: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);

  useEffect(() => {
    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setNeedsPasswordReset(true);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setNeedsPasswordReset(false);
      }
      // SIGNED_IN is handled by signIn/signUp explicitly to avoid double-fetching
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const checkSession = async () => {
    setIsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        setUser(profile);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Error checking session:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserProfile = async (userId: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        // PGRST116 = no rows found; expected before onboarding creates the profile row
        if (error.code !== "PGRST116") {
          console.error("Error fetching profile:", error);
        }
        return null;
      }
      if (!data) return null;

      const authUser = await supabase.auth.getUser();
      if (!authUser.data.user) return null;

      return {
        id: data.id,
        name: data.name,
        username: data.username,
        email: authUser.data.user.email || "",
        profileImage: data.profile_image_url,
        onboardingCompleted: data.onboarding_completed,
      };
    } catch (error) {
      console.error("Error in fetchUserProfile:", error);
      return null;
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (data.user) {
      const profile = await fetchUserProfile(data.user.id);
      setUser(profile);
    }
  };

  // termsVersion records which version of the EULA the user ticked at sign-up
  // (App Store Guideline 1.2). It goes into auth metadata, which is written
  // atomically with the account, and is then mirrored onto the profile row —
  // that row is created by a trigger, so it may not exist for a moment yet.
  const signUp = async (email: string, password: string, termsVersion?: string) => {
    const acceptedAt = new Date().toISOString();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: termsVersion
        ? { data: { terms_accepted_at: acceptedAt, terms_accepted_version: termsVersion } }
        : undefined,
    });
    if (error) throw error;

    if (data.user && termsVersion) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          terms_accepted_at: acceptedAt,
          terms_accepted_version: termsVersion,
        })
        .eq("id", data.user.id);
      // Non-fatal: auth metadata already holds the durable record.
      if (profileError) {
        console.error("Could not stamp terms acceptance on profile:", profileError);
      }
    }

    if (data.user) {
      setUser({
        id: data.user.id,
        email: data.user.email ?? "",
        name: "",
        username: "",
        onboardingCompleted: false,
      });
    }
  };

  const updateUser = async (userData: Partial<User>) => {
    if (!user) return;
    try {
      const updateData: Record<string, unknown> = {};
      if (userData.name !== undefined) updateData.name = userData.name;
      if (userData.username !== undefined) updateData.username = userData.username;
      if (userData.profileImage !== undefined) updateData.profile_image_url = userData.profileImage;
      if (userData.onboardingCompleted !== undefined) updateData.onboarding_completed = userData.onboardingCompleted;

      const { error, data } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id)
        .select()
        .single();
      if (error) throw error;
      if (data) {
        const profile = await fetchUserProfile(data.id);
        setUser(profile);
      }
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
  };

  // Sends a password-reset email. Add `opencircle://` to your Supabase
  // dashboard → Authentication → URL Configuration → Redirect URLs.
  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "opencircle://reset-password",
    });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setNeedsPasswordReset(false);
  };

  const clearPasswordReset = () => setNeedsPasswordReset(false);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        needsPasswordReset,
        signUp,
        signIn,
        updateUser,
        signOut,
        resetPassword,
        updatePassword,
        clearPasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("must be inside the provider");
  }
  return context;
};
