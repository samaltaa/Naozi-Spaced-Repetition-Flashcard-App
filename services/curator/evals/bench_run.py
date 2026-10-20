from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml
from dotenv import dotenv_values

# Paths

EVALS = Path(__file__).resolve().parent
SERVICE = EVALS.parent
REPO = SERVICE.parents[1]
DATASET = EVALS / "datasets" / "benchmark"
OUT = EVALS / "results" / "benchmark" / "generations"
WORKER = EVALS / "bench_worker.py"
PYTHON = SERVICE / ".venv" / "bin" / "python"

# Versions

@dataclass(frozen=True)
class Version:
    name: str
    commit: str
    languages: tuple[str, ...]
    runs: int

VERSIONS = [
    Version("v1", "10894ede", ("es",), 1),
    Version("v3", "1956a501", ("es",), 1),
    Version("v4", "630a73a1", ("es",), 1),
    Version("v6", "d8d9cd22", ("es", "ru", "zh"), 2),
]

PASSED_ENV = ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR")

# Worktrees

def worktree(version: Version, root: Path) -> Path:
    path = root / version.name
    if not path.exists():
        subprocess.run(
            ["git", "-C", str(REPO), "worktree", "add", "--detach", str(path), version.commit],
            check=True,
            capture_output=True,
        )
    return path

def remove_worktrees(root: Path) -> None:
    for version in VERSIONS:
        path = root / version.name
        if path.exists():
            subprocess.run(["git", "-C", str(REPO), "worktree", "remove", "--force", str(path)], check=True)

# Environment

def clean_env(src: Path) -> dict[str, str]:
    key = dotenv_values(SERVICE / ".env").get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        sys.exit("ANTHROPIC_API_KEY is not set in services/curator/.env")
    env = {name: os.environ[name] for name in PASSED_ENV if name in os.environ}
    env["ANTHROPIC_API_KEY"] = key
    env["PYTHONPATH"] = str(src)
    return env

# Texts

def texts() -> list[dict[str, str]]:
    return yaml.safe_load((DATASET / "sources.yaml").read_text(encoding="utf-8"))["texts"]

# Running

def run_one(version: Version, tree: Path, text: dict[str, str], run: int) -> None:
    out = OUT / f"{version.name}__{text['name']}__run{run}.json"
    if out.exists():
        print(f"  {out.name} exists, skipping")
        return

    src = tree / "services" / "curator" / "src"
    text_path = DATASET / "texts" / f"{text['name']}.txt"
    print(f"  {version.name} {text['name']} run {run}...", flush=True)
    done = subprocess.run(
        [str(PYTHON), str(WORKER), str(text_path), text["language"]],
        cwd=tree / "services" / "curator",
        env=clean_env(src),
        capture_output=True,
        text=True,
        check=False,
    )
    if done.returncode != 0:
        print(done.stderr[-2000:])
        raise SystemExit(f"{version.name} failed on {text['name']}")

    payload = json.loads(done.stdout.strip().splitlines()[-1])
    if not payload["curator_path"].startswith(str(src)):
        raise SystemExit(f"{version.name} imported the wrong code: {payload['curator_path']}")

    payload.update({"version": version.name, "commit": version.commit, "text": text["name"], "language": text["language"], "run": run})
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"    {len(payload['items'])} items, ${payload['cost_usd']:.4f}, {payload['seconds']}s")

def main() -> None:
    parser = argparse.ArgumentParser(description="Run every curator version on the benchmark texts")
    parser.add_argument("--worktrees", type=Path, required=True)
    parser.add_argument("--versions", nargs="*", default=[v.name for v in VERSIONS])
    parser.add_argument("--texts", nargs="*")
    parser.add_argument("--cleanup", action="store_true")
    args = parser.parse_args()

    if args.cleanup:
        remove_worktrees(args.worktrees)
        return

    OUT.mkdir(parents=True, exist_ok=True)
    args.worktrees.mkdir(parents=True, exist_ok=True)
    chosen = [t for t in texts() if not args.texts or t["name"] in args.texts]

    for version in VERSIONS:
        if version.name not in args.versions:
            continue
        tree = worktree(version, args.worktrees)
        print(f"{version.name} ({version.commit})")
        for text in chosen:
            if text["language"] not in version.languages:
                continue
            for run in range(1, version.runs + 1):
                run_one(version, tree, text, run)

if __name__ == "__main__":
    main()
