'use client';

import { AuthProvider } from '@/lib/firebase/auth-context';
import QueueTimerBanner from '@/components/queue-timer/QueueTimerBanner';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <QueueTimerBanner />
      {children}
    </AuthProvider>
  );
}
