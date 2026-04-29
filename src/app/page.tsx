import Link from 'next/link';

const features = [
  {
    href: '/trips/new',
    emoji: '🎟️',
    title: 'Log Your Trip',
    description: 'Track wait times, rate attractions, and help the community with real-time insights.',
    color: 'bg-coral-50 hover:bg-coral-100 border-coral-200',
    textColor: 'text-coral-700',
  },
  {
    href: '/parks',
    emoji: '🏰',
    title: 'Live Wait Times',
    description: 'Real-time wait times across Disney, Universal, and more. Know before you go.',
    color: 'bg-primary-50 hover:bg-primary-100 border-primary-200',
    textColor: 'text-primary-700',
  },
  {
    href: '/calendar',
    emoji: '📅',
    title: 'Crowd Calendar',
    description: 'See predicted crowd levels for every day. Pick the perfect date for your visit.',
    color: 'bg-sage-50 hover:bg-sage-100 border-sage-200',
    textColor: 'text-sage-700',
  },
];

export default function HomePage() {
  return (
    <div className="pb-20 md:pb-0">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 px-4 py-20 text-white sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-coral-400 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-accent-400 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 text-5xl sm:text-6xl">🎢</div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            Skip the guesswork.
            <br />
            <span className="text-coral-300">Ride more.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-primary-200 sm:text-xl">
            Real-time wait times, crowd predictions, and ride logging for theme park
            fans who want to make the most of their trip to the park.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/parks"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-base font-semibold text-primary-700 shadow-lg transition-all hover:bg-primary-50 hover:shadow-xl"
            >
              View Live Wait Times
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link
              href="/calendar"
              className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-8 py-3.5 text-base font-semibold text-white transition-all hover:border-white/60 hover:bg-white/10"
            >
              Check Crowd Calendar
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold text-primary-900 sm:text-3xl">
            Everything you need for the perfect park day
          </h2>
          <p className="mt-3 text-primary-500">
            Data-driven tools that actually make your day better.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Link
              key={feature.href}
              href={feature.href}
              className={`group rounded-2xl border p-6 transition-all ${feature.color}`}
            >
              <div className="mb-4 text-4xl">{feature.emoji}</div>
              <h3 className={`text-lg font-semibold ${feature.textColor}`}>
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-primary-600">
                {feature.description}
              </p>
              <div className={`mt-4 inline-flex items-center gap-1 text-sm font-medium ${feature.textColor} opacity-0 transition-opacity group-hover:opacity-100`}>
                Explore →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-primary-100 bg-primary-50/50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 text-center lg:grid-cols-4">
          {[
            { value: '10+', label: 'Theme Parks' },
            { value: '500+', label: 'Attractions' },
            { value: 'Live', label: 'Wait Times' },
            { value: '365', label: 'Days of Crowd Data' },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-2xl font-bold text-primary-700 sm:text-3xl">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-primary-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
