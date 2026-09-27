import {
  Project,
  newLane,
  uid,
  sizeFeature,
  approximate,
  fullyReviewed,
  vertical,
} from "./model";
export async function decode(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () =>
      reject(Error("Could not decode image. Use a PNG or JPEG."));
    i.src = url;
  });
}
export async function projectFromFile(file: File): Promise<Project> {
  if (!["image/png", "image/jpeg"].includes(file.type))
    throw Error("Please select a PNG or JPEG image.");
  if (file.size > 30 * 1024 * 1024)
    throw Error("The first build supports images up to 30 MB.");
  const bytes = await file.arrayBuffer();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(Error("Image could not be read"));
    r.readAsDataURL(file);
  });
  const image = await decode(dataUrl);
  if (image.width * image.height > 40_000_000)
    throw Error("Please use an image smaller than 40 megapixels.");
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return {
    schemaVersion: 1,
    appVersion: "0.1.0",
    id: uid(),
    name: file.name.replace(/\.[^.]+$/, ""),
    revision: 0,
    savedAt: "",
    image: {
      dataUrl,
      width: image.width,
      height: image.height,
      fingerprint: Array.from(new Uint8Array(hash))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join(""),
      filename: file.name,
    },
    source: "instrument",
    polarity: "bright",
    geometryConfirmed: false,
    direction: "down",
    reference: 0,
    view: { rotation: 0, contrast: 1, crop: null },
    detector: { smoothing: 2, prominence: 12, separation: 12 },
    ladderReviewed: false,
    markerSizes: [],
    lanes: [],
  };
}
export async function demo(): Promise<Project> {
  const c = document.createElement("canvas");
  c.width = 1000;
  c.height = 600;
  const x = c.getContext("2d")!;
  x.fillStyle = "#101b20";
  x.fillRect(0, 0, c.width, c.height);
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const data = x.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const n = rand() * 9;
    data.data[i] += n;
    data.data[i + 1] += n;
    data.data[i + 2] += n;
  }
  x.putImageData(data, 0, 0);
  const positions = [
    [100, 150, 210, 280, 365, 460],
    [145, 304, 383],
    [146, 300, 387],
    [305, 388],
    [145, 303, 390],
    [330],
    [268],
    [170, 325, 421],
  ];
  positions.forEach((ys, i) => {
    const cx = 87 + i * 117;
    x.fillStyle = "#040b10";
    x.fillRect(cx - 30, 42, 60, 8);
    ys.forEach((y, j) => {
      x.save();
      x.shadowColor = "#d5edf2";
      x.shadowBlur = 12;
      x.fillStyle = `rgba(209,237,243,${i === 0 ? 0.6 : 0.4 + rand() * 0.5})`;
      x.fillRect(cx - 26, y - 3, 52, 6);
      x.restore();
      const g = x.createLinearGradient(0, y - 14, 0, y + 14);
      g.addColorStop(0, "#bbdbe500");
      g.addColorStop(0.5, "#bbdbe52a");
      g.addColorStop(1, "#bbdbe500");
      x.fillStyle = g;
      x.fillRect(cx - 29, y - 14, 58, 28);
    });
  });
  const blob = await new Promise<Blob>((r) =>
    c.toBlob((b) => r(b!), "image/png"),
  );
  const p = await projectFromFile(
    new File([blob], "Plasmid prep · example.png", { type: "image/png" }),
  );
  p.source = "synthetic";
  p.reference = 48;
  p.geometryConfirmed = true;
  p.markerSizes = [10000, 6000, 3000, 1500, 750, 250];
  p.lanes = positions.map((ys, i) => ({
    ...newLane({ x: 55 + i * 117, y: 65, width: 64, height: 455 }, i),
    label:
      i === 0
        ? "Ladder"
        : i === 5
          ? "PCR control"
          : `Prep ${String(i).padStart(2, "0")}`,
    type: i === 0 ? "ladder" : i === 5 ? "pcr" : "uncut",
    expectedBp: i === 5 ? 1000 : undefined,
    features: ys.map((y, j) => ({
      id: uid(),
      kind: "band",
      position: y,
      review: i === 0 ? "reviewed" : "proposed",
      note: "",
      ambiguous: false,
      markerBp: i === 0 ? p.markerSizes[j] : undefined,
    })),
    reviewed: i === 0,
  }));
  return p;
}
export async function annotatedPng(p: Project): Promise<Uint8Array> {
  const img = await decode(p.image.dataUrl),
    c = document.createElement("canvas");
  const w = Math.min(4000, Math.max(1200, p.image.width)),
    scale = w / p.image.width,
    h = Math.round(p.image.height * scale);
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = "14px sans-serif";
  const wrap = (text: string) => {
    const lines: string[] = [];
    let line = "";
    for (const ch of text) {
      if (ch === "\n" || measure.measureText(line + ch).width > w - 48) {
        lines.push(line);
        line = ch === "\n" ? "" : ch;
      } else line += ch;
    }
    lines.push(line);
    return lines;
  };
  const roster = p.lanes.flatMap((l, i) => {
    const details = l.features.map((f, j) => {
      const result = sizeFeature(p, l, f);
      const value =
        l.type === "ladder" && f.markerBp
          ? `${f.markerBp} bp (reference)`
          : result.bp !== undefined
            ? `≈${approximate(result.bp)} bp`
            : result.status;
      return `${f.kind === "band" ? "B" : "R"}${j + 1}: ${value} [${f.review}]${f.note ? ` — ${f.note}` : ""}`;
    });
    return [
      ...wrap(
        `L${i + 1}  ${l.label} · ${l.type === "uncut" ? "Uncut / unknown plasmid" : l.type} · ${l.reviewed ? "reviewed" : "draft"}${l.note ? ` · ${l.note}` : ""}`,
      ),
      ...details.flatMap((text) => wrap(`    ${text}`)),
      ...(details.length
        ? []
        : wrap(
            "    No distinct band marked" +
              (l.reviewed ? " during review" : "; review incomplete"),
          )),
      "",
    ];
  });
  const title = wrap(p.name);
  const header = 42 + title.length * 23,
    footer = 95;
  c.width = w;
  c.height = header + h + 24 + roster.length * 21 + footer;
  if (c.height > 30000)
    throw Error("Annotation export is too tall. Shorten notes or export CSV.");
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f5f4ef";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = "bold 20px sans-serif";
  ctx.fillStyle = "#162b28";
  title.forEach((line, i) => ctx.fillText(line, 22, 27 + i * 23));
  ctx.font = "13px sans-serif";
  ctx.fillText(
    `Revision ${p.revision} · ${fullyReviewed(p) ? "REVIEWED" : "DRAFT"} · Source: ${p.source} · Project ${p.id}`,
    22,
    header - 12,
  );
  ctx.save();
  ctx.filter = `contrast(${p.view.contrast})`;
  ctx.drawImage(img, 0, header, w, h);
  ctx.restore();
  p.lanes.forEach((l, i) => {
    ctx.strokeStyle = l.type === "ladder" ? "#efbd6a" : "#74d5bd";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      l.x * scale,
      l.y * scale + header,
      l.width * scale,
      l.height * scale,
    );
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(
      `L${i + 1}`,
      l.x * scale,
      Math.max(header + 14, l.y * scale + header - 6),
    );
    l.features.forEach((f, j) => {
      ctx.setLineDash(f.review === "proposed" ? [4, 4] : []);
      ctx.beginPath();
      if (vertical(p)) {
        ctx.moveTo(l.x * scale, f.position * scale + header);
        ctx.lineTo((l.x + l.width) * scale, f.position * scale + header);
      } else {
        ctx.moveTo(f.position * scale, l.y * scale + header);
        ctx.lineTo(f.position * scale, (l.y + l.height) * scale + header);
      }
      ctx.stroke();
      if (f.kind === "region" && f.end !== undefined) {
        ctx.globalAlpha = 0.2;
        ctx.fillRect(
          (vertical(p) ? l.x : f.position) * scale,
          (vertical(p) ? f.position : l.y) * scale + header,
          (vertical(p) ? l.width : f.end - f.position) * scale,
          (vertical(p) ? f.end - f.position : l.height) * scale,
        );
        ctx.globalAlpha = 1;
      }
      ctx.fillText(
        `${f.kind === "band" ? "B" : "R"}${j + 1}`,
        Math.min(
          w - 30,
          vertical(p) ? (l.x + l.width) * scale + 3 : f.position * scale + 3,
        ),
        vertical(p)
          ? f.position * scale + header + 4
          : l.y * scale + header - 4,
      );
    });
    ctx.setLineDash([]);
  });
  ctx.fillStyle = "#17372e";
  ctx.font = "14px sans-serif";
  roster.forEach((line, i) => ctx.fillText(line, 22, header + h + 25 + i * 21));
  ctx.fillStyle = "#4a605a";
  ctx.font = "12px sans-serif";
  [
    "Uncut plasmid: annotation only. Linear sizing: approximate; reviewed same-gel ladder required.",
    "Solid markers: reviewed. Dashed markers: proposed. Regions and ambiguous features are not sized.",
    `Display contrast: ${p.view.contrast.toFixed(2)}. Full original orientation; view crop/rotation saved in project. Export scale: ${scale.toFixed(3)}×.`,
    "Image brightness is not DNA quantity. Notes are user interpretations.",
  ].forEach((text, i) => ctx.fillText(text, 22, c.height - 73 + i * 18));
  const blob = await new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(Error("PNG export failed"))),
      "image/png",
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
