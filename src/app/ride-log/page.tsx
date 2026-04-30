'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Timer, MapPin, Clock } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getRideLogs, deleteRideLog } from '@/lib/services/ride-log-service';
import RideLogList from '@/components/ride-log/RideLogList';
import ManualLogForm from '@/components/ride-log/ManualLogForm';
import type { RideLog } from '@/types/ride-log';

type FilterTab = 'all' | 'park' | 'date';

export default function RideLogPage() {
  const { user, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<(RideLog & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [showForm, setShowForm] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getRideLogs(user.uid);
      setLogs(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchLogs();
  }, [user, fetchLogs]);

  const handleDelete = async (id: string) => {
    if (!user) return;
    await deleteRideLog(user.uid, id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  };

  // Stats
  const totalRides = logs.length;
  const parksVisited = new Set(logs.map((l) => l.parkId)).size;
  const totalWaitMinutes = logs.reduce((sum, l) => sum + (l.waitTimeMinutes ?? 0), 0);

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-5xl">🎢</div>
        <h2 className="text-xl font-semibold text-primary-800">Sign in to track your rides</h2>
        <p className="text-primary-500 max-w-sm">
          Log every ride, see your wait time stats, and build your ultimate coaster count. The thrills are calling!
        </p>
        <Link
          href="/auth/signin"
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          🎠 Sign In to Track Rides
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary-900">My Rides</h1>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="rounded-full p-2 text-primary-500 hover:bg-primary-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats summary */}
      {totalRides > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-primary-50 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-primary-400">
              <Timer className="h-3.5 w-3.5" />
            </div>
            <p className="mt-1 text-2xl font-bold text-primary-900">{totalRides}</p>
            <p className="text-xs text-primary-400">Rides</p>
          </div>
          <div className="rounded-2xl bg-primary-50 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-primary-400">
              <MapPin className="h-3.5 w-3.5" />
            </div>
            <p className="mt-1 text-2xl font-bold text-primary-900">{parksVisited}</p>
            <p className="text-xs text-primary-400">Parks</p>
          </div>
          <div className="rounded-2xl bg-primary-50 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-primary-400">
              <Clock className="h-3.5 w-3.5" />
            </div>
            <p className="mt-1 text-2xl font-bold text-primary-900">
              {totalWaitMinutes > 60 ? `${Math.round(totalWaitMinutes / 60)}h` : `${totalWaitMinutes}m`}
            </p>
            <p className="text-xs text-primary-400">Waited</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {totalRides > 0 && (
        <div className="mb-4 flex gap-1 rounded-xl bg-primary-50 p-1">
          {(['all', 'park', 'date'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium capitalize transition-colors ${
                filter === tab
                  ? 'bg-white text-primary-900 shadow-sm'
                  : 'text-primary-500 hover:text-primary-700'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'park' ? 'By Park' : 'By Date'}
            </button>
          ))}
        </div>
      )}

      {/* Ride log list */}
      <RideLogList logs={logs} onDelete={handleDelete} loading={loading} groupBy={filter === 'park' ? 'park' : 'date'} />

      {/* Manual log form modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-md animate-slide-up rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <h2 className="mb-4 text-lg font-bold text-primary-900">Log a Ride</h2>
            <ManualLogForm
              onSuccess={() => { setShowForm(false); fetchLogs(); }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-coral-500 to-coral-600 text-white shadow-lg shadow-coral-500/30 transition-all hover:shadow-xl hover:shadow-coral-500/40 active:scale-90 md:bottom-8 md:right-8"
        aria-label="Add ride manually"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
