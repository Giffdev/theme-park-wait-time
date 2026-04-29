/**
 * Unit tests for Firebase Auth helper functions (src/lib/firebase/auth.ts).
 *
 * These test the raw auth functions in isolation by mocking the Firebase SDK.
 * They serve as a spec for Data's auth module implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase Auth SDK
const mockSignInWithPopup = vi.fn();
const mockSignInWithEmailAndPassword = vi.fn();
const mockCreateUserWithEmailAndPassword = vi.fn();
const mockFirebaseSignOut = vi.fn();
const mockUpdateProfile = vi.fn();
const mockOnAuthStateChanged = vi.fn();

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  GoogleAuthProvider: vi.fn(() => ({ providerId: 'google.com' })),
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignInWithEmailAndPassword(...args),
  createUserWithEmailAndPassword: (...args: unknown[]) => mockCreateUserWithEmailAndPassword(...args),
  signOut: (...args: unknown[]) => mockFirebaseSignOut(...args),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
}));

vi.mock('@/lib/firebase/config', () => ({
  auth: { currentUser: null },
}));

import { signIn, signUp, signInWithGoogle, signOut, getCurrentUser, onAuthStateChange } from '@/lib/firebase/auth';

describe('Firebase Auth helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signInWithGoogle', () => {
    it('calls signInWithPopup with GoogleAuthProvider', async () => {
      const mockCredential = { user: { uid: 'google-uid', email: 'user@gmail.com' } };
      mockSignInWithPopup.mockResolvedValue(mockCredential);

      const result = await signInWithGoogle();

      expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockCredential);
    });

    it('throws when popup is closed by user', async () => {
      const error = new Error('auth/popup-closed-by-user');
      mockSignInWithPopup.mockRejectedValue(error);

      await expect(signInWithGoogle()).rejects.toThrow('auth/popup-closed-by-user');
    });

    it('throws when popup is blocked', async () => {
      const error = new Error('auth/popup-blocked');
      mockSignInWithPopup.mockRejectedValue(error);

      await expect(signInWithGoogle()).rejects.toThrow('auth/popup-blocked');
    });
  });

  describe('signIn (email/password)', () => {
    it('calls signInWithEmailAndPassword with correct args', async () => {
      const mockCredential = { user: { uid: 'uid-1', email: 'test@example.com' } };
      mockSignInWithEmailAndPassword.mockResolvedValue(mockCredential);

      const result = await signIn('test@example.com', 'password123');

      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(), // auth instance
        'test@example.com',
        'password123',
      );
      expect(result).toEqual(mockCredential);
    });

    it('throws auth/wrong-password for incorrect credentials', async () => {
      const error = { code: 'auth/wrong-password', message: 'Wrong password' };
      mockSignInWithEmailAndPassword.mockRejectedValue(error);

      await expect(signIn('test@example.com', 'wrong')).rejects.toEqual(error);
    });

    it('throws auth/user-not-found for non-existent email', async () => {
      const error = { code: 'auth/user-not-found', message: 'User not found' };
      mockSignInWithEmailAndPassword.mockRejectedValue(error);

      await expect(signIn('nobody@example.com', 'pass')).rejects.toEqual(error);
    });

    it('throws auth/invalid-email for malformed email', async () => {
      const error = { code: 'auth/invalid-email', message: 'Invalid email' };
      mockSignInWithEmailAndPassword.mockRejectedValue(error);

      await expect(signIn('not-an-email', 'pass')).rejects.toEqual(error);
    });
  });

  describe('signUp (email/password)', () => {
    it('calls createUserWithEmailAndPassword with correct args', async () => {
      const mockCredential = { user: { uid: 'new-uid', email: 'new@example.com' } };
      mockCreateUserWithEmailAndPassword.mockResolvedValue(mockCredential);

      const result = await signUp('new@example.com', 'strongpass');

      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'new@example.com',
        'strongpass',
      );
      expect(result).toEqual(mockCredential);
    });

    it('sets display name via updateProfile when provided', async () => {
      const mockCredential = { user: { uid: 'new-uid', email: 'new@example.com' } };
      mockCreateUserWithEmailAndPassword.mockResolvedValue(mockCredential);
      mockUpdateProfile.mockResolvedValue(undefined);

      await signUp('new@example.com', 'strongpass', 'Park Fan');

      expect(mockUpdateProfile).toHaveBeenCalledWith(mockCredential.user, {
        displayName: 'Park Fan',
      });
    });

    it('does not call updateProfile when displayName is omitted', async () => {
      const mockCredential = { user: { uid: 'new-uid', email: 'new@example.com' } };
      mockCreateUserWithEmailAndPassword.mockResolvedValue(mockCredential);

      await signUp('new@example.com', 'strongpass');

      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('throws auth/weak-password for short passwords', async () => {
      const error = { code: 'auth/weak-password', message: 'Password should be at least 6 characters' };
      mockCreateUserWithEmailAndPassword.mockRejectedValue(error);

      await expect(signUp('new@example.com', '123')).rejects.toEqual(error);
    });

    it('throws auth/email-already-in-use for duplicate accounts', async () => {
      const error = { code: 'auth/email-already-in-use', message: 'Email already in use' };
      mockCreateUserWithEmailAndPassword.mockRejectedValue(error);

      await expect(signUp('taken@example.com', 'strongpass')).rejects.toEqual(error);
    });
  });

  describe('signOut', () => {
    it('calls Firebase signOut', async () => {
      mockFirebaseSignOut.mockResolvedValue(undefined);

      await signOut();

      expect(mockFirebaseSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentUser', () => {
    it('returns null when no user is signed in', () => {
      const result = getCurrentUser();
      expect(result).toBeNull();
    });
  });

  describe('onAuthStateChange', () => {
    it('subscribes to auth state changes', () => {
      const callback = vi.fn();
      const mockUnsubscribe = vi.fn();
      mockOnAuthStateChanged.mockReturnValue(mockUnsubscribe);

      const unsubscribe = onAuthStateChange(callback);

      expect(mockOnAuthStateChanged).toHaveBeenCalledWith(expect.anything(), callback);
      expect(unsubscribe).toBe(mockUnsubscribe);
    });
  });
});
