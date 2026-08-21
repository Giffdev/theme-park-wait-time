/**
 * Regression tests: ParkDetailPage sends the park-local YYYY-MM-DD to
 * /api/park-schedule when UTC has already crossed midnight but the park's
 * own timezone has not.
 *
 * Coverage:
 *  - America/New_York (EDT = UTC-4 in summer) - Walt Disney World
 *  - America/Los_Angeles (PDT = UTC-7 in summer) - Disneyland
 *  - Initial schedule fetch
 *  - Schedule retry (after a failed initial call)
 *  - Schedule auto-refresh (hidden-to-visible at 30-min staleness)
 *  - ET vs LA divergence after only ET crosses midnight
 *
 * Clock strategy: vi.useFakeTimers({ toFake: ["Date"] }) fakes only the Date
 * constructor so vi.setSystemTime() controls new Date() / Date.now() while
 * real setTimeout keeps waitFor / findBy polling functional.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ---- Mocks ------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockUseParams = vi.fn(() => ({ parkId: "magic-kingdom" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useParams: () => mockUseParams(),
  usePathname: () => `/parks/${mockUseParams().parkId}`,
}));

vi.mock("@/lib/firebase/config", () => ({
  auth: {},
  db: {},
  storage: {},
  app: {},
}));

vi.mock("@/components/UnifiedLogSheet", () => ({
  default: () => null,
}));

const mockGetCollection = vi.fn();
vi.mock("@/lib/firebase/firestore", () => ({
  getDocument: vi.fn(),
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  whereConstraint: vi.fn((...args: unknown[]) => args),
}));

vi.mock("lucide-react", () => ({
  RefreshCw: ({ className }: { className?: string }) => (
    <span data-testid="refresh-icon" className={className}>rotate</span>
  ),
  ArrowUpDown: () => <span>sort</span>,
  TrendingUp: () => <span>trending</span>,
  Clock: () => <span>clock</span>,
  AlertCircle: () => <span>alert</span>,
  MapPin: () => <span>pin</span>,
}));

vi.mock("@/lib/parks/park-registry", () => ({
  getParkBySlug: (slug: string) => {
    if (slug === "magic-kingdom") return { id: "magic-kingdom", slug };
    if (slug === "disneyland") return { id: "7340550b-c14d-4def-80bb-acdb51d49a66", slug };
    return undefined;
  },
  DESTINATION_FAMILIES: [{
    familyName: "Disney Parks",
    destinations: [{
      id: "wdw",
      destinationId: "wdw",
      slug: "walt-disney-world-dest",
      parks: [
        { id: "magic-kingdom", name: "Magic Kingdom" },
        { id: "7340550b-c14d-4def-80bb-acdb51d49a66", name: "Disneyland" },
      ],
    }],
  }],
}));

vi.mock("@/lib/parks/park-document-read", () => ({
  selectCurrentParkDocument: (docs: Array<{ id: string; slug?: string }>, slug: string) =>
    docs.find((doc) => doc.slug === slug) ?? docs.find((doc) => doc.id === slug),
}));

vi.mock("@/lib/parks/park-locations", () => ({
  getLocationByDestinationId: () => ({ city: "Orlando", state: "FL", country: "United States" }),
  formatLocation: () => "Orlando, FL",
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ---- Deterministic time constants ------------------------------------------
//
// UTC_ROLLOVER  2026-08-02T03:00Z:
//   UTC date                = "2026-08-02"
//   America/New_York  EDT   = 2026-08-01T23:00  -> park-local date "2026-08-01"
//   America/Los_Angeles PDT = 2026-08-01T20:00  -> park-local date "2026-08-01"
//
// UTC_AT_1AM_ET  2026-08-02T05:00Z:
//   America/New_York  EDT   = 2026-08-02T01:00  -> park-local date "2026-08-02"
//   America/Los_Angeles PDT = 2026-08-01T22:00  -> park-local date "2026-08-01"
//   (ET has crossed midnight; LA has not - the two timezones now diverge.)
const UTC_ROLLOVER   = "2026-08-02T03:00:00.000Z";
const UTC_AT_1AM_ET  = "2026-08-02T05:00:00.000Z";
const LOCAL_DATE_DAY1 = "2026-08-01";
const LOCAL_DATE_DAY2 = "2026-08-02";

// ---- Park fixtures with explicit IANA timezones ----------------------------

const mockParkNY = {
  id: "magic-kingdom",
  name: "Magic Kingdom",
  slug: "magic-kingdom",
  destinationName: "Walt Disney World",
  destinationId: "wdw",
  timezone: "America/New_York",
};

const disneylandUuid = "7340550b-c14d-4def-80bb-acdb51d49a66";

const mockParkLA = {
  id: disneylandUuid,
  name: "Disneyland",
  slug: "disneyland",
  destinationName: "Disneyland Resort",
  destinationId: "bfc89fd6-314d-44b4-b89e-df1a89cf991e",
  timezone: "America/Los_Angeles",
};

const mockAttractions = [
  {
    id: "space-mountain",
    name: "Space Mountain",
    parkId: "magic-kingdom",
    parkName: "Magic Kingdom",
    entityType: "ATTRACTION",
    slug: "space-mountain",
  },
];

/**
 * Build wait-time fixtures whose fetchedAt equals the given instant so they
 * are always "fresh" relative to the faked clock (<2 min old).  A non-empty
 * forecast suppresses the Phase-3 background refresh so mock.calls stays
 * clean for schedule-URL assertions.
 */
function makeFreshWaitTimes(parkId: string, now: string) {
  return [
    {
      id: "wt-1",
      attractionId: "space-mountain",
      attractionName: "Space Mountain",
      parkId,
      status: "OPERATING",
      waitMinutes: 45,
      lastUpdated: now,
      fetchedAt: now,
      forecast: [{ time: "10:00", wait: 45 }],
    },
  ];
}

const mockScheduleResponse = { segments: [], timezone: "America/New_York" };

function scheduleCallUrls(calls: unknown[][]): string[] {
  return calls
    .filter(([url]) => typeof url === "string" && (url as string).includes("/api/park-schedule"))
    .map(([url]) => url as string);
}

// ---- Suite ------------------------------------------------------------------

describe("ParkDetailPage - /api/park-schedule uses park-local date at UTC rollover", () => {
  let ParkDetailPage: React.ComponentType;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(UTC_ROLLOVER));

    vi.clearAllMocks();
    mockGetCollection.mockReset();
    mockFetch.mockReset();
    mockUseParams.mockReturnValue({ parkId: "magic-kingdom" });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/park-schedule"))
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScheduleResponse) });
      if (url.includes("/api/wait-times"))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ parks: {} }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const mod = await import("@/app/parks/[parkId]/page");
    ParkDetailPage = mod.default;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. Initial fetch ----------------------------------------------------------

  describe("initial schedule fetch", () => {
    it("America/New_York: sends date=2026-08-01 (not UTC 2026-08-02) at 03:00Z", async () => {
      mockGetCollection.mockImplementation((path: string) => {
        if (path === "parks") return Promise.resolve([mockParkNY]);
        if (path === "attractions") return Promise.resolve(mockAttractions);
        if (path === "waitTimes/magic-kingdom/current")
          return Promise.resolve(makeFreshWaitTimes("magic-kingdom", UTC_ROLLOVER));
        return Promise.resolve([]);
      });

      render(<ParkDetailPage />);

      await waitFor(() => {
        const urls = scheduleCallUrls(mockFetch.mock.calls);
        expect(urls.length).toBeGreaterThan(0);
        urls.forEach((url) => {
          expect(url).toContain(`date=${LOCAL_DATE_DAY1}`);
          expect(url).not.toContain(`date=${LOCAL_DATE_DAY2}`);
        });
      });
    });

    it("America/Los_Angeles: sends date=2026-08-01 (not UTC 2026-08-02) at 03:00Z", async () => {
      mockUseParams.mockReturnValue({ parkId: "disneyland" });
      mockGetCollection.mockImplementation((path: string) => {
        if (path === "parks") return Promise.resolve([mockParkLA]);
        if (path === "attractions") return Promise.resolve(mockAttractions);
        if (path === `waitTimes/${disneylandUuid}/current`)
          return Promise.resolve(makeFreshWaitTimes(disneylandUuid, UTC_ROLLOVER));
        return Promise.resolve([]);
      });

      render(<ParkDetailPage />);

      await waitFor(() => {
        const urls = scheduleCallUrls(mockFetch.mock.calls);
        expect(urls.length).toBeGreaterThan(0);
        urls.forEach((url) => {
          expect(url).toContain(`date=${LOCAL_DATE_DAY1}`);
          expect(url).not.toContain(`date=${LOCAL_DATE_DAY2}`);
        });
      });
    });

    it("America/Los_Angeles: exact URL is /api/park-schedule?parkId=<uuid>&date=2026-08-01", async () => {
      mockUseParams.mockReturnValue({ parkId: "disneyland" });
      mockGetCollection.mockImplementation((path: string) => {
        if (path === "parks") return Promise.resolve([mockParkLA]);
        if (path === "attractions") return Promise.resolve(mockAttractions);
        if (path === `waitTimes/${disneylandUuid}/current`)
          return Promise.resolve(makeFreshWaitTimes(disneylandUuid, UTC_ROLLOVER));
        return Promise.resolve([]);
      });

      render(<ParkDetailPage />);

      await waitFor(() => {
        const urls = scheduleCallUrls(mockFetch.mock.calls);
        expect(urls).toContain(
          `/api/park-schedule?parkId=${disneylandUuid}&date=${LOCAL_DATE_DAY1}`,
        );
      });
    });
  });

  // 2. ET vs LA divergence after ET midnight ---------------------------------

  describe("ET vs LA diverge once ET crosses midnight", () => {
    it("America/New_York: date advances to 2026-08-02 when UTC is 05:00Z (01:00 ET)", async () => {
      vi.setSystemTime(new Date(UTC_AT_1AM_ET));

      mockGetCollection.mockImplementation((path: string) => {
        if (path === "parks") return Promise.resolve([mockParkNY]);
        if (path === "attractions") return Promise.resolve(mockAttractions);
        if (path === "waitTimes/magic-kingdom/current")
          return Promise.resolve(makeFreshWaitTimes("magic-kingdom", UTC_AT_1AM_ET));
        return Promise.resolve([]);
      });

      render(<ParkDetailPage />);

      await waitFor(() => {
        const urls = scheduleCallUrls(mockFetch.mock.calls);
        expect(urls.length).toBeGreaterThan(0);
        urls.forEach((url) => {
          expect(url).toContain(`date=${LOCAL_DATE_DAY2}`);
          expect(url).not.toContain(`date=${LOCAL_DATE_DAY1}`);
        });
      });
    });

    it("America/Los_Angeles: still sends date=2026-08-01 at 05:00Z (LA midnight is 07:00Z)", async () => {
      vi.setSystemTime(new Date(UTC_AT_1AM_ET));
      mockUseParams.mockReturnValue({ parkId: "disneyland" });
      mockGetCollection.mockImplementation((path: string) => {
        if (path === "parks") return Promise.resolve([mockParkLA]);
        if (path === "attractions") return Promise.resolve(mockAttractions);
        if (path === `waitTimes/${disneylandUuid}/current`)
          return Promise.resolve(makeFreshWaitTimes(disneylandUuid, UTC_AT_1AM_ET));
        return Promise.resolve([]);
      });

      render(<ParkDetailPage />);

      await waitFor(() => {
        const urls = scheduleCallUrls(mockFetch.mock.calls);
        expect(urls.length).toBeGreaterThan(0);
        urls.forEach((url) => {
          expect(url).toContain(`date=${LOCAL_DATE_DAY1}`);
          expect(url).not.toContain(`date=${LOCAL_DATE_DAY2}`);
        });
      });
    });
  });

  // 3. Schedule retry preserves park-local date ------------------------------

  describe("schedule retry preserves park-local date", () => {
    it("America/New_York: Retry button re-fetches with date=2026-08-01", async () => {
      const user = userEvent.setup();
      mockGetCollection.mockImplementation((path: string) => {
        if (path === "parks") return Promise.resolve([mockParkNY]);
        if (path === "attractions") return Promise.resolve(mockAttractions);
        if (path === "waitTimes/magic-kingdom/current")
          return Promise.resolve(makeFreshWaitTimes("magic-kingdom", UTC_ROLLOVER));
        return Promise.resolve([]);
      });

      let scheduleCalls = 0;
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/park-schedule")) {
          scheduleCalls++;
          return scheduleCalls === 1
            ? Promise.resolve({ ok: false, status: 503 })
            : Promise.resolve({ ok: true, json: () => Promise.resolve(mockScheduleResponse) });
        }
        if (url.includes("/api/wait-times"))
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ parks: { "magic-kingdom": makeFreshWaitTimes("magic-kingdom", UTC_ROLLOVER) } }) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<ParkDetailPage />);

      const retryButton = await screen.findByRole("button", { name: "Retry" });

      // Initial call must already use park-local date (not UTC date).
      const initUrls = scheduleCallUrls(mockFetch.mock.calls);
      expect(initUrls).toHaveLength(1);
      expect(initUrls[0]).toContain(`date=${LOCAL_DATE_DAY1}`);
      expect(initUrls[0]).not.toContain(`date=${LOCAL_DATE_DAY2}`);

      await user.click(retryButton);
      await waitFor(() => expect(scheduleCalls).toBe(2));

      // Both the initial and the retry call must use the park-local date.
      const allUrls = scheduleCallUrls(mockFetch.mock.calls);
      expect(allUrls).toHaveLength(2);
      allUrls.forEach((url) => {
        expect(url).toContain(`date=${LOCAL_DATE_DAY1}`);
        expect(url).not.toContain(`date=${LOCAL_DATE_DAY2}`);
      });
    });

    it("America/Los_Angeles: Retry button re-fetches with date=2026-08-01", async () => {
      const user = userEvent.setup();
      mockUseParams.mockReturnValue({ parkId: "disneyland" });
      mockGetCollection.mockImplementation((path: string) => {
        if (path === "parks") return Promise.resolve([mockParkLA]);
        if (path === "attractions") return Promise.resolve(mockAttractions);
        if (path === `waitTimes/${disneylandUuid}/current`)
          return Promise.resolve(makeFreshWaitTimes(disneylandUuid, UTC_ROLLOVER));
        return Promise.resolve([]);
      });

      let scheduleCalls = 0;
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/park-schedule")) {
          scheduleCalls++;
          return scheduleCalls === 1
            ? Promise.resolve({ ok: false, status: 503 })
            : Promise.resolve({ ok: true, json: () => Promise.resolve(mockScheduleResponse) });
        }
        if (url.includes("/api/wait-times"))
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ parks: { [disneylandUuid]: makeFreshWaitTimes(disneylandUuid, UTC_ROLLOVER) } }) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<ParkDetailPage />);

      const retryButton = await screen.findByRole("button", { name: "Retry" });
      await user.click(retryButton);
      await waitFor(() => expect(scheduleCalls).toBe(2));

      const allUrls = scheduleCallUrls(mockFetch.mock.calls);
      expect(allUrls).toHaveLength(2);
      allUrls.forEach((url) => {
        expect(url).toContain(`date=${LOCAL_DATE_DAY1}`);
        expect(url).not.toContain(`date=${LOCAL_DATE_DAY2}`);
      });
    });
  });

  // 4. Schedule auto-refresh (hidden -> visible) retains park-local date -----

  describe("schedule auto-refresh on visibility return", () => {
    // The useVisibility debounce uses Date.now() inline: elapsed = Date.now() - hiddenAt.
    // Since we fake Date (not setTimeout), we control the elapsed value by advancing the
    // clock BETWEEN the hidden and visible events.
    // useAutoRefresh.lastRefreshedAt starts at null for the schedule hook (because
    // fetchSchedule is called directly, not through useAutoRefresh), so age = Infinity
    // which satisfies the 30-min staleness threshold without needing extra clock advance.
    it("America/New_York: hidden-to-visible auto-refresh still requests date=2026-08-01", async () => {
      mockGetCollection.mockImplementation((path: string) => {
        if (path === "parks") return Promise.resolve([mockParkNY]);
        if (path === "attractions") return Promise.resolve(mockAttractions);
        if (path === "waitTimes/magic-kingdom/current")
          return Promise.resolve(makeFreshWaitTimes("magic-kingdom", UTC_ROLLOVER));
        return Promise.resolve([]);
      });

      render(<ParkDetailPage />);

      // Wait for the initial schedule fetch to complete.
      await waitFor(() => expect(scheduleCallUrls(mockFetch.mock.calls).length).toBeGreaterThan(0));
      const countAfterInit = scheduleCallUrls(mockFetch.mock.calls).length;

      // Step 1: hide the page. useVisibility records hiddenAt = Date.now() = UTC_ROLLOVER.
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      // Step 2: advance the faked clock 6 s so elapsed = 6000 ms > 5000 ms debounce.
      // This is still well within "2026-08-01" in ET (23:00:06 ET), so the date is correct.
      vi.setSystemTime(new Date(new Date(UTC_ROLLOVER).getTime() + 6_000));

      // Step 3: show the page. useVisibility fires onVisible -> maybeRefresh -> fetchSchedule.
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      await waitFor(
        () => expect(scheduleCallUrls(mockFetch.mock.calls).length).toBeGreaterThan(countAfterInit),
        { timeout: 3_000 },
      );

      // Every schedule call (initial + auto-refresh) must use the park-local date.
      scheduleCallUrls(mockFetch.mock.calls).forEach((url) => {
        expect(url).toContain(`date=${LOCAL_DATE_DAY1}`);
        expect(url).not.toContain(`date=${LOCAL_DATE_DAY2}`);
      });
    });
  });
});