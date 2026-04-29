import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'About ParkPulse — the theme park wait time platform built by fans, for fans.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <h1 className="text-3xl font-bold text-primary-900">About ParkPulse</h1>
      <div className="prose mt-6 text-primary-700">
        <p>
          ParkPulse is a data-driven platform for theme park enthusiasts. We aggregate
          real-time wait times, crowd-sourced reports, and historical data to help you
          make the most of every park visit.
        </p>
        <p>
          Whether you&apos;re planning your next trip or standing in the park right now,
          ParkPulse gives you the information you need to ride more and wait less.
        </p>
      </div>
    </div>
  );
}
