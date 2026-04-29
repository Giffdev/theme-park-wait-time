import type { Metadata } from 'next';
import Link from 'next/link';

type Props = { params: Promise<{ parkId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { parkId } = await params;
  const title = parkId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { title, description: `Live wait times and details for ${title}.` };
}

export default async function ParkDetailPage({ params }: Props) {
  const { parkId } = await params;
  const parkName = parkId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <nav className="mb-6 text-sm text-primary-400">
        <Link href="/parks" className="hover:text-primary-600">Parks</Link>
        <span className="mx-2">›</span>
        <span className="text-primary-700">{parkName}</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary-900">{parkName}</h1>
        <div className="mt-2 flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-100 px-3 py-1 text-xs font-medium text-sage-700">
            <span className="h-1.5 w-1.5 rounded-full bg-sage-500" />
            Open
          </span>
          <span className="text-sm text-primary-400">Hours: 9:00 AM – 10:00 PM</span>
        </div>
      </div>

      {/* Wait Times Grid Placeholder */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-primary-800">Live Wait Times</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {['Space Mountain', 'Thunder Mountain', 'Haunted Mansion', 'Pirates of the Caribbean', 'Splash Mountain', 'Seven Dwarfs Mine Train'].map(
            (ride) => (
              <div
                key={ride}
                className="flex items-center justify-between rounded-lg border border-primary-100 bg-white p-4 transition-colors hover:bg-primary-50"
              >
                <div>
                  <div className="font-medium text-primary-800">{ride}</div>
                  <div className="text-xs text-primary-400">Standby</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-accent-600">
                    {Math.floor(Math.random() * 60) + 10}
                  </div>
                  <div className="text-xs text-primary-400">min</div>
                </div>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
