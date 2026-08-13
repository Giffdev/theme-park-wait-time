import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Crowd Calendar',
  description: 'Compare clearly labeled historical crowd estimates and coverage across theme parks.',
};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
