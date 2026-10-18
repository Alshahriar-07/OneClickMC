# OneClickMC — GUI Design Specification

## 1. Reference direction

Use the supplied screenshot as a **visual direction reference**, not as an exact page to copy. Its defining traits are:

- A dark, cinematic Minecraft forest background.
- Large blocky/pixel display typography.
- Strong green-to-gold headline treatment.
- Bright, readable white supporting text.
- Chunky, beveled, pixel-inspired buttons with clear borders.
- A premium handcrafted Minecraft feel.

The existing `appbg.png` should be the primary background image. Inspect the actual file in the repository and use it rather than substituting a random background. The uploaded screenshot is a design reference; it is not the app's background asset.

## 2. Background usage

- Use `appbg.png` as the main app background where it is legible and appropriate.
- Scale with `cover`-like behavior; avoid stretching or distorting the image.
- Add a dark translucent overlay/gradient behind text and panels when needed.
- Keep body text readable on bright or busy parts of the background.
- Avoid placing small text directly over detailed scenery.
- Use a solid or translucent dark surface for dense forms, logs, compatibility tables, and progress details.
- If the background asset is missing, show a graceful neutral dark fallback and document the missing asset; do not crash or invent a replacement asset.

## 3. Typography

- Use a blocky/pixel-inspired font for large headings and important action labels.
- Keep paragraphs, form labels, error messages, and long lists in a clean, highly readable sans-serif font.
- Avoid using a pixel font for every text element; readability takes priority.
- Main brand title may use green-to-gold coloring inspired by the reference.
- Use consistent heading hierarchy, line height, and spacing.

## 4. Color and materials

Suggested starting palette (adjust to the actual assets):

- Forest-black background: `#101510`
- Deep panel: `#171D18`
- Border/outline: `#6C756B`
- Primary green: `#69C83F`
- Secondary gold: `#E7B13D`
- Main text: `#F5F5F2`
- Muted text: `#C0C7BF`
- Error: `#E35D5D`
- Success: `#72D477`

Use green for the primary action and positive/selected states; gold for secondary/highlight actions. Do not use color alone to communicate compatibility or errors—include labels/icons.

## 5. Buttons

Buttons should resemble chunky Minecraft/pixel UI controls:

- Strong rectangular silhouette.
- Clear outer border and inner highlight/shadow.
- Slightly beveled or layered edges.
- Pixel-inspired label font for short action labels.
- Obvious hover, pressed, disabled, and keyboard-focus states.
- Consistent height and padding.
- Avoid excessive rounded-pill buttons.
- Do not sacrifice keyboard accessibility or readable contrast for decoration.

Suggested variants:
- Primary: green treatment.
- Secondary: gold/brown treatment.
- Neutral: grey/dark treatment.
- Destructive: red, with confirmation.

## 6. Layout and screens

### Welcome/dashboard
- Brand/title and concise purpose statement.
- Primary action: choose/detect Minecraft installation.
- Three edition cards.
- Small status area for detected installation and compatibility data.
- Keep the background visible around panels.

### Minecraft installation screen
- Browse/select root directory.
- Show discovered profiles/installations.
- Show effective game directory when known.
- Separate selector for actual Minecraft version.
- Explain uncertainty instead of guessing.

### Edition selection
- Three visually distinct cards: Potato, Balanced, Ultimate.
- Each card states its intent and qualitative resource demand.
- No guaranteed FPS claims.
- Clear selected state.

### Components
- Group mods, shaders, resource packs, dependencies.
- Show compatibility and required dependency state.
- Allow optional components to be selected/deselected.
- Show official source link and useful warnings.
- Only one shader should be selected as the active shader unless the underlying system explicitly supports otherwise.

### Install review
- Selected game version and effective directory.
- Edition and component list.
- Download size only if reliable metadata exists.
- Backup plan and warnings.
- Explicit confirmation before making changes.

### Progress
- Show current task, actual completed/total work, and readable log details.
- Distinguish resolving, downloading, verifying, backing up, installing, and final verification.
- Never animate fake progress to 100%.

### Result
- Success/failure summary.
- Installed and skipped components.
- Clear errors and recovery options.
- Open logs or installation directory.
- Offer launcher action only when reliably supported.

### Settings/diagnostics
- Download/cache location if supported.
- Logs.
- Theme/background fallback behavior.
- Compatibility data status.
- Reset settings with confirmation.

## 7. Motion

- Short, restrained transitions for screen changes and selection states.
- Subtle hover feedback.
- Progress animations must reflect real work.
- Respect reduced-motion preferences where practical.
- Avoid continuous heavy animation that wastes resources.

## 8. Accessibility and window behavior

- Support keyboard navigation and visible focus.
- Keep body text readable at common Windows scaling settings.
- Do not rely on hover alone.
- Ensure layouts adapt to typical desktop window sizes.
- Keep critical actions visible without forcing unnecessary scrolling.
- Do not block the whole UI during long operations; support safe cancellation where possible.

## 9. Brand assets

Reuse existing `logo.png`, `.ico`, `text.png`, and `appbg.png` if present. Use the icon for the EXE/window/taskbar where supported. Avoid replacing the user's branding without permission.
