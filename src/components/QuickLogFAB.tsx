'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { usePathname } from 'next/navigation';
import UnifiedLogSheet from './UnifiedLogSheet';

/**
 * Global Floating Action Button for quick ride logging.
 * Visible on all pages when authenticated, EXCEPT the dedicated log page.
 * Positioned above mobile nav bar on small screens.
 * Opens the unified sheet with ride-log section expanded by default (user's intent is logging).
 */
export default function QuickLogFAB() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Don't show if not authenticated
  if (!user) return null;

  // Don't show on the dedicated log page (that IS the logging experience)
  if (pathname?.includes('/log')) return null;

  return (
    <>
      <button
        onClick={() => setSheetOpen(true)}
        aria-label="Log a ride"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all md:bottom-6 md:right-6"
      >
        <Plus className="h-7 w-7" strokeWidth={2.5} />
      </button>

      <UnifiedLogSheet open={sheetOpen} onClose={() => setSheetOpen(false)} expandedByDefault={true} />
    </>
  );
}
