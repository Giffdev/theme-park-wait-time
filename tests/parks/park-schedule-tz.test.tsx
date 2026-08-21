import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/firebase/config", () => ({ auth: {}, db: {}, storage: {}, app: {} }));

import ParkScheduleBar from "@/components/parks/ParkScheduleBar";
import ParkOperatingStatus from "@/components/parks/ParkOperatingStatus";

// Fixed ISO instants for deterministic tests.
// 2026-08-01T13:00:00Z = 09:00 ET (UTC-4) = 06:00 PT (UTC-7) = 07:00 CT (UTC-5).
// 2026-08-01T02:00:00Z = 22:00 ET = 19:00 PT = 21:00 CT (prior day in PT/CT).
const OPEN_ISO = "2026-08-01T13:00:00.000Z";  // 09:00 ET / 06:00 PT
const CLOSE_ISO = "2026-08-02T02:00:00.000Z"; // 22:00 ET / 19:00 PT

function makeSegment(overrides = {}) {
  return {
    type: "OPERATING",
    description: null,
    openingTime: OPEN_ISO,
    closingTime: CLOSE_ISO,
    ...overrides,
  };
}

describe("ParkScheduleBar — TZ-invariant rendering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T17:00:00.000Z")); // 1 PM ET
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders park-local open/close times for America/New_York (09:00 ET ≠ UTC or PT hours)", () => {
    const segments = [makeSegment()];
    render(<ParkScheduleBar segments={segments} timezone="America/New_York" />);

    // Should show ET times (9AM and 10PM), not UTC (13:00/02:00) or PT (6AM/7PM).
    const labels = screen.getAllByText(/open 9\s*am.*10\s*pm|open 9.*22/i);
    expect(labels.length).toBeGreaterThan(0);
  });

  it("renders park-local open/close times for America/Los_Angeles (09:00 PT)", () => {
    // Opening: 2026-08-01T16:00:00Z = 09:00 PT
    // Closing:  2026-08-02T05:00:00Z = 22:00 PT
    const segments = [makeSegment({
      openingTime: "2026-08-01T16:00:00.000Z",
      closingTime: "2026-08-02T05:00:00.000Z",
    })];
    render(<ParkScheduleBar segments={segments} timezone="America/Los_Angeles" />);

    const labels = screen.getAllByText(/open 9\s*am.*10\s*pm|open 9.*22/i);
    expect(labels.length).toBeGreaterThan(0);
  });

  it("segment label includes AM/PM (period is not empty)", () => {
    const segments = [makeSegment()];
    const { container } = render(<ParkScheduleBar segments={segments} timezone="America/New_York" />);

    const text = container.textContent ?? "";
    // Must contain either 'AM' or 'PM' — if dayPeriod lookup is broken it will be absent.
    expect(/[AP]M/i.test(text)).toBe(true);
  });

  it("TICKETED_EVENT segment renders its label with park-local times", () => {
    const segments = [
      makeSegment({ type: "OPERATING" }),
      {
        type: "TICKETED_EVENT",
        description: "Evening Extra Hours",
        openingTime: "2026-08-02T01:00:00.000Z",  // 21:00 ET
        closingTime: "2026-08-02T03:00:00.000Z",  // 23:00 ET
      },
    ];
    render(<ParkScheduleBar segments={segments} timezone="America/New_York" />);

    const text = screen.getByText(/Evening Extra Hours/i);
    expect(text).toBeInTheDocument();
  });

  it("renders nothing when segments array is empty", () => {
    const { container } = render(<ParkScheduleBar segments={[]} timezone="America/New_York" />);
    expect(container.firstChild).toBeNull();
  });

  it("timeline bar has role=img aria-label for accessibility", () => {
    const segments = [makeSegment()];
    render(<ParkScheduleBar segments={segments} timezone="America/New_York" />);
    expect(screen.getByRole("img", { name: /schedule timeline/i })).toBeInTheDocument();
  });
});

describe("ParkOperatingStatus — TZ-invariant rendering", () => {
  it("shows Open status with park-local closing time for America/New_York", () => {
    // Now = 1 PM ET (inside 09:00–22:00 ET window).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T17:00:00.000Z"));

    const segments = [makeSegment()];
    render(<ParkOperatingStatus segments={segments} timezone="America/New_York" />);

    // Should show ET closing time (10 PM), not UTC (02:00) or PT (7 PM).
    expect(screen.getByText(/open until/i)).toBeInTheDocument();
    const text = screen.getByText(/open until/i).textContent ?? "";
    expect(/10.*PM.*ET/.test(text)).toBe(true);

    vi.useRealTimers();
  });

  it("shows Open status with park-local closing time for America/Chicago", () => {
    vi.useFakeTimers();
    // 15:00 UTC = 10:00 CT (CDT = UTC-5). Closing: 2026-08-02T03:00Z = 22:00 CT.
    vi.setSystemTime(new Date("2026-08-01T15:00:00.000Z"));

    const segments = [makeSegment({
      openingTime: "2026-08-01T14:00:00.000Z", // 09:00 CT
      closingTime: "2026-08-02T03:00:00.000Z", // 22:00 CT
    })];
    render(<ParkOperatingStatus segments={segments} timezone="America/Chicago" />);

    expect(screen.getByText(/open until/i)).toBeInTheDocument();
    const text = screen.getByText(/open until/i).textContent ?? "";
    // CT abbreviation for America/Chicago
    expect(/CT/.test(text)).toBe(true);

    vi.useRealTimers();
  });

  it("shows Closed + Opens time when park has not yet opened", () => {
    vi.useFakeTimers();
    // 07:00 ET (11:00 UTC) — before 09:00 ET opening.
    vi.setSystemTime(new Date("2026-08-01T11:00:00.000Z"));

    const segments = [makeSegment()];
    render(<ParkOperatingStatus segments={segments} timezone="America/New_York" />);

    expect(screen.getByText(/closed/i)).toBeInTheDocument();
    const text = screen.getByText(/closed/i).textContent ?? "";
    // Should mention when it opens (9 AM ET).
    expect(/opens/i.test(text)).toBe(true);
    expect(/9.*AM.*ET/.test(text)).toBe(true);

    vi.useRealTimers();
  });

  it("shows Closed with no Opens time when all segments are in the past", () => {
    vi.useFakeTimers();
    // Far in the future — all segments already closed.
    vi.setSystemTime(new Date("2027-01-01T00:00:00.000Z"));

    const segments = [makeSegment()];
    render(<ParkOperatingStatus segments={segments} timezone="America/New_York" />);

    expect(screen.getByText(/closed/i)).toBeInTheDocument();
    // No "Opens" text because there are no future OPERATING segments.
    const text = screen.getByText(/closed/i).textContent ?? "";
    expect(/opens/i.test(text)).toBe(false);

    vi.useRealTimers();
  });

  it("renders nothing when segments array is empty", () => {
    const { container } = render(<ParkOperatingStatus segments={[]} timezone="America/New_York" />);
    expect(container.firstChild).toBeNull();
  });
});
