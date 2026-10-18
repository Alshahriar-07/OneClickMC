# OneClickMC — Technical Plan

## 1. First action: inspect the existing repository

Before selecting frameworks or rewriting code, inspect the repository structure, current app, existing scripts, assets, build configuration, and release workflow. Preserve working code where reasonable. Record the actual stack in the implementation notes.

## 2. Delivery phases

### Phase A — repository and asset audit
- Inspect current code and the existing EXE/BAT approach.
- Identify `appbg.png`, `logo.png`, `.ico`, `text.png`.
- Confirm the current framework and build tools.
- Identify risks and reusable logic.

### Phase B — GUI foundation
- Implement the main window, navigation, design system, background, edition cards, selectors, and error/loading states.
- Keep the GUI separate from installation logic.
- Ensure no terminal UI is required for normal use.

### Phase C — Minecraft detection and path safety
- Detect common launcher locations where possible.
- Allow manual directory selection.
- Distinguish Minecraft root, launcher profile, version folder, and effective game directory.
- Ask for confirmation when path detection is ambiguous.

### Phase D — compatibility and dependency engine
- Use version-specific manifests.
- Verify loader, game version, dependencies, licenses, and official file sources.
- Exclude unverified files from automatic installation.

### Phase E — download and installation engine
- Download with retries and cancellation.
- Verify integrity where metadata permits.
- Back up files before modification.
- Install to correct destinations.
- Provide logs and rollback/recovery options.

### Phase F — testing and EXE packaging
- Test valid, invalid, and ambiguous paths.
- Test download failure, cancellation, dependency failure, and existing-file conflicts.
- Build Windows executable/installer.
- Verify launch on a clean Windows environment.
- Confirm the EXE icon and asset paths work after packaging.

### Phase G — website/setup work
Only start after Phase F passes and the user accepts the desktop app milestone. Then plan website download pages, release links, and setup experience separately.

## 3. Suggested modules

Adapt names to the actual framework:

- `ui/`: screens, components, theme, interactions.
- `minecraft/`: installation discovery and game-directory resolution.
- `compatibility/`: manifests and validation.
- `resolver/`: dependencies and conflict detection.
- `downloads/`: safe downloading, retries, checksums.
- `installer/`: backups, file operations, rollback.
- `settings/`: preferences and persistence.
- `diagnostics/`: logs and support information.
- `packaging/`: Windows build and release scripts.

## 4. Manifest design

Use a machine-readable manifest per Minecraft version and loader. A component record should contain:
- stable project identifier;
- display name and category;
- official project page;
- exact downloadable file URL/ID from a verified source;
- Minecraft version;
- loader;
- dependencies;
- optionality;
- destination type;
- checksum if available;
- license/download restrictions;
- verification date and status.

The sample JSON is a schema/template only. Do not treat placeholders as installable files.

## 5. Safety model

- Validate destination paths before writing.
- Avoid path traversal and unsafe filenames.
- Do not execute downloaded files or scripts as part of normal mod installation.
- Do not use an unverified `irm ... | iex` command as the main installation mechanism.
- Use official sources and integrity checks when available.
- Never expose secrets or tokens in logs.
- Require confirmation before replacing existing files.
- Keep backup and rollback behavior understandable.
- Never remove user worlds or saves.

## 6. Error handling

Every failure should identify the task, explain the likely cause, and provide a safe next step. Include log details without showing secrets. Do not silently skip a required dependency or claim success after partial failure.

## 7. Testing plan

- Unit tests: path parsing, version detection, manifest parsing, dependency resolution, checksum validation.
- Integration tests: downloads, staging, backup, install, rollback.
- UI tests: navigation, keyboard access, selected edition, progress, errors.
- Manual tests: custom Minecraft paths, arbitrary profile names, missing assets, no internet, insufficient disk space.
- Release tests: clean install, launch, uninstall if provided, and no dependency on the developer's machine.

## 8. Completion gate

The desktop milestone is complete only when the GUI works, the correct game directory is used, incompatible components are blocked, file operations are safe, progress is truthful, errors are handled, and the packaged EXE has been smoke-tested.
