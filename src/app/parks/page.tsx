import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Parks',
  description: 'Browse theme parks and view live wait times.',
};

const parkFamilies = [
  {
    name: 'Walt Disney World',
    slug: 'walt-disney-world',
    parks: [
      { name: 'Magic Kingdom', slug: 'magic-kingdom', emoji: '🏰' },
      { name: 'EPCOT', slug: 'epcot', emoji: '🌐' },
      { name: "Hollywood Studios", slug: 'hollywood-studios', emoji: '🎬' },
      { name: 'Animal Kingdom', slug: 'animal-kingdom', emoji: '🦁' },
    ],
  },
  {
    name: 'Universal Orlando',
    slug: 'universal-orlando',
    parks: [
      { name: 'Universal Studios Florida', slug: 'universal-studios', emoji: '🎥' },
      { name: "Islands of Adventure", slug: 'islands-of-adventure', emoji: '🏝️' },
      { name: 'Epic Universe', slug: 'epic-universe', emoji: '✨' },
    ],
  },
];

export default function ParksPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-primary-900">Theme Parks</h1>
        <p className="mt-2 text-primary-500">
          Select a park to view live wait times and attraction details.
        </p>
      </div>

      <div className="space-y-10">
        {parkFamilies.map((family) => (
          <section key={family.slug}>
            <h2 className="mb-4 text-xl font-semibold text-primary-800">
              {family.name}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {family.parks.map((park) => (
                <Link
                  key={park.slug}
                  href={`/parks/${park.slug}`}
                  className="group rounded-xl border border-primary-200 bg-white p-5 transition-all hover:border-primary-300 hover:shadow-md"
                >
                  <div className="mb-3 text-3xl">{park.emoji}</div>
                  <h3 className="font-semibold text-primary-800 group-hover:text-primary-600">
                    {park.name}
                  </h3>
                  <p className="mt-1 text-xs text-primary-400">View live wait times →</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
