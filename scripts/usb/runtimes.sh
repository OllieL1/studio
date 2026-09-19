#!/bin/bash
# Downloads the latest Node 22 LTS for Mac (Apple Silicon) and Windows (x64)
# into .usb-cache, checks both against nodejs.org's published SHA-256 sums,
# and keeps just the node binaries. Run before the first usb:deploy.
set -euo pipefail
cd "$(dirname "$0")/../.."
BASE=https://nodejs.org/dist/latest-v22.x
mkdir -p .usb-cache/mac-arm64 .usb-cache/win-x64
curl -fsSL "$BASE/SHASUMS256.txt" -o .usb-cache/SHASUMS256.txt
VER=$(grep -oE "node-v22\.[0-9]+\.[0-9]+-darwin-arm64\.tar\.gz" .usb-cache/SHASUMS256.txt | head -1 | sed -E 's/node-(v[0-9.]+)-.*/\1/')
for f in "node-$VER-darwin-arm64.tar.gz" "node-$VER-win-x64.zip"; do
  [ -f ".usb-cache/$f" ] || curl -fsSL "$BASE/$f" -o ".usb-cache/$f"
  want=$(grep " $f\$" .usb-cache/SHASUMS256.txt | awk '{print $1}')
  got=$(shasum -a 256 ".usb-cache/$f" | awk '{print $1}')
  [ "$want" = "$got" ] || { echo "Checksum mismatch for $f - not using it."; rm -f ".usb-cache/$f"; exit 1; }
done
tar -xzf ".usb-cache/node-$VER-darwin-arm64.tar.gz" -O "node-$VER-darwin-arm64/bin/node" > .usb-cache/mac-arm64/node
chmod +x .usb-cache/mac-arm64/node
unzip -o -j -q ".usb-cache/node-$VER-win-x64.zip" "node-$VER-win-x64/node.exe" -d .usb-cache/win-x64
echo "$VER" > .usb-cache/node-version
echo "Node $VER ready for Mac and Windows (checksums verified)."
