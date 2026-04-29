'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Clock, TrendingUp, MessageSquarePlus, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getRecentReports, getConsensusWaitTime, type WaitTimeReport } from '@/lib/firebase/waitTimeReports';
import { getCollection, whereConstraint } from '@/lib/firebase/firestore';
import ReportWaitTimeModal from '@/components/parks/ReportWaitTimeModal';
import RecentReports from '@/components/parks/RecentReports';

function slugToName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function AttractionDetailPage() {
  const params = useParams<{ parkId: string; attractionId: string }>();
  const parkId = params.parkId;
  const attractionId = params.attractionId;
  const { user } = useAuth();

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportRefreshKey, setReportRefreshKey] = useState(0);
  const [consensus, setConsensus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const attractionName = slugToName(attractionId);
  const parkName = slugToName(parkId);

  // Load consensus wait time
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getConsensusWaitTime(attractionId)
      .then((val) => { if (!cancelled) setConsensus(val); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attractionId, reportRefreshKey]);

  const consensusDisplay = consensus === null
    ? '—'
    : consensus === -1
    ? 'Closed'
    : `${consensus}`;

  const statusColor = consensus === null
    ? 'bg-primary-100 text-primary-600'
    : consensus === -1
    ? 'bg-red-100 text-red-700'
    : consensus <= 20
    ? 'bg-sage-100 text-sage-700'
    : consensus <= 45
    ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-primary-400">
        <Link href="/parks" className="hover:text-primary-600">Parks</Link>
        <span className="mx-2">›</span>
        <Link href={`/parks/${parkId}`} className="hover:text-primary-600">{parkName}</Link>
        <span className="mx-2">›</span>
        <span className="text-primary-700">{attractionName}</span>
      </nav>

      {/* Header with back button */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <Link
            href={`/parks/${parkId}`}
            className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-700 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {parkName}
          </Link>
          <h1 className="text-3xl font-bold text-primary-900">{attractionName}</h1>
        </div>
        <button
          onClick={() => {
            if (!user) {
              window.location.href = '/auth/signin';
              return;
            }
            setShowReportModal(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-coral-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-600 shrink-0"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Report Wait Time
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Current Community Wait */}
          <div className="rounded-xl border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-6 text-center">
            <div className="text-sm font-medium text-primary-500">Community Reported Wait</div>
            <div className="mt-2 text-5xl font-bold text-primary-700">
              {loading ? (
                <span className="inline-block h-12 w-20 animate-pulse rounded bg-primary-100" />
              ) : (
                consensusDisplay
              )}
            </div>
            {consensus !== null && consensus !== -1 && (
              <div className="text-sm text-primary-400">minutes</div>
            )}
            <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusColor}`}>
              {consensus === -1 ? 'Reported Closed' : consensus === null ? 'No Recent Reports' : 'Community Consensus'}
            </div>
            <p className="mt-2 text-xs text-primary-400">
              Based on reports from the last 30 minutes
            </p>
          </div>

          {/* Historical Chart placeholder — will use real data once we have enough reports */}
          <section className="rounded-xl border border-primary-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-semibold text-primary-800">Wait Time Trends</h2>
            </div>
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-primary-200 bg-primary-50 text-primary-400">
              <div className="text-center">
                <Clock className="h-8 w-8 mx-auto mb-2 text-primary-300" />
                <p className="text-sm">Historical trends will appear as more reports come in</p>
                <p className="text-xs mt-1">Be the first to report a wait time!</p>
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Stats Card */}
          <div className="rounded-xl border border-primary-100 p-5">
            <h3 className="text-sm font-semibold text-primary-700 mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Quick Stats
            </h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-primary-500">Current Consensus</dt>
                <dd className="font-medium text-primary-800">
                  {consensus === null ? 'No data' : consensus === -1 ? 'Closed' : `${consensus} min`}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-primary-500">Park</dt>
                <dd className="font-medium text-primary-800">{parkName}</dd>
              </div>
            </dl>
          </div>

          {/* Recent Reports */}
          <div className="rounded-xl border border-primary-100 p-5">
            <RecentReports attractionId={attractionId} refreshKey={reportRefreshKey} />
          </div>

          {/* CTA to report */}
          <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50 p-5 text-center">
            <p className="text-sm text-primary-600 font-medium">Were you just on this ride?</p>
            <p className="text-xs text-primary-400 mt-1 mb-3">Help others by reporting what you experienced</p>
            <button
              onClick={() => {
                if (!user) {
                  window.location.href = '/auth/signin';
                  return;
                }
                setShowReportModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Report Now
            </button>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <ReportWaitTimeModal
          attractionId={attractionId}
          attractionName={attractionName}
          parkId={parkId}
          onClose={() => setShowReportModal(false)}
          onSuccess={() => setReportRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

