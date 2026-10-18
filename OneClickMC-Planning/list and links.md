# OneClickMC — Mod, Shader, and Resource-Pack Catalog

## Important status note

Every item below is a **candidate**. The URLs are starting points supplied for research; they do not establish that a particular file supports Minecraft `1.21.11`, `26.1`, or `26.2`. Verify official metadata, exact files, loader requirements, dependencies, license, and download terms before enabling an item.

Status values:
- `UNVERIFIED`: not yet validated for the selected target.
- `VERIFIED`: exact file and compatibility checked from trustworthy metadata.
- `UNAVAILABLE`: no suitable file found for that target.
- `INCOMPATIBLE`: verified to be unsuitable.
- `OPTIONAL_VERIFIED`: verified, but opt-in due to performance, conflicts, or personal preference.

## Potato — performance-first candidates

### Mods
| Project | Official project URL | Notes |
|---|---|---|
| Sodium | https://modrinth.com/mod/sodium | Rendering optimization; verify loader/version |
| Lithium | https://modrinth.com/mod/lithium | Game logic optimization |
| FerriteCore | https://modrinth.com/mod/ferrite-core | Memory optimization |
| ImmediatelyFast | https://modrinth.com/mod/immediatelyfast | Rendering optimizations |
| Entity Culling | https://modrinth.com/mod/entityculling | Avoid rendering hidden entities |
| ModernFix | https://modrinth.com/mod/modernfix | Various optimizations/fixes |
| More Culling | https://modrinth.com/mod/moreculling | Additional culling |
| Dynamic FPS | https://modrinth.com/mod/dynamic-fps | Reduce background resource use |
| Iris | https://modrinth.com/mod/iris | Shader support; shaders remain optional |
| Fabric API | https://modrinth.com/mod/fabric-api | Only if the selected loader/profile requires it |
| Continuity | https://modrinth.com/mod/continuity | Connected textures; check dependencies |
| Not Enough Animations | https://modrinth.com/mod/not-enough-animations | Visual animation |
| 3D Skin Layers | https://modrinth.com/mod/3dskinlayers | Player skin layer visuals |
| Eating Animation | https://modrinth.com/mod/eating-animation | Eating animation |
| Visuality | https://modrinth.com/mod/visuality | Visual effects |

### Shaders
| Project | URL | Notes |
|---|---|---|
| BSL Shaders | https://modrinth.com/shader/bsl-shaders | Optional; not guaranteed low-end |
| Sildur's Enhanced Default | https://modrinth.com/shader/sildurs-enhanced-default-shaders | Verify target files |
| Sildur's Basic Shaders | https://modrinth.com/shader/sildurs-basic-shaders | Verify target files |
| MakeUp Ultra Fast | https://modrinth.com/shader/makeup-ultra-fast-shaders | Verify target files |

### Resource packs
| Project | URL | Notes |
|---|---|---|
| Vanilla Tweaks | https://vanillatweaks.net/ | User-customized downloads may require a generated pack |
| Fresh Animations | https://modrinth.com/resourcepack/fresh-animations | Verify dependencies and version |
| Stay True | https://modrinth.com/resourcepack/stay-true | Verify version |
| Faithful 32x | https://faithfulpack.net/ | Verify edition, version, and license |

## Balanced — visual quality plus performance

### Additional mods
| Project | URL | Notes |
|---|---|---|
| Distant Horizons | https://modrinth.com/mod/distanthorizons | Significant configuration/compatibility considerations |
| Entity Model Features (EMF) | https://modrinth.com/mod/entity-model-features | Check required companion mods |
| Entity Texture Features (ETF) | https://modrinth.com/mod/entitytexturefeatures | Check dependencies |
| Presence Footsteps | https://modrinth.com/mod/presence-footsteps | Audio enhancement |

### Shader candidates
| Project | URL | Notes |
|---|---|---|
| Complementary Unbound | https://modrinth.com/shader/complementary-unbound | Choose one active shader |
| Bliss | https://modrinth.com/shader/bliss-shader | Verify target version and requirements |
| BSL Shaders | https://modrinth.com/shader/bsl-shaders | Shared candidate |
| Solas Shader | https://modrinth.com/shader/solas-shader | Verify target files |
| Derivative | https://www.curseforge.com/minecraft/shaders/derivative-main | Verify official file and compatibility |
| Iteration T | Official URL not yet confirmed | Do not invent a URL; research exact project identity |

### Resource-pack candidates
| Project | URL | Notes |
|---|---|---|
| 3D Mace | https://modrinth.com/resourcepack/3d-mace | Verify game version |
| Better Lanterns | https://modrinth.com/project/better-lanterns | Verify exact project/files |
| Motschen's Better Leaves | https://modrinth.com/resourcepack/better-leaves | Verify version and pack priority |
| Dark Mode Everywhere | https://modrinth.com/resourcepack/dark-mode-everywhere | Verify exact project/files |
| Fresh Animations | https://modrinth.com/resourcepack/fresh-animations | Shared candidate |
| Stay True | https://modrinth.com/resourcepack/stay-true | Shared candidate |
| Vanilla Tweaks | https://vanillatweaks.net/ | May require user-specific pack generation |

## Ultimate — high visual quality

### Resource-pack candidates
| Project | URL | Notes |
|---|---|---|
| Optimum Realism | https://modrinth.com/resourcepack/optimum-realism | Verify resolution/edition, target version, and license |
| PrettyRealistic | https://modrinth.com/resourcepack/prettyrealistic | Verify exact project identity, files, and license |
| Faithful 32x | https://faithfulpack.net/ | Candidate alternative; do not assume it is a realism/PBR pack |

### Shader and visual additions
Reuse compatible shader candidates from Balanced after verifying exact files. Distant Horizons may be offered as an optional advanced feature only when compatible. Verify PBR support instead of assuming it.

## Per-version matrix

Create separate live records for:
- Minecraft `1.21.11`
- Minecraft `26.1`
- Minecraft `26.2`

For each version and selected loader, validate every component individually. Do not mark all versions supported just because a project page exists.

## Required verification fields

For every actual downloadable component record:
- Project and file identity.
- Official project URL.
- Exact official file URL or API file ID.
- Game version.
- Loader and loader version.
- Java requirements where applicable.
- Required dependencies.
- File type and installation destination.
- Integrity hash when available.
- License and redistribution limitations.
- Verification date.
- Compatibility status and evidence.
- Known conflicts.

## Download and license policy

Prefer official project pages and APIs. Respect each project's terms and licenses. Do not redistribute project files unless allowed. Do not scrape or bypass access controls. Do not invent checksums, API responses, filenames, or download links. Do not download or install an unverified substitute silently.
