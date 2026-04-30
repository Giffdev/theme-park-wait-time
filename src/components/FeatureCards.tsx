'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';

export function FeatureCards() {
  const { user, loading } = useAuth();

  const tripCard = {
    href: !loading && !user ? '/auth/signin' : '/trips/new',
    emoji: '🎟️',
    title: !loading && !user ? 'Start Your Park Journal' : 'Log Your Trip',
    description: !loading && !user
      ? 'Sign in to log rides, track wait times, and build your ultimate theme park history. 🎢'
      : 'Track wait times, rate attractions, and help the community with real-time insights.',
    color: 'bg-violet-50 hover:bg-violet-100 border-violet-200',
    textColor: 'text-violet-700',
  };

  const features = [
    tripCard,
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
    {
      href: !loading && !user ? '/auth/signin' : '/ride-log',
      emoji: '🎢',
      title: !loading && !user ? 'Track Your Rides' : 'My Ride History',
      description: 'Log every ride, time your waits, and build your personal ride history across all parks.',
      color: 'bg-coral-50 hover:bg-coral-100 border-coral-200',
      textColor: 'text-coral-700',
    },
  ];

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {features.map((feature) => (
        <Link
          key={feature.title}
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
            {!loading && !user && feature.href === '/auth/signin' ? 'Join the fun →' : 'Explore →'}
          </div>
        </Link>
      ))}
    </div>
  );
}
