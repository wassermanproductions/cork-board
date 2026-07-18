#!/usr/bin/env bash
# Cork Board macOS installer
#
# Downloads the latest release and installs it to /Applications, bypassing
# the Gatekeeper "app is damaged" false alarm that macOS shows for
# browser-downloaded unsigned apps (terminal downloads aren't quarantined).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/wassermanproductions/cork-board/main/install.sh | bash
set -euo pipefail

REPO="wassermanproductions/cork-board"
ASSET="CorkBoard-macOS-universal.zip"

DEST="/Applications"
if [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading the latest Cork Board (universal — Apple Silicon & Intel)..."
curl -fL --progress-bar "https://github.com/$REPO/releases/latest/download/$ASSET" -o "$TMP/$ASSET"

echo "Installing to $DEST..."
rm -rf "$DEST/Cork Board.app"
ditto -x -k "$TMP/$ASSET" "$DEST"
xattr -cr "$DEST/Cork Board.app" 2>/dev/null || true

echo "✓ Cork Board installed — launching."
open "$DEST/Cork Board.app"
