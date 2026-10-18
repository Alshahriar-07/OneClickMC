# OneClickMC — Planning Archive

This archive defines the product, visual direction, Windows application workflow, technical architecture, and mod/shader/resource-pack research plan for OneClickMC.

## Important delivery order

**Phase 1: Build and verify the Windows desktop EXE first.**  
**Phase 2: Only after the EXE is stable, plan and build the website/setup experience.**

The website is not the current implementation target. The immediate goal is a polished, usable desktop GUI installer.

## Read in this order

1. `wholeplan.md` — consolidated product blueprint.
2. `ui.md` — visual and interaction specification, including the supplied CraftingTable-style reference.
3. `workflow.md` — user and installer workflow.
4. `plan.md` — architecture and staged implementation plan.
5. `list and links.md` — mod, shader, and resource-pack catalog plus verification requirements.
6. `release-plan.md` — Windows EXE packaging and verification.
7. `compatibility-template.json` — starter schema for verified compatibility records.
8. `assets/README.md` — assets to reuse from the existing repository.

## Project links

- Website: https://oneclickmc.vercel.app
- GitHub repository: https://github.com/Alshahriar-07/OneClickMC
- Existing release reference: https://github.com/Alshahriar-07/OneClickMC/releases/download/version1/MC-26.2-Setup.bat

## Evidence and compatibility policy

The mod lists are candidates, not verified installation manifests. Each component must be checked against the exact Minecraft version, loader, dependencies, file metadata, and license before it is enabled by default. Never fabricate compatibility or benchmark results.
