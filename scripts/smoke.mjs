import { chromium, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
const externalRequests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (/^https?:/.test(r.url()) && new URL(r.url()).hostname !== "127.0.0.1")
    externalRequests.push(r.url());
});
await mkdir(".local/qa", { recursive: true });
try {
  await page.goto(process.env.GEL_APP_URL || "http://127.0.0.1:1420", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "Open example" })
    .click({ timeout: 60000 });
  await expect(
    page.getByText("SYNTHETIC EXAMPLE", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".lane-row")).toHaveCount(8);
  await page
    .getByRole("button", { name: "Suggest bands", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("candidate peaks");
  await page.getByRole("button", { name: "Dismiss status" }).click();
  await page
    .getByRole("textbox", { name: "Lane notes", exact: true })
    .fill("Synthetic demonstration only. Review band positions manually.");
  await page
    .getByRole("button", { name: "Mark lane & observations reviewed" })
    .click();
  await expect(
    page
      .locator("td")
      .filter({ hasText: "Not applicable: uncut plasmid" })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved locally");
  await page.getByRole("button", { name: "Dismiss status" }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.locator(".inspector").evaluate((el) => {
    el.scrollTop = 0;
  });
  if (process.argv.includes("--screenshots"))
    await page.screenshot({
      path: "docs/assets/screenshots/synthetic-workspace.png",
    });
  await page.getByRole("button", { name: "Calibration", exact: true }).click();
  await page.getByLabel("I reviewed the size assignments").check();
  await expect(page.locator(".cal-status")).toHaveText("Reviewed calibration");
  await expect(page.locator(".project-meta")).toContainText("Saved locally");
  await page.locator(".inspector").evaluate((el) => {
    el.scrollTop = 0;
  });
  if (process.argv.includes("--screenshots"))
    await page.screenshot({
      path: "docs/assets/screenshots/synthetic-calibration.png",
    });
  await page.locator(".lane-row").filter({ hasText: "PCR control" }).click();
  await page.getByRole("button", { name: "Lane details", exact: true }).click();
  await page
    .getByRole("button", { name: "Mark lane & observations reviewed" })
    .click();
  await expect(
    page.locator("td").filter({ hasText: "≈ 1,000 bp" }),
  ).toBeVisible();
  await expect(page.locator(".lane-summary")).toContainText(
    "within the selected expected-size window",
  );
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.reload();
  await page.locator(".project-item > button").first().click();
  await expect(
    page.locator("td").filter({ hasText: "≈ 1,000 bp" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Lane notes", exact: true }),
  ).toHaveValue(
    "Synthetic demonstration only. Review band positions manually.",
  );
  // Draw and undo a new lane through the actual image interaction.
  const gel = page.getByLabel("Gel image with editable lane and band overlays");
  const box = await gel.boundingBox();
  await page.getByRole("button", { name: "Draw lane", exact: true }).click();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.93, box.y + box.height * 0.8);
  await page.mouse.up();
  await expect(page.locator(".lane-row")).toHaveCount(9);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".lane-row")).toHaveCount(8);
  for (const [name, extension] of [
    ["Excel-compatible CSV", "csv"],
    ["Annotated PNG", "png"],
  ]) {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: new RegExp(name) }).click();
    const file = await download;
    if (!file.suggestedFilename().includes("_draft."))
      throw Error("Export must disclose incomplete review");
    await file.saveAs(`.local/qa/synthetic-export.${extension}`);
    await expect(
      page.getByRole("dialog", { name: "Export analysis" }),
    ).toBeHidden();
  }
  const csv = await readFile(".local/qa/synthetic-export.csv", "utf8");
  if (
    !csv.includes("lane_summary") ||
    !csv.includes("Approximate linear size") ||
    csv.includes("data:image")
  )
    throw Error("Unexpected CSV content");
  const original = await page.locator(".gel-image image").getAttribute("href");
  // Import only freshly generated synthetic pixels; never user files.
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "synthetic-import.png",
      mimeType: "image/png",
      buffer: Buffer.from(original.split(",")[1], "base64"),
    });
  await expect(page.getByLabel("Project name")).toHaveValue("synthetic-import");
  await expect(page.locator(".lane-row")).toHaveCount(0);
  const jpeg = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d").drawImage(image, 0, 0);
    return c.toDataURL("image/jpeg");
  }, original);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "synthetic-import.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(jpeg.split(",")[1], "base64"),
    });
  await expect(page.getByLabel("Project name")).toHaveValue("synthetic-import");
  await expect(
    page
      .getByLabel("Gel image with editable lane and band overlays")
      .locator("image"),
  ).toHaveAttribute("href", /^data:image\/jpeg/);
  if (errors.length || externalRequests.length)
    throw Error(JSON.stringify({ errors, externalRequests }));
  console.log(
    "PASS: synthetic demo, band suggestions, annotations, calibration (~1000 bp), uncut exclusion, save/reload, lane draw/undo, CSV/PNG exports, PNG/JPEG import. No page errors or external page requests observed.",
  );
} finally {
  await browser.close();
}
