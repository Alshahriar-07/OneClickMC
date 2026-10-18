"""Ad-hoc verification probe for the OneClickMC component catalog.

Queries the official Modrinth API (no scraping, no invented data) and reports
which catalog projects actually publish files for each target Minecraft
version / loader combination. This is a research tool, not part of the app.
"""

import json
import urllib.parse
import urllib.request

MC_VERSIONS = ["1.21.11", "26.1", "26.2"]
LOADERS = {
    "mod": ["fabric"],
    "shader": ["iris", "minecraft"],
    "resourcepack": ["minecraft"],
}

PROJECTS = {
    "mod": [
        "sodium", "lithium", "ferrite-core", "immediatelyfast", "entityculling",
        "modernfix", "moreculling", "dynamic-fps", "iris", "fabric-api",
        "continuity", "not-enough-animations", "3dskinlayers", "eating-animation",
        "visuality", "distanthorizons", "entity-model-features",
        "entitytexturefeatures", "presence-footsteps",
    ],
    "shader": [
        "bsl-shaders", "sildurs-enhanced-default-shaders", "sildurs-basic-shaders",
        "makeup-ultra-fast-shaders", "complementary-unbound", "bliss-shader",
        "solas-shader",
    ],
    "resourcepack": [
        "fresh-animations", "stay-true", "3d-mace", "better-lanterns",
        "better-leaves", "dark-mode-everywhere", "optimum-realism",
        "prettyrealistic",
    ],
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "OneClickMC-catalog-probe/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    for ptype, slugs in PROJECTS.items():
        loaders = LOADERS[ptype]
        print(f"\n=== {ptype} ===")
        for slug in slugs:
            try:
                project = get(f"https://api.modrinth.com/v2/project/{slug}")
            except Exception as exc:  # noqa: BLE001 - probe tool
                print(f"{slug:38} PROJECT ERROR {exc}")
                continue
            row = [f"{slug:38}", project.get("title", "")[:26].ljust(26)]
            for mc in MC_VERSIONS:
                q = urllib.parse.urlencode({
                    "game_versions": json.dumps([mc]),
                    "loaders": json.dumps(loaders),
                })
                try:
                    versions = get(f"https://api.modrinth.com/v2/project/{slug}/version?{q}")
                    row.append(f"{mc}:{len(versions):>3}")
                except Exception:  # noqa: BLE001
                    row.append(f"{mc}:ERR")
            print("  ".join(row))


if __name__ == "__main__":
    main()
