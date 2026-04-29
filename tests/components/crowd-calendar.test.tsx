/**
 * Tests for park-family crowd calendar UI components.
 *
 * Components tested:
 * - FamilySelector: Park family searchable combobox
 * - CalendarDayCell: Per-day multi-park crowd bars
 * - BestPlanBanner: Trip recommendation summary
 * - MiniMonth: Compact future month overview
 * - Full page integration: family switching, park toggling, mini month navigation
 *
 * Written 2026-04-29 — proactive contract tests (components being built by Mouth).
 * Uses inline stubs to define the rendering contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: {},
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Types (matching the architecture proposal)
// ---------------------------------------------------------------------------

interface ParkFamily {
  id: string;
  name: string;
  parks: string[];
}

interface CrowdBar {
  parkId: string;
  parkName: string;
  level: number; // 1–4
  color: string;
}

interface DayRecommendation {
  date: string;
  bestParkId: string;
  bestParkName: string;
  level: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Stub Components (define rendering contract — replace with real imports)
// ---------------------------------------------------------------------------

/** FamilySelector: searchable combobox to pick a park family */
function FamilySelector({
  families,
  selected,
  onChange,
}: {
  families: ParkFamily[];
  selected: string;
  onChange: (familyId: string) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const filtered = families.filter((f) =>
    f.name.toLowerCase().includes(query.toLowerCase()),
  );
  const selectedFamily = families.find((f) => f.id === selected);

  return (
    <div data-testid="family-selector">
      <input
        role="combobox"
        aria-expanded={isOpen}
        aria-label="Select park family"
        placeholder={selectedFamily?.name ?? 'Select a park family…'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        data-testid="family-search-input"
      />
      {isOpen && (
        <ul role="listbox" aria-label="Park families">
          {filtered.map((f) => (
            <li
              key={f.id}
              role="option"
              aria-selected={f.id === selected}
              onClick={() => {
                onChange(f.id);
                setIsOpen(false);
                setQuery('');
              }}
              data-testid={`family-option-${f.id}`}
            >
              {f.name}
              <span>{f.parks.length} parks</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** CalendarDayCell: one day in the calendar grid with stacked park bars */
function CalendarDayCell({
  day,
  bars,
  hiddenParks = [],
}: {
  day: number;
  bars: CrowdBar[];
  hiddenParks?: string[];
}) {
  const crowdColors: Record<number, string> = {
    1: 'green',
    2: 'yellow',
    3: 'orange',
    4: 'red',
  };

  const visibleBars = bars.filter((b) => !hiddenParks.includes(b.parkId));

  return (
    <div data-testid={`calendar-cell-${day}`} className="calendar-cell">
      <span className="day-number">{day}</span>
      <div className="crowd-bars">
        {visibleBars.map((bar) => (
          <div
            key={bar.parkId}
            data-testid={`bar-${bar.parkId}`}
            className={`crowd-bar crowd-bar--${crowdColors[bar.level]}`}
            style={{ backgroundColor: crowdColors[bar.level] }}
            aria-label={`${bar.parkName}: level ${bar.level}`}
          />
        ))}
      </div>
    </div>
  );
}

/** BestPlanBanner: shows trip recommendation or "no plan" */
function BestPlanBanner({ bestPlan }: { bestPlan: DayRecommendation[] | null }) {
  if (!bestPlan) {
    return (
      <div data-testid="best-plan-banner" className="best-plan-banner--empty">
        <p>No plan available</p>
      </div>
    );
  }

  return (
    <div data-testid="best-plan-banner" className="best-plan-banner">
      <h3>Best {bestPlan.length}-day plan this month:</h3>
      <ul>
        {bestPlan.map((rec) => (
          <li key={rec.date} data-testid={`plan-day-${rec.date}`}>
            {rec.date} → {rec.bestParkName}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** MiniMonth: compact month thumbnail showing aggregate crowd colors */
function MiniMonth({
  month,
  daysInMonth,
  aggregateLevels,
  onMonthClick,
}: {
  month: string;
  daysInMonth: number;
  aggregateLevels: Record<number, number>; // day → aggregate level
  onMonthClick: (month: string) => void;
}) {
  const crowdColors: Record<number, string> = { 1: 'green', 2: 'yellow', 3: 'orange', 4: 'red' };

  return (
    <div
      data-testid={`mini-month-${month}`}
      className="mini-month"
      onClick={() => onMonthClick(month)}
      role="button"
      aria-label={`Navigate to ${month}`}
    >
      <span className="mini-month-label">{month}</span>
      <div className="mini-month-grid" data-testid={`mini-grid-${month}`}>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
          <div
            key={day}
            className={`mini-day mini-day--${crowdColors[aggregateLevels[day] || 1]}`}
            data-testid={`mini-day-${month}-${day}`}
            style={{ backgroundColor: crowdColors[aggregateLevels[day] || 1] }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const mockFamilies: ParkFamily[] = [
  { id: 'walt-disney-world', name: 'Walt Disney World', parks: ['magic-kingdom', 'epcot', 'hollywood-studios', 'animal-kingdom'] },
  { id: 'universal-orlando', name: 'Universal Orlando', parks: ['universal-studios', 'islands-of-adventure', 'epic-universe'] },
  { id: 'disneyland-resort', name: 'Disneyland Resort', parks: ['disneyland', 'california-adventure'] },
];

const mockBars: CrowdBar[] = [
  { parkId: 'magic-kingdom', parkName: 'Magic Kingdom', level: 1, color: 'green' },
  { parkId: 'epcot', parkName: 'EPCOT', level: 3, color: 'orange' },
  { parkId: 'hollywood-studios', parkName: 'Hollywood Studios', level: 2, color: 'yellow' },
  { parkId: 'animal-kingdom', parkName: 'Animal Kingdom', level: 4, color: 'red' },
];

const mockBestPlan: DayRecommendation[] = [
  { date: '2026-05-05', bestParkId: 'animal-kingdom', bestParkName: 'Animal Kingdom', level: 1, label: 'Low' },
  { date: '2026-05-07', bestParkId: 'magic-kingdom', bestParkName: 'Magic Kingdom', level: 2, label: 'Moderate' },
  { date: '2026-05-09', bestParkId: 'epic-universe', bestParkName: 'Epic Universe', level: 1, label: 'Low' },
];

// ---------------------------------------------------------------------------
// Tests: FamilySelector
// ---------------------------------------------------------------------------

describe('FamilySelector', () => {
  it('renders all park families as options when opened', () => {
    render(
      <FamilySelector
        families={mockFamilies}
        selected="walt-disney-world"
        onChange={vi.fn()}
      />,
    );

    // Focus the input to open the listbox
    fireEvent.focus(screen.getByTestId('family-search-input'));

    expect(screen.getByText('Walt Disney World')).toBeInTheDocument();
    expect(screen.getByText('Universal Orlando')).toBeInTheDocument();
    expect(screen.getByText('Disneyland Resort')).toBeInTheDocument();
  });

  it('highlights the currently selected family', () => {
    render(
      <FamilySelector
        families={mockFamilies}
        selected="universal-orlando"
        onChange={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByTestId('family-search-input'));

    const uniOption = screen.getByTestId('family-option-universal-orlando');
    expect(uniOption).toHaveAttribute('aria-selected', 'true');

    const wdwOption = screen.getByTestId('family-option-walt-disney-world');
    expect(wdwOption).toHaveAttribute('aria-selected', 'false');
  });

  it('fires onChange when a family is selected', () => {
    const onChange = vi.fn();
    render(
      <FamilySelector
        families={mockFamilies}
        selected="walt-disney-world"
        onChange={onChange}
      />,
    );

    fireEvent.focus(screen.getByTestId('family-search-input'));
    fireEvent.click(screen.getByText('Universal Orlando'));
    expect(onChange).toHaveBeenCalledWith('universal-orlando');
  });

  it('fires onChange with correct familyId for each option', () => {
    const onChange = vi.fn();
    render(
      <FamilySelector
        families={mockFamilies}
        selected="walt-disney-world"
        onChange={onChange}
      />,
    );

    fireEvent.focus(screen.getByTestId('family-search-input'));
    fireEvent.click(screen.getByText('Disneyland Resort'));
    expect(onChange).toHaveBeenCalledWith('disneyland-resort');
  });

  it('filters options based on search query', () => {
    render(
      <FamilySelector
        families={mockFamilies}
        selected="walt-disney-world"
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByTestId('family-search-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Universal' } });

    expect(screen.getByText('Universal Orlando')).toBeInTheDocument();
    expect(screen.queryByText('Walt Disney World')).not.toBeInTheDocument();
    expect(screen.queryByText('Disneyland Resort')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: CalendarDayCell
// ---------------------------------------------------------------------------

describe('CalendarDayCell', () => {
  it('renders correct number of park bars', () => {
    render(<CalendarDayCell day={14} bars={mockBars} />);

    const cell = screen.getByTestId('calendar-cell-14');
    const bars = within(cell).getAllByTestId(/^bar-/);
    expect(bars).toHaveLength(4);
  });

  it('uses green color for crowd level 1', () => {
    render(<CalendarDayCell day={1} bars={[mockBars[0]]} />);
    const bar = screen.getByTestId('bar-magic-kingdom');
    expect(bar.className).toContain('crowd-bar--green');
  });

  it('uses yellow color for crowd level 2', () => {
    render(<CalendarDayCell day={1} bars={[mockBars[2]]} />);
    const bar = screen.getByTestId('bar-hollywood-studios');
    expect(bar.className).toContain('crowd-bar--yellow');
  });

  it('uses orange color for crowd level 3', () => {
    render(<CalendarDayCell day={1} bars={[mockBars[1]]} />);
    const bar = screen.getByTestId('bar-epcot');
    expect(bar.className).toContain('crowd-bar--orange');
  });

  it('uses red color for crowd level 4', () => {
    render(<CalendarDayCell day={1} bars={[mockBars[3]]} />);
    const bar = screen.getByTestId('bar-animal-kingdom');
    expect(bar.className).toContain('crowd-bar--red');
  });

  it('respects park toggle filters — hidden parks do not show', () => {
    render(
      <CalendarDayCell
        day={14}
        bars={mockBars}
        hiddenParks={['epcot', 'hollywood-studios']}
      />,
    );

    const cell = screen.getByTestId('calendar-cell-14');
    const bars = within(cell).getAllByTestId(/^bar-/);
    expect(bars).toHaveLength(2); // only MK and AK
    expect(within(cell).getByTestId('bar-magic-kingdom')).toBeInTheDocument();
    expect(within(cell).getByTestId('bar-animal-kingdom')).toBeInTheDocument();
    expect(within(cell).queryByTestId('bar-epcot')).not.toBeInTheDocument();
    expect(within(cell).queryByTestId('bar-hollywood-studios')).not.toBeInTheDocument();
  });

  it('renders day number', () => {
    render(<CalendarDayCell day={22} bars={mockBars} />);
    expect(screen.getByText('22')).toBeInTheDocument();
  });

  it('renders accessible labels on bars', () => {
    render(<CalendarDayCell day={1} bars={[mockBars[0]]} />);
    const bar = screen.getByTestId('bar-magic-kingdom');
    expect(bar).toHaveAttribute('aria-label', 'Magic Kingdom: level 1');
  });
});

// ---------------------------------------------------------------------------
// Tests: BestPlanBanner
// ---------------------------------------------------------------------------

describe('BestPlanBanner', () => {
  it('renders park names and days for each recommendation', () => {
    render(<BestPlanBanner bestPlan={mockBestPlan} />);

    expect(screen.getByText(/Animal Kingdom/)).toBeInTheDocument();
    expect(screen.getByText(/Magic Kingdom/)).toBeInTheDocument();
    expect(screen.getByText(/Epic Universe/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-05/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-07/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-09/)).toBeInTheDocument();
  });

  it('shows "no plan available" when bestPlan is null', () => {
    render(<BestPlanBanner bestPlan={null} />);

    expect(screen.getByText(/no plan available/i)).toBeInTheDocument();
  });

  it('renders correct number of plan days', () => {
    render(<BestPlanBanner bestPlan={mockBestPlan} />);

    expect(screen.getByText(/Best 3-day plan/)).toBeInTheDocument();
    const items = screen.getAllByTestId(/^plan-day-/);
    expect(items).toHaveLength(3);
  });

  it('renders plan with 2 days when only 2 recommendations exist', () => {
    const shortPlan = mockBestPlan.slice(0, 2);
    render(<BestPlanBanner bestPlan={shortPlan} />);

    expect(screen.getByText(/Best 2-day plan/)).toBeInTheDocument();
    const items = screen.getAllByTestId(/^plan-day-/);
    expect(items).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: MiniMonth
// ---------------------------------------------------------------------------

describe('MiniMonth', () => {
  const juneAggregates: Record<number, number> = {};
  for (let i = 1; i <= 30; i++) {
    juneAggregates[i] = (i % 4) + 1; // cycles 2,3,4,1,2,3,4,1...
  }

  it('renders correct number of day cells for the month', () => {
    render(
      <MiniMonth
        month="2026-06"
        daysInMonth={30}
        aggregateLevels={juneAggregates}
        onMonthClick={vi.fn()}
      />,
    );

    const grid = screen.getByTestId('mini-grid-2026-06');
    const dayCells = within(grid).getAllByTestId(/^mini-day-/);
    expect(dayCells).toHaveLength(30);
  });

  it('renders 31 cells for a 31-day month', () => {
    const mayAggregates: Record<number, number> = {};
    for (let i = 1; i <= 31; i++) mayAggregates[i] = 2;

    render(
      <MiniMonth
        month="2026-05"
        daysInMonth={31}
        aggregateLevels={mayAggregates}
        onMonthClick={vi.fn()}
      />,
    );

    const grid = screen.getByTestId('mini-grid-2026-05');
    const dayCells = within(grid).getAllByTestId(/^mini-day-/);
    expect(dayCells).toHaveLength(31);
  });

  it('shows aggregate crowd colors (green for level 1)', () => {
    render(
      <MiniMonth
        month="2026-06"
        daysInMonth={30}
        aggregateLevels={{ ...juneAggregates, 4: 1 }}
        onMonthClick={vi.fn()}
      />,
    );

    const day4 = screen.getByTestId('mini-day-2026-06-4');
    expect(day4.className).toContain('mini-day--green');
  });

  it('shows aggregate crowd colors (red for level 4)', () => {
    render(
      <MiniMonth
        month="2026-06"
        daysInMonth={30}
        aggregateLevels={{ ...juneAggregates, 3: 4 }}
        onMonthClick={vi.fn()}
      />,
    );

    const day3 = screen.getByTestId('mini-day-2026-06-3');
    expect(day3.className).toContain('mini-day--red');
  });

  it('clicking mini month fires onMonthClick with month string', () => {
    const onMonthClick = vi.fn();
    render(
      <MiniMonth
        month="2026-06"
        daysInMonth={30}
        aggregateLevels={juneAggregates}
        onMonthClick={onMonthClick}
      />,
    );

    fireEvent.click(screen.getByTestId('mini-month-2026-06'));
    expect(onMonthClick).toHaveBeenCalledWith('2026-06');
  });
});

// ---------------------------------------------------------------------------
// Tests: Full Page Integration
// ---------------------------------------------------------------------------

describe('Crowd Calendar — Full Page Integration', () => {
  // Simulated page component combining all sub-components
  function CrowdCalendarPage() {
    const [selectedFamily, setSelectedFamily] = React.useState('walt-disney-world');
    const [hiddenParks, setHiddenParks] = React.useState<string[]>([]);
    const [activeMonth, setActiveMonth] = React.useState('2026-05');
    const [fetchCount, setFetchCount] = React.useState(0);

    // Simulate data fetch on family change
    React.useEffect(() => {
      setFetchCount((c) => c + 1);
    }, [selectedFamily]);

    const togglePark = (parkId: string) => {
      setHiddenParks((prev) =>
        prev.includes(parkId) ? prev.filter((p) => p !== parkId) : [...prev, parkId],
      );
    };

    const currentFamily = mockFamilies.find((f) => f.id === selectedFamily)!;

    return (
      <div data-testid="crowd-calendar-page">
        <span data-testid="fetch-count">{fetchCount}</span>
        <span data-testid="active-month">{activeMonth}</span>

        <FamilySelector
          families={mockFamilies}
          selected={selectedFamily}
          onChange={setSelectedFamily}
        />

        <div data-testid="park-toggles">
          {currentFamily.parks.map((parkId) => (
            <button
              key={parkId}
              data-testid={`toggle-${parkId}`}
              onClick={() => togglePark(parkId)}
              aria-pressed={!hiddenParks.includes(parkId)}
            >
              {parkId}
            </button>
          ))}
        </div>

        <CalendarDayCell day={1} bars={mockBars} hiddenParks={hiddenParks} />

        <BestPlanBanner bestPlan={mockBestPlan} />

        <MiniMonth
          month="2026-06"
          daysInMonth={30}
          aggregateLevels={{ 1: 2, 2: 3 }}
          onMonthClick={setActiveMonth}
        />
      </div>
    );
  }

  it('changing family selector fetches new data', () => {
    render(<CrowdCalendarPage />);

    // Initial fetch
    expect(screen.getByTestId('fetch-count').textContent).toBe('1');

    // Open combobox and change family
    fireEvent.focus(screen.getByTestId('family-search-input'));
    fireEvent.click(screen.getByText('Universal Orlando'));
    expect(screen.getByTestId('fetch-count').textContent).toBe('2');
  });

  it('toggling a park chip hides that park\'s bars from all cells', () => {
    render(<CrowdCalendarPage />);

    // Initially all 4 bars visible
    const cell = screen.getByTestId('calendar-cell-1');
    expect(within(cell).getAllByTestId(/^bar-/)).toHaveLength(4);

    // Toggle epcot off
    fireEvent.click(screen.getByTestId('toggle-epcot'));

    // Now 3 bars
    expect(within(cell).getAllByTestId(/^bar-/)).toHaveLength(3);
    expect(within(cell).queryByTestId('bar-epcot')).not.toBeInTheDocument();
  });

  it('clicking mini month navigates to that month', () => {
    render(<CrowdCalendarPage />);

    expect(screen.getByTestId('active-month').textContent).toBe('2026-05');

    fireEvent.click(screen.getByTestId('mini-month-2026-06'));
    expect(screen.getByTestId('active-month').textContent).toBe('2026-06');
  });
});
