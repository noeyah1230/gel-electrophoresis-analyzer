import { describe, it, expect } from "vitest";
import {
  Project,
  Lane,
  Feature,
  calibration,
  sizeFeature,
  profile,
  suggest,
  csv,
  fullyReviewed,
  laneComparison,
  validateProject,
} from "../src/model";
const feature = (position: number, extra: Partial<Feature> = {}): Feature => ({
  id: `f${position}`,
  kind: "band",
  position,
  review: "reviewed",
  note: "",
  ambiguous: false,
  ...extra,
});
const lane = (extra: Partial<Lane> = {}): Lane => ({
  id: "sample",
  label: "Sample",
  type: "pcr",
  x: 10,
  y: 0,
  width: 10,
  height: 100,
  confirmedLinear: false,
  windowPercent: 10,
  reviewed: true,
  note: "",
  features: [feature(25)],
  ...extra,
});
const project = (): Project => ({
  schemaVersion: 1,
  appVersion: "0.1.0",
  id: "test",
  name: "Test",
  revision: 3,
  savedAt: "",
  source: "instrument",
  image: {
    dataUrl: "data:image/png;base64,eA==",
    width: 100,
    height: 100,
    fingerprint: "",
    filename: "test.png",
  },
  direction: "down",
  polarity: "bright",
  reference: 0,
  geometryConfirmed: true,
  view: { rotation: 0, contrast: 1, crop: null },
  detector: { smoothing: 1, prominence: 10, separation: 8 },
  markerSizes: [10000, 1000, 100, 10],
  ladderReviewed: true,
  lanes: [
    lane({
      id: "ladder",
      label: "Ladder",
      type: "ladder",
      features: [
        feature(10, { markerBp: 10000 }),
        feature(20, { markerBp: 1000 }),
        feature(30, { markerBp: 100 }),
        feature(40, { markerBp: 10 }),
      ],
    }),
    lane(),
  ],
});
describe("scientific eligibility and calibration", () => {
  it("interpolates logarithmically between adjacent anchors", () => {
    const p = project();
    expect(sizeFeature(p, p.lanes[1], feature(25)).bp).toBeCloseTo(
      Math.sqrt(1000 * 100),
      8,
    );
    expect(sizeFeature(p, p.lanes[1], feature(20)).bp).toBeCloseTo(1000);
  });
  it("withholds sizes for uncut lanes even with a user-entered length", () => {
    const p = project();
    expect(
      sizeFeature(p, lane({ type: "uncut", knownBp: 5000 }), feature(25)),
    ).toEqual({ status: "Not applicable: uncut plasmid", comparison: "" });
  });
  it("requires explicit full-length single-cut confirmation", () => {
    const p = project();
    expect(
      sizeFeature(p, lane({ type: "linearized" }), feature(25)).bp,
    ).toBeUndefined();
    expect(
      sizeFeature(
        p,
        lane({ type: "linearized", confirmedLinear: true }),
        feature(25),
      ).bp,
    ).toBeDefined();
  });
  it.each([9, 41])("never extrapolates at %s px", (pos) => {
    const p = project();
    expect(sizeFeature(p, p.lanes[1], feature(pos)).status).toBe(
      "Outside calibrated range",
    );
  });
  it.each([
    { ambiguous: true },
    { kind: "region" as const, end: 28 },
    { review: "proposed" as const },
  ])("withholds ambiguous, unresolved, or unreviewed features: %o", (extra) => {
    const p = project();
    expect(sizeFeature(p, p.lanes[1], feature(25, extra)).bp).toBeUndefined();
  });
  it("requires four reviewed anchors and reviewed assignments", () => {
    const p = project();
    p.ladderReviewed = false;
    expect(calibration(p).valid).toBe(false);
    p.ladderReviewed = true;
    p.lanes[0].features.pop();
    expect(calibration(p).valid).toBe(false);
  });
  it.each([
    "duplicate-position",
    "duplicate-size",
    "reversed-size",
    "negative-size",
    "negative-distance",
    "unreviewed",
  ])("rejects %s ladder", (kind) => {
    const p = project(),
      f = p.lanes[0].features;
    if (kind === "duplicate-position") f[1].position = f[0].position;
    if (kind === "duplicate-size") f[1].markerBp = f[0].markerBp;
    if (kind === "reversed-size") f[2].markerBp = 2000;
    if (kind === "negative-size") f[2].markerBp = -1;
    if (kind === "negative-distance") p.reference = 15;
    if (kind === "unreviewed") f[2].review = "proposed";
    expect(calibration(p).valid).toBe(false);
  });
  it("recomputes on every sample-type, geometry and mapping change", () => {
    const p = project(),
      l = p.lanes[1],
      f = feature(25);
    const size = sizeFeature(p, l, f).bp!;
    p.lanes[0].features[1].markerBp = 2000;
    expect(sizeFeature(p, l, f).bp).not.toBe(size);
    l.type = "uncut";
    expect(sizeFeature(p, l, f).bp).toBeUndefined();
    l.type = "pcr";
    p.geometryConfirmed = false;
    expect(sizeFeature(p, l, f).bp).toBeUndefined();
  });
  it("ignores display contrast, crop and rotation for fixed measurements", () => {
    const p = project(),
      size = sizeFeature(p, p.lanes[1], feature(25));
    p.view = {
      contrast: 3,
      rotation: 90,
      crop: { x: 0, y: 10, width: 50, height: 50 },
    };
    expect(sizeFeature(p, p.lanes[1], feature(25))).toEqual(size);
  });
  it("supports reverse migration and reference-line offsets", () => {
    const p = project();
    p.direction = "up";
    p.reference = 100;
    p.lanes[0].features.forEach((f) => {
      f.position = 100 - f.position;
    });
    expect(sizeFeature(p, p.lanes[1], feature(75)).bp).toBeCloseTo(
      Math.sqrt(1000 * 100),
    );
  });
  it("uses the selected expected window without equating sequence identity", () => {
    const p = project(),
      l = lane({ expectedBp: 316, windowPercent: 1 });
    expect(sizeFeature(p, l, feature(25)).comparison).toBe(
      "Band within the selected expected-size window",
    );
    l.expectedBp = 500;
    expect(sizeFeature(p, l, feature(25)).comparison).toBe(
      "Outside the selected expected-size window",
    );
  });
});
describe("review and exports", () => {
  it("preserves empty reviewed lanes and blank missing numeric values", () => {
    const p = project();
    p.lanes = [lane({ type: "uncut", features: [] })];
    expect(laneComparison(p, p.lanes[0])).toBe(
      "No distinct band marked during review",
    );
    const text = csv(p);
    expect(text).toContain("lane_summary");
    expect(text).toContain("No distinct band marked during review");
    expect(text).not.toContain("0 bp");
    expect(fullyReviewed(p)).toBe(true);
  });
  it("quotes commas, quotes and newlines; neutralizes spreadsheet formulas", () => {
    const p = project();
    p.lanes = [
      lane({
        label: '=HYPERLINK("x")',
        note: "\t+cmd",
        features: [feature(25, { note: 'first, "quoted"\nsecond' })],
      }),
    ];
    const text = csv(p);
    expect(text).toContain('"\'=HYPERLINK(""x"")"');
    expect(text).toContain('"\'\t+cmd"');
    expect(text).toContain('"first, ""quoted""\nsecond"');
    expect(text.startsWith("\uFEFF")).toBe(true);
  });
  it("does not export image paths or image metadata", () => {
    const p = project();
    p.image.filename = "/secret/sample.png";
    const text = csv(p);
    expect(text).not.toContain("/secret");
    expect(text).not.toContain("data:image");
    expect(text).toContain('"test",3,');
  });
  it("keeps known plasmid length separate from measured size", () => {
    const p = project();
    p.lanes = [lane({ type: "uncut", knownBp: 5000, expectedBp: 4000 })];
    const lines = csv(p).split("\r\n");
    expect(lines[2]).toContain(",,5000,");
    expect(lines[2]).not.toContain("4000");
  });
  it("does not claim no matching band when sizing is unavailable", () => {
    const p = project();
    p.geometryConfirmed = false;
    p.lanes[1].expectedBp = 1000;
    expect(laneComparison(p, p.lanes[1])).toContain("Comparison unavailable");
  });
  it("requires lanes and every feature for a reviewed export", () => {
    const p = project();
    expect(fullyReviewed(p)).toBe(true);
    p.lanes[1].features[0].review = "proposed";
    expect(fullyReviewed(p)).toBe(false);
    p.lanes = [];
    expect(fullyReviewed(p)).toBe(false);
  });
  it("rejects corrupt project geometry and unsupported schemas", () => {
    const p = project();
    expect(validateProject(p)).toBe(p);
    p.lanes[0].width = 10000;
    expect(() => validateProject(p)).toThrow();
    expect(() => validateProject({ schemaVersion: 2 })).toThrow();
  });
});
describe("brightness and local detection", () => {
  it("averages the width of vertical and horizontal lanes", () => {
    const d = new Uint8ClampedArray([
      0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 255, 255, 255, 255,
    ]);
    const l = lane({ x: 0, y: 0, width: 2, height: 2 });
    expect(profile(d, 2, 2, l, true)[0]).toBeCloseTo(50);
    expect(profile(d, 2, 2, l, false)[0]).toBeCloseTo(100);
  });
  it("detects synthetic positive and negative peaks equivalently", () => {
    const raw = Array.from(
      { length: 100 },
      (_, i) =>
        20 +
        180 * Math.exp(-(((i - 30) / 3) ** 2)) +
        120 * Math.exp(-(((i - 70) / 4) ** 2)),
    );
    const cfg = { smoothing: 1, prominence: 15, separation: 10 };
    expect(suggest(raw, "bright", cfg)).toEqual([30, 70]);
    expect(
      suggest(
        raw.map((v) => 255 - v),
        "dark",
        cfg,
      ),
    ).toEqual([30, 70]);
  });
  it("does not invent peaks in a flat profile", () => {
    expect(
      suggest(Array(100).fill(50), "bright", {
        smoothing: 2,
        prominence: 10,
        separation: 10,
      }),
    ).toEqual([]);
  });
});
