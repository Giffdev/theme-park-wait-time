import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'ParkPulse — Live Wait Times, Crowd Calendars & Ride Logs',
    template: '%s | ParkPulse',
  },
  description:
    'Track real-time ride wait times, plan your visit with crowd calendars, and log every ride. Built for theme park fans who refuse to waste time in line.',
  keywords: [
    'theme park',
    'wait times',
    'crowd calendar',
    'ride tracker',
    'Disney',
    'Universal',
  ],
};

export const viewport: Viewport = {
  themeColor: '#1a365d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen flex-col font-sans">
        {/* ── Header ── */}
        <header className="sticky top-0 z-50 border-b border-primary-100 bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center gap-2 font-bold text-primary-700">
              <span className="text-2xl">🎢</span>
              <span className="text-lg tracking-tight">ParkPulse</span>
            </Link>

            <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
              <Link href="/parks" className="text-primary-600 transition-colors hover:text-primary-900">
                Parks
              </Link>
              <Link href="/calendar" className="text-primary-600 transition-colors hover:text-primary-900">
                Crowd Calendar
              </Link>
              <Link href="/ride-log" className="text-primary-600 transition-colors hover:text-primary-900">
                My Rides
              </Link>
              <Link href="/dashboard" className="text-primary-600 transition-colors hover:text-primary-900">
                Dashboard
              </Link>
              <Link
                href="/auth/signin"
                className="rounded-full bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-700"
              >
                Sign In
              </Link>
            </nav>

            {/* Mobile menu button */}
            <button
              className="inline-flex items-center justify-center rounded-md p-2 text-primary-600 md:hidden"
              aria-label="Open menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        </header>

        {/* ── Main Content ── */}
        <Providers>
          <main className="flex-1">{children}</main>
        </Providers>

        {/* ── Footer ── */}
        <footer className="border-t border-primary-100 bg-primary-950 text-primary-200">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎢</span>
                <span className="font-semibold text-white">ParkPulse</span>
              </div>
              <p className="text-sm text-primary-400">
                © 2026 ParkPulse. Built with 🎡 by theme park fans, for theme park fans.
              </p>
            </div>
          </div>
        </footer>

        {/* ── Mobile Bottom Nav ── */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-primary-100 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="flex items-center justify-around py-2">
            <Link href="/" className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs text-primary-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              Home
            </Link>
            <Link href="/parks" className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs text-primary-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              Parks
            </Link>
            <Link href="/ride-log" className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs text-primary-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              My Rides
            </Link>
            <Link href="/dashboard" className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs text-primary-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              Profile
            </Link>
          </div>
        </nav>
      </body>
    </html>
  );
}
