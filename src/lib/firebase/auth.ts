import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  updateProfile,
  type User,
  type UserCredential,
  type Unsubscribe,
} from 'firebase/auth';
import { auth } from './config';

const googleProvider = new GoogleAuthProvider();

/**
 * Create a new account with email and password.
 * Optionally set a display name on the newly created user.
 */
export async function signUp(
  email: string,
  password: string,
  displayName?: string,
): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && credential.user) {
    await updateProfile(credential.user, { displayName });
  }
  return credential;
}

/**
 * Sign in an existing user with email and password.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Sign in (or sign up) with a Google account via popup.
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider);
}

/**
 * Sign the current user out.
 */
export async function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

/**
 * Subscribe to auth-state changes.
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(
  callback: (user: User | null) => void,
): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

/**
 * Returns the currently signed-in user, or null.
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}
