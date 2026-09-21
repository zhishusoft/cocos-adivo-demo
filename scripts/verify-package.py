#!/usr/bin/env python3
"""Verify the public Cocos demo package without requiring Cocos Creator."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    raise SystemExit(message)


manifest = json.loads((ROOT / "BINARY-MANIFEST.json").read_text())
for relative, expected in manifest["files"].items():
    path = ROOT / relative
    if not path.is_file():
        fail(f"Missing binary: {relative}")
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        fail(f"Binary checksum mismatch: {relative}")

example = json.loads((ROOT / "assets/resources/Adivo.local.json.example").read_text())
for key in ["sdkKey", "rewardedAdUnitId", "interstitialAdUnitId", "developmentTeam"]:
    if not str(example.get(key, "")).startswith("YOUR_"):
        fail(f"Example must contain a placeholder: {key}")
if example.get("testMode") is not True:
    fail("Example must default to testMode=true")

for forbidden in [
    ROOT / "assets/resources/Adivo.local.json",
    ROOT / "assets/resources/Adivo.local.json.meta",
    ROOT / "build-configs/ios.local.json",
]:
    if forbidden.exists():
        fail(f"Private local configuration is present: {forbidden.relative_to(ROOT)}")

identity_markers = [
    b"/" + b"Users/",
    b"Nox" + b"Workspace",
    b"Parking" + b"Master",
    b"Crazy" + b"Commands",
]
for path in ROOT.rglob("*"):
    relative = path.relative_to(ROOT)
    if (not path.is_file() or ".git" in relative.parts or
            any(part in {"build", "library", "temp", "local", "profiles", "node_modules"}
                for part in relative.parts)):
        continue
    raw = path.read_bytes()
    for marker in identity_markers:
        if marker in raw:
            fail(f"Private or reference identity marker found: {path.relative_to(ROOT)}")

print(f"Package verification passed: {len(manifest['files'])} binary files checked")
