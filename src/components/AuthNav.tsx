'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';

export function AuthNavDesktop() {
  const { user, loading } = useAuth();

  return (
    <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
      <Link href="/parks" className="text-primary-600 transition-colors hover:text-primary-900">
        Parks
      </Link>
      <Link href="/calendar" className="text-primary-600 transition-colors hover:text-primary-900">
        Crowd Calendar
      </Link>
      {user && (
        <>
          <Link href="/trips" className="text-primary-600 transition-colors hover:text-primary-900">
            Trips
          </Link>
          <Link href="/ride-log" className="text-primary-600 transition-colors hover:text-primary-900">
            My Rides
          </Link>
          <Link href="/dashboard" className="text-primary-600 transition-colors hover:text-primary-900">
            Dashboard
          </Link>
        </>
      )}
      {!loading && !user && (
        <Link
          href="/auth/signin"
          className="rounded-full bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-700"
        >
          Sign In
        </Link>
      )}
      {!loading && user && (
        <Link
          href="/dashboard"
          className="rounded-full bg-primary-100 px-4 py-2 text-primary-700 transition-colors hover:bg-primary-200"
        >
          Account
        </Link>
      )}
    </nav>
  );
}

export function AuthNavMobile() {
  const { user } = useAuth();

  return (
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
        {user ? (
          <>
            <Link href="/trips" className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs text-primary-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              Trips
            </Link>
            <Link href="/dashboard" className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs text-primary-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              Profile
            </Link>
          </>
        ) : (
          <Link href="/auth/signin" className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs text-primary-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
}
