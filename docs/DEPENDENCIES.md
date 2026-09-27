# Dependencies and ownership

## Project ownership

No pre-existing project license or provenance statement was found. The author describes the app as a personal project, but that alone does not establish release rights for every original file or icon. A license has therefore not been applied. MIT is a reasonable recommendation once the author confirms ownership and permission to release the original code and artwork.

“MIT” is a license name; it does not imply use of university research, technology transfer, or institutional endorsement. A project's license does not replace its dependencies' licenses. See the [MIT license summary and text](https://choosealicense.com/licenses/mit/).

## JavaScript dependencies

Inspected `package.json`, `package-lock.json`, installed direct dependency metadata, and the Lucide license notice. Both React packages resolved to 19.3.0 in the supplied lockfile; Tauri API resolved to 2.12.0 and Lucide React to 0.468.0. The lockfile, not the lower-bound version ranges, determines an `npm ci` installation.

| Dependency                        | Purpose                           | Declared license                                                         |
| --------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| React / React DOM                 | Interface and rendering           | MIT                                                                      |
| `@tauri-apps/api`                 | Native IPC/window bridge          | Apache-2.0 OR MIT                                                        |
| `lucide-react`                    | Interface icons                   | ISC; bundled notice also identifies inherited Feather portions under MIT |
| TypeScript                        | Type checking                     | Apache-2.0                                                               |
| Vite / React plugin / Vitest      | Development, bundling, unit tests | MIT                                                                      |
| Playwright test                   | Synthetic browser smoke checks    | Apache-2.0                                                               |
| Tauri CLI                         | Desktop build tooling             | Apache-2.0 OR MIT                                                        |
| Prettier / React type definitions | Formatting / type support         | MIT                                                                      |

The supplied npm lockfile contains declarations of MIT, Apache-2.0, Apache-2.0 OR MIT, ISC, BSD-3-Clause, and CC-BY-4.0. The CC-BY-4.0 package is the development browser-support dataset `caniuse-lite`, not original app analysis code. Required notices must be retained when distributing dependency code or data. Installed dependencies and generated bundles are excluded from this source publication.

## Rust dependencies

`Cargo.toml` declares `tauri`, `tauri-build`, `serde_json`, `base64`, `sha2`, and `rfd`. `Cargo.lock` pins the resolved native dependency tree. Their exact license texts and the licenses of all platform-specific/transitive components still need a distribution-level review before releasing packaged binaries. Cargo is not installed in the current verification environment, so a fresh `cargo metadata` inventory and native build could not be completed here.

## Limits of the review

No copied-code attribution header or conflicting project license was found in the original application source. That is not proof of independent authorship, and the preliminary dependency review is not a legal clearance. No dependency source, installer, or compiled native binary is being published. Keep the original dependency notices when installing or redistributing packages. Resolve project ownership before describing this as MIT-licensed or open-source.
