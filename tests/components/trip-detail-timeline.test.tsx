/**
 * Tests for Trip Detail Timeline — day-by-park grouped ride display.
 *
 * The trip detail page shows rides grouped by day, then by park within each day.
 * This is the new rendering approach from the trip logging redesign.
 *
 * Contract:
 * - Primary grouping: by day (chronological, based on rodeAt date)
 * - Secondary grouping: by park within day (ordered by first ride time)
 * - Each ride shows: time, name, wait time (optional), rating (optional)
 * - Day headers show formatted dates
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// --- Mock Firebase config ---
vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-123' } },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/trips/trip-1',
  useParams: () => ({ tripId: 'trip-1' }),
}));

vi.mock('lucide-react', () => ({
  Clock: () => <span data-testid="icon-clock" />,
  Star: ({ className }: { className?: string }) => <span data-testid="icon-star" className={className} />,
  Timer: () => <span data-testid="icon-timer" />,
  Calendar: () => <span data-testid="icon-calendar" />,
  MapPin: () => <span data-testid="icon-map-pin" />,
}));

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'user-123' }, loading: false }),
}));

/**
 * Stub TripTimeline component for contract testing.
 *
 * Props: { rideLogs: RideLog[] }
 * Behavior:
 * - Groups rides by date (from rodeAt)
 * - Within each date, groups by parkId (ordered by earliest ride time)
 * - Renders day headers, park sections, and individual ride entries
 */

interface TimelineRideLog {
  id: string;
  parkId: string;
  parkName: string;
  attractionName: string;
  rodeAt: Date;
  waitTimeMinutes: number | null;
  rating: number | null;
}

function TripTimeline({ rideLogs }: { rideLogs: TimelineRideLog[] }) {
  if (rideLogs.length === 0) {
    return <p data-testid="empty-state">No rides logged yet</p>;
  }

  // Group by date
  const dayGroups: Record<string, TimelineRideLog[]> = {};
  for (const log of rideLogs) {
    const dateKey = log.rodeAt.toISOString().split('T')[0];
    if (!dayGroups[dateKey]) dayGroups[dateKey] = [];
    dayGroups[dateKey].push(log);
  }

  // Sort days chronologically
  const sortedDays = Object.keys(dayGroups).sort();

  return (
    <div data-testid="trip-timeline">
      {sortedDays.map((dateKey) => {
        const dayLogs = dayGroups[dateKey];
        // Group by park, ordered by first ride time
        const parkGroups: Record<string, TimelineRideLog[]> = {};
        const parkOrder: string[] = [];
        for (const log of dayLogs.sort((a, b) => a.rodeAt.getTime() - b.rodeAt.getTime())) {
          if (!parkGroups[log.parkId]) {
            parkGroups[log.parkId] = [];
            parkOrder.push(log.parkId);
          }
          parkGroups[log.parkId].push(log);
        }

        const formattedDate = new Date(dateKey + 'T12:00:00Z').toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        });

        return (
          <div key={dateKey} data-testid={`day-${dateKey}`}>
            <h3 data-testid={`day-header-${dateKey}`}>{formattedDate}</h3>
            {parkOrder.map((parkId) => {
              const parkLogs = parkGroups[parkId];
              const parkName = parkLogs[0].parkName;
              return (
                <div key={parkId} data-testid={`park-section-${parkId}`}>
                  <h4>{parkName} ({parkLogs.length} rides)</h4>
                  {parkLogs.map((log) => (
                    <div key={log.id} data-testid={`ride-entry-${log.id}`}>
                      <span data-testid={`ride-time-${log.id}`}>
                        {log.rodeAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span data-testid={`ride-name-${log.id}`}>{log.attractionName}</span>
                      {log.waitTimeMinutes != null && (
                        <span data-testid={`ride-wait-${log.id}`}>
                          <span data-testid="icon-timer" />
                          {log.waitTimeMinutes}min
                        </span>
                      )}
                      {log.rating != null && (
                        <span data-testid={`ride-rating-${log.id}`}>
                          {'★'.repeat(log.rating)}{'☆'.repeat(5 - log.rating)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

describe('TripTimeline', () => {
  const sampleLogs: TimelineRideLog[] = [
    {
      id: 'log-1',
      parkId: 'magic-kingdom',
      parkName: 'Magic Kingdom',
      attractionName: 'Space Mountain',
      rodeAt: new Date('2026-04-14T13:15:00Z'),
      waitTimeMinutes: 35,
      rating: 4,
    },
    {
      id: 'log-2',
      parkId: 'magic-kingdom',
      parkName: 'Magic Kingdom',
      attractionName: 'Big Thunder Mountain',
      rodeAt: new Date('2026-04-14T14:02:00Z'),
      waitTimeMinutes: 20,
      rating: 5,
    },
    {
      id: 'log-3',
      parkId: 'epcot',
      parkName: 'EPCOT',
      attractionName: 'Test Track',
      rodeAt: new Date('2026-04-14T20:30:00Z'),
      waitTimeMinutes: 45,
      rating: 4,
    },
    {
      id: 'log-4',
      parkId: 'magic-kingdom',
      parkName: 'Magic Kingdom',
      attractionName: 'Haunted Mansion',
      rodeAt: new Date('2026-04-15T10:00:00Z'),
      waitTimeMinutes: null,
      rating: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups rides by day (based on rodeAt date)', () => {
    render(<TripTimeline rideLogs={sampleLogs} />);

    // Should have two day sections
    expect(screen.getByTestId('day-2026-04-14')).toBeInTheDocument();
    expect(screen.getByTestId('day-2026-04-15')).toBeInTheDocument();
  });

  it('within a day, groups by park (ordered by first ride time)', () => {
    render(<TripTimeline rideLogs={sampleLogs} />);

    const day14 = screen.getByTestId('day-2026-04-14');

    // Magic Kingdom rides came first (13:15), then Epcot (20:30)
    expect(day14.querySelector('[data-testid="park-section-magic-kingdom"]')).toBeInTheDocument();
    expect(day14.querySelector('[data-testid="park-section-epcot"]')).toBeInTheDocument();

    // Check order: MK section should appear before Epcot in DOM
    const parkSections = day14.querySelectorAll('[data-testid^="park-section-"]');
    expect(parkSections[0].getAttribute('data-testid')).toBe('park-section-magic-kingdom');
    expect(parkSections[1].getAttribute('data-testid')).toBe('park-section-epcot');
  });

  it('shows ride time, name, wait time, and rating', () => {
    render(<TripTimeline rideLogs={sampleLogs} />);

    // Check Space Mountain entry
    expect(screen.getByTestId('ride-name-log-1')).toHaveTextContent('Space Mountain');
    expect(screen.getByTestId('ride-wait-log-1')).toHaveTextContent('35min');
    expect(screen.getByTestId('ride-rating-log-1')).toHaveTextContent('★★★★☆');
  });

  it('handles rides with no wait time (shows without timer icon)', () => {
    render(<TripTimeline rideLogs={sampleLogs} />);

    // Haunted Mansion (log-4) has null waitTimeMinutes
    expect(screen.queryByTestId('ride-wait-log-4')).not.toBeInTheDocument();
    // But the ride itself should still be there
    expect(screen.getByTestId('ride-name-log-4')).toHaveTextContent('Haunted Mansion');
  });

  it('handles rides with no rating (shows without stars)', () => {
    render(<TripTimeline rideLogs={sampleLogs} />);

    // Haunted Mansion (log-4) has null rating
    expect(screen.queryByTestId('ride-rating-log-4')).not.toBeInTheDocument();
    expect(screen.getByTestId('ride-name-log-4')).toBeInTheDocument();
  });

  it('shows correct day headers (formatted dates)', () => {
    render(<TripTimeline rideLogs={sampleLogs} />);

    // Date headers should be human-readable
    const header14 = screen.getByTestId('day-header-2026-04-14');
    expect(header14.textContent).toContain('Apr');
    expect(header14.textContent).toContain('14');

    const header15 = screen.getByTestId('day-header-2026-04-15');
    expect(header15.textContent).toContain('Apr');
    expect(header15.textContent).toContain('15');
  });

  it('shows empty state when no rides', () => {
    render(<TripTimeline rideLogs={[]} />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent('No rides logged yet');
  });

  it('shows ride count per park section', () => {
    render(<TripTimeline rideLogs={sampleLogs} />);

    // Magic Kingdom on Apr 14 has 2 rides
    expect(screen.getByText('Magic Kingdom (2 rides)')).toBeInTheDocument();
    // EPCOT on Apr 14 has 1 ride
    expect(screen.getByText('EPCOT (1 rides)')).toBeInTheDocument();
  });
});
