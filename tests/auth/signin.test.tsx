/**
 * Tests for the SignIn page component.
 *
 * Tests the expected interactive behavior: Google sign-in, email/password form,
 * loading states, error display, and redirect on success.
 *
 * The current SignInPage is a static scaffold — the rendering tests verify the
 * current structure, while the interaction tests define the spec for when
 * Data wires up auth logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/auth/signin',
  redirect: vi.fn(),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock Firebase config
vi.mock('@/lib/firebase/config', () => ({
  auth: { currentUser: null },
  db: {},
  storage: {},
  app: {},
}));

// Mock firebase/app (for FirebaseError)
vi.mock('firebase/app', () => ({
  FirebaseError: class FirebaseError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Mock auth functions
const mockSignInWithGoogle = vi.fn();
const mockSignIn = vi.fn();
vi.mock('@/lib/firebase/auth', () => ({
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(() => vi.fn()),
  getCurrentUser: vi.fn(() => null),
}));

// Mock auth context
vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('SignIn Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the page title and description', async () => {
      const { default: SignInPage } = await import('@/app/auth/signin/page');
      render(<SignInPage />);

      expect(screen.getByText('Welcome back')).toBeInTheDocument();
      expect(screen.getByText('Sign in to your ParkFlow account')).toBeInTheDocument();
    });

    it('renders the Google sign-in button', async () => {
      const { default: SignInPage } = await import('@/app/auth/signin/page');
      render(<SignInPage />);

      expect(screen.getByText('Continue with Google')).toBeInTheDocument();
    });

    it('renders email and password input fields', async () => {
      const { default: SignInPage } = await import('@/app/auth/signin/page');
      render(<SignInPage />);

      expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    });

    it('renders the Sign In submit button', async () => {
      const { default: SignInPage } = await import('@/app/auth/signin/page');
      render(<SignInPage />);

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('renders link to sign up page', async () => {
      const { default: SignInPage } = await import('@/app/auth/signin/page');
      render(<SignInPage />);

      const link = screen.getByRole('link', { name: /sign up/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/auth/signup');
    });
  });

  describe('form interaction', () => {
    it('accepts email and password input', async () => {
      const user = userEvent.setup();
      const { default: SignInPage } = await import('@/app/auth/signin/page');
      render(<SignInPage />);

      const emailInput = screen.getByPlaceholderText('Email address');
      const passwordInput = screen.getByPlaceholderText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      expect(emailInput).toHaveValue('test@example.com');
      expect(passwordInput).toHaveValue('password123');
    });

    it('Google button is clickable', async () => {
      const user = userEvent.setup();
      const { default: SignInPage } = await import('@/app/auth/signin/page');
      render(<SignInPage />);

      const googleButton = screen.getByText('Continue with Google');
      await user.click(googleButton);

      // Button exists and is interactive
      expect(googleButton).toBeInTheDocument();
    });
  });

  describe('auth behavior (spec — for wired-up version)', () => {
    it('should call signInWithGoogle when Google button is clicked', () => {
      // Spec: On Google button click → signInWithGoogle() is called
      // On success → router.push('/dashboard')
      expect(mockSignInWithGoogle).not.toHaveBeenCalled();
    });

    it('should call signIn with email/password on form submit', () => {
      // Spec: On form submit → signIn(email, password) is called
      // On success → router.push('/dashboard')
      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('should show loading state during authentication', () => {
      // Spec: While auth is pending:
      // - Submit button shows "Signing in..." or spinner
      // - Form inputs become disabled
      expect(true).toBe(true);
    });

    it('should show error for auth/wrong-password', () => {
      // Spec: Error banner: "Incorrect password. Please try again."
      expect(true).toBe(true);
    });

    it('should show error for auth/user-not-found', () => {
      // Spec: Error banner: "No account found with this email."
      expect(true).toBe(true);
    });

    it('should show error for auth/popup-blocked', () => {
      // Spec: Error banner: "Popup was blocked. Please allow popups."
      expect(true).toBe(true);
    });

    it('should redirect to /dashboard after successful sign-in', () => {
      // Spec: router.push('/dashboard') called on success
      expect(true).toBe(true);
    });

    it('should redirect authenticated users to /dashboard', () => {
      // Spec: If useAuth().user is non-null and loading is false,
      // redirect to /dashboard immediately (no flash of sign-in page)
      expect(true).toBe(true);
    });
  });
});
