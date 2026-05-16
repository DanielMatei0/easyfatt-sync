#!/usr/bin/env bash
# Genera assets/icon.icns da assets/icon.png (solo macOS: sips + iconutil).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/assets/icon.png"
ICONSET="${ROOT}/assets/icon.iconset"
ICNS="${ROOT}/assets/icon.icns"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "generate-icon-icns.sh richiede macOS (sips, iconutil)."
  exit 1
fi

if [[ ! -f "$SRC" ]]; then
  echo "Manca: $SRC"
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

sips -z 16 16     "$SRC" --out "${ICONSET}/icon_16x16.png" >/dev/null
sips -z 32 32     "$SRC" --out "${ICONSET}/icon_16x16@2x.png" >/dev/null
sips -z 32 32     "$SRC" --out "${ICONSET}/icon_32x32.png" >/dev/null
sips -z 64 64     "$SRC" --out "${ICONSET}/icon_32x32@2x.png" >/dev/null
sips -z 128 128   "$SRC" --out "${ICONSET}/icon_128x128.png" >/dev/null
sips -z 256 256   "$SRC" --out "${ICONSET}/icon_128x128@2x.png" >/dev/null
sips -z 256 256   "$SRC" --out "${ICONSET}/icon_256x256.png" >/dev/null
sips -z 512 512   "$SRC" --out "${ICONSET}/icon_256x256@2x.png" >/dev/null
sips -z 512 512   "$SRC" --out "${ICONSET}/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$SRC" --out "${ICONSET}/icon_512x512@2x.png" >/dev/null

iconutil -c icns "$ICONSET" -o "$ICNS"
rm -rf "$ICONSET"

echo "Creato: $ICNS"
