/**
 * Phase 1 UI component tests.
 *
 * Tests from the USER's perspective:
 * - ForecastChart: Does the user see predicted wait times? Do they know when "now" is?
 * - ParkScheduleBar: Does the user see the full day at a glance with clear event blocks?
 * - AttractionRow (enhanced): Does the user know Lightning Lane is available? How much it costs?
 *
 * Each test asks: "If I'm a theme park guest looking at my phone, what do I see?"
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock Firebase config
vi.mock('@/lib/firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
  app: {},
}));

// Mock recharts (SVG-based charting can't fully render in jsdom)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart-container">{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="chart-area" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ReferenceLine: ({ label }: { label?: string }) => <div data-testid="reference-line" data-label={label} />,
  CartesianGrid: () => <div data-testid="grid" />,
}));

// ---------------------------------------------------------------------------
// ForecastChart component (will be created by Mouth)
// We test the contract — what the component MUST render given certain props.
// ---------------------------------------------------------------------------

// Inline stub of ForecastChart for testing contract
// Replace this import path once the real component exists:
// import ForecastChart from '@/components/ForecastChart';

interface ForecastEntry {
  time: string;
  waitTime: number;
  percentage: number;
}

interface ForecastChartProps {
  forecast: ForecastEntry[] | null;
  operatingHours?: Array<{ type: string; startTime: string; endTime: string }> | null;
  currentWait?: number | null;
  currentTime?: string;
}

// Minimal implementation to define the component contract
function ForecastChart({ forecast, currentTime }: ForecastChartProps) {
  if (!forecast || forecast.length === 0) {
    return <div data-testid="forecast-chart"><p>No forecast available</p></div>;
  }

  const nowHour = currentTime ? new Date(currentTime).getHours() : null;

  return (
    <div data-testid="forecast-chart">
      <div data-testid="chart-container">
        <div data-testid="area-chart">
          {forecast.map((entry, i) => (
            <div key={i} data-testid="forecast-point" data-time={entry.time} data-wait={entry.waitTime} />
          ))}
        </div>
      </div>
      {nowHour !== null && (
        <div data-testid="now-indicator" data-hour={nowHour}>NOW</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ParkScheduleBar component (will be created by Mouth)
// ---------------------------------------------------------------------------

interface ScheduleSegment {
  type: 'OPERATING' | 'TICKETED_EVENT' | 'EXTRA_HOURS';
  description: string | null;
  openingTime: string;
  closingTime: string;
}

interface ParkScheduleBarProps {
  segments: ScheduleSegment[];
}

// Minimal implementation to define the component contract
function ParkScheduleBar({ segments }: ParkScheduleBarProps) {
  const colorMap: Record<string, string> = {
    OPERATING: 'bg-blue-500',
    TICKETED_EVENT: 'bg-purple-500',
    EXTRA_HOURS: 'bg-amber-400',
  };

  return (
    <div data-testid="schedule-bar" role="img" aria-label="Park schedule timeline">
      {segments.map((seg, i) => (
        <div
          key={i}
          data-testid={`segment-${seg.type.toLowerCase()}`}
          className={colorMap[seg.type] || 'bg-gray-300'}
          aria-label={seg.description || seg.type}
        >
          <span>{seg.description || seg.type}</span>
          <span>{new Date(seg.openingTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span>{new Date(seg.closingTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enhanced AttractionRow (will be modified by Mouth)
// ---------------------------------------------------------------------------

interface QueueData {
  RETURN_TIME?: { state: string; returnStart: string | null; returnEnd: string | null };
  PAID_RETURN_TIME?: {
    state: string;
    returnStart: string | null;
    returnEnd: string | null;
    price: { amount: number; currency: string; formatted: string } | null;
  };
  BOARDING_GROUP?: { state: string; currentGroupStart: number | null; currentGroupEnd: number | null; estimatedWait: number | null };
}

interface EnhancedAttractionRowProps {
  name: string;
  entityType: string;
  status: string;
  waitMinutes: number | null;
  queue?: QueueData | null;
}

// Minimal implementation to define the enhanced AttractionRow contract
function EnhancedAttractionRow({ name, status, waitMinutes, queue }: EnhancedAttractionRowProps) {
  const showBadges = queue && status !== 'FINISHED';

  return (
    <div data-testid="attraction-row">
      <span data-testid="attraction-name">{name}</span>
      {status === 'OPERATING' && waitMinutes !== null && (
        <span data-testid="wait-badge">{waitMinutes} min</span>
      )}
      {showBadges && queue?.RETURN_TIME && queue.RETURN_TIME.state !== 'FINISHED' && (
        <span data-testid="ll-badge" className="badge-lightning-lane">⚡ LL</span>
      )}
      {showBadges && queue?.PAID_RETURN_TIME && queue.PAID_RETURN_TIME.state !== 'FINISHED' && (
        <span data-testid="paid-ll-badge" className="badge-paid-ll">
          💰 {queue.PAID_RETURN_TIME.price?.formatted || 'LL'}
        </span>
      )}
      {showBadges && queue?.BOARDING_GROUP && (
        <span data-testid="boarding-badge">🎟️ Virtual Queue</span>
      )}
    </div>
  );
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('ForecastChart', () => {
  const validForecast: ForecastEntry[] = [
    { time: '2026-04-29T09:00:00-04:00', waitTime: 35, percentage: 30 },
    { time: '2026-04-29T10:00:00-04:00', waitTime: 55, percentage: 47 },
    { time: '2026-04-29T11:00:00-04:00', waitTime: 75, percentage: 64 },
    { time: '2026-04-29T12:00:00-04:00', waitTime: 90, percentage: 77 },
    { time: '2026-04-29T13:00:00-04:00', waitTime: 70, percentage: 60 },
    { time: '2026-04-29T14:00:00-04:00', waitTime: 45, percentage: 38 },
  ];

  it('renders correctly with valid forecast data', () => {
    render(<ForecastChart forecast={validForecast} currentTime="2026-04-29T11:30:00-04:00" />);

    expect(screen.getByTestId('forecast-chart')).toBeInTheDocument();
    expect(screen.getAllByTestId('forecast-point')).toHaveLength(6);
  });

  it('shows "No forecast available" when forecast is null', () => {
    render(<ForecastChart forecast={null} />);

    expect(screen.getByText('No forecast available')).toBeInTheDocument();
  });

  it('shows "No forecast available" when forecast is empty array', () => {
    render(<ForecastChart forecast={[]} />);

    expect(screen.getByText('No forecast available')).toBeInTheDocument();
  });

  it('shows "NOW" line at correct position based on currentTime', () => {
    const currentTime = '2026-04-29T11:30:00-04:00';
    render(<ForecastChart forecast={validForecast} currentTime={currentTime} />);

    const nowIndicator = screen.getByTestId('now-indicator');
    expect(nowIndicator).toBeInTheDocument();
    expect(nowIndicator).toHaveTextContent('NOW');
    // Verify the hour is derived from the provided time (may differ by timezone)
    const expectedHour = new Date(currentTime).getHours().toString();
    expect(nowIndicator.dataset.hour).toBe(expectedHour);
  });

  it('does not show NOW indicator when currentTime is not provided', () => {
    render(<ForecastChart forecast={validForecast} />);

    expect(screen.queryByTestId('now-indicator')).not.toBeInTheDocument();
  });

  it('renders forecast points with correct wait time data', () => {
    render(<ForecastChart forecast={validForecast} currentTime="2026-04-29T12:00:00-04:00" />);

    const points = screen.getAllByTestId('forecast-point');
    expect(points[0].dataset.wait).toBe('35');
    expect(points[3].dataset.wait).toBe('90'); // peak at noon
  });
});

describe('ParkScheduleBar', () => {
  const fullDaySegments: ScheduleSegment[] = [
    {
      type: 'TICKETED_EVENT',
      description: 'Early Entry',
      openingTime: '2026-04-29T08:30:00-04:00',
      closingTime: '2026-04-29T09:00:00-04:00',
    },
    {
      type: 'OPERATING',
      description: null,
      openingTime: '2026-04-29T09:00:00-04:00',
      closingTime: '2026-04-29T22:00:00-04:00',
    },
    {
      type: 'TICKETED_EVENT',
      description: 'Extended Evening',
      openingTime: '2026-04-29T22:00:00-04:00',
      closingTime: '2026-04-30T00:00:00-04:00',
    },
  ];

  it('renders all segment types', () => {
    render(<ParkScheduleBar segments={fullDaySegments} />);

    expect(screen.getByTestId('schedule-bar')).toBeInTheDocument();
    const ticketedSegments = screen.getAllByTestId('segment-ticketed_event');
    const operatingSegments = screen.getAllByTestId('segment-operating');

    expect(ticketedSegments).toHaveLength(2);
    expect(operatingSegments).toHaveLength(1);
  });

  it('uses correct colors: blue for OPERATING, purple for TICKETED_EVENT', () => {
    const { container } = render(<ParkScheduleBar segments={fullDaySegments} />);

    const purpleSegments = container.querySelectorAll('.bg-purple-500');
    const blueSegments = container.querySelectorAll('.bg-blue-500');

    expect(purpleSegments).toHaveLength(2); // Early Entry + Extended Evening
    expect(blueSegments).toHaveLength(1); // OPERATING
  });

  it('displays descriptions for ticketed events', () => {
    render(<ParkScheduleBar segments={fullDaySegments} />);

    expect(screen.getByText('Early Entry')).toBeInTheDocument();
    expect(screen.getByText('Extended Evening')).toBeInTheDocument();
  });

  it('is accessible with proper aria-label', () => {
    render(<ParkScheduleBar segments={fullDaySegments} />);

    expect(screen.getByRole('img', { name: /schedule timeline/i })).toBeInTheDocument();
  });
});

describe('AttractionRow — Lightning Lane badges', () => {
  it('shows Lightning Lane badge when RETURN_TIME exists and is AVAILABLE', () => {
    render(
      <EnhancedAttractionRow
        name="Space Mountain"
        entityType="ATTRACTION"
        status="OPERATING"
        waitMinutes={45}
        queue={{
          RETURN_TIME: { state: 'AVAILABLE', returnStart: '2026-04-29T15:00:00-04:00', returnEnd: null },
        }}
      />
    );

    expect(screen.getByTestId('ll-badge')).toBeInTheDocument();
    expect(screen.getByTestId('ll-badge')).toHaveTextContent('⚡ LL');
  });

  it('shows price badge when PAID_RETURN_TIME exists', () => {
    render(
      <EnhancedAttractionRow
        name="TRON Lightcycle / Run"
        entityType="ATTRACTION"
        status="OPERATING"
        waitMinutes={75}
        queue={{
          PAID_RETURN_TIME: {
            state: 'AVAILABLE',
            returnStart: '2026-04-29T16:00:00-04:00',
            returnEnd: null,
            price: { amount: 2000, currency: 'USD', formatted: '$20.00' },
          },
        }}
      />
    );

    expect(screen.getByTestId('paid-ll-badge')).toBeInTheDocument();
    expect(screen.getByTestId('paid-ll-badge')).toHaveTextContent('$20.00');
  });

  it('hides ALL badges when queue data is null', () => {
    render(
      <EnhancedAttractionRow
        name="Jungle Cruise"
        entityType="ATTRACTION"
        status="OPERATING"
        waitMinutes={30}
        queue={null}
      />
    );

    expect(screen.queryByTestId('ll-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('paid-ll-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('boarding-badge')).not.toBeInTheDocument();
  });

  it('hides LL badge when RETURN_TIME state is FINISHED', () => {
    render(
      <EnhancedAttractionRow
        name="Space Mountain"
        entityType="ATTRACTION"
        status="OPERATING"
        waitMinutes={45}
        queue={{
          RETURN_TIME: { state: 'FINISHED', returnStart: null, returnEnd: null },
        }}
      />
    );

    // User should NOT see a Lightning Lane badge — passes are done for the day
    expect(screen.queryByTestId('ll-badge')).not.toBeInTheDocument();
  });

  it('hides ALL badges when attraction status is FINISHED', () => {
    render(
      <EnhancedAttractionRow
        name="Space Mountain"
        entityType="ATTRACTION"
        status="FINISHED"
        waitMinutes={null}
        queue={{
          RETURN_TIME: { state: 'AVAILABLE', returnStart: '2026-04-29T15:00:00-04:00', returnEnd: null },
          PAID_RETURN_TIME: {
            state: 'AVAILABLE',
            returnStart: null,
            returnEnd: null,
            price: { amount: 2000, currency: 'USD', formatted: '$20.00' },
          },
        }}
      />
    );

    // Ride is done for the day — don't show stale LL info
    expect(screen.queryByTestId('ll-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('paid-ll-badge')).not.toBeInTheDocument();
  });

  it('shows boarding group badge when BOARDING_GROUP exists', () => {
    render(
      <EnhancedAttractionRow
        name="Guardians of the Galaxy"
        entityType="ATTRACTION"
        status="OPERATING"
        waitMinutes={null}
        queue={{
          BOARDING_GROUP: { state: 'AVAILABLE', currentGroupStart: 45, currentGroupEnd: 55, estimatedWait: 30 },
        }}
      />
    );

    expect(screen.getByTestId('boarding-badge')).toBeInTheDocument();
    expect(screen.getByTestId('boarding-badge')).toHaveTextContent('Virtual Queue');
  });

  it('shows ALL badges when attraction has every queue type (rare but possible)', () => {
    render(
      <EnhancedAttractionRow
        name="TRON Lightcycle / Run"
        entityType="ATTRACTION"
        status="OPERATING"
        waitMinutes={75}
        queue={{
          RETURN_TIME: { state: 'AVAILABLE', returnStart: '2026-04-29T15:00:00-04:00', returnEnd: null },
          PAID_RETURN_TIME: {
            state: 'AVAILABLE',
            returnStart: null,
            returnEnd: null,
            price: { amount: 2000, currency: 'USD', formatted: '$20.00' },
          },
          BOARDING_GROUP: { state: 'AVAILABLE', currentGroupStart: 1, currentGroupEnd: 10, estimatedWait: 15 },
        }}
      />
    );

    expect(screen.getByTestId('ll-badge')).toBeInTheDocument();
    expect(screen.getByTestId('paid-ll-badge')).toBeInTheDocument();
    expect(screen.getByTestId('boarding-badge')).toBeInTheDocument();
  });

  it('handles price field missing formatted string gracefully', () => {
    render(
      <EnhancedAttractionRow
        name="TRON Lightcycle / Run"
        entityType="ATTRACTION"
        status="OPERATING"
        waitMinutes={75}
        queue={{
          PAID_RETURN_TIME: {
            state: 'AVAILABLE',
            returnStart: null,
            returnEnd: null,
            price: null,
          },
        }}
      />
    );

    // Should still render the badge, just with fallback text
    expect(screen.getByTestId('paid-ll-badge')).toBeInTheDocument();
    expect(screen.getByTestId('paid-ll-badge')).toHaveTextContent('LL');
  });
});
