import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  FolderOpen,
  ImagePlus,
  Layers,
  LockKeyhole,
  Microscope,
  MousePointer2,
  Plus,
  RotateCw,
  ScanLine,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
  CheckCheck,
  Save,
  Info,
  Crop,
} from "lucide-react";
import {
  Project,
  Lane,
  Feature,
  Rect,
  newLane,
  uid,
  laneNames,
  vertical,
  migration,
  calibration,
  sizeFeature,
  approximate,
  profile,
  suggest,
  csv,
  fullyReviewed,
  laneComparison,
} from "./model";
import {
  native,
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  recoverProject,
  presets,
  savePresets,
  exportFile,
} from "./storage";
import { projectFromFile, demo, decode, annotatedPng } from "./image";
type Tool = "select" | "lane" | "band" | "region" | "reference" | "crop";
const colors = [
  "#d8ac60",
  "#5fc3a4",
  "#89b9df",
  "#ca9bd6",
  "#e7a881",
  "#90bd89",
  "#d7c06e",
  "#8fa3dd",
];
export default function App() {
  const [p, setP] = useState<Project | null>(null),
    [projects, setProjects] = useState<Project[]>([]),
    [selected, setSelected] = useState(""),
    [featureId, setFeatureId] = useState(""),
    [tool, setTool] = useState<Tool>("select"),
    [zoom, setZoom] = useState(1),
    [tab, setTab] = useState<"lane" | "image" | "ladder">("lane"),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(-1),
    [help, setHelp] = useState(false),
    [exports, setExports] = useState(false),
    [deleteId, setDeleteId] = useState(""),
    [savedPresets, setSavedPresets] = useState<Record<string, number[]>>({}),
    [presetName, setPresetName] = useState(""),
    [markerText, setMarkerText] = useState(""),
    [unit, setUnit] = useState("bp"),
    [drag, setDrag] = useState<{
      start: { x: number; y: number };
      end: { x: number; y: number };
      id?: string;
      mode?: "move" | "resize" | "feature";
    } | null>(null),
    [pixels, setPixels] = useState<Uint8ClampedArray | null>(null);
  const history = useRef<Project[]>([]),
    input = useRef<HTMLInputElement>(null),
    svg = useRef<SVGSVGElement>(null),
    current = useRef(p),
    saveChain = useRef(Promise.resolve());
  current.current = p;
  const lane = p?.lanes.find((l) => l.id === selected),
    feature = lane?.features.find((f) => f.id === featureId),
    cal = p ? calibration(p) : null;
  const refresh = () =>
    listProjects()
      .then(setProjects)
      .catch(() => setError("Could not read local projects."));
  useEffect(() => {
    refresh();
    presets()
      .then(setSavedPresets)
      .catch(() => setError("Could not read local ladder presets."));
  }, []);
  const persist = (snapshot: Project) => {
    const next = {
      ...snapshot,
      savedAt: new Date().toISOString(),
      results: snapshot.lanes.map((l) => ({
        laneId: l.id,
        comparison: laneComparison(snapshot, l),
        features: l.features.map((f) => ({
          featureId: f.id,
          ...sizeFeature(snapshot, l, f),
        })),
      })),
    };
    const pending = saveChain.current
      .catch(() => {})
      .then(() => saveProject(next));
    saveChain.current = pending;
    return pending.then(() => {
      if (current.current?.id === next.id) setSaved(next.revision);
      return next;
    });
  };
  useEffect(() => {
    if (!native) return;
    const win = getCurrentWindow();
    const listener = win.onCloseRequested(async (event) => {
      event.preventDefault();
      try {
        if (current.current) await persist(current.current);
        await win.destroy();
      } catch {
        setError(
          "Could not save before closing. Keep the app open and try Save again.",
        );
      }
    });
    return () => {
      listener.then((fn) => fn());
    };
  }, []);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (current.current && saved !== current.current.revision) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saved]);
  useEffect(() => {
    if (!p) return;
    const t = setTimeout(() => {
      persist(p).catch(() =>
        setError("Save failed. Keep this window open and try Save again."),
      );
    }, 650);
    return () => clearTimeout(t);
  }, [p]);
  useEffect(() => {
    if (!p) {
      setPixels(null);
      return;
    }
    let cancelled = false;
    decode(p.image.dataUrl)
      .then((img) => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        if (!cancelled)
          setPixels(ctx.getImageData(0, 0, img.width, img.height).data);
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [p?.image.dataUrl]);
  const edit = (fn: (next: Project) => void) => {
    if (!p) return;
    const next = structuredClone(p);
    fn(next);
    next.revision = p.revision + 1;
    history.current.push(p);
    if (history.current.length > 50) history.current.shift();
    setP(next);
  };
  const editLane = (fn: (l: Lane, next: Project) => void) =>
    edit((next) => {
      const l = next.lanes.find((l) => l.id === selected);
      if (l) {
        fn(l, next);
        l.reviewed = false;
        if (l.type === "ladder") next.ladderReviewed = false;
      }
    });
  const editFeature = (fn: (f: Feature) => void) =>
    editLane((l) => {
      const f = l.features.find((f) => f.id === featureId);
      if (f) fn(f);
    });
  const undo = () => {
    const previous = history.current.pop();
    if (previous && p) setP({ ...previous, revision: p.revision + 1 });
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "z" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const open = (next: Project) => {
    setP(next);
    history.current = [];
    setSelected(next.lanes[1]?.id || next.lanes[0]?.id || "");
    setFeatureId("");
    setSaved(next.revision === 0 ? -1 : next.revision);
    setTool("select");
    setZoom(1);
    setMarkerText(next.markerSizes.join(", "));
  };
  const importImage = async (file?: File) => {
    if (!file) return;
    try {
      if (p) await persist(p);
      open(await projectFromFile(file));
      setStatus("Original image preserved. Draw your first lane to begin.");
    } catch (e) {
      setError(String(e));
    }
    if (input.current) input.current.value = "";
  };
  const close = async () => {
    try {
      if (p) await persist(p);
      setP(null);
      refresh();
    } catch {
      setError("Save failed. Project kept open.");
    }
  };
  const raw =
    p && lane && pixels
      ? profile(pixels, p.image.width, p.image.height, lane, vertical(p))
      : [];
  const addSuggestions = () => {
    if (!lane || !p) return;
    const start = Math.floor(vertical(p) ? lane.y : lane.x),
      positions = suggest(raw, p.polarity, p.detector).map((i) => i + start);
    editLane((l) => {
      const reviewed = l.features.filter((f) => f.review === "reviewed");
      l.features = [
        ...reviewed,
        ...positions
          .filter((pos) =>
            reviewed.every(
              (f) =>
                Math.abs(f.position - pos) >= p.detector.separation &&
                (f.kind !== "region" ||
                  pos < f.position ||
                  pos > (f.end ?? f.position)),
            ),
          )
          .map((position) => ({
            id: uid(),
            kind: "band" as const,
            position,
            review: "proposed" as const,
            note: "",
            ambiguous: false,
          })),
      ].sort((a, b) => a.position - b.position);
    });
    setStatus(
      positions.length
        ? `${positions.length} candidate peaks. Review each marker; accepted observations are preserved.`
        : "No peaks suggested. This does not establish that DNA is absent.",
    );
  };
  const point = (e: React.PointerEvent) => {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.current!.getScreenCTM()!.inverse(),
    );
    return {
      x: Math.max(0, Math.min(p!.image.width, pt.x)),
      y: Math.max(0, Math.min(p!.image.height, pt.y)),
    };
  };
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!p || e.button !== 0) return;
    const pt = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "reference") {
      edit((n) => {
        n.reference = vertical(n) ? pt.y : pt.x;
        n.ladderReviewed = false;
      });
      return;
    }
    if (tool === "band") {
      if (lane) {
        const pos = vertical(p) ? pt.y : pt.x;
        const start = vertical(p) ? lane.y : lane.x,
          end = start + (vertical(p) ? lane.height : lane.width);
        if (pos < start || pos > end) {
          setStatus("Click within the selected lane’s migration range.");
          return;
        }
        const id = uid();
        editLane((l) =>
          l.features.push({
            id,
            kind: "band",
            position: pos,
            review: "proposed",
            note: "",
            ambiguous: false,
          }),
        );
        setFeatureId(id);
      } else setStatus("Select or draw a lane first.");
      return;
    }
    if (tool === "lane" || tool === "region" || tool === "crop")
      setDrag({ start: pt, end: pt });
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag || !p) return;
    const end = point(e),
      dx = end.x - drag.start.x,
      dy = end.y - drag.start.y;
    const r = {
      x: Math.min(drag.start.x, end.x),
      y: Math.min(drag.start.y, end.y),
      width: Math.abs(dx),
      height: Math.abs(dy),
    };
    if (drag.mode && Math.abs(dx) + Math.abs(dy) < 0.5) {
      setDrag(null);
      return;
    }
    if (drag.mode === "feature" && lane) {
      const pos = vertical(p) ? end.y : end.x;
      editLane((l) => {
        const f = l.features.find((f) => f.id === drag.id);
        if (f) {
          const start = vertical(p) ? l.y : l.x,
            limit = start + (vertical(p) ? l.height : l.width),
            span = f.end === undefined ? 0 : f.end - f.position;
          f.position = Math.max(start, Math.min(limit - span, pos));
          if (f.end !== undefined) f.end = f.position + span;
          f.review = "proposed";
        }
      });
    } else if (drag.mode && lane) {
      editLane((l) => {
        if (drag.mode === "move") {
          const nx = Math.max(0, Math.min(p.image.width - l.width, l.x + dx)),
            ny = Math.max(0, Math.min(p.image.height - l.height, l.y + dy)),
            delta = vertical(p) ? ny - l.y : nx - l.x;
          l.features.forEach((f) => {
            f.position += delta;
            if (f.end !== undefined) f.end += delta;
            f.review = "proposed";
          });
          l.x = nx;
          l.y = ny;
        } else {
          l.width = Math.min(p.image.width - l.x, Math.max(12, end.x - l.x));
          l.height = Math.min(p.image.height - l.y, Math.max(12, end.y - l.y));
          const limit = vertical(p) ? l.y + l.height : l.x + l.width;
          l.features.forEach((f) => {
            f.position = Math.min(f.position, limit);
            if (f.end !== undefined) f.end = Math.min(f.end, limit);
            f.review = "proposed";
          });
        }
      });
    } else if (tool === "lane" && r.width > 10 && r.height > 10) {
      const l = newLane(r, p.lanes.length + 1);
      edit((n) => n.lanes.push(l));
      setSelected(l.id);
      setTool("select");
      setTab("lane");
    } else if (tool === "crop" && r.width > 10 && r.height > 10) {
      edit((n) => {
        n.view.crop = r;
      });
      setTool("select");
    } else if (tool === "region" && lane) {
      const start = vertical(p) ? lane.y : lane.x,
        limit = start + (vertical(p) ? lane.height : lane.width),
        a = Math.max(start, vertical(p) ? r.y : r.x),
        b = Math.min(limit, vertical(p) ? r.y + r.height : r.x + r.width);
      if (b > a) {
        const id = uid();
        editLane((l) =>
          l.features.push({
            id,
            kind: "region",
            position: a,
            end: b,
            review: "proposed",
            note: "",
            ambiguous: true,
          }),
        );
        setFeatureId(id);
      }
    }
    setDrag(null);
  };
  const exportResult = async (kind: "csv" | "png") => {
    if (!p) return;
    try {
      const snapshot = await persist(structuredClone(p));
      const bytes =
        kind === "csv"
          ? new TextEncoder().encode(csv(snapshot))
          : await annotatedPng(snapshot);
      const msg = await exportFile(
        `${snapshot.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_r${snapshot.revision}_${fullyReviewed(snapshot) ? "reviewed" : "draft"}.${kind}`,
        bytes,
      );
      setStatus(msg);
      setExports(false);
    } catch {
      setError("Export failed. Your project remains open; try saving again.");
    }
  };
  const numberField = (
    label: string,
    value: number | undefined,
    onChange: (n: number | undefined) => void,
  ) => (
    <label>
      {label}
      <input
        type="number"
        min="1"
        value={value ?? ""}
        placeholder="Optional"
        onChange={(e) =>
          onChange(
            e.target.value && Number(e.target.value) > 0
              ? Number(e.target.value)
              : undefined,
          )
        }
      />
    </label>
  );
  const crop = p?.view.crop || {
    x: 0,
    y: 0,
    width: p?.image.width || 1,
    height: p?.image.height || 1,
  };
  return (
    <div className="app">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => importImage(e.target.files?.[0])}
      />
      <header className="topbar">
        <button className="brand" onClick={close}>
          <span className="brand-icon">
            <ScanLine size={22} />
          </span>
          gel<span className="brand-light">notebook</span>
          <span className="version">EARLY BUILD</span>
        </button>
        <div className="top-right">
          <span className="local">
            <LockKeyhole size={13} />
            {native ? "Local workspace" : "Browser preview · local storage"}
          </span>
          <button
            className="icon-button"
            aria-label="Help and privacy"
            onClick={() => setHelp(true)}
          >
            <Info size={18} />
          </button>
        </div>
      </header>
      {!p ? (
        <main className="home">
          <div className="home-heading">
            <div className="eyebrow">YOUR LOCAL LAB NOTEBOOK</div>
            <h1>A clearer view of your gel.</h1>
            <p>
              From image to observations. Review your plasmid preparations,
              <br />
              mark what you see, and keep a record you can return to.
            </p>
          </div>
          <div className="start-grid">
            <button
              className="import-card"
              onClick={() => input.current?.click()}
            >
              <span className="large-icon">
                <ImagePlus size={28} />
              </span>
              <h2>Start with a gel image</h2>
              <p>Import a PNG or JPEG from your device.</p>
              <span className="primary faux">
                Open image <ArrowRight size={16} />
              </span>
              <small>Your original image stays intact.</small>
            </button>
            <div className="demo-card">
              <div className="mini-gel">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i}>
                    {[0, 1, 2, 3].map((j) => (
                      <i
                        key={j}
                        style={{
                          top: `${14 + j * 19 + (i % 3) * 5}%`,
                          opacity: 0.35 + ((i + j) % 3) * 0.2,
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div>
                <span className="eyebrow">TAKE A LOOK AROUND</span>
                <h2>A practice gel, ready to explore.</h2>
                <p>
                  Try lanes, band review, and sizing with a clearly labeled
                  synthetic example.
                </p>
                <button
                  className="text-button"
                  onClick={() =>
                    demo()
                      .then(open)
                      .catch((e) => setError(String(e)))
                  }
                >
                  Open example <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
          <section className="projects">
            <div className="section-heading">
              <h2>
                Local projects <span>{projects.length}</span>
              </h2>
              <span>Saved on this device</span>
            </div>
            {!projects.length ? (
              <div className="empty-projects">
                <FolderOpen size={23} />
                <p>Your saved gels will appear here.</p>
                <small>
                  Start a project and your edits will save automatically.
                </small>
              </div>
            ) : (
              projects.map((project) => (
                <div className="project-item" key={project.id}>
                  <button
                    onClick={() =>
                      loadProject(project.id)
                        .then(open)
                        .catch(() =>
                          setError(
                            "Could not open this project. Try its recovery copy.",
                          ),
                        )
                    }
                  >
                    <img src={project.image.dataUrl} />
                    <div>
                      <strong>{project.name}</strong>
                      <small>
                        {project.lanes.length} lanes · Revision{" "}
                        {project.revision} ·{" "}
                        {new Date(project.savedAt).toLocaleDateString()}
                      </small>
                    </div>
                    <ArrowRight size={18} />
                  </button>
                  <button
                    className="subtle"
                    onClick={() =>
                      recoverProject(project.id)
                        .then((v) =>
                          open({ ...v, revision: project.revision + 1 }),
                        )
                        .catch(() =>
                          setError("No usable recovery copy is available."),
                        )
                    }
                  >
                    Recover
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => setDeleteId(project.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </section>
          <footer>
            <LockKeyhole size={15} />
            <span>
              No account. No cloud workflow. Just your image and your
              observations.
            </span>
          </footer>
        </main>
      ) : (
        <>
          <div className="project-bar">
            <div className="project-title">
              <button
                className="icon-button"
                aria-label="Back to projects"
                onClick={close}
              >
                <ArrowLeft size={19} />
              </button>
              <div>
                <input
                  className="title-input"
                  aria-label="Project name"
                  value={p.name}
                  onChange={(e) =>
                    edit((n) => {
                      n.name = e.target.value;
                    })
                  }
                />
                <div className="project-meta">
                  {p.source === "synthetic" ? (
                    <span className="example-tag">SYNTHETIC EXAMPLE</span>
                  ) : (
                    <span>
                      {p.image.width} × {p.image.height} px
                    </span>
                  )}
                  <span className="dot" />
                  {saved === p.revision ? (
                    <>
                      <Check size={12} /> Saved locally
                    </>
                  ) : (
                    "Saving…"
                  )}
                  <span>· Revision {p.revision}</span>
                </div>
              </div>
            </div>
            <div className="project-actions">
              <button onClick={() => input.current?.click()}>
                <ImagePlus size={16} />
                Open image
              </button>
              <button
                onClick={() =>
                  persist(p)
                    .then(() => setStatus("Project saved locally."))
                    .catch(() => setError("Could not save project."))
                }
                title="Save project"
              >
                <Save size={16} />
              </button>
              <button className="primary" onClick={() => setExports(true)}>
                <Download size={16} />
                Export <ChevronDown size={14} />
              </button>
            </div>
          </div>
          <div className="workspace">
            <div className="left-workspace">
              <section className="gel-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">GEL WORKSPACE</span>
                    <span className="muted">
                      {p.lanes.length} lanes ·{" "}
                      {p.lanes.reduce((sum, l) => sum + l.features.length, 0)}{" "}
                      observations
                    </span>
                  </div>
                  <div className="zoom-controls">
                    <button
                      aria-label="Zoom out"
                      onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                    >
                      <ZoomOut size={15} />
                    </button>
                    <span>{Math.round(zoom * 100)}%</span>
                    <button
                      aria-label="Zoom in"
                      onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                    >
                      <ZoomIn size={15} />
                    </button>
                    <button
                      aria-label="Rotate view"
                      onClick={() =>
                        edit((n) => {
                          n.view.rotation = (n.view.rotation + 90) % 360;
                        })
                      }
                    >
                      <RotateCw size={15} />
                    </button>
                  </div>
                </div>
                <div className="tools">
                  {(
                    [
                      { id: "select", icon: MousePointer2, label: "Select" },
                      { id: "lane", icon: Square, label: "Draw lane" },
                      { id: "band", icon: ScanLine, label: "Add band" },
                      { id: "region", icon: Layers, label: "Region" },
                      { id: "reference", icon: ArrowRight, label: "Well line" },
                      { id: "crop", icon: Crop, label: "Crop view" },
                    ] as const
                  ).map((t) => (
                    <button
                      className={tool === t.id ? "active" : ""}
                      key={t.id}
                      onClick={() => setTool(t.id)}
                    >
                      <t.icon size={15} />
                      {t.label}
                    </button>
                  ))}
                  <span className="tool-divider" />
                  <button onClick={undo} disabled={!history.current.length}>
                    <Undo2 size={15} />
                    Undo
                  </button>
                </div>
                <div className="image-scroll">
                  <div
                    className="image-holder"
                    style={{
                      width: `${zoom * 100}%`,
                      minWidth: zoom > 1 ? `${zoom * 100}%` : undefined,
                      transform: `rotate(${p.view.rotation}deg)`,
                      margin: p.view.rotation % 180 ? "18% auto" : undefined,
                    }}
                  >
                    <svg
                      ref={svg}
                      viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`}
                      onPointerDown={down}
                      onPointerMove={(e) => {
                        if (drag) setDrag({ ...drag, end: point(e) });
                      }}
                      onPointerUp={up}
                      onPointerCancel={() => setDrag(null)}
                      className={`gel-image tool-${tool}`}
                      aria-label="Gel image with editable lane and band overlays"
                    >
                      <defs>
                        <filter id="contrast">
                          <feComponentTransfer>
                            <feFuncR
                              type="linear"
                              slope={p.view.contrast}
                              intercept={0.5 - 0.5 * p.view.contrast}
                            />
                            <feFuncG
                              type="linear"
                              slope={p.view.contrast}
                              intercept={0.5 - 0.5 * p.view.contrast}
                            />
                            <feFuncB
                              type="linear"
                              slope={p.view.contrast}
                              intercept={0.5 - 0.5 * p.view.contrast}
                            />
                          </feComponentTransfer>
                        </filter>
                      </defs>
                      <image
                        href={p.image.dataUrl}
                        width={p.image.width}
                        height={p.image.height}
                        filter="url(#contrast)"
                      />
                      <line
                        x1={vertical(p) ? 0 : p.reference}
                        y1={vertical(p) ? p.reference : 0}
                        x2={vertical(p) ? p.image.width : p.reference}
                        y2={vertical(p) ? p.reference : p.image.height}
                        stroke="#ccd3d0"
                        strokeDasharray="5 6"
                        opacity=".5"
                      />
                      {p.lanes.map((l, i) => (
                        <g
                          key={l.id}
                          style={{ color: colors[i % colors.length] }}
                        >
                          <rect
                            x={l.x}
                            y={l.y}
                            width={l.width}
                            height={l.height}
                            fill={
                              l.id === selected ? "currentColor" : "transparent"
                            }
                            fillOpacity=".07"
                            stroke="currentColor"
                            strokeWidth={l.id === selected ? 2.5 : 1}
                            strokeOpacity={l.id === selected ? 1 : 0.45}
                            onPointerDown={(e) => {
                              if (tool === "select") {
                                e.stopPropagation();
                                setSelected(l.id);
                                setFeatureId("");
                                svg.current?.setPointerCapture(e.pointerId);
                                setDrag({
                                  start: point(e),
                                  end: point(e),
                                  id: l.id,
                                  mode: "move",
                                });
                              }
                            }}
                          />
                          <text
                            x={l.x + l.width / 2}
                            y={l.y - 13}
                            fill="currentColor"
                            textAnchor="middle"
                            fontSize={Math.max(12, p.image.width / 75)}
                          >
                            {i === 0 && l.type === "ladder"
                              ? "M"
                              : String(i + 1).padStart(2, "0")}
                          </text>
                          {l.features.map((f, j) => (
                            <g
                              key={f.id}
                              onPointerDown={(e) => {
                                if (tool === "select") {
                                  e.stopPropagation();
                                  setSelected(l.id);
                                  setFeatureId(f.id);
                                  svg.current?.setPointerCapture(e.pointerId);
                                  setDrag({
                                    start: point(e),
                                    end: point(e),
                                    id: f.id,
                                    mode: "feature",
                                  });
                                }
                              }}
                            >
                              {f.kind === "region" && (
                                <rect
                                  x={vertical(p) ? l.x : f.position}
                                  y={vertical(p) ? f.position : l.y}
                                  width={
                                    vertical(p)
                                      ? l.width
                                      : (f.end ?? f.position) - f.position
                                  }
                                  height={
                                    vertical(p)
                                      ? (f.end ?? f.position) - f.position
                                      : l.height
                                  }
                                  fill="currentColor"
                                  opacity=".22"
                                />
                              )}
                              <line
                                x1={vertical(p) ? l.x : f.position}
                                x2={vertical(p) ? l.x + l.width : f.position}
                                y1={vertical(p) ? f.position : l.y}
                                y2={vertical(p) ? f.position : l.y + l.height}
                                stroke="currentColor"
                                strokeWidth={f.id === featureId ? 4 : 2}
                                strokeDasharray={
                                  f.review === "proposed" ? "4 4" : undefined
                                }
                              />
                              <line
                                x1={vertical(p) ? l.x : f.position}
                                x2={vertical(p) ? l.x + l.width : f.position}
                                y1={vertical(p) ? f.position : l.y}
                                y2={vertical(p) ? f.position : l.y + l.height}
                                stroke="transparent"
                                strokeWidth="14"
                              />
                              <text
                                x={
                                  vertical(p)
                                    ? l.x + l.width + 5
                                    : f.position + 5
                                }
                                y={vertical(p) ? f.position + 4 : l.y - 5}
                                fontSize={Math.max(10, p.image.width / 95)}
                                fill="currentColor"
                              >
                                {l.type === "ladder" && f.markerBp
                                  ? `${f.markerBp}`
                                  : `${f.kind === "band" ? "B" : "R"}${j + 1}`}
                              </text>
                            </g>
                          ))}
                          {l.id === selected && (
                            <rect
                              x={l.x + l.width - 5}
                              y={l.y + l.height - 5}
                              width="10"
                              height="10"
                              fill="currentColor"
                              onPointerDown={(e) => {
                                if (tool === "select") {
                                  e.stopPropagation();
                                  svg.current?.setPointerCapture(e.pointerId);
                                  setDrag({
                                    start: point(e),
                                    end: point(e),
                                    id: l.id,
                                    mode: "resize",
                                  });
                                }
                              }}
                            />
                          )}
                        </g>
                      ))}
                      {drag && !drag.mode && (
                        <rect
                          x={Math.min(drag.start.x, drag.end.x)}
                          y={Math.min(drag.start.y, drag.end.y)}
                          width={Math.abs(drag.start.x - drag.end.x)}
                          height={Math.abs(drag.start.y - drag.end.y)}
                          fill="#74d5bd22"
                          stroke="#a0e9d4"
                          strokeDasharray="4 4"
                        />
                      )}
                    </svg>
                  </div>
                </div>
                <div className="image-caption">
                  <span>
                    <span className="legend-line" />
                    Reviewed <span className="legend-line dashed" />
                    Proposed
                  </span>
                  <span>
                    {tool === "lane"
                      ? "Drag a rectangle around a lane."
                      : tool === "band"
                        ? "Click to add a band in the selected lane."
                        : tool === "region"
                          ? "Drag along the selected lane to mark an unresolved region."
                          : tool === "reference"
                            ? "Click to set the common well / reference line."
                            : tool === "crop"
                              ? "Drag to crop the view. The original stays intact."
                              : "Select a lane or band. Drag to move; use the corner to resize."}
                  </span>
                </div>
              </section>
              <section className="observations">
                <div className="section-heading">
                  <h2>
                    Observations{" "}
                    <span>
                      {p.lanes.reduce((s, l) => s + l.features.length, 0)}
                    </span>
                  </h2>
                  <div>
                    <span className="review-count">
                      {p.lanes.filter((l) => l.reviewed).length} /{" "}
                      {p.lanes.length} lanes reviewed
                    </span>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>LANE / SAMPLE</th>
                        <th>FEATURE</th>
                        <th>POSITION</th>
                        <th>APPROX. SIZE</th>
                        <th>REVIEW</th>
                        <th>NOTE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.lanes.flatMap((l, i) => [
                        <tr
                          key={l.id}
                          className={`lane-row ${selected === l.id && !featureId ? "selected-row" : ""}`}
                          onClick={() => {
                            setSelected(l.id);
                            setFeatureId("");
                          }}
                        >
                          <td>
                            <i
                              className="lane-dot"
                              style={{ background: colors[i % colors.length] }}
                            />
                            <strong>{l.label}</strong>
                          </td>
                          <td className="summary-cell">
                            {l.features.length} marked
                          </td>
                          <td>—</td>
                          <td title={laneComparison(p, l)}>
                            {l.type === "uncut"
                              ? "Uncut review"
                              : laneNames[l.type]}
                          </td>
                          <td>
                            <span
                              className={`badge ${l.reviewed ? "reviewed" : ""}`}
                            >
                              {l.reviewed ? "Reviewed" : "Draft"}
                            </span>
                          </td>
                          <td title={l.note}>
                            {l.note ||
                              (!l.features.length && l.reviewed
                                ? "No distinct band marked during review"
                                : "—")}
                          </td>
                        </tr>,
                        ...l.features.map((f, j) => {
                          const result = sizeFeature(p, l, f);
                          return (
                            <tr
                              key={f.id}
                              className={
                                featureId === f.id ? "selected-row" : ""
                              }
                              onClick={() => {
                                setSelected(l.id);
                                setFeatureId(f.id);
                              }}
                            >
                              <td className="indent">
                                {String(i + 1).padStart(2, "0")}
                              </td>
                              <td>
                                {f.kind === "band" ? "Band" : "Region"} {j + 1}
                              </td>
                              <td>{Math.round(migration(p, f.position))} px</td>
                              <td title={result.status}>
                                {l.type === "ladder" && f.markerBp
                                  ? `${f.markerBp.toLocaleString()} bp (reference)`
                                  : result.bp
                                    ? `≈ ${approximate(result.bp).toLocaleString()} bp`
                                    : l.type === "uncut"
                                      ? "Not applicable: uncut plasmid"
                                      : result.status}
                              </td>
                              <td>
                                <span
                                  className={`badge ${f.review === "reviewed" ? "reviewed" : ""}`}
                                >
                                  {f.review === "reviewed" ? (
                                    <Check size={11} />
                                  ) : (
                                    <span className="tiny-dot" />
                                  )}
                                  {f.review === "reviewed"
                                    ? "Reviewed"
                                    : "Proposed"}
                                </span>
                              </td>
                              <td title={f.note}>{f.note || "—"}</td>
                            </tr>
                          );
                        }),
                      ])}
                      {!p.lanes.length && (
                        <tr>
                          <td colSpan={6} className="table-empty">
                            Draw a lane on the image to start your review.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <aside className="inspector">
              <div className="inspector-tabs">
                {(["lane", "image", "ladder"] as const).map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t === "lane"
                      ? "Lane details"
                      : t === "image"
                        ? "Image"
                        : "Calibration"}
                  </button>
                ))}
              </div>
              {tab === "lane" ? (
                lane ? (
                  <>
                    <div className="inspector-heading">
                      <div>
                        <span className="eyebrow">SELECTED LANE</span>
                        <h2>{lane.label}</h2>
                      </div>
                      <span
                        className="lane-chip"
                        style={{
                          background:
                            colors[p.lanes.indexOf(lane) % colors.length] +
                            "28",
                          color: colors[p.lanes.indexOf(lane) % colors.length],
                        }}
                      >
                        {String(p.lanes.indexOf(lane) + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <label>
                      Sample label
                      <input
                        value={lane.label}
                        onChange={(e) =>
                          editLane((l) => {
                            l.label = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      Sample type
                      <select
                        value={lane.type}
                        onChange={(e) => {
                          if (
                            e.target.value === "ladder" &&
                            p.lanes.some(
                              (l) => l.id !== lane.id && l.type === "ladder",
                            )
                          ) {
                            setError(
                              "V1 supports one ladder lane. Change the existing ladder to another type first.",
                            );
                            return;
                          }
                          editLane((l, n) => {
                            l.type = e.target.value as Lane["type"];
                            l.confirmedLinear = false;
                            l.features.forEach((f) => {
                              delete f.markerBp;
                            });
                            n.ladderReviewed = false;
                          });
                        }}
                      >
                        {Object.entries(laneNames).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {lane.type === "uncut" ? (
                      <>
                        <div className="info-box">
                          <Info size={16} />
                          <p>
                            <strong>
                              Observe first. Interpret thoughtfully.
                            </strong>
                            Uncut plasmid forms migrate differently. Bands are
                            annotated without linear-ladder size estimates.
                          </p>
                        </div>
                        {numberField(
                          "Known length, entered by user (bp)",
                          lane.knownBp,
                          (v) =>
                            editLane((l) => {
                              l.knownBp = v;
                            }),
                        )}
                      </>
                    ) : lane.type === "ladder" ? (
                      <button
                        className="secondary full"
                        onClick={() => setTab("ladder")}
                      >
                        Review ladder mapping <ArrowRight size={15} />
                      </button>
                    ) : (
                      <>
                        {lane.type === "linearized" && (
                          <label className="check-label">
                            <input
                              type="checkbox"
                              checked={lane.confirmedLinear}
                              onChange={(e) =>
                                editLane((l) => {
                                  l.confirmedLinear = e.target.checked;
                                })
                              }
                            />
                            Confirmed full-length linear molecule from a single
                            cut (complete digestion)
                          </label>
                        )}
                        {numberField(
                          "Expected linear size (bp)",
                          lane.expectedBp,
                          (v) =>
                            editLane((l) => {
                              l.expectedBp = v;
                            }),
                        )}
                        <label>
                          Expected-size window (±%)
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={lane.windowPercent}
                            onChange={(e) =>
                              editLane((l) => {
                                l.windowPercent = Math.max(
                                  0,
                                  Math.min(100, Number(e.target.value)),
                                );
                              })
                            }
                          />
                        </label>
                        <small className="helper">
                          A selected comparison window, not a confidence
                          interval. Size agreement does not identify a sequence.
                        </small>
                      </>
                    )}
                    <div className="lane-summary">
                      {laneComparison(p, lane)}
                    </div>
                    <label>
                      Lane notes
                      <textarea
                        placeholder="What do you observe?"
                        value={lane.note}
                        onChange={(e) =>
                          editLane((l) => {
                            l.note = e.target.value;
                          })
                        }
                      />
                    </label>
                    <div className="button-row">
                      <button
                        onClick={() => {
                          const l = {
                            ...structuredClone(lane),
                            id: uid(),
                            label: `${lane.label} copy`,
                            features: [],
                            reviewed: false,
                            type:
                              lane.type === "ladder"
                                ? ("uncut" as const)
                                : lane.type,
                            x: Math.min(
                              p.image.width - lane.width,
                              lane.x + lane.width + 12,
                            ),
                          };
                          edit((n) => n.lanes.push(l));
                          setSelected(l.id);
                          setFeatureId("");
                        }}
                      >
                        <Copy size={14} />
                        Duplicate lane
                      </button>
                      <button
                        aria-label="Delete selected lane"
                        onClick={() => {
                          edit((n) => {
                            n.lanes = n.lanes.filter((l) => l.id !== selected);
                            n.ladderReviewed = false;
                          });
                          setSelected("");
                          setFeatureId("");
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <section className="profile-section">
                      <div className="section-heading">
                        <h3>Image brightness</h3>
                        <span>0–255</span>
                      </div>
                      <svg
                        viewBox="0 0 300 110"
                        className="profile"
                        aria-label="Raw image brightness profile"
                      >
                        <path
                          d="M0 95H300 M0 50H300 M0 5H300"
                          stroke="#e8e9e3"
                          fill="none"
                        />
                        {raw.length > 0 && (
                          <>
                            <path
                              d={`M0 100 ${raw.map((v, i) => `L${(i / (raw.length - 1)) * 300} ${100 - (v / 255) * 90}`).join(" ")} L300 100Z`}
                              fill="#dceae3"
                            />
                            <polyline
                              points={raw
                                .map(
                                  (v, i) =>
                                    `${(i / (raw.length - 1)) * 300},${100 - (v / 255) * 90}`,
                                )
                                .join(" ")}
                              fill="none"
                              stroke="#377d67"
                              strokeWidth="1.5"
                            />
                            {lane.features.map((f) => (
                              <line
                                key={f.id}
                                x1={
                                  ((f.position -
                                    Math.floor(vertical(p) ? lane.y : lane.x)) /
                                    raw.length) *
                                  300
                                }
                                x2={
                                  ((f.position -
                                    Math.floor(vertical(p) ? lane.y : lane.x)) /
                                    raw.length) *
                                  300
                                }
                                y1="2"
                                y2="100"
                                stroke={
                                  f.id === featureId ? "#c58d37" : "#579680"
                                }
                                strokeWidth={f.id === featureId ? 2 : 1}
                                strokeDasharray={
                                  f.review === "proposed" ? "3 3" : undefined
                                }
                              />
                            ))}
                          </>
                        )}
                      </svg>
                      <div className="profile-axis">
                        <span>Lane start</span>
                        <span>Image position →</span>
                        <span>Lane end</span>
                      </div>
                      <button
                        className="secondary full"
                        onClick={addSuggestions}
                        disabled={!pixels}
                      >
                        <Sparkles size={15} />
                        Suggest bands
                      </button>
                      <small className="helper">
                        Local peak suggestions. Brightness is not DNA quantity.
                      </small>
                    </section>
                    {feature && (
                      <section className="feature-editor">
                        <div className="section-heading">
                          <h3>
                            {feature.kind === "band" ? "Band" : "Region"}{" "}
                            {lane.features.indexOf(feature) + 1}
                          </h3>
                          <button
                            className="icon-button"
                            aria-label="Remove selected feature"
                            onClick={() => {
                              editLane((l) => {
                                l.features = l.features.filter(
                                  (f) => f.id !== featureId,
                                );
                              });
                              setFeatureId("");
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <label>
                          Original image position (px)
                          <input
                            type="number"
                            value={Math.round(feature.position * 10) / 10}
                            min={vertical(p) ? lane.y : lane.x}
                            max={
                              vertical(p)
                                ? lane.y + lane.height
                                : lane.x + lane.width
                            }
                            onChange={(e) =>
                              editFeature((f) => {
                                const low = vertical(p) ? lane.y : lane.x,
                                  high =
                                    low +
                                    (vertical(p) ? lane.height : lane.width),
                                  span =
                                    f.end === undefined
                                      ? 0
                                      : f.end - f.position;
                                f.position = Math.max(
                                  low,
                                  Math.min(high - span, Number(e.target.value)),
                                );
                                if (f.end !== undefined)
                                  f.end = f.position + span;
                                f.review = "proposed";
                              })
                            }
                          />
                        </label>
                        <div className="lane-summary">
                          {sizeFeature(p, lane, feature).bp !== undefined
                            ? `Approximately ${approximate(sizeFeature(p, lane, feature).bp!)} bp`
                            : sizeFeature(p, lane, feature).status}
                          {sizeFeature(p, lane, feature).comparison && (
                            <small>
                              {sizeFeature(p, lane, feature).comparison}
                            </small>
                          )}
                        </div>
                        <label>
                          Feature note
                          <textarea
                            value={feature.note}
                            onChange={(e) =>
                              editFeature((f) => {
                                f.note = e.target.value;
                              })
                            }
                            placeholder="e.g. faint band; user interpretation"
                          />
                        </label>
                        {feature.kind === "band" && (
                          <label className="check-label">
                            <input
                              type="checkbox"
                              checked={feature.ambiguous}
                              onChange={(e) =>
                                editFeature((f) => {
                                  f.ambiguous = e.target.checked;
                                  f.review = "proposed";
                                })
                              }
                            />
                            Ambiguous / clipped / overlapping — withhold sizing
                          </label>
                        )}
                        <button
                          className="secondary full"
                          onClick={() =>
                            editFeature((f) => {
                              f.review =
                                f.review === "reviewed"
                                  ? "proposed"
                                  : "reviewed";
                            })
                          }
                        >
                          <Check size={15} />
                          {feature.review === "reviewed"
                            ? "Return to proposed"
                            : "Mark feature reviewed"}
                        </button>
                      </section>
                    )}
                    <button
                      className="primary full review-lane"
                      onClick={() =>
                        edit((n) => {
                          const l = n.lanes.find((l) => l.id === selected)!;
                          l.reviewed = true;
                          l.features.forEach((f) => {
                            f.review = "reviewed";
                          });
                        })
                      }
                    >
                      <CheckCheck size={16} />
                      Mark lane & observations reviewed
                    </button>
                    <small className="helper">
                      Review includes empty lanes and unresolved regions.
                    </small>
                  </>
                ) : (
                  <div className="inspector-empty">
                    <Square size={28} />
                    <h3>Select a lane</h3>
                    <p>
                      Draw a rectangle around a lane, then add bands and review
                      your observations.
                    </p>
                    <button
                      className="secondary"
                      onClick={() => setTool("lane")}
                    >
                      <Plus size={15} />
                      Draw lane
                    </button>
                  </div>
                )
              ) : tab === "image" ? (
                <>
                  <div className="inspector-heading">
                    <div>
                      <span className="eyebrow">IMAGE & GEOMETRY</span>
                      <h2>Analysis settings</h2>
                    </div>
                    <Settings2 size={20} />
                  </div>
                  <label>
                    Image source
                    <select
                      value={p.source}
                      onChange={(e) =>
                        edit((n) => {
                          n.source = e.target.value as Project["source"];
                          n.geometryConfirmed = false;
                          n.ladderReviewed = false;
                        })
                      }
                    >
                      <option value="instrument">Instrument export</option>
                      <option value="gel-photo">Photograph of gel</option>
                      <option value="screen-photo">
                        Photograph of display
                      </option>
                      {p.source === "synthetic" && (
                        <option value="synthetic">Synthetic example</option>
                      )}
                    </select>
                  </label>
                  <label>
                    Band appearance
                    <select
                      value={p.polarity}
                      onChange={(e) =>
                        edit((n) => {
                          n.polarity = e.target.value as Project["polarity"];
                        })
                      }
                    >
                      <option value="bright">
                        Bright bands on dark background
                      </option>
                      <option value="dark">
                        Dark bands on bright background
                      </option>
                    </select>
                  </label>
                  <label>
                    Migration direction (original image)
                    <select
                      value={p.direction}
                      onChange={(e) =>
                        edit((n) => {
                          const wasVertical = vertical(n);
                          n.direction = e.target.value as Project["direction"];
                          n.ladderReviewed = false;
                          n.geometryConfirmed = false;
                          n.lanes.forEach((l) => {
                            l.reviewed = false;
                            l.features.forEach((f) => {
                              f.review = "proposed";
                              if (wasVertical !== vertical(n))
                                f.ambiguous = true;
                            });
                          });
                        })
                      }
                    >
                      <option value="down">Top → bottom</option>
                      <option value="up">Bottom → top</option>
                      <option value="right">Left → right</option>
                      <option value="left">Right → left</option>
                    </select>
                  </label>
                  <label>
                    Common well / reference line (px)
                    <input
                      type="number"
                      min="0"
                      max={vertical(p) ? p.image.height : p.image.width}
                      value={p.reference}
                      onChange={(e) =>
                        edit((n) => {
                          n.reference = Math.max(
                            0,
                            Math.min(
                              vertical(n) ? n.image.height : n.image.width,
                              Number(e.target.value),
                            ),
                          );
                          n.ladderReviewed = false;
                        })
                      }
                    />
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={p.geometryConfirmed}
                      onChange={(e) =>
                        edit((n) => {
                          n.geometryConfirmed = e.target.checked;
                          n.ladderReviewed = false;
                        })
                      }
                    />
                    Straight, parallel migration and common alignment confirmed
                    suitable for sizing
                  </label>
                  <div className="info-box">
                    <Info size={15} />
                    <p>
                      Uncertain geometry, glare, skew or curved migration? Leave
                      sizing off and continue annotating.
                    </p>
                  </div>
                  <label>
                    Display contrast <span>{p.view.contrast.toFixed(2)}×</span>
                    <input
                      type="range"
                      min="0.5"
                      max="3"
                      step=".05"
                      value={p.view.contrast}
                      onChange={(e) =>
                        edit((n) => {
                          n.view.contrast = Number(e.target.value);
                        })
                      }
                    />
                  </label>
                  <small className="helper">
                    Display only. Analysis pixels and band coordinates stay
                    unchanged.
                  </small>
                  <button
                    className="secondary full"
                    onClick={() =>
                      edit((n) => {
                        n.view = { rotation: 0, contrast: 1, crop: null };
                      })
                    }
                  >
                    Reset display adjustments
                  </button>
                  <h3 className="settings-subtitle">
                    Band suggestion settings
                  </h3>
                  {[
                    ["smoothing", "Smoothing radius (px)", 0, 10],
                    ["prominence", "Minimum prominence (brightness)", 1, 100],
                    ["separation", "Minimum separation (px)", 3, 100],
                  ].map(([key, label, min, max]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="number"
                        min={min}
                        max={max}
                        value={p.detector[key as keyof Project["detector"]]}
                        onChange={(e) =>
                          edit((n) => {
                            n.detector[key as keyof Project["detector"]] =
                              Math.round(
                                Math.max(
                                  Number(min),
                                  Math.min(Number(max), Number(e.target.value)),
                                ),
                              );
                          })
                        }
                      />
                    </label>
                  ))}
                  <small className="helper">
                    Settings apply when you run Suggest bands. Reviewed
                    observations are preserved.
                  </small>
                </>
              ) : (
                <>
                  <div className="inspector-heading">
                    <div>
                      <span className="eyebrow">LINEAR DNA ONLY</span>
                      <h2>Ladder calibration</h2>
                    </div>
                    <Layers size={20} />
                  </div>
                  <div className={`cal-status ${cal?.valid ? "valid" : ""}`}>
                    <span className="tiny-dot" />
                    {cal?.reason}
                  </div>
                  <p className="helper">
                    Use the ladder run on this gel. Assign visible markers to
                    actual sizes; missing markers can stay unassigned.
                  </p>
                  <label>
                    Local ladder preset
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          const sizes = savedPresets[e.target.value];
                          setMarkerText(sizes.join(", "));
                          setUnit("bp");
                          edit((n) => {
                            n.markerSizes = sizes;
                            n.ladderReviewed = false;
                          });
                        }
                      }}
                    >
                      <option value="">Choose a saved preset…</option>
                      {Object.keys(savedPresets).map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Actual marker sizes
                    <textarea
                      value={markerText}
                      onChange={(e) => setMarkerText(e.target.value)}
                      placeholder="10000, 6000, 3000, 1500, 750, 250"
                    />
                  </label>
                  <div className="button-row">
                    <select
                      aria-label="Ladder size unit"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    >
                      <option>bp</option>
                      <option>kb</option>
                    </select>
                    <button
                      className="secondary"
                      onClick={() => {
                        const values = markerText
                          .trim()
                          .split(/[\s,;]+/)
                          .map(Number)
                          .map((n) => n * (unit === "kb" ? 1000 : 1));
                        if (
                          !values.length ||
                          values.some((n) => !Number.isFinite(n) || n <= 0) ||
                          new Set(values).size !== values.length
                        ) {
                          setError(
                            "Enter distinct positive marker sizes, separated by commas or spaces.",
                          );
                          return;
                        }
                        edit((n) => {
                          n.markerSizes = values.sort((a, b) => b - a);
                          n.ladderReviewed = false;
                          n.lanes
                            .filter((l) => l.type === "ladder")
                            .forEach((l) =>
                              l.features.forEach((f) => {
                                if (f.markerBp && !values.includes(f.markerBp))
                                  delete f.markerBp;
                              }),
                            );
                        });
                        setStatus(
                          "Marker list updated. Pair sizes with visible ladder bands below.",
                        );
                      }}
                    >
                      Use sizes
                    </button>
                  </div>
                  <div className="preset-save">
                    <input
                      placeholder="Preset name"
                      aria-label="Preset name"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                    />
                    <button
                      disabled={!presetName.trim() || !p.markerSizes.length}
                      onClick={async () => {
                        const next = {
                          ...savedPresets,
                          [presetName.trim()]: p.markerSizes,
                        };
                        try {
                          await savePresets(next);
                          setSavedPresets(next);
                          setStatus("Ladder preset saved locally.");
                        } catch {
                          setError("Could not save ladder preset.");
                        }
                      }}
                    >
                      <Save size={15} />
                    </button>
                  </div>
                  {!p.lanes.some((l) => l.type === "ladder") ? (
                    <div className="info-box">
                      <Info size={16} />
                      <p>
                        Select a lane and set its sample type to DNA ladder to
                        map its bands.
                      </p>
                    </div>
                  ) : (
                    p.lanes
                      .filter((l) => l.type === "ladder")
                      .map((l) => (
                        <section key={l.id} className="mapping">
                          <div className="section-heading">
                            <h3>{l.label}</h3>
                            <button
                              className="text-button"
                              onClick={() => {
                                setSelected(l.id);
                                setTool("band");
                              }}
                            >
                              Add anchor
                            </button>
                          </div>
                          {l.features
                            .filter((f) => f.kind === "band")
                            .map((f, i) => (
                              <div className="mapping-row" key={f.id}>
                                <button
                                  onClick={() => {
                                    setSelected(l.id);
                                    setFeatureId(f.id);
                                    setTab("lane");
                                  }}
                                >
                                  B{i + 1}{" "}
                                  <small>
                                    {Math.round(migration(p, f.position))} px
                                  </small>
                                </button>
                                <select
                                  aria-label={`Marker size for ladder band ${i + 1}`}
                                  value={f.markerBp ?? ""}
                                  onChange={(e) =>
                                    edit((n) => {
                                      const a = n.lanes
                                        .find((a) => a.id === l.id)!
                                        .features.find((a) => a.id === f.id)!;
                                      a.markerBp = e.target.value
                                        ? Number(e.target.value)
                                        : undefined;
                                      a.review = "proposed";
                                      n.ladderReviewed = false;
                                    })
                                  }
                                >
                                  <option value="">Unassigned</option>
                                  {p.markerSizes.map((bp) => (
                                    <option key={bp} value={bp}>
                                      {bp} bp
                                    </option>
                                  ))}
                                </select>
                                <input
                                  aria-label={`Review ladder band ${i + 1}`}
                                  type="checkbox"
                                  checked={f.review === "reviewed"}
                                  onChange={(e) =>
                                    edit((n) => {
                                      n.lanes
                                        .find((a) => a.id === l.id)!
                                        .features.find(
                                          (a) => a.id === f.id,
                                        )!.review = e.target.checked
                                        ? "reviewed"
                                        : "proposed";
                                      n.ladderReviewed = false;
                                    })
                                  }
                                />
                              </div>
                            ))}
                        </section>
                      ))
                  )}
                  {cal && cal.anchors.length > 0 && (
                    <div className="cal-plot">
                      <svg
                        viewBox="0 0 280 90"
                        aria-label="Calibration points: migration pixels versus log10 base pairs"
                      >
                        <path d="M20 5V72H270" fill="none" stroke="#c8cfc7" />
                        {cal.anchors.map((a, i, arr) => {
                          const x =
                              25 +
                              ((a.d - arr[0].d) /
                                Math.max(1, arr[arr.length - 1].d - arr[0].d)) *
                                235,
                            y =
                              67 -
                              ((Math.log10(a.bp) -
                                Math.log10(arr[arr.length - 1].bp)) /
                                Math.max(
                                  0.001,
                                  Math.log10(arr[0].bp) -
                                    Math.log10(arr[arr.length - 1].bp),
                                )) *
                                55;
                          return (
                            <circle
                              key={i}
                              cx={x}
                              cy={y}
                              r="4"
                              fill="#32775f"
                            />
                          );
                        })}
                      </svg>
                      <small>
                        log₁₀(bp) vs migration · {Math.round(cal.anchors[0].d)}–
                        {Math.round(cal.anchors.at(-1)!.d)} px
                      </small>
                    </div>
                  )}
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={p.ladderReviewed}
                      onChange={(e) =>
                        edit((n) => {
                          n.ladderReviewed = e.target.checked;
                        })
                      }
                    />
                    I reviewed the size assignments and confirm this ladder was
                    run on this gel.
                  </label>
                  <div className="info-box">
                    <Info size={16} />
                    <p>
                      At least four reviewed, distinct, ordered anchors are
                      required. No sizing outside the calibrated interval.
                    </p>
                  </div>
                </>
              )}
            </aside>
          </div>
          <div className="bottom-bar">
            <span>
              <LockKeyhole size={12} />
              {native
                ? "Local project storage"
                : "Preview data is stored in this browser"}{" "}
              · Original preserved
            </span>
            <span>
              {fullyReviewed(p) ? "Reviewed analysis" : "Draft analysis"}
              <span className="dot" />
              V0.1 · Validation build
            </span>
          </div>
        </>
      )}
      {status && (
        <div className="toast" role="status">
          <Check size={17} />
          {status}
          <button
            className="icon-button"
            aria-label="Dismiss status"
            onClick={() => setStatus("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {error && (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" aria-modal="true">
            <h2>Something needs attention</h2>
            <p>{error}</p>
            <button className="primary" onClick={() => setError("")}>
              Got it
            </button>
          </div>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="About Gel Notebook"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="brand-icon">
              <Microscope size={24} />
            </span>
            <h2>A local notebook for your gel.</h2>
            <p>
              Open an image, draw lanes, choose sample types, add or suggest
              bands, then review your observations. Select a table row to edit
              its feature.
            </p>
            <p>
              Uncut plasmids receive annotations only. PCR and confirmed
              full-length linearized plasmids can be sized with a reviewed
              same-gel ladder. Brightness is never reported as DNA quantity.
            </p>
            <h3>Privacy & storage</h3>
            <p>
              {native
                ? "Projects, originals, presets and recovery copies are kept in the app’s local data folder. Exports default to its Exports folder."
                : "This is a development browser preview. Projects use browser storage and exports use browser downloads. Use the packaged app for the intended local-folder workflow."}
            </p>
            <p>
              The application has no upload, analytics, account or update
              integration. Packaged network-observation and fresh offline
              installation checks are still required before making the verified
              privacy claim.
            </p>
            <p>
              Device backups and separately copied exports are outside the app’s
              control. Local storage is not additional encryption. Deleting a
              project removes app-managed copies, not separate exports or
              backups.
            </p>
            <small>
              Early build. Representative-image and numerical-accuracy
              validation is pending.
            </small>
          </div>
        </div>
      )}
      {exports && p && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Export analysis"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close export"
              onClick={() => setExports(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">SAVE A LOCAL COPY</span>
            <h2>Export your observations.</h2>
            <p>
              Both exports use the current saved revision. Your original image
              stays with the editable project.
            </p>
            <div className="export-state">
              <span className={`badge ${fullyReviewed(p) ? "reviewed" : ""}`}>
                {fullyReviewed(p) ? "Reviewed" : "Draft"}
              </span>
              <p>
                {fullyReviewed(p)
                  ? "All lanes and observations are marked reviewed."
                  : "Some lanes or observations still need review. Exports are marked draft."}
              </p>
            </div>
            <button
              className="export-option"
              onClick={() => exportResult("png")}
            >
              <ImagePlus size={22} />
              <div>
                <strong>Annotated PNG</strong>
                <small>
                  Original orientation, labels and interpretation legend
                </small>
              </div>
              <Download size={18} />
            </button>
            <button
              className="export-option"
              onClick={() => exportResult("csv")}
            >
              <Layers size={22} />
              <div>
                <strong>Excel-compatible CSV</strong>
                <small>Lane summaries, observations, status and notes</small>
              </div>
              <Download size={18} />
            </button>
          </div>
        </div>
      )}
      {deleteId && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Delete this local project?</h2>
            <p>
              This removes the saved project, its original image and recovery
              copy. Separate exports and device backups are not deleted.
            </p>
            <div className="button-row">
              <button onClick={() => setDeleteId("")}>Cancel</button>
              <button
                className="danger"
                onClick={() =>
                  deleteProject(deleteId)
                    .then(() => {
                      setDeleteId("");
                      refresh();
                    })
                    .catch(() => setError("Project could not be deleted."))
                }
              >
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
