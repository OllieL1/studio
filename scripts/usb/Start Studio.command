#!/bin/bash
# Studio - double-click to start on the Mac.
cd "$(dirname "$0")/studio" || exit 1
exec ./runtime/mac-arm64/node ./launcher.mjs
