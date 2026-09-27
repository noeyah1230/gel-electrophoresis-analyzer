import { readFileSync, writeFileSync } from "node:fs";
const slug = process.argv[2];
if (!/^[a-z\d](?:[a-z\d-]*[a-z\d])?\/[a-z\d_.-]+$/i.test(slug || "")) {
  throw new Error("Usage: node scripts/configure-pages.mjs OWNER/REPOSITORY");
}
const path = new URL("../docs/script.js", import.meta.url);
const html = new URL("../docs/index.html", import.meta.url);
const url = `https://github.com/${slug}`;
writeFileSync(
  path,
  readFileSync(path, "utf8").replace(
    /const configuredRepository\s*=\s*[^;]*;/,
    `const configuredRepository = ${JSON.stringify(url)};`,
  ),
);
writeFileSync(
  html,
  readFileSync(html, "utf8").replace(
    /data-repo-link\s+href="[^"]*"/,
    `data-repo-link href="${url}"`,
  ),
);
console.log(`Portfolio repository link: ${url}`);
