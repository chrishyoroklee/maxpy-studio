import { useState, useEffect, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  deleteUser,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../lib/firebase";
import { ensureUserDoc } from "../lib/firestore";

export class ReauthRequiredError extends Error {
  providerId: "password" | "google.com" | "unknown";
  constructor(providerId: "password" | "google.com" | "unknown") {
    super("Recent sign-in required");
    this.name = "ReauthRequiredError";
    this.providerId = providerId;
  }
}

const googleProvider = new GoogleAuthProvider();

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      // Create/update user doc in Firestore on login
      if (u) ensureUserDoc().catch(() => {});
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    await sendEmailVerification(cred.user);
    return cred;
  }, []);

  const resendVerification = useCallback(async () => {
    if (auth.currentUser && !auth.currentUser.emailVerified) {
      await sendEmailVerification(auth.currentUser);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setUser({ ...auth.currentUser } as User);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    return signInWithPopup(auth, googleProvider);
  }, []);

  const logout = useCallback(async () => {
    return signOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    return sendPasswordResetEmail(auth, email);
  }, []);

  const updateDisplayName = useCallback(async (displayName: string) => {
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName });
      setUser({ ...auth.currentUser } as User);
    }
  }, []);

  const reauthenticate = useCallback(async (password?: string) => {
    const current = auth.currentUser;
    if (!current) throw new Error("Not signed in");
    const providerId = current.providerData[0]?.providerId;

    if (providerId === "password") {
      if (!password) {
        throw new ReauthRequiredError("password");
      }
      if (!current.email) throw new Error("Account has no email");
      const credential = EmailAuthProvider.credential(current.email, password);
      await reauthenticateWithCredential(current, credential);
    } else if (providerId === "google.com") {
      await reauthenticateWithPopup(current, googleProvider);
    } else {
      throw new ReauthRequiredError("unknown");
    }
  }, []);

  const deleteAccount = useCallback(async (password?: string) => {
    const current = auth.currentUser;
    if (!current) return;

    const providerId = current.providerData[0]?.providerId;
    const normalizedProvider: "password" | "google.com" | "unknown" =
      providerId === "password" ? "password"
        : providerId === "google.com" ? "google.com"
        : "unknown";

    const attemptDeleteUser = async () => {
      try {
        await deleteUser(current);
        return;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== "auth/requires-recent-login") throw err;
        if (password === undefined && normalizedProvider === "password") {
          throw new ReauthRequiredError("password");
        }
        await reauthenticate(password);
        await deleteUser(current);
      }
    };

    await httpsCallable(functions, "deleteUserData")();
    await attemptDeleteUser();
  }, [reauthenticate]);

  return {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    logout,
    resetPassword,
    resendVerification,
    refreshUser,
    updateDisplayName,
    deleteAccount,
  };
}
