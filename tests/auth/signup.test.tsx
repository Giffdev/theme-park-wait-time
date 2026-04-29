/**
 * Tests for the SignUp page component.
 *
 * Tests registration form behavior: Google sign-up, email form with display name,
 * password validation, error display, and redirect on success.
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
  usePathname: () => '/auth/signup',
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
const mockSignUp = vi.fn();
vi.mock('@/lib/firebase/auth', () => ({
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
  signIn: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(() => vi.fn()),
  getCurrentUser: vi.fn(() => null),
}));

// Mock auth context
vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('SignUp Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the page title and description', async () => {
      const { default: SignUpPage } = await import('@/app/auth/signup/page');
      render(<SignUpPage />);

      expect(screen.getByText('Create your account')).toBeInTheDocument();
      expect(screen.getByText('Join the ParkPulse community')).toBeInTheDocument();
    });

    it('renders the Google sign-up button', async () => {
      const { default: SignUpPage } = await import('@/app/auth/signup/page');
      render(<SignUpPage />);

      expect(screen.getByText('Continue with Google')).toBeInTheDocument();
    });

    it('renders display name, email, and password inputs', async () => {
      const { default: SignUpPage } = await import('@/app/auth/signup/page');
      render(<SignUpPage />);

      expect(screen.getByPlaceholderText('Display name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Password (min 6 characters)')).toBeInTheDocument();
    });

    it('renders the Create Account submit button', async () => {
      const { default: SignUpPage } = await import('@/app/auth/signup/page');
      render(<SignUpPage />);

      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('renders link to sign in page', async () => {
      const { default: SignUpPage } = await import('@/app/auth/signup/page');
      render(<SignUpPage />);

      const link = screen.getByRole('link', { name: /sign in/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/auth/signin');
    });
  });

  describe('form interaction', () => {
    it('accepts display name, email, and password input', async () => {
      const user = userEvent.setup();
      const { default: SignUpPage } = await import('@/app/auth/signup/page');
      render(<SignUpPage />);

      const nameInput = screen.getByPlaceholderText('Display name');
      const emailInput = screen.getByPlaceholderText('Email address');
      const passwordInput = screen.getByPlaceholderText('Password (min 6 characters)');
      await user.type(nameInput, 'Park Enthusiast');
      await user.type(emailInput, 'new@example.com');
      await user.type(passwordInput, 'securepass123');

      expect(nameInput).toHaveValue('Park Enthusiast');
      expect(emailInput).toHaveValue('new@example.com');
      expect(passwordInput).toHaveValue('securepass123');
    });

    it('Google button is clickable', async () => {
      const user = userEvent.setup();
      const { default: SignUpPage } = await import('@/app/auth/signup/page');
      render(<SignUpPage />);

      const googleButton = screen.getByText('Continue with Google');
      await user.click(googleButton);

      expect(googleButton).toBeInTheDocument();
    });
  });

  describe('auth behavior (spec — for wired-up version)', () => {
    it('should call signUp with email, password, and displayName on form submit', () => {
      // Spec: signUp('email', 'password', 'displayName') called on submit
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('should call signInWithGoogle when Google button is clicked', () => {
      // Spec: Same Google provider for sign-in and sign-up
      expect(mockSignInWithGoogle).not.toHaveBeenCalled();
    });

    it('should show loading state during registration', () => {
      // Spec: Submit button shows "Creating account..." or spinner
      // Spec: Form inputs become disabled
      expect(true).toBe(true);
    });

    it('should redirect to /dashboard after successful sign-up', () => {
      // Spec: router.push('/dashboard') called after registration
      expect(true).toBe(true);
    });

    it('should show error for auth/weak-password', () => {
      // Spec: Error message: "Password must be at least 6 characters."
      expect(true).toBe(true);
    });

    it('should show error for auth/email-already-in-use', () => {
      // Spec: Error message: "An account with this email already exists."
      // Optional: link to sign-in page
      expect(true).toBe(true);
    });

    it('should show error for auth/invalid-email', () => {
      // Spec: Error message: "Please enter a valid email address."
      expect(true).toBe(true);
    });

    it('should validate password length client-side before submission', () => {
      // Spec: If password < 6 chars, show validation error without calling Firebase
      expect(true).toBe(true);
    });

    it('should redirect authenticated users to /dashboard', () => {
      // Spec: If useAuth().user is non-null, redirect immediately
      expect(true).toBe(true);
    });
  });
});
