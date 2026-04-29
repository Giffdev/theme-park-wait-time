import type { Metadata } from 'next';
import Link from 'next/link';

type Props = {
  params: Promise<{ parkId: string; attractionId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { attractionId } = await params;
  const title = attractionId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { title };
}

export default async function AttractionDetailPage({ params }: Props) {
  const { parkId, attractionId } = await params;
  const attractionName = attractionId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const parkName = parkId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <nav className="mb-6 text-sm text-primary-400">
        <Link href="/parks" className="hover:text-primary-600">Parks</Link>
        <span className="mx-2">›</span>
        <Link href={`/parks/${parkId}`} className="hover:text-primary-600">{parkName}</Link>
        <span className="mx-2">›</span>
        <span className="text-primary-700">{attractionName}</span>
      </nav>

      <h1 className="text-3xl font-bold text-primary-900">{attractionName}</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Current Wait */}
        <div className="rounded-xl border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-6 text-center">
          <div className="text-sm font-medium text-primary-500">Current Wait</div>
          <div className="mt-2 text-5xl font-bold text-primary-700">45</div>
          <div className="text-sm text-primary-400">minutes</div>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sage-100 px-3 py-1 text-xs font-medium text-sage-700">
            Operating
          </div>
        </div>

        {/* Details */}
        <div className="rounded-xl border border-primary-100 p-6">
          <h2 className="mb-4 font-semibold text-primary-800">Ride Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-primary-500">Type</dt>
              <dd className="font-medium text-primary-800">Thrill Ride</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-primary-500">Area</dt>
              <dd className="font-medium text-primary-800">Tomorrowland</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-primary-500">Height Req.</dt>
              <dd className="font-medium text-primary-800">44″</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-primary-500">Duration</dt>
              <dd className="font-medium text-primary-800">~3 min</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Historical Chart Placeholder */}
      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-primary-800">Wait Time History</h2>
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-primary-200 bg-primary-50 text-primary-400">
          📈 Historical wait time chart coming soon
        </div>
      </section>
    </div>
  );
}
