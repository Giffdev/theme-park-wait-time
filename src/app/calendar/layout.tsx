import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Crowd Calendar',
  description: 'See predicted crowd levels for every day across major theme parks.',
};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
