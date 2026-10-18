# OneClickMC — Complete Product Blueprint

## 1. Vision

OneClickMC is a Windows desktop application that makes it straightforward to install and manage curated Minecraft mod, shader, and resource-pack profiles. Its main value is a clear GUI, safe installation workflow, version-aware compatibility checks, and three easy-to-understand editions.

**Immediate priority:** finish a proper Windows GUI and release-ready EXE. Do not start website/setup redesign work until the desktop app is built, tested, and packaged successfully.

## 2. Product identity

- Name: OneClickMC
- Website: https://oneclickmc.vercel.app
- Repository: https://github.com/Alshahriar-07/OneClickMC
- Target: Windows desktop first
- Target Minecraft versions: `1.21.11`, `26.1`, `26.2`
- Editions: Potato, Balanced, Ultimate
- Visual theme: Minecraft-inspired blocky/pixel UI with the existing `appbg.png` as the main background where appropriate.

## 3. Editions

### Potato
Performance-first, low overhead, conservative defaults. Keep shaders and expensive visual packs optional and off by default where appropriate.

### Balanced
A middle ground between performance and visual quality. Optional distant terrain, shader, animation, and visual upgrades after compatibility validation.

### Ultimate
Visual-quality-first. High-quality shader and resource-pack options, including PBR where confirmed. Clearly communicate performance cost and let users customize the selection.

The names describe goals, not guaranteed FPS or universal hardware tiers.

## 4. Core user journey

1. Open the app.
2. Select or detect a Minecraft installation.
3. Select the actual Minecraft version independently from the folder name.
4. Choose Potato, Balanced, or Ultimate.
5. Review compatible mods, shaders, and resource packs.
6. Resolve dependencies and conflicts.
7. Review the install plan and backup behavior.
8. Install with truthful progress and useful logs.
9. Review the result and launch/open the appropriate launcher/profile if supported.

## 5. Directory and data safety

Minecraft root, launcher profile, version folder, and effective game directory are different concepts. Never infer a Minecraft version from a directory name such as `My World` or `Mr Earth`. Launcher-specific layouts must be handled explicitly.

- Detect paths where possible, but ask for confirmation when uncertain.
- Install into the correct effective game directory.
- Never silently overwrite worlds, saves, settings, or existing mods.
- Back up files before changing them.
- Offer cancellation, recovery, and rollback where feasible.
- Report unsupported launchers honestly.

## 6. Compatibility-first design

Maintain separate manifests for each target Minecraft version. Verify the exact game version, loader, Java requirement, mod file, dependencies, source, checksum when available, and license. A nearby game version is not proof of compatibility.

Possible states: `VERIFIED`, `OPTIONAL_VERIFIED`, `UNVERIFIED`, `UNAVAILABLE`, `INCOMPATIBLE`, `BLOCKED_DEPENDENCY`, `BLOCKED_LICENSE`.

Only verified compatible files should be enabled by default. Do not invent URLs, file IDs, checksums, benchmark results, or licenses.

## 7. User interface

The app should feel like a polished Minecraft-themed desktop utility, not a terminal wrapped in a window. Use a dark forest/game-world background, blocky display headings, pixel-inspired buttons, crisp readable body text, clear selected states, and restrained transitions. See `ui.md` for detailed requirements.

## 8. Technical structure

Keep UI, Minecraft discovery, compatibility manifests, dependency resolution, downloading, integrity checks, installation, backup/rollback, logging, settings, and packaging as separate modules. Choose the framework after inspecting the current repository; avoid unnecessary migration.

## 9. Non-goals for the first EXE milestone

- Do not build the website as part of this milestone.
- Do not promise a fixed FPS improvement.
- Do not automatically install every candidate listed in the catalog.
- Do not silently change a user's launcher or Minecraft profile.
- Do not use fake progress, fake compatibility, or placeholder download buttons in a release build.

## 10. Acceptance criteria

- A user can choose an installation path and actual Minecraft version separately.
- The three editions are selectable in the GUI.
- Components are filtered by verified compatibility and dependencies.
- Downloads and installation show real task status.
- Existing user data is protected.
- Failures are understandable and recoverable where possible.
- The app builds into the intended Windows EXE/installer and passes a clean-machine smoke test.
- Website work begins only after this desktop milestone is accepted.
