# OneClickMC — Windows EXE Release Plan

## Priority

The first deliverable is a stable Windows desktop app and its packaged EXE/installer. Website setup work comes later.

## Packaging decision

Inspect the existing repository and choose a packaging strategy compatible with the current stack. Prefer a single unified GUI app with an edition selector. Do not require three separate EXEs unless there is a clear technical reason.

Historical filename ideas:
- `OneClickMC-Potato.exe`
- `OneClickMC-Balance.exe` (historical spelling)
- `OneClickMC-Ultimate.exe`

Recommended user-facing identity should use `Balanced` consistently. A single `OneClickMC.exe` or a properly named installer may be simpler; decide after inspecting the current build.

## Release checklist

- [ ] App starts on a clean Windows environment.
- [ ] GUI is visible; no unwanted terminal window.
- [ ] `appbg.png` and branding assets load in the packaged build.
- [ ] Correct app/window/taskbar icon is present.
- [ ] User can browse to a custom Minecraft directory.
- [ ] Actual Minecraft version is selected independently.
- [ ] Edition selection works.
- [ ] Unverified components are not auto-installed.
- [ ] Downloads have failure handling and integrity validation where possible.
- [ ] Existing user data is protected.
- [ ] Cancellation and partial failure are handled.
- [ ] Logs do not expose secrets.
- [ ] Installer/uninstaller behavior is documented if supplied.
- [ ] Version number and release notes are correct.
- [ ] SHA-256 checksum is generated for the final release binary.
- [ ] Release artifact is tested after download, not only from the developer workspace.

## Website gate

Do not begin website/setup redesign until the desktop EXE has passed its acceptance tests and the user approves the milestone. Then link the website to the actual verified release artifact; never publish placeholder links.
