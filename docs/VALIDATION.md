# Verification record

Date: 2026-09-27. All interactive checks used generated synthetic images in fresh browser contexts. This record describes software behavior, not scientific accuracy or clinical validation.

## Passed in this preparation

| Check                                            | Result                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Existing TypeScript unit suite                   | 29/29 tests passed                                                                                                                     |
| TypeScript compilation and Vite production build | Passed                                                                                                                                 |
| Synthetic example                                | Eight lanes open with linked overlays, brightness profile, and observations                                                            |
| Band suggestions                                 | Selected-lane peak proposals generated and reviewed                                                                                    |
| Manual review                                    | Synthetic note saved; uncut lanes retain unavailable numerical sizes                                                                   |
| Ladder calibration                               | Reviewed same-gel assignments accepted; synthetic PCR control gives approximately 1,000 bp                                             |
| Persistence                                      | Browser save, reload, reopen restore the note, calibration, and reviewed result                                                        |
| Lane editing                                     | Draw a lane, then undo, restores the original lane count                                                                               |
| Import                                           | Locally generated PNG and JPEG both import; imported images begin without pre-drawn lanes                                              |
| Exports                                          | CSV and PNG download; incomplete review is disclosed in the filename and PNG; CSV includes lane summaries and available size estimates |
| Export visual review                             | Synthetic annotated PNG inspected, including annotations, notes, review state, and disclaimer                                          |
| Portfolio page                                   | Local links/images resolve; layout has no horizontal overflow at 320, 390, 768, and 1440 pixels                                        |
| Portfolio resource requests                      | No external resource requests or JavaScript errors observed during the local-page check                                                |
| Publication screen                               | Candidate source/assets and reachable Git history pass the configured sensitive-pattern and disallowed-file checks                     |

The browser workflow is exercised by `scripts/smoke.mjs` against both the development server and the production preview. It also records page errors and page-level external requests; none occurred during the successful checks. This is narrower than process-wide network monitoring and does not validate the native desktop environment.

Unit tests cover log interpolation, exact anchors, reverse migration, uncut/uncertain-digest exclusions, ambiguous/region/proposed exclusions, the four-anchor rule, duplicate/misordered mapping rejection, geometry changes, display invariance, expected windows, empty-lane summaries, CSV quoting/formula protection, and bright/dark peak detection. Constructed examples are not representative laboratory validation.

## Reproduce

```sh
npm ci
npm test
npm run build
npm run preview
# In another terminal, with Google Chrome installed:
GEL_APP_URL=http://127.0.0.1:4173 BROWSER_CHANNEL=chrome node scripts/smoke.mjs
python3 scripts/check-publication.py
```

Alternatively install Playwright Chromium and omit `BROWSER_CHANNEL=chrome`. Test exports remain in ignored `.local/qa/`; browser projects are held in an isolated test context. Screenshot generation uses the same script with `--screenshots` against the development server. Review replacement images before publication.

Verified environment: macOS arm64, Node.js 26.7.0, npm 11.19.0, Vitest 3.2.7, Vite 6.4.3, local Google Chrome via Playwright. Exact library versions are recorded in the lockfiles.

## Not verified here

- Rust/Cargo is unavailable in this environment. The prior local record reported two Rust tests and a macOS bundle build, but those results were not rerun or independently certified in this preparation.
- Native import, restart/recovery, export dialogs, deletion, save-on-close, interrupted writes, corrupt records, disk-full behavior, and fresh-machine installation require further testing.
- Process-wide native DNS/connection observation, CSP failure tests, and offline fresh-machine testing remain pending. No certified privacy claim is made.
- Signing/notarization, Intel builds, and Windows/Linux packaging are not established. Existing native binaries remain excluded from publication.
- Broad keyboard/screen-reader access, dense or overlapping labels, very long notes, large images, and all failure paths need further review.
- Scientific accuracy, real-gel detection performance, sizing uncertainty, and inter-reviewer repeatability are unestablished. Do not infer performance from the illustrative 1,000 bp result.

## Next validation steps

Use controlled synthetic fixtures for background variation, faint/overlapping bands, and geometry. Separately evaluate detector suggestions and manually corrected annotations. Any later real-image evaluation requires appropriate permission and a storage/publication plan; confidential images must never be added to this repository. Use independent linear fragments rather than calibration anchors to evaluate sizing performance.
