import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCollectionGet = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: () => ({ get: mockCollectionGet }),
  },
}));

vi.mock("@/lib/parks/park-document-read", () => ({
  filterCurrentParkDocuments: (docs) => docs,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GET } from "@/app/api/park-hours/route";

const ET_PARK = {
  id: "75ea578a-adc8-4116-a54d-dccb60765ef9",
  name: "Magic Kingdom",
  slug: "magic-kingdom",
  timezone: "America/New_York",
};

const PT_PARK = {
  id: "7340550b-c14d-4def-80bb-acdb51d49a66",
  name: "Disneyland",
  slug: "disneyland",
  timezone: "America/Los_Angeles",
};

function parksSnapshot(parks) {
  return {
    docs: parks.map((p) => ({
      id: p.id,
      data: () => ({ name: p.name, slug: p.slug, timezone: p.timezone }),
    })),
  };
}

function upstreamSchedule(park, entries) {
  return {
    ok: true,
    json: async () => ({
      id: park.id,
      name: park.name,
      timezone: park.timezone,
      schedule: entries.map((e) => ({
        date: e.date,
        type: e.type ?? "OPERATING",
        openingTime: e.openingISO,
        closingTime: e.closingISO,
      })),
    }),
  };
}

describe("GET /api/park-hours", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockCollectionGet.mockResolvedValue(parksSnapshot([ET_PARK]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isoToLocalHHMM TZ invariance", () => {
    it("returns park-local HH:MM for ET park (09:00 ET != other TZ hours)", async () => {
      vi.setSystemTime(new Date("2026-08-01T17:00:00.000Z"));
      mockFetch.mockResolvedValueOnce(upstreamSchedule(ET_PARK, [{ date: "2026-08-01", openingISO: "2026-08-01T09:00:00-04:00", closingISO: "2026-08-01T22:00:00-04:00" }]));
      const { parks } = await (await GET()).json();
      expect(parks[0].todayHours).not.toBeNull();
      expect(parks[0].todayHours.openTime).toBe("09:00");
      expect(parks[0].todayHours.closeTime).toBe("22:00");
    });

    it("returns park-local HH:MM for PT park (09:00 PT = 16:00 UTC)", async () => {
      mockCollectionGet.mockResolvedValue(parksSnapshot([PT_PARK]));
      vi.setSystemTime(new Date("2026-08-01T20:00:00.000Z"));
      mockFetch.mockResolvedValueOnce(upstreamSchedule(PT_PARK, [{ date: "2026-08-01", openingISO: "2026-08-01T09:00:00-07:00", closingISO: "2026-08-01T22:00:00-07:00" }]));
      const { parks } = await (await GET()).json();
      expect(parks[0].todayHours.openTime).toBe("09:00");
      expect(parks[0].todayHours.closeTime).toBe("22:00");
    });
  });

  describe("todayStr is park-local near UTC midnight", () => {
    it("uses park-local Aug 1 when UTC has rolled to Aug 2 at 01:00 UTC (ET park)", async () => {
      vi.setSystemTime(new Date("2026-08-02T01:00:00.000Z"));
      mockFetch.mockResolvedValueOnce(upstreamSchedule(ET_PARK, [
        { date: "2026-08-01", openingISO: "2026-08-01T09:00:00-04:00", closingISO: "2026-08-01T23:00:00-04:00" },
        { date: "2026-08-02", openingISO: "2026-08-02T10:00:00-04:00", closingISO: "2026-08-02T21:00:00-04:00" },
      ]));
      const { parks } = await (await GET()).json();
      expect(parks[0].phase).toBe("OPEN");
      expect(parks[0].todayHours?.openTime).toBe("09:00");
      expect(parks[0].todayHours?.closeTime).toBe("23:00");
    });

    it("uses park-local Aug 2 when both UTC and ET have passed midnight (06:00 UTC)", async () => {
      vi.setSystemTime(new Date("2026-08-02T06:00:00.000Z"));
      mockFetch.mockResolvedValueOnce(upstreamSchedule(ET_PARK, [
        { date: "2026-08-01", openingISO: "2026-08-01T09:00:00-04:00", closingISO: "2026-08-01T23:00:00-04:00" },
        { date: "2026-08-02", openingISO: "2026-08-02T10:00:00-04:00", closingISO: "2026-08-02T21:00:00-04:00" },
      ]));
      const { parks } = await (await GET()).json();
      expect(parks[0].phase).toBe("UPCOMING");
      expect(parks[0].todayHours?.openTime).toBe("10:00");
      expect(parks[0].todayHours?.closeTime).toBe("21:00");
    });
  });

  describe("date-specific schedule isolation", () => {
    it("returns null todayHours when only tomorrow has an OPERATING entry", async () => {
      vi.setSystemTime(new Date("2026-08-01T17:00:00.000Z"));
      mockFetch.mockResolvedValueOnce(upstreamSchedule(ET_PARK, [{ date: "2026-08-02", openingISO: "2026-08-02T09:00:00-04:00", closingISO: "2026-08-02T22:00:00-04:00" }]));
      const { parks } = await (await GET()).json();
      expect(parks[0].phase).toBe("NO_DATA");
      expect(parks[0].todayHours).toBeNull();
    });

    it("returns null todayHours when today has only a TICKETED_EVENT entry", async () => {
      vi.setSystemTime(new Date("2026-08-01T17:00:00.000Z"));
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: ET_PARK.id, name: ET_PARK.name, timezone: ET_PARK.timezone, schedule: [{ date: "2026-08-01", type: "TICKETED_EVENT", openingTime: "2026-08-01T18:00:00-04:00", closingTime: "2026-08-01T23:00:00-04:00" }] }) });
      const { parks } = await (await GET()).json();
      expect(parks[0].phase).toBe("NO_DATA");
      expect(parks[0].todayHours).toBeNull();
    });

    it("does not return hours from yesterday when only yesterday has an OPERATING entry", async () => {
      vi.setSystemTime(new Date("2026-08-02T14:00:00.000Z"));
      mockFetch.mockResolvedValueOnce(upstreamSchedule(ET_PARK, [{ date: "2026-08-01", openingISO: "2026-08-01T09:00:00-04:00", closingISO: "2026-08-01T22:00:00-04:00" }]));
      const { parks } = await (await GET()).json();
      expect(parks[0].phase).toBe("NO_DATA");
      expect(parks[0].todayHours).toBeNull();
    });
  });

  describe("response shape contract", () => {
    it("wraps results in { fetchedAt, parks: [] } not a bare array", async () => {
      vi.setSystemTime(new Date("2026-08-01T17:00:00.000Z"));
      mockFetch.mockResolvedValueOnce(upstreamSchedule(ET_PARK, [{ date: "2026-08-01", openingISO: "2026-08-01T09:00:00-04:00", closingISO: "2026-08-01T22:00:00-04:00" }]));
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("fetchedAt");
      expect(body).toHaveProperty("parks");
      expect(Array.isArray(body.parks)).toBe(true);
      expect(typeof body.fetchedAt).toBe("string");
    });

    it("each park entry has parkId, slug, timezone, phase, todayHours, localTime", async () => {
      vi.setSystemTime(new Date("2026-08-01T17:00:00.000Z"));
      mockFetch.mockResolvedValueOnce(upstreamSchedule(ET_PARK, [{ date: "2026-08-01", openingISO: "2026-08-01T09:00:00-04:00", closingISO: "2026-08-01T22:00:00-04:00" }]));
      const { parks } = await (await GET()).json();
      const park = parks[0];
      expect(park).toHaveProperty("parkId", ET_PARK.id);
      expect(park).toHaveProperty("slug", ET_PARK.slug);
      expect(park).toHaveProperty("timezone", ET_PARK.timezone);
      expect(park).toHaveProperty("phase");
      expect(park).toHaveProperty("todayHours");
      expect(park).toHaveProperty("localTime");
      // isOpen must not be present in the new contract
      expect(park).not.toHaveProperty("isOpen");
    });
  });

  describe("phase and todayHours semantics", () => {
    it("phase=OPEN with todayHours when inside OPERATING window", async () => {
      vi.setSystemTime(new Date("2026-08-01T17:00:00.000Z"));
      mockFetch.mockResolvedValueOnce(upstreamSchedule(ET_PARK, [{ date: "2026-08-01", openingISO: "2026-08-01T09:00:00-04:00", closingISO: "2026-08-01T22:00:00-04:00" }]));
      const { parks } = await (await GET()).json();
      expect(parks[0].phase).toBe("OPEN");
      expect(parks[0].todayHours).toMatchObject({ openTime: "09:00", closeTime: "22:00" });
    });

    it("phase=UPCOMING with todayHours when before opening", async () => {
      vi.setSystemTime(new Date("2026-08-01T11:00:00.000Z"));
      mockFetch.mockResolvedValueOnce(upstreamSchedule(ET_PARK, [{ date: "2026-08-01", openingISO: "2026-08-01T09:00:00-04:00", closingISO: "2026-08-01T22:00:00-04:00" }]));
      const { parks } = await (await GET()).json();
      expect(parks[0].phase).toBe("UPCOMING");
      expect(parks[0].todayHours).toMatchObject({ openTime: "09:00", closeTime: "22:00" });
    });

    it("phase=CLOSED with todayHours preserved after closing (hours not discarded)", async () => {
      // 2026-08-02T03:30 UTC = 11:30 PM ET on Aug 1 — after the 10 PM close
      vi.setSystemTime(new Date("2026-08-02T03:30:00.000Z"));
      mockFetch.mockResolvedValueOnce(upstreamSchedule(ET_PARK, [{ date: "2026-08-01", openingISO: "2026-08-01T09:00:00-04:00", closingISO: "2026-08-01T22:00:00-04:00" }]));
      const { parks } = await (await GET()).json();
      expect(parks[0].phase).toBe("CLOSED");
      // todayHours must be preserved so the card can show "Closed at 10 PM"
      expect(parks[0].todayHours).toMatchObject({ openTime: "09:00", closeTime: "22:00" });
    });

    it("phase=NO_DATA with todayHours=null when upstream returns empty schedule", async () => {
      vi.setSystemTime(new Date("2026-08-01T17:00:00.000Z"));
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: ET_PARK.id, name: ET_PARK.name, timezone: ET_PARK.timezone, schedule: [] }) });
      const { parks } = await (await GET()).json();
      expect(parks[0].phase).toBe("NO_DATA");
      expect(parks[0].todayHours).toBeNull();
    });

    it("phase=ERROR (not CLOSED) when upstream API request fails", async () => {
      vi.setSystemTime(new Date("2026-08-01T17:00:00.000Z"));
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      const { parks } = await (await GET()).json();
      // Must never assert Closed on an upstream error
      expect(parks[0].phase).toBe("ERROR");
      expect(parks[0].todayHours).toBeNull();
    });

    it("phase=ERROR (not CLOSED) when upstream fetch throws", async () => {
      vi.setSystemTime(new Date("2026-08-01T17:00:00.000Z"));
      mockFetch.mockRejectedValueOnce(new Error("network timeout"));
      const { parks } = await (await GET()).json();
      expect(parks[0].phase).toBe("ERROR");
      expect(parks[0].todayHours).toBeNull();
    });
  });
});
