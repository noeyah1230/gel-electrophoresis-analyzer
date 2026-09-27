// Set by scripts/configure-pages.mjs after the repository owner is known.
const configuredRepository = "";

// Derive a project repository only on a standard GitHub Pages host.
const owner = location.hostname.match(
  /^([a-z\d](?:[a-z\d-]*[a-z\d])?)\.github\.io$/i,
)?.[1];
const project = location.pathname.split("/").filter(Boolean)[0];
const inferredRepository =
  owner && project && /^[a-z\d_.-]+$/i.test(project)
    ? `https://github.com/${owner}/${project}`
    : "";
const repository = configuredRepository || inferredRepository;
if (/^https:\/\/github\.com\/[a-z\d-]+\/[a-z\d_.-]+$/i.test(repository)) {
  for (const link of document.querySelectorAll("[data-repo-link]"))
    link.href = repository;
  const status = document.getElementById("repository-status");
  status.textContent =
    "Explore the source, installation instructions, engineering decisions, and test record on GitHub.";
  const link = document.createElement("a");
  link.href = repository;
  link.textContent = "Open the repository ↗";
  link.className = "button";
  status.after(link);
}
