import type { Metadata } from 'next';
import { APP_NAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'About',
  description: `About ${APP_NAME} — the theme park wait time platform built by fans, for fans.`,
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pb-24 sm:px-6 md:pb-10 lg:px-8">
      <h1 className="text-3xl font-bold text-primary-900">About {APP_NAME}</h1>
      <div className="prose mt-6 text-primary-700">
        <p>
          {APP_NAME} brings together current wait-time snapshots, community reports,
          and clearly labeled historical estimates where coverage supports them.
        </p>
        <p>
          Whether you&apos;re planning your next trip or standing in the park right now,
          {APP_NAME} gives you the information you need to ride more and wait less.
        </p>
      </div>
    </div>
  );
}
