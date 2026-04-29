'use client';

import { useEffect, useState } from 'react';
import { Clock, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { getRecentReports, type WaitTimeReport } from '@/lib/firebase/waitTimeReports';

interface RecentReportsProps {
  attractionId: string;
  refreshKey?: number;
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function WaitBadge({ waitTime }: { waitTime: number }) {
  if (waitTime === -1) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
        Closed
      </span>
    );
  }
  if (waitTime === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-sage-100 px-2.5 py-0.5 text-xs font-medium text-sage-700">
        Walk-on
      </span>
    );
  }

  const color = waitTime <= 20
    ? 'bg-sage-100 text-sage-700'
    : waitTime <= 45
    ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700';

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {waitTime} min
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'verified':
      return <CheckCircle2 className="h-3.5 w-3.5 text-sage-500" />;
    case 'disputed':
      return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-primary-300" />;
  }
}

export default function RecentReports({ attractionId, refreshKey }: RecentReportsProps) {
  const [reports, setReports] = useState<WaitTimeReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getRecentReports(attractionId, 5)
      .then((data) => {
        if (!cancelled) setReports(data);
      })
      .catch((err) => {
        console.error('Failed to load recent reports:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [attractionId, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded-lg bg-primary-100" />
        ))}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-primary-200 p-4 text-center">
        <Users className="mx-auto h-5 w-5 text-primary-300" />
        <p className="mt-1 text-xs text-primary-400">No reports yet — be the first!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-4 w-4 text-primary-400" />
        <h4 className="text-sm font-semibold text-primary-700">Community Reports</h4>
      </div>
      {reports.map((report) => (
        <div
          key={report.id}
          className="flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <StatusIcon status={report.status} />
            <span className="text-xs font-medium text-primary-600 truncate">
              {report.username}
            </span>
            <span className="text-xs text-primary-400 shrink-0">
              {formatTimeAgo(report.reportedAt)}
            </span>
          </div>
          <WaitBadge waitTime={report.waitTime} />
        </div>
      ))}
    </div>
  );
}
