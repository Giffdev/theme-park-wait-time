import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { Providers } from './providers';
import { AuthNavDesktop, AuthNavMobile } from '@/components/AuthNav';
import { APP_NAME } from '@/lib/constants';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Live Wait Times, Crowd Estimates & Ride Logs`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'Track current ride wait times, compare clearly labeled historical crowd estimates, and log every ride.',
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
        <Providers>
          {/* ── Header ── */}
          <header className="sticky top-0 z-50 border-b border-primary-100 bg-white/80 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
              <Link href="/" className="flex items-center gap-2 font-bold text-primary-700">
                <span className="text-2xl">🎢</span>
                <span className="text-lg tracking-tight">{APP_NAME}</span>
              </Link>

              <AuthNavDesktop />

              {/* Mobile nav handled by bottom bar */}
            </div>
          </header>

          {/* ── Main Content ── */}
          <main className="flex-1">{children}</main>

          {/* ── Footer ── */}
          <footer className="border-t border-primary-100 bg-primary-950 text-primary-200">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎢</span>
                  <span className="font-semibold text-white">{APP_NAME}</span>
                </div>
                <p className="text-sm text-primary-400">
                  © 2026 {APP_NAME}. Built with 🎡 by theme park fans, for theme park fans.
                </p>
              </div>
            </div>
          </footer>

          {/* ── Mobile Bottom Nav ── */}
          <AuthNavMobile />
        </Providers>
      </body>
    </html>
  );
}
