# OneClickMC

A Windows desktop installer for curated Minecraft mod profiles. OneClickMC verifies the exact
Minecraft version, loader, dependencies and file integrity before it writes anything into a
Minecraft folder, and it backs up every file it replaces.

This repository currently targets **Phase 1: the Windows desktop application**. The website
(`oneclickmc.vercel.app`) is intentionally untouched by this phase.

## What it does

- **Real Minecraft discovery** — reads `launcher_profiles.json`, `versions/*/*.json` and instance
  folders, and separates the Minecraft root, launcher profile, version folder and the *effective
  game directory*.
- **Version-first compatibility** — one manifest per target Minecraft version (`1.21.11`, `26.1`,
  `26.2`) on Fabric, resolved live against the official Modrinth API. A folder named `My World` or
  `Mr Earth` never counts as a game version.
- **Three editions in one app** — Potato, Balanced and Ultimate are curated component sets, not
  separate executables and not performance promises.
- **Verified downloads** — HTTPS-only, SHA-512 verified while streaming, retried, cancellable, and
  never executed as scripts.
- **Backup + rollback** — existing files are copied into a timestamped backup folder before
  replacement, and every run is journalled so it can be rolled back from Diagnostics.
- **Honest progress and errors** — distinct phases for validating, resolving, downloading,
  verifying, backing up, installing and final checks. No fake progress, no false success.

## Screens

| Screen | What it does |
| --- | --- |
| Home | Branding, detected installations, edition previews, how it works |
| Install (step 1) | Folder browsing, detected installations and launcher profiles, effective game directory, Fabric readiness, version selection |
| Edition (step 2) | Potato / Balanced / Ultimate cards with intent and resource demand |
| Components (step 3) | Required mods, optional mods, single-active shader, resource packs (single base pack + add-ons), auto-resolved dependencies, real statuses and source links |
| Review (step 4) | Destination, exact file list, conflicts, backup plan, free space, explicit confirmation |
| Progress | Real per-phase state, download counts and bytes, live log, cancellation |
| Result | Installed/skipped files, warnings, recovery and rollback actions |
| Settings | Background mode, reduced motion, log level, compatibility cache refresh, reset |
| Diagnostics | App/system info, bundled assets, Java runtimes, cache status, logs, installation history with rollback |

## Safety model

- Only `mods/`, `shaderpacks/` and `resourcepacks/` inside the resolved game directory are written.
- File names are validated (no traversal, no reserved Windows names, extension must match the
  component type). Nothing outside the game directory can be targeted.
- Worlds, saves, screenshots, options and unrelated mods are never deleted or moved.
- Existing files are backed up first; the destination is written through a temporary file and an
  atomic rename, then hashed again to confirm the installed bytes.
- Required components that fail to resolve or download stop the run before anything is written.
  Optional components that fail are skipped and reported.
- Cancelling removes staged downloads and rolls back whatever the run had already installed.
- Logs never contain credentials or secrets.

## Compatibility model

- `data/catalog.json` holds every candidate component: project identity, official URL, summary,
  caveats and per-edition membership (`required`, `optional`, `off`).
- `data/manifests/<minecraft-version>.json` holds the per-version Fabric manifest: review date,
  overrides for components that cannot be resolved (unavailable or manual-only) and known
  conflict warnings.
- The resolver queries `https://api.modrinth.com/v2` for the **exact** game version and loader,
  prefers release-channel files, records the real file name, size, SHA-512 hash, license and
  required dependencies, and caches the result on disk for six hours so the app still works
  offline.
- Statuses shown in the UI: `Verified`, `Optional`, `Unavailable`, `Manual only` (unverified),
  `Incompatible`, `Dependency blocked`. Only verified files can be selected, and only one shader
  can be active at a time.
- No URL, file id, checksum, license or compatibility result is ever invented. Manual-only
  projects (CurseForge, faithfulpack.net, vanillatweaks.net) are listed with their official link
  and are never auto-downloaded.

## Requirements

- Windows 10/11 (x64)
- Node.js 20+ for development (`node --version`)
- Internet access for compatibility checks and downloads

## Development

```bash
npm install         # install dependencies
npm start           # run the app from source
npm test            # unit tests (49 tests, no network required)
npm test:install    # end-to-end install test against the live API (network)
npm run lint        # ESLint
npm run smoke       # launch the app, run the built-in self-test, write a report
```

`npm run smoke` writes `smoke-report.json` and `smoke-capture.png` to the app data folder
(`%APPDATA%\OneClickMC`). Point it elsewhere with
`electron . --smoke-test --smoke-report=C:\path\report.json`.

## Building the Windows release

```bash
npm run build       # NSIS installer + portable single EXE into ./dist
npm run build:dir   # unpacked build only (fast, used for packaging checks)
```

Artifacts:

- `dist/OneClickMC-Setup.exe` — NSIS installer (choose install directory, desktop/Start Menu
  shortcuts, uninstaller).
- `dist/OneClickMC.exe` — portable single-file build.
- `dist/win-unpacked/OneClickMC.exe` — unpacked application used for packaged smoke tests.

All three binaries use the Windows GUI subsystem, so no console window appears. See
`docs/RELEASE.md` for checksums, verification results and the manual test checklist.

## Project layout

```
app/                      renderer (no Node access, context-isolated)
  index.html              app shell, dialogs, loading overlay
  styles/app.css          design system (pixel headings, panels, chunky buttons)
  js/app.js               state, routing, IPC actions, job events, self-test
  js/views/*.js           one module per screen
  js/parts.js, icons.js   shared UI builders and inline SVG icons
electron/main.js          window, app:// protocol, IPC surface, diagnostics, smoke test
electron/preload.js       narrow contextBridge API
electron/lib/             logger, settings, paths, minecraft discovery, modrinth client,
                          resolver, compat cache, downloader, installer, job manager
data/catalog.json         component catalog
data/manifests/*.json     per-version Fabric manifests
assets/                   existing branding (appbg.png, logo.png, text.png, icon.ico) + font
scripts/                  asset check, end-to-end install test
test/                     unit tests (node:test)
```

The renderer never receives download URLs or filesystem write access; the main process owns all
network and file work.

## Assets and licensing

- `assets/appbg.png`, `logo.png`, `text.png`, `icon.ico` and the derived PNG icon set are the
  project's existing branding and are reused unchanged.
- `assets/fonts/press-start-2p-latin.woff2` is the "Press Start 2P" font by CodeMan38, licensed
  under the SIL Open Font License 1.1 (`assets/fonts/OFL.txt`).
- OneClickMC does **not** redistribute mods, shaders or resource packs. It downloads them at
  install time from the official URLs reported by the Modrinth API, and shows each project's
  license in the component list.

## Known limitations

- Fabric only. Forge/NeoForge/Quilt instances are detected and refused rather than modified.
- OneClickMC installs files; it does not install the Fabric loader or launch the game. If Fabric is
  missing for the selected version, the app says so and links to the official installer.
- CurseForge, Faithful and Vanilla Tweaks content can only be installed manually; they are marked
  `Manual only`.
- Modrinth is the only automated source, so components a project only publishes elsewhere show as
  unavailable instead of being guessed.
- Edition names describe intent; no FPS or benchmark results are promised or fabricated.
