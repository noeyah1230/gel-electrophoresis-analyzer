# Publish the project

## Current status

This guide covers initial publication and later deployments. The repository name is `gel-electrophoresis-analyzer`, and the portfolio is served from `main:/docs`. No credentials should be pasted into this repository or a chat. Authenticate interactively with `gh auth login` when needed.

Project licensing remains pending ownership confirmation; no `LICENSE` was applied. Before sharing the original source publicly, confirm that you have release rights. If those rights are confirmed, MIT is the recommended project license; retain dependency notices. Public code without a license is not automatically open-source.

## Repository metadata

- Name: `gel-electrophoresis-analyzer`
- Description: `Privacy-focused prototype for analyzing and annotating gel electrophoresis images.`
- Suggested topics: `electrophoresis`, `bioinformatics`, `image-processing`, `molecular-biology`, `scientific-computing`, `computer-vision`, `research-tools`, `react`, `typescript`, `tauri`
- Visibility: public, after reviewing the manifest and any subsequent changes.
- No university affiliation, logos, clinical claims, or laboratory data.

## Review and publish

Run these commands from the repository root. Python 3, Node.js/npm, Git, and GitHub CLI are required. Do not upload a ZIP of the workspace, `.git`, `release/`, or a native binary.

```sh
# Authenticate interactively. Never put credentials in project files.
gh auth login --hostname github.com
gh auth status

# Discover the account; this is used only for public repository URLs.
GEL_OWNER=$(gh api user --jq .login)
GEL_REPO="$GEL_OWNER/gel-electrophoresis-analyzer"
node scripts/configure-pages.mjs "$GEL_REPO"

npm ci
npm test
npm run build
python3 scripts/check-publication.py --write-manifest
cat docs/PUBLICATION_FILES.txt

# Inspect the complete named upload set before staging.
# This repository initially had no commits. Stage only the reviewed manifest.
python3 - <<'PY'
from pathlib import Path
import subprocess
files = Path('docs/PUBLICATION_FILES.txt').read_text().splitlines()
subprocess.run(['git', 'add', '--', *files], check=True)
PY
git diff --cached --stat
git diff --cached --check
python3 scripts/check-publication.py

# Review your author identity; use your GitHub-provided noreply email if desired.
# Set user.name/user.email locally with git config before committing if needed.
git var GIT_AUTHOR_IDENT
git commit -m "Prepare gel analysis prototype for public portfolio"

# Verify whether this name already exists. If it exists, inspect it instead
# of creating a duplicate or force-pushing over it.
gh repo view "$GEL_REPO"
```

If `gh repo view` confirms the repository does not exist (rather than an authentication/network error), create it and push the reviewed first commit:

```sh
gh repo create "$GEL_REPO" --public --source=. --remote=origin \
  --description "Privacy-focused prototype for analyzing and annotating gel electrophoresis images." \
  --push

gh repo edit "$GEL_REPO" \
  --add-topic electrophoresis,bioinformatics,image-processing,molecular-biology,scientific-computing,computer-vision,research-tools,react,typescript,tauri
```

If the intended repository already exists and is empty, set its remote and push normally after checking `git remote -v`. If it contains work, reconcile that work first; do not use `--force`. If it is private, review all of its existing history and release assets before changing visibility.

## Enable GitHub Pages

The portfolio is dependency-free static HTML/CSS/JavaScript under `docs/`, with local screenshot assets and `.nojekyll`. It does not host the analyzer or accept user files. Publish from the `main` branch, `/docs` directory:

```sh
gh api --method POST "repos/$GEL_REPO/pages" \
  -f 'source[branch]=main' -f 'source[path]=/docs'

# Once the Pages build completes, retrieve the actual URL and status.
gh api "repos/$GEL_REPO/pages" --jq '{url: .html_url, status: .status, source: .source}'
gh api "repos/$GEL_REPO/pages/builds/latest" --jq '{status: .status, error: .error}'
```

If Pages is already configured, use `--method PUT` with the same source fields instead of `POST`. Alternatively select **Settings → Pages → Deploy from a branch → main → /docs → Save**. See [GitHub's publishing-source guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [Pages API reference](https://docs.github.com/en/rest/pages/pages).

The expected project-site pattern is `https://OWNER.github.io/gel-electrophoresis-analyzer/`; it is not a live URL until GitHub reports a successful build. Open the returned URL and confirm images, navigation, repository links, and mobile layout before adding it to a portfolio.

## Local page preview

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory docs
```

Open `http://127.0.0.1:8080`. Before a repository URL is configured, **View on GitHub** links to a clearly labeled publication-status section instead of a made-up URL. `configure-pages.mjs` sets the real URL and HTML fallback once the owner is known. The page also recognizes ordinary project GitHub Pages URLs without making a network request.

## Safe additions

Only the named synthetic screenshots are exempted from image exclusions. Do not loosen those rules for real gel data. Re-run the publication screen and visually inspect any added image or annotation. Source publication does not imply approval to distribute the existing native build.
