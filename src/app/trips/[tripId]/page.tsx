'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, Pencil, X, PlusCircle } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getTrip, completeTrip, generateShareId, updateTrip, deleteTrip } from '@/lib/services/trip-service';
import { getTripRideLogs } from '@/lib/services/trip-service';
import { deleteRideLog, updateRideLog } from '@/lib/services/ride-log-service';
import { getTripDiningLogs, deleteDiningLog, updateDiningLog } from '@/lib/services/dining-log-service';
import { notifyActiveTripChanged } from '@/components/trips/ActiveTripBanner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { Trip } from '@/types/trip';
import type { RideLog, RideLogUpdateData } from '@/types/ride-log';
import type { DiningLog, DiningLogUpdateData } from '@/types/dining-log';

function statusBadge(status: Trip['status']) {
  switch (status) {
    case 'active':
      return <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Active</span>;
    case 'completed':
      return <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">Completed</span>;
    default:
      return null;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

// Safely convert Firestore Timestamp, Date, string, or number to a JS Date
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSafeDate(value: any): Date {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') return new Date(value);
  return new Date();
}

function groupRidesByDay(logs: (RideLog & { id: string })[]): Record<string, (RideLog & { id: string })[]> {
  const groups: Record<string, (RideLog & { id: string })[]> = {};
  for (const log of logs) {
    const date = toSafeDate(log.rodeAt).toISOString().split('T')[0];
    if (!groups[date]) groups[date] = [];
    groups[date].push(log);
  }
  // Sort days chronologically (oldest first for timeline)
  return Object.fromEntries(
    Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  );
}

/** Group a day's rides by park, ordered by earliest ride timestamp. */
function groupByPark(logs: (RideLog & { id: string })[]): { parkId: string; parkName: string; rides: (RideLog & { id: string })[] }[] {
  const parkMap: Record<string, { parkName: string; rides: (RideLog & { id: string })[] }> = {};
  for (const log of logs) {
    if (!parkMap[log.parkId]) {
      parkMap[log.parkId] = { parkName: log.parkName, rides: [] };
    }
    parkMap[log.parkId].rides.push(log);
  }
  // Sort rides within each park chronologically
  const groups = Object.entries(parkMap).map(([parkId, data]) => ({
    parkId,
    parkName: data.parkName,
    rides: data.rides.sort((a, b) => toSafeDate(a.rodeAt).getTime() - toSafeDate(b.rodeAt).getTime()),
  }));
  // Sort parks by earliest ride time
  groups.sort((a, b) => toSafeDate(a.rides[0].rodeAt).getTime() - toSafeDate(b.rides[0].rodeAt).getTime());
  return groups;
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

  // Edit ride log state
  const [editingRideLog, setEditingRideLog] = useState<(RideLog & { id: string }) | null>(null);
  const [editRideData, setEditRideData] = useState<{ rodeAt: string; waitTimeMinutes: string; rating: string; notes: string }>({ rodeAt: '', waitTimeMinutes: '', rating: '', notes: '' });
  const [savingRide, setSavingRide] = useState(false);

  // Edit dining log state
  const [editingDiningLog, setEditingDiningLog] = useState<(DiningLog & { id: string }) | null>(null);
  const [editDiningData, setEditDiningData] = useState<{ diningAt: string; tableWaitMinutes: string; rating: string; notes: string; mealType: string; hadReservation: string }>({ diningAt: '', tableWaitMinutes: '', rating: '', notes: '', mealType: '', hadReservation: '' });
  const [savingDining, setSavingDining] = useState(false);

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
      notifyActiveTripChanged();
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

  const openEditRideLog = (log: RideLog & { id: string }) => {
    const date = toSafeDate(log.rodeAt);
    const localIso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditRideData({
      rodeAt: localIso,
      waitTimeMinutes: log.waitTimeMinutes != null ? String(log.waitTimeMinutes) : '',
      rating: log.rating != null ? String(log.rating) : '',
      notes: log.notes || '',
    });
    setEditingRideLog(log);
  };

  const handleSaveRideLog = async () => {
    if (!user || !editingRideLog) return;
    setSavingRide(true);
    try {
      const data: RideLogUpdateData = {};
      if (editRideData.rodeAt) data.rodeAt = new Date(editRideData.rodeAt);
      data.waitTimeMinutes = editRideData.waitTimeMinutes ? Number(editRideData.waitTimeMinutes) : null;
      data.rating = editRideData.rating ? Number(editRideData.rating) : null;
      data.notes = editRideData.notes;
      await updateRideLog(user.uid, editingRideLog.id, data);
      setRideLogs((prev) =>
        prev.map((l) => l.id === editingRideLog.id ? { ...l, ...data } : l)
      );
      setEditingRideLog(null);
    } catch (err) {
      console.error('Failed to update ride log:', err);
    } finally {
      setSavingRide(false);
    }
  };

  const openEditDiningLog = (log: DiningLog & { id: string }) => {
    const date = toSafeDate(log.diningAt);
    const localIso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditDiningData({
      diningAt: localIso,
      tableWaitMinutes: log.tableWaitMinutes != null ? String(log.tableWaitMinutes) : '',
      rating: log.rating != null ? String(log.rating) : '',
      notes: log.notes || '',
      mealType: log.mealType || 'lunch',
      hadReservation: log.hadReservation === true ? 'yes' : log.hadReservation === false ? 'no' : '',
    });
    setEditingDiningLog(log);
  };

  const handleSaveDiningLog = async () => {
    if (!user || !editingDiningLog) return;
    setSavingDining(true);
    try {
      const data: DiningLogUpdateData = {};
      if (editDiningData.diningAt) data.diningAt = new Date(editDiningData.diningAt);
      data.tableWaitMinutes = editDiningData.tableWaitMinutes ? Number(editDiningData.tableWaitMinutes) : null;
      data.rating = editDiningData.rating ? Number(editDiningData.rating) : null;
      data.notes = editDiningData.notes;
      data.mealType = editDiningData.mealType as DiningLog['mealType'];
      data.hadReservation = editDiningData.hadReservation === 'yes' ? true : editDiningData.hadReservation === 'no' ? false : null;
      await updateDiningLog(user.uid, editingDiningLog.id, data);
      setDiningLogs((prev) =>
        prev.map((l) => l.id === editingDiningLog.id ? { ...l, ...data } : l)
      );
      setEditingDiningLog(null);
    } catch (err) {
      console.error('Failed to update dining log:', err);
    } finally {
      setSavingDining(false);
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
          {Object.values(trip.parkNames ?? {}).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.values(trip.parkNames ?? {}).map((name) => (
                <span key={name} className="rounded-md bg-primary-50 px-2 py-0.5 text-xs text-primary-600">
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/trips/${trip.id}/log`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            Log a Ride or Experience
          </Link>
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
              className="mt-4 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Log a Ride or Experience
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedLogs).map(([date, dayLogs]) => {
              const parkGroups = groupByPark(dayLogs);
              const totalRides = dayLogs.length;
              return (
                <div key={date} className="rounded-xl border border-primary-100 bg-white overflow-hidden">
                  {/* Day header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-primary-50 border-b border-primary-100">
                    <span className="text-base">📅</span>
                    <h3 className="text-sm font-semibold text-primary-800">{formatDate(date)}</h3>
                    <span className="ml-auto text-xs text-primary-400">{totalRides} ride{totalRides !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Parks within this day */}
                  <div className="divide-y divide-primary-50">
                    {parkGroups.map((park) => (
                      <div key={park.parkId} className="px-4 py-3">
                        {/* Park sub-header */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">🏰</span>
                          <span className="text-xs font-semibold text-primary-700">{park.parkName}</span>
                          <span className="text-xs text-primary-400">({park.rides.length})</span>
                        </div>

                        {/* Rides in this park */}
                        <div className="space-y-1.5 ml-5">
                          {park.rides.map((log) => {
                            const time = toSafeDate(log.rodeAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                            return (
                              <div key={log.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-primary-50 transition-colors">
                                <span className="text-xs text-primary-400 w-16 flex-shrink-0">{time}</span>
                                <span className="text-sm font-medium text-primary-800 flex-1 min-w-0 truncate">{log.attractionName}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {log.waitTimeMinutes != null && (
                                    <span className="text-xs text-primary-500">⏱️ {log.waitTimeMinutes}min</span>
                                  )}
                                  {log.rating && (
                                    <span className="text-xs text-amber-500">
                                      {'★'.repeat(log.rating)}{'☆'.repeat(5 - log.rating)}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => openEditRideLog(log)}
                                    className="rounded-md p-1 text-primary-400 transition-opacity hover:bg-primary-100 hover:text-primary-600 sm:opacity-0 sm:group-hover:opacity-100"
                                    aria-label={`Edit ${log.attractionName} ride log`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteLogId(log.id)}
                                    className="rounded-md p-1 text-red-400 transition-opacity hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                                    aria-label={`Delete ${log.attractionName} ride log`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dining Logs (only shown if user has existing dining logs) */}
      {diningLogs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-primary-900 mb-4">🍽️ Dining</h2>
          <div className="space-y-2">
            {diningLogs.map((log) => {
              const time = toSafeDate(log.diningAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
                        onClick={() => openEditDiningLog(log)}
                        className="rounded-md p-1 text-primary-400 transition-opacity hover:bg-primary-50 hover:text-primary-600 sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label={`Edit ${log.restaurantName} dining log`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
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
        </div>
      )}

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

      {/* Edit Ride Log Modal */}
      {editingRideLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-primary-900">Edit Ride Log</h3>
              <button onClick={() => setEditingRideLog(null)} className="rounded-md p-1 text-primary-400 hover:text-primary-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-primary-600 mb-4">{editingRideLog.attractionName} · {editingRideLog.parkName}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  value={editRideData.rodeAt}
                  onChange={(e) => setEditRideData((d) => ({ ...d, rodeAt: e.target.value }))}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">Wait Time (minutes)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Optional"
                  value={editRideData.waitTimeMinutes}
                  onChange={(e) => setEditRideData((d) => ({ ...d, waitTimeMinutes: e.target.value }))}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">Rating</label>
                <select
                  value={editRideData.rating}
                  onChange={(e) => setEditRideData((d) => ({ ...d, rating: e.target.value }))}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">No rating</option>
                  <option value="1">★ (1)</option>
                  <option value="2">★★ (2)</option>
                  <option value="3">★★★ (3)</option>
                  <option value="4">★★★★ (4)</option>
                  <option value="5">★★★★★ (5)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">Notes</label>
                <textarea
                  value={editRideData.notes}
                  onChange={(e) => setEditRideData((d) => ({ ...d, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="Any notes about this ride..."
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingRideLog(null)}
                className="rounded-lg border border-primary-200 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRideLog}
                disabled={savingRide}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {savingRide ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dining Log Modal */}
      {editingDiningLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-primary-900">Edit Dining Log</h3>
              <button onClick={() => setEditingDiningLog(null)} className="rounded-md p-1 text-primary-400 hover:text-primary-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-primary-600 mb-4">{editingDiningLog.restaurantName} · {editingDiningLog.parkName}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  value={editDiningData.diningAt}
                  onChange={(e) => setEditDiningData((d) => ({ ...d, diningAt: e.target.value }))}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">Meal Type</label>
                <select
                  value={editDiningData.mealType}
                  onChange={(e) => setEditDiningData((d) => ({ ...d, mealType: e.target.value }))}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">Had Reservation?</label>
                <select
                  value={editDiningData.hadReservation}
                  onChange={(e) => setEditDiningData((d) => ({ ...d, hadReservation: e.target.value }))}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Not specified</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">Wait for Table (minutes)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Optional"
                  value={editDiningData.tableWaitMinutes}
                  onChange={(e) => setEditDiningData((d) => ({ ...d, tableWaitMinutes: e.target.value }))}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">Rating</label>
                <select
                  value={editDiningData.rating}
                  onChange={(e) => setEditDiningData((d) => ({ ...d, rating: e.target.value }))}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">No rating</option>
                  <option value="1">★ (1)</option>
                  <option value="2">★★ (2)</option>
                  <option value="3">★★★ (3)</option>
                  <option value="4">★★★★ (4)</option>
                  <option value="5">★★★★★ (5)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">Notes</label>
                <textarea
                  value={editDiningData.notes}
                  onChange={(e) => setEditDiningData((d) => ({ ...d, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-primary-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="What did you have? Any notes..."
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingDiningLog(null)}
                className="rounded-lg border border-primary-200 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDiningLog}
                disabled={savingDining}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {savingDining ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
