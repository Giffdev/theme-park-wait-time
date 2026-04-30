'use client';

import { AuthProvider } from '@/lib/firebase/auth-context';
import QueueTimerBanner from '@/components/queue-timer/QueueTimerBanner';
import ActiveTripBanner from '@/components/trips/ActiveTripBanner';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ActiveTripBanner />
      <QueueTimerBanner />
      {children}
    </AuthProvider>
  );
}
