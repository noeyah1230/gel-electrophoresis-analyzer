# Engineering notes

## Scope and architecture

The problem is repeated visual review and documentation of gel lanes and bands. This prototype keeps the image, editable observations, and a review record together. It is implemented in React and TypeScript, bundled by Vite, with a small Rust/Tauri 2 desktop shell. Browser development mode uses the same interface with a separate IndexedDB storage adapter.

| Module                  | Responsibility                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/App.tsx`           | Image interactions, lane/feature editors, review states, undo, autosave, export orchestration          |
| `src/image.ts`          | PNG/JPEG import, SHA-256, deterministic canvas-generated example, annotated PNG rendering              |
| `src/model.ts`          | Lane brightness profiles, peak suggestions, calibration eligibility, interpolation, CSV, record checks |
| `src/storage.ts`        | Native command bridge and browser IndexedDB/download fallback                                          |
| `src-tauri/src/main.rs` | Scoped application storage, original fingerprint checks, atomic writes, recovery, native save dialog   |
| `tests/model.test.ts`   | Constructed tests of interpolation, exclusions, profiles, peak detection, CSV, and review states       |

## Image-processing pipeline

1. Decode a selected PNG/JPEG locally and retain the original bytes and hash. Reject files over 30 MB or images over 40 megapixels.
2. Let the user draw rectangular lanes. No automatic lane detector runs.
3. Average weighted RGB luminance (`0.2126 R + 0.7152 G + 0.0722 B`) across each lane's width to produce a one-dimensional profile along migration.
4. For optional band suggestions, invert dark-band polarity, apply a moving average, subtract a local minimum within a ±20-pixel window, select local peaks above the configured threshold, then suppress peaks that are too close together.
5. Retain reviewed observations when generating new proposed markers. Let the user correct markers and record ambiguous or unresolved regions.
6. Optionally interpolate `log10(bp)` between adjacent, manually assigned ladder anchors. Require one same-gel ladder, suitable geometry, at least four reviewed/distinct/ordered anchors, and a reviewed unambiguous sample band within the anchor interval.
7. Save the project and export a frozen saved revision as PNG or CSV.

## Deliberate design choices

- **Separate viewing from measuring.** Contrast, crop, and rotation change the view, while measurements stay in original-image coordinates. PNG exports show the full original orientation and disclose contrast.
- **Separate proposals from observations.** Peak suggestions are proposed features until a person reviews them. An empty reviewed lane remains a meaningful record without becoming a claim of DNA absence.
- **Withhold unsupported numbers.** Uncut/unknown plasmids are never sized using a linear ladder. Linearized plasmids require explicit single-cut/full-length confirmation. Regions, ambiguous observations, and out-of-range bands have no size estimate.
- **Keep local revisions inspectable.** The native adapter serializes saves, flushes a temporary file before rename, and retains one prior revision. Browser mode uses IndexedDB transactions. Neither is an unlimited undo history or backup system.
- **Export review context.** CSV includes a lane summary even for empty lanes and neutralizes formula-like text. PNG includes annotations, notes, review state, and limitations. Neither export should be treated as de-identified merely because it is an export.

## What testing can establish

Constructed fixtures can establish that the interpolation formula, exclusions, and export conventions behave as written. Synthetic UI tests can establish that a workflow completes. They cannot establish accuracy on laboratory images, scientific validity, native operating-system privacy, or clinical suitability.

The next useful engineering step is a controlled synthetic benchmark for faint/overlapping bands and uneven backgrounds, followed by authorized representative-image evaluation with independent reference fragments. New methods should be evaluated separately from manual corrections.
