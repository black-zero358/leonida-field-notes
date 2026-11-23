"""Refresh the facts used from gta6-data; keep locally researched gameplay fields intact."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / "public" / "guide-data.js"
PREFIX = "window.GUIDE_DATA = "
UPSTREAM = "https://github.com/crlsmartnruiz/gta6-data"
ALIASES = {
    "dealer-s-choice": "dealers-choice",
    "yasmani-s-jewelry-jobs": "yasmanis-jewelry-jobs",
    # PowerPyx lists the title on entering the mission and the objective on the map together.
    "clonin-keys-makin-gs": "steal-the-zorrusso-for-randy",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", help="Full upstream Git commit, defaulting to the current pin")
    parser.add_argument("--check", action="store_true", help="Fail if pinned fields have changed")
    args = parser.parse_args()
    before = OUTPUT.read_text(encoding="utf-8")
    guide = json.loads(before.removeprefix(PREFIX).strip().removesuffix(";"))
    revision = args.revision or guide["missionIndex"]["revision"]
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        parser.error("Supply a full 40-character upstream commit SHA")
    raw_url = f"https://raw.githubusercontent.com/crlsmartnruiz/gta6-data/{revision}/data/missions.json"
    with urlopen(Request(raw_url, headers={"User-Agent": "LeonidaFieldNotes/1"}), timeout=30) as response:
        records = json.load(response)
    index = {item["id"]: item for item in records}
    if len(index) != len(records):
        raise ValueError("Duplicate mission IDs in upstream index")

    count = 0
    for chapter in guide["chapters"]:
        for mission in chapter["missions"]:
            target = ALIASES.get(mission["id"], mission["id"])
            item = index[target]
            url = urlsplit(item["source"])
            if url.scheme != "https" or url.hostname not in {"gta6intel.com", "www.gta6intel.com"}:
                raise ValueError(f"Review the source for {target} before importing it")
            mission["upstream"] = {"id": target, "name": item["name"], "updatedAt": item["updated_at"]}
            references = [r for r in mission["references"] if r["label"] != "GTA6Intel"]
            mission["references"] = [*references, {"label": "GTA6Intel", "url": item["source"]}]
            count += 1

    guide["missionIndex"] = {
        "name": "gta6-data", "revision": revision,
        "url": f"{UPSTREAM}/blob/{revision}/data/missions.json",
        "license": "MIT", "licenseUrl": "gta6-data.LICENSE.txt",
        "matched": count, "total": len(records),
    }
    after = PREFIX + json.dumps(guide, ensure_ascii=False, indent=2) + ";\n"
    print(f"{count} local records matched against {len(records)} upstream records at {revision[:8]}")
    if args.check:
        if after != before:
            raise SystemExit("Pinned data differs. Run the tool without --check and inspect the changes.")
    else:
        OUTPUT.write_text(after, encoding="utf-8")


if __name__ == "__main__":
    main()
