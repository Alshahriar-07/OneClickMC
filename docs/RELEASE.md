# OneClickMC 1.0.0 — Windows release notes

Phase 1 desktop milestone: a single unified GUI application with an in-app edition selector,
a real verification and installation engine, and a signed-off packaged build.

## Release artifacts

| Artifact | Path | Size | SHA-256 |
| --- | --- | --- | --- |
| Installer (NSIS) | `dist/OneClickMC-Setup.exe` | 111.7 MB | `4c9335b14980968a4c4be4d018315d41e126c70b77cdc7b841ad79679ce44d8c` |
| Portable single EXE | `dist/OneClickMC.exe` | 111.3 MB | `0d4ecaa300edb680cd98cf637a31b840843323875f677a3fdaeb4559b599cffe` |
| Unpacked application | `dist/win-unpacked/OneClickMC.exe` | — | packaged smoke-tested build |

Regenerate with:

```bash
npm install
npm run lint && npm test
npm run build
sha256sum dist/OneClickMC.exe dist/OneClickMC-Setup.exe
```

Build environment: Windows 10.0.26200 x64, Node v24.15.0, electron 44.9.0,
electron-builder 26.15.3. No code-signing certificate was available, so the binaries are
unsigned; expect a SmartScreen prompt on first run.

## Verification results

### Static checks

- `npm run lint` — ESLint 10 (recommended rules + project rules across main, preload, renderer,
  tests and scripts): **0 errors, 0 warnings**.
- `npm run verify:assets` — all 14 required assets/config files present.

### Unit tests — `npm test`

```
tests 49  pass 49  fail 0  duration ~1.1s
```

Covers: path/filename validation and traversal refusal, Minecraft discovery (custom version folder
names, missing metadata, instance folders, loader detection), compatibility resolution (release
preference, exact-version matching, hash/HTTPS requirements, dependency resolution, offline
failure), selection planning (edition defaults, single-shader rule, blockers, dependency
propagation, no download URLs in renderer payloads), installer planning/backup/install/rollback,
verified downloads (checksum verification, retries, cancellation, size mismatch), settings
persistence, and validity of the shipped catalog and manifests.

### End-to-end install tests — `npm run test:install` (live Modrinth API + real downloads)

Both runs install into a synthetic Minecraft directory that contains a world, an unrelated mod and
`options.txt`:

| Run | Target | Files installed | Result |
| --- | --- | --- | --- |
| 1 | Minecraft 26.2 · Fabric · Potato | 9 | 16/16 checks passed |
| 2 | Minecraft 1.21.11 · Fabric · Ultimate | 15 (includes a shader and a 74.7 MB resource pack) | 16/16 checks passed |

Checks in each run: live compatibility resolution, unavailable components reported honestly,
selection builds without blockers, dry-run plan writes nothing, installation succeeds, the journal
records every file, every installed file matches its published SHA-512 hash, an unrelated mod
survives, worlds/saves survive, `options.txt` survives, no `.part`/`.tmp` files remain, rollback
succeeds and removes only this run's files while keeping user data, cancellation is reported as
cancelled and leaves nothing behind, and a missing game directory fails safely before any change.

### Packaged application self-test — `--smoke-test`

The packaged binaries were launched with the built-in self-test, which loads the real window,
checks the DOM, the bundled assets, the fonts, the IPC bridge and screen navigation, captures the
window, and exits with a status code.

| Binary | Result |
| --- | --- |
| `dist/win-unpacked/OneClickMC.exe` | ok — 27/27 checks, `packaged: true`, exit code 0 |
| `dist/OneClickMC.exe` (portable) | ok — 27/27 checks, `packaged: true`, exit code 0 |

Checks include: IPC bridge available, nine screens registered, `appbg.png` loads and is applied as
the background, `logo.png` and `text.png` load, the pixel font loads, app info reports all five
branding assets present, home/setup/edition/settings screens render, three version cards, three
edition cards, all buttons labelled, no interactive target below 36 px, no horizontal overflow, no
console errors, and a non-empty window capture (1424×881).

Artifacts of these runs are written next to the report path passed to `--smoke-report`, e.g.
`smoke-report.json` and `smoke-capture.png`.

### Packaging checks

- `assets/appbg.png`, `logo.png`, `text.png`, `icon.png`, `icon.ico`, the bundled font and all three
  version manifests are present inside `resources/app.asar` (58 entries).
- PE subsystem of `win-unpacked/OneClickMC.exe`, the portable EXE and the installer:
  `WINDOWS_GUI` (subsystem 2) — no console window opens.

## Manual test checklist (recommended on a real Minecraft machine)

1. Launch `OneClickMC.exe`; confirm the window, taskbar icon and background image.
2. Home → **Set up my Minecraft**: confirm your detected `launcher_profiles.json` profiles appear
   with their real game directories.
3. Browse to a folder that contains `My World` inside `versions`; confirm the version is reported
   from JSON metadata (or as unknown) and never from the folder name.
4. Pick Potato / Balanced / Ultimate and confirm the component list changes and that
   unavailable/manual-only components cannot be selected.
5. Review a plan, then install; confirm progress phases reflect real tasks and the game folder
   contains only the planned files.
6. Install once more over the same folder and confirm existing files are backed up first.
7. Cancel a run mid-download and confirm no leftovers in the game folder.
8. Roll back from the Result screen or Diagnostics and confirm the previous files return.
9. Confirm no worlds, saves or unrelated mods changed.

## Not verified in this environment

- **Interactive installer run.** Electron Builder produced a valid NSIS installer with a GUI
  subsystem, an uninstaller payload and shortcuts, but unattended silent execution
  (`OneClickMC-Setup.exe /S`) did not complete on this machine: the installer process stayed alive
  without writing files or raising an error dialog, in an environment that also blocks similar
  installers. The packaged application itself (portable EXE and unpacked build, which use the same
  `app.asar`) was fully smoke-tested, so this is an installer-execution gap, not an application
  gap. Run the installer interactively on a normal user machine to complete this check.
- **Real Minecraft launch.** No Minecraft installation was available here, so "mods load in game"
  was verified only indirectly: files land in `mods/`, `shaderpacks/` and `resourcepacks/` of the
  resolved game directory with correct hashes, and a Fabric profile is detected from version JSON.
- **Forge/NeoForge/Quilt installs** are intentionally unsupported and were verified only by
  detection and refusal in unit tests.
- **SmartScreen/code signing** — no certificate was configured.

## Scope confirmation

The website (`oneclickmc.vercel.app`) and any website source were not modified, built or deployed in
this phase. All work is limited to the desktop application, its data manifests, tests and docs.
