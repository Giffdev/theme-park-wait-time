/**
 * Custom render helper that wraps components in the app's providers.
 *
 * Usage:
 *   import { render, screen } from '@/lib/test-utils/render-helpers';
 *   render(<MyComponent />);
 *   expect(screen.getByText('Hello')).toBeInTheDocument();
 */

import React, { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Auth context stub — replace with the real AuthProvider once it exists
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: { uid: string; email: string; displayName: string } | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const defaultAuth: AuthContextValue = {
  user: null,
  loading: false,
  signIn: async () => {},
  signOut: async () => {},
};

// This will be swapped for the real context once src/hooks/use-auth.ts exists.
// For now we create a lightweight stub so component tests can import this file
// without errors.
const AuthContext = React.createContext<AuthContextValue>(defaultAuth);

// ---------------------------------------------------------------------------
// AllProviders wrapper
// ---------------------------------------------------------------------------

interface ProvidersProps {
  children: ReactNode;
  authValue?: Partial<AuthContextValue>;
}

function AllProviders({ children, authValue }: ProvidersProps) {
  const auth: AuthContextValue = { ...defaultAuth, ...authValue };
  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Custom render
// ---------------------------------------------------------------------------

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  authValue?: Partial<AuthContextValue>;
}

function customRender(ui: ReactElement, options: CustomRenderOptions = {}) {
  const { authValue, ...renderOptions } = options;

  return {
    user: userEvent.setup(),
    ...render(ui, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AllProviders authValue={authValue}>{children}</AllProviders>
      ),
      ...renderOptions,
    }),
  };
}

// Re-export everything from @testing-library/react, overriding render
export * from '@testing-library/react';
export { customRender as render, AuthContext };
