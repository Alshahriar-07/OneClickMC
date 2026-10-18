# OneClickMC — User and Installer Workflow

## User journey

1. User launches OneClickMC.
2. App loads settings and checks whether required local assets/configuration are available.
3. App searches supported Minecraft locations if implemented.
4. User selects or confirms the Minecraft root and profile.
5. App resolves the effective game directory. If uncertain, it asks for confirmation.
6. User selects the actual Minecraft version separately from any folder name.
7. App loads the matching compatibility manifest.
8. User selects Potato, Balanced, or Ultimate.
9. App displays components available for that exact version and loader.
10. Dependency and conflict checks run.
11. User reviews the component list, destination, warnings, and backup plan.
12. User confirms.
13. App checks free space where practical and stages downloads.
14. App downloads from verified official sources.
15. App verifies files and dependencies.
16. App backs up existing files that may be changed.
17. App installs into the correct game directory.
18. App verifies installed files and records the outcome.
19. App shows success, partial success, or failure accurately.
20. User can open logs or relevant folders and use a supported launcher action if available.

## Path terminology

- **Minecraft root:** the top-level Minecraft data location.
- **Launcher profile/installation:** a launcher-defined configuration.
- **Version directory:** a directory representing a game version or launcher-managed version entry.
- **Effective game directory:** the directory the selected launch configuration actually uses for saves, mods, resource packs, and related data.

Do not assume these are the same directory. Do not infer the actual game version from names such as `My World` or `Mr Earth`.

## Installation safety

- Make a plan before changing files.
- Do not overwrite files without asking.
- Create backups for files that will be changed.
- Never delete saves/worlds.
- If installation fails, report what was completed and what was rolled back.
- Make cancellation safe; do not leave the profile in a misleading partially-installed state.
- Avoid deleting unrelated mods.

## Failure cases

### Invalid or ambiguous path
Explain what was not recognized and ask the user to choose the correct directory.

### Unsupported Minecraft version or launcher
Do not guess. Explain the limitation and let the user cancel or choose a supported option.

### Missing dependency
Show the dependency name and status; do not install an unverified substitute.

### Download failure
Retry only within reasonable limits, support cancellation, and report the official source and component that failed.

### Checksum or integrity failure
Do not install the questionable file. Retry from the trusted source or stop.

### Existing file conflict
Explain what exists, back it up, and ask before replacement.

### Insufficient storage
Stop before making destructive changes and explain the estimated requirement if reliable data is available.

### Partial installation
Clearly list successful, skipped, and failed components. Offer rollback if it can be performed safely.

## Progress states

Use distinct real tasks: `Resolving`, `Downloading`, `Verifying`, `Backing up`, `Installing`, `Checking`, `Completed`, `Cancelled`, `Failed`. Do not fake progress.
