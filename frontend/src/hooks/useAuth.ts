import { useState, useEffect, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { ensureUserDoc } from "../lib/firestore";

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
    return cred;
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

  const deleteAccount = useCallback(async () => {
    if (auth.currentUser) {
      await deleteUser(auth.currentUser);
    }
  }, []);

  return {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    logout,
    resetPassword,
    updateDisplayName,
    deleteAccount,
  };
}
