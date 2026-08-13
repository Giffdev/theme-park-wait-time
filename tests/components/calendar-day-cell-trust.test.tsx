import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarDayCell } from '@/components/crowd-calendar/CalendarDayCell';

describe('CalendarDayCell trust contract', () => {
  it('renders an open crowd estimate without generated weather or temperatures', () => {
    render(
      <CalendarDayCell
        dayNumber={12}
        enabledParkIds={new Set(['magic-kingdom'])}
        day={{
          date: '2026-08-12',
          aggregateCrowdLevel: 2,
          parks: [{
            parkId: 'magic-kingdom',
            parkName: 'Magic Kingdom',
            status: 'OPEN',
            crowdLevel: 2,
            avgWaitMinutes: 25,
          }],
        }}
      />,
    );

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/°F|°C|High \d+°|Low \d+°/);
  });
});
