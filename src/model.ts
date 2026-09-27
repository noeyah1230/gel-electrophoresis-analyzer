export type LaneType = "uncut" | "pcr" | "linearized" | "ladder";
export type Review = "proposed" | "reviewed";
export interface Feature {
  id: string;
  kind: "band" | "region";
  position: number;
  end?: number;
  review: Review;
  note: string;
  ambiguous: boolean;
  markerBp?: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Lane extends Rect {
  id: string;
  label: string;
  type: LaneType;
  confirmedLinear: boolean;
  knownBp?: number;
  expectedBp?: number;
  windowPercent: number;
  reviewed: boolean;
  note: string;
  features: Feature[];
}
export interface Project {
  schemaVersion: 1;
  appVersion: string;
  id: string;
  name: string;
  revision: number;
  savedAt: string;
  image: {
    dataUrl: string;
    width: number;
    height: number;
    fingerprint: string;
    filename: string;
  };
  source: "instrument" | "gel-photo" | "screen-photo" | "synthetic";
  polarity: "bright" | "dark";
  geometryConfirmed: boolean;
  direction: "down" | "up" | "right" | "left";
  reference: number;
  view: { rotation: number; contrast: number; crop: Rect | null };
  detector: { smoothing: number; prominence: number; separation: number };
  ladderReviewed: boolean;
  markerSizes: number[];
  lanes: Lane[];
}
export const laneNames: Record<LaneType, string> = {
  uncut: "Uncut / unknown plasmid",
  pcr: "PCR product",
  linearized: "Linearized plasmid",
  ladder: "DNA ladder",
};
export const uid = () => crypto.randomUUID();
export const vertical = (p: Project) =>
  p.direction === "down" || p.direction === "up";
export const migration = (p: Project, pos: number) =>
  (pos - p.reference) *
  (p.direction === "up" || p.direction === "left" ? -1 : 1);
export const newLane = (rect: Rect, index: number): Lane => ({
  ...rect,
  id: uid(),
  label: `Sample ${String(index).padStart(2, "0")}`,
  type: "uncut",
  confirmedLinear: false,
  windowPercent: 10,
  reviewed: false,
  note: "",
  features: [],
});
export function calibration(p: Project): {
  valid: boolean;
  reason: string;
  anchors: { d: number; bp: number }[];
} {
  const ladders = p.lanes.filter((l) => l.type === "ladder");
  const fail = (reason: string) => ({ valid: false, reason, anchors: [] });
  if (!p.geometryConfirmed) return fail("Geometry not confirmed suitable");
  if (ladders.length !== 1) return fail("Select exactly one same-gel ladder");
  const anchors = ladders[0].features
    .filter(
      (f) =>
        f.kind === "band" &&
        f.review === "reviewed" &&
        !f.ambiguous &&
        f.markerBp !== undefined,
    )
    .map((f) => ({ d: migration(p, f.position), bp: f.markerBp! }))
    .sort((a, b) => a.d - b.d);
  if (anchors.length < 4)
    return fail("At least 4 reviewed ladder anchors required");
  if (
    anchors.some(
      (a, i) =>
        !Number.isFinite(a.bp) ||
        a.bp <= 0 ||
        !Number.isFinite(a.d) ||
        a.d < 0 ||
        (i > 0 && (a.d <= anchors[i - 1].d || a.bp >= anchors[i - 1].bp)),
    )
  )
    return fail(
      "Ladder positions and sizes must be distinct and correctly ordered",
    );
  if (!p.ladderReviewed)
    return { valid: false, reason: "Review ladder assignments", anchors };
  return { valid: true, reason: "Reviewed calibration", anchors };
}
export function sizeFeature(
  p: Project,
  l: Lane,
  f: Feature,
): { bp?: number; status: string; comparison: string } {
  const unavailable = (status: string) => ({ status, comparison: "" });
  if (l.type === "uncut") return unavailable("Not applicable: uncut plasmid");
  if (l.type === "ladder") return unavailable("Ladder reference");
  if (l.type === "linearized" && !l.confirmedLinear)
    return unavailable(
      "Annotation only: full-length single-cut product not confirmed",
    );
  if (f.kind === "region" || f.ambiguous)
    return unavailable("Unresolved or ambiguous feature");
  if (f.review !== "reviewed") return unavailable("Band not reviewed");
  const c = calibration(p);
  if (!c.valid) return unavailable(c.reason);
  const d = migration(p, f.position);
  const a = c.anchors;
  if (d < a[0].d || d > a[a.length - 1].d)
    return unavailable("Outside calibrated range");
  let i = a.findIndex(
    (v, j) => j < a.length - 1 && d >= v.d && d <= a[j + 1].d,
  );
  if (i < 0) return unavailable("Outside calibrated range");
  const lo = a[i],
    hi = a[i + 1];
  const bp =
    10 **
    (Math.log10(lo.bp) +
      ((d - lo.d) / (hi.d - lo.d)) * (Math.log10(hi.bp) - Math.log10(lo.bp)));
  const within =
    l.expectedBp &&
    Math.abs(bp - l.expectedBp) <= (l.expectedBp * l.windowPercent) / 100;
  return {
    bp,
    status: "Approximate linear size",
    comparison: l.expectedBp
      ? within
        ? "Band within the selected expected-size window"
        : "Outside the selected expected-size window"
      : "",
  };
}
export const approximate = (bp: number) => Number(bp.toPrecision(2));
export function laneComparison(p: Project, l: Lane): string {
  if (!l.reviewed || l.features.some((f) => f.review !== "reviewed"))
    return "Lane review incomplete";
  if (!l.features.some((f) => f.kind === "band"))
    return "No distinct band marked during review";
  if (!l.expectedBp || l.type === "uncut" || l.type === "ladder")
    return `${l.features.filter((f) => f.kind === "band").length} marked bands; review notes available`;
  const results = l.features.map((f) => sizeFeature(p, l, f));
  if (
    results.some(
      (r) => r.comparison === "Band within the selected expected-size window",
    )
  )
    return "Band within the selected expected-size window";
  if (!results.some((r) => r.bp !== undefined))
    return "Comparison unavailable: no eligible sized bands";
  return "No reviewed band within the selected window";
}
export const fullyReviewed = (p: Project) =>
  p.lanes.length > 0 &&
  p.lanes.every(
    (l) => l.reviewed && l.features.every((f) => f.review === "reviewed"),
  );
export function profile(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  l: Lane,
  isVertical: boolean,
): number[] {
  const start = Math.max(0, Math.floor(isVertical ? l.y : l.x)),
    end = Math.min(
      isVertical ? h : w,
      Math.ceil(isVertical ? l.y + l.height : l.x + l.width),
    );
  const crossStart = Math.max(0, Math.floor(isVertical ? l.x : l.y)),
    crossEnd = Math.min(
      isVertical ? w : h,
      Math.ceil(isVertical ? l.x + l.width : l.y + l.height),
    );
  return Array.from({ length: Math.max(0, end - start) }, (_, j) => {
    let sum = 0;
    for (let k = crossStart; k < crossEnd; k++) {
      const x = isVertical ? k : start + j,
        y = isVertical ? start + j : k,
        idx = (y * w + x) * 4;
      sum +=
        data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
    }
    return sum / Math.max(1, crossEnd - crossStart);
  });
}
export function suggest(
  raw: number[],
  polarity: "bright" | "dark",
  settings: Project["detector"],
): number[] {
  const positive = raw.map((v) => (polarity === "bright" ? v : 255 - v)),
    r = settings.smoothing;
  const smooth = positive.map((_, i) => {
    const a = positive.slice(Math.max(0, i - r), i + r + 1);
    return a.reduce((s, v) => s + v, 0) / a.length;
  });
  const corrected = smooth.map(
    (v, i) => v - Math.min(...smooth.slice(Math.max(0, i - 20), i + 21)),
  );
  const candidates: number[] = [];
  for (let i = 2; i < corrected.length - 2; i++)
    if (
      corrected[i] >= settings.prominence &&
      corrected[i] > corrected[i - 1] &&
      corrected[i] >= corrected[i + 1] &&
      corrected[i - 1] >= settings.prominence * 0.25 &&
      corrected[i + 1] >= settings.prominence * 0.25
    )
      candidates.push(i);
  const accepted: number[] = [];
  candidates
    .sort((a, b) => corrected[b] - corrected[a])
    .forEach((i) => {
      if (accepted.every((j) => Math.abs(i - j) >= settings.separation))
        accepted.push(i);
    });
  return accepted.sort((a, b) => a - b);
}
export function csv(p: Project): string {
  const headers = [
    "project_id",
    "revision",
    "source_category",
    "record_type",
    "lane_number",
    "sample_label",
    "sample_type",
    "feature_id",
    "migration_position_px",
    "approximate_size_bp",
    "expected_linear_size_bp",
    "user_entered_known_plasmid_length_bp",
    "expected_window_percent",
    "comparison_result",
    "sizing_status",
    "review_state",
    "user_note",
  ];
  const rows: unknown[][] = [headers];
  p.lanes.forEach((l, i) => {
    const common = [p.id, p.revision, p.source];
    const extras = [
      l.type === "pcr" || l.type === "linearized" ? l.expectedBp : undefined,
      l.type === "uncut" ? l.knownBp : undefined,
      l.expectedBp && l.type !== "uncut" ? l.windowPercent : undefined,
    ];
    rows.push([
      ...common,
      "lane_summary",
      i + 1,
      l.label,
      laneNames[l.type],
      "",
      "",
      "",
      ...extras,
      laneComparison(p, l),
      "",
      l.reviewed ? "reviewed" : "draft",
      l.note,
    ]);
    l.features.forEach((f, j) => {
      const s = sizeFeature(p, l, f);
      rows.push([
        ...common,
        f.kind,
        i + 1,
        l.label,
        laneNames[l.type],
        `${f.kind === "band" ? "B" : "R"}${j + 1}`,
        migration(p, f.position),
        s.bp !== undefined ? approximate(s.bp) : undefined,
        ...extras,
        s.comparison,
        s.status,
        f.review,
        f.note,
      ]);
    });
  });
  const cell = (v: unknown) => {
    if (v === undefined || v === null) return "";
    if (typeof v === "number") return String(v);
    let s = String(v);
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
export function validateProject(v: unknown): Project {
  const p = v as Project;
  if (
    !p ||
    p.schemaVersion !== 1 ||
    !p.image ||
    !Array.isArray(p.lanes) ||
    !p.id ||
    !Number.isInteger(p.revision) ||
    p.revision < 0 ||
    !/^data:image\/(png|jpeg);base64,/.test(p.image.dataUrl) ||
    p.image.width < 1 ||
    p.image.height < 1 ||
    p.image.width * p.image.height > 40_000_000
  )
    throw Error("Unsupported or damaged project.");
  if (
    !["down", "up", "left", "right"].includes(p.direction) ||
    !p.view ||
    !p.detector ||
    !Array.isArray(p.markerSizes)
  )
    throw Error("Invalid project settings.");
  for (const l of p.lanes) {
    if (
      !(l.type in laneNames) ||
      !Array.isArray(l.features) ||
      ![l.x, l.y, l.width, l.height].every(Number.isFinite) ||
      l.width <= 0 ||
      l.height <= 0 ||
      l.x < 0 ||
      l.y < 0 ||
      l.x + l.width > p.image.width + 0.01 ||
      l.y + l.height > p.image.height + 0.01
    )
      throw Error("Invalid lane geometry.");
    for (const f of l.features)
      if (
        !Number.isFinite(f.position) ||
        !["band", "region"].includes(f.kind) ||
        !["proposed", "reviewed"].includes(f.review)
      )
        throw Error("Invalid feature.");
  }
  return p;
}
