'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getTrip, completeTrip, generateShareId, updateTrip, deleteTrip } from '@/lib/services/trip-service';
import { getTripRideLogs } from '@/lib/services/trip-service';
import { deleteRideLog } from '@/lib/services/ride-log-service';
import { getTripDiningLogs, deleteDiningLog } from '@/lib/services/dining-log-service';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { Trip } from '@/types/trip';
import type { RideLog } from '@/types/ride-log';
import type { DiningLog } from '@/types/dining-log';

function statusBadge(status: Trip['status']) {
  switch (status) {
    case 'active':
      return <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Active</span>;
    case 'planning':
      return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Upcoming</span>;
    case 'completed':
      return <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">Completed</span>;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function groupRidesByDay(logs: (RideLog & { id: string })[]): Record<string, (RideLog & { id: string })[]> {
  const groups: Record<string, (RideLog & { id: string })[]> = {};
  for (const log of logs) {
    const date = log.rodeAt instanceof Date
      ? log.rodeAt.toISOString().split('T')[0]
      : new Date(log.rodeAt).toISOString().split('T')[0];
    if (!groups[date]) groups[date] = [];
    groups[date].push(log);
  }
  // Sort days newest first
  return Object.fromEntries(
    Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  );
}

export default function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [trip, setTrip] = useState<(Trip & { id: string }) | null>(null);
  const [rideLogs, setRideLogs] = useState<(RideLog & { id: string })[]>([]);
  const [diningLogs, setDiningLogs] = useState<(DiningLog & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  // Delete trip state
  const [showDeleteTrip, setShowDeleteTrip] = useState(false);
  const [deletingTrip, setDeletingTrip] = useState(false);

  // Delete ride log state
  const [deleteLogId, setDeleteLogId] = useState<string | null>(null);
  const [deletingLog, setDeletingLog] = useState(false);

  // Delete dining log state
  const [deleteDiningId, setDeleteDiningId] = useState<string | null>(null);
  const [deletingDining, setDeletingDining] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !tripId) return;
    setLoading(true);
    try {
      const tripData = await getTrip(user.uid, tripId);
      setTrip(tripData);
    } catch (err) {
      console.error('Failed to load trip:', err);
    }
    try {
      const logs = await getTripRideLogs(user.uid, tripId);
      setRideLogs(logs);
    } catch (err) {
      console.error('Failed to load ride logs:', err);
    }
    try {
      const dLogs = await getTripDiningLogs(user.uid, tripId);
      setDiningLogs(dLogs);
    } catch (err) {
      console.error('Failed to load dining logs:', err);
    }
    setLoading(false);
  }, [user, tripId]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const handleComplete = async () => {
    if (!user || !tripId) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      await completeTrip(user.uid, tripId);
      await fetchData();
    } catch (err) {
      console.error('Failed to complete trip:', err);
      setCompleteError('Failed to complete trip. Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  const handleShare = async () => {
    if (!user || !trip) return;
    setSharing(true);
    try {
      const shareId = trip.shareId || generateShareId();
      if (!trip.shareId) {
        await updateTrip(user.uid, trip.id, { shareId });
      }
      const url = `${window.location.origin}/trips/shared/${shareId}`;
      await navigator.clipboard.writeText(url);
      alert('Share link copied to clipboard!');
      await fetchData();
    } catch (err) {
      console.error('Failed to share trip:', err);
    } finally {
      setSharing(false);
    }
  };

  const handleDeleteTrip = async () => {
    if (!user || !tripId) return;
    setDeletingTrip(true);
    try {
      await deleteTrip(user.uid, tripId);
      router.push('/trips');
    } catch (err) {
      console.error('Failed to delete trip:', err);
      setDeletingTrip(false);
      setShowDeleteTrip(false);
    }
  };

  const handleDeleteRideLog = async () => {
    if (!user || !deleteLogId) return;
    setDeletingLog(true);
    try {
      await deleteRideLog(user.uid, deleteLogId);
      setRideLogs((prev) => prev.filter((l) => l.id !== deleteLogId));
    } catch (err) {
      console.error('Failed to delete ride log:', err);
    } finally {
      setDeletingLog(false);
      setDeleteLogId(null);
    }
  };

  const handleDeleteDiningLog = async () => {
    if (!user || !deleteDiningId) return;
    setDeletingDining(true);
    try {
      await deleteDiningLog(user.uid, deleteDiningId);
      setDiningLogs((prev) => prev.filter((l) => l.id !== deleteDiningId));
    } catch (err) {
      console.error('Failed to delete dining log:', err);
    } finally {
      setDeletingDining(false);
      setDeleteDiningId(null);
    }
  };

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
        <div className="text-5xl">🎡</div>
        <h2 className="text-xl font-semibold text-primary-800">Sign in to view your trip details</h2>
        <p className="text-primary-500 max-w-sm">
          Your ride stats, park highlights, and trip memories are waiting for you. Sign in to see it all!
        </p>
        <Link
          href="/auth/signin"
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          🎢 Sign In to View Trip
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold text-primary-900">Trip Not Found</h1>
        <p className="mt-2 text-primary-500">This trip doesn&apos;t exist or you don&apos;t have access.</p>
        <Link href="/trips" className="mt-4 inline-block text-primary-600 hover:text-primary-700 font-medium">
          ← Back to My Trips
        </Link>
      </div>
    );
  }

  const groupedLogs = groupRidesByDay(rideLogs);
  const dateRange = trip.startDate === trip.endDate
    ? formatDate(trip.startDate)
    : `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-24 md:pb-8">
      {/* Back */}
      <Link href="/trips" className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-700 mb-4">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to My Trips
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-primary-900 sm:text-3xl">{trip.name}</h1>
            {statusBadge(trip.status)}
          </div>
          <p className="mt-1 text-primary-500">{dateRange}</p>
          {Object.values(trip.parkNames).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.values(trip.parkNames).map((name) => (
                <span key={name} className="rounded-md bg-primary-50 px-2 py-0.5 text-xs text-primary-600">
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleShare}
            disabled={sharing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
            </svg>
            Share
          </button>
          <button
            onClick={() => setShowDeleteTrip(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            aria-label="Delete trip"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Delete</span>
          </button>
          {trip.status === 'active' && (
            <>
              <Link
                href={`/trips/${trip.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
              >
                Edit
              </Link>
              <button
                onClick={handleComplete}
                disabled={completing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                {completing ? 'Completing...' : 'Complete Trip'}
              </button>
              {completeError && (
                <p className="text-xs text-red-600 mt-1">{completeError}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      {trip.stats.totalRides > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-primary-100 bg-white p-3 text-center">
            <div className="text-xl font-bold text-primary-700">{trip.stats.totalRides}</div>
            <div className="text-xs text-primary-500">Total Rides</div>
          </div>
          <div className="rounded-lg border border-primary-100 bg-white p-3 text-center">
            <div className="text-xl font-bold text-primary-700">{trip.stats.totalWaitMinutes}</div>
            <div className="text-xs text-primary-500">Min. Waited</div>
          </div>
          <div className="rounded-lg border border-primary-100 bg-white p-3 text-center">
            <div className="text-xl font-bold text-primary-700">{trip.stats.parksVisited}</div>
            <div className="text-xs text-primary-500">Parks Visited</div>
          </div>
          <div className="rounded-lg border border-primary-100 bg-white p-3 text-center">
            <div className="text-xl font-bold text-primary-700">{trip.stats.uniqueAttractions}</div>
            <div className="text-xs text-primary-500">Unique Attractions</div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-primary-900 mb-4">Trip Timeline</h2>

        {rideLogs.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-primary-200 py-12 text-center">
            <div className="text-4xl mb-3">🎢</div>
            <p className="text-primary-600 font-medium">No rides logged yet</p>
            <p className="text-sm text-primary-400 mt-1">Start riding and log your experiences!</p>
            <Link
              href={`/trips/${trip.id}/log`}
              className="mt-4 inline-flex items-center gap-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Log a Ride
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedLogs).map(([date, logs]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 rounded-full bg-primary-400" />
                  <h3 className="text-sm font-semibold text-primary-700">{formatDate(date)}</h3>
                  <span className="text-xs text-primary-400">{logs.length} ride{logs.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="ml-3 border-l-2 border-primary-100 pl-4 space-y-2">
                  {logs.map((log) => {
                    const time = log.rodeAt instanceof Date
                      ? log.rodeAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                      : new Date(log.rodeAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    return (
                      <div key={log.id} className="group rounded-lg border border-primary-100 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-primary-800">{log.attractionName}</p>
                            <p className="text-xs text-primary-500">{log.parkName} · {time}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {log.waitTimeMinutes != null ? (
                              <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600">
                                {log.waitTimeMinutes} min
                              </span>
                            ) : (
                              <span className="rounded-md bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-400">
                                —
                              </span>
                            )}
                            {log.rating && (
                              <span className="text-xs text-amber-500">
                                {'★'.repeat(log.rating)}{'☆'.repeat(5 - log.rating)}
                              </span>
                            )}
                            <button
                              onClick={() => setDeleteLogId(log.id)}
                              className="ml-1 rounded-md p-1 text-red-400 transition-opacity hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                              aria-label={`Delete ${log.attractionName} ride log`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {log.notes && (
                          <p className="mt-1.5 text-xs text-primary-500 italic">{log.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dining Timeline */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-primary-900 mb-4">🍽️ Dining</h2>

        {diningLogs.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-amber-200 py-8 text-center">
            <div className="text-3xl mb-2">🍽️</div>
            <p className="text-primary-600 font-medium text-sm">No dining logged yet</p>
            <p className="text-xs text-primary-400 mt-1">Log your meals and snacks along the way!</p>
            <Link
              href={`/trips/${trip.id}/log`}
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
            >
              Log Dining
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {diningLogs.map((log) => {
              const time = log.diningAt instanceof Date
                ? log.diningAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                : new Date(log.diningAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              const mealIcons: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍿' };
              return (
                <div key={log.id} className="group rounded-lg border border-amber-100 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{mealIcons[log.mealType] || '🍽️'}</span>
                      <div>
                        <p className="text-sm font-medium text-primary-800">{log.restaurantName}</p>
                        <p className="text-xs text-primary-500">
                          {log.parkName} · {time} · <span className="capitalize">{log.mealType}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.rating && (
                        <span className="text-xs text-amber-500">
                          {'★'.repeat(log.rating)}{'☆'.repeat(5 - log.rating)}
                        </span>
                      )}
                      <button
                        onClick={() => setDeleteDiningId(log.id)}
                        className="ml-1 rounded-md p-1 text-red-400 transition-opacity hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label={`Delete ${log.restaurantName} dining log`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {log.notes && (
                    <p className="mt-1.5 ml-8 text-xs text-primary-500 italic">{log.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Trip Confirmation */}
      <ConfirmDialog
        open={showDeleteTrip}
        title="Delete Trip"
        description="Are you sure? This will permanently delete this trip and all associated ride logs. This action cannot be undone."
        confirmLabel="Delete Trip"
        onConfirm={handleDeleteTrip}
        onCancel={() => setShowDeleteTrip(false)}
        loading={deletingTrip}
      />

      {/* Delete Ride Log Confirmation */}
      <ConfirmDialog
        open={deleteLogId !== null}
        title="Delete Ride Log"
        description="Are you sure you want to delete this ride log entry? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteRideLog}
        onCancel={() => setDeleteLogId(null)}
        loading={deletingLog}
      />

      {/* Delete Dining Log Confirmation */}
      <ConfirmDialog
        open={deleteDiningId !== null}
        title="Delete Dining Log"
        description="Are you sure you want to delete this dining log entry? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteDiningLog}
        onCancel={() => setDeleteDiningId(null)}
        loading={deletingDining}
      />
    </div>
  );
}
