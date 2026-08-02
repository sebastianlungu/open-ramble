#!/usr/bin/env bash
set -euo pipefail

# x86_64 Darwin Binary Verification
# Downloads opencode-darwin-x64.zip from GitHub Release v1.18.9,
# verifies SHA-256, extracts, checks architecture and size.

MANIFEST="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/compatibility-manifest.json}"
SHA_BIN=$(jq -r '.components[] | select(.name=="opencode-cli") | .platforms["darwin-x64"].binarySha256' "$MANIFEST")
SHA_ZIP=$(jq -r '.components[] | select(.name=="opencode-cli") | .platforms["darwin-x64"].zipSha256' "$MANIFEST")
BIN_SIZE=$(jq -r '.components[] | select(.name=="opencode-cli") | .platforms["darwin-x64"].binarySize' "$MANIFEST")
ZIP_SIZE=$(jq -r '.components[] | select(.name=="opencode-cli") | .platforms["darwin-x64"].zipSize' "$MANIFEST")

WORK_DIR="/var/folders/rr/jvph_g6n153d1l4cs32ctmxc0000gn/T/opencode/runtime-proof/verify-x64"
mkdir -p "$WORK_DIR"
ZIP_PATH="$WORK_DIR/opencode-darwin-x64.zip"

echo "=== x86_64 Binary Verification ==="
echo "Manifest: $MANIFEST"
echo "Work dir: $WORK_DIR"
echo ""

# 1. Download archive
if [ ! -f "$ZIP_PATH" ]; then
  echo "--- Step 1: Downloading opencode-darwin-x64.zip ---"
  curl -sL -o "$ZIP_PATH" \
    "https://github.com/anomalyco/opencode/releases/download/v1.18.9/opencode-darwin-x64.zip"
  echo "  Downloaded: $(stat -f%z "$ZIP_PATH") bytes"
else
  echo "--- Step 1: Using cached archive ---"
fi

# 2. Verify archive SHA-256
echo "--- Step 2: Verify archive SHA-256 ---"
ACTUAL_ZIP_SHA=$(shasum -a 256 "$ZIP_PATH" | cut -d' ' -f1)
echo "  Expected: $SHA_ZIP"
echo "  Actual:   $ACTUAL_ZIP_SHA"
if [ "$ACTUAL_ZIP_SHA" != "$SHA_ZIP" ]; then
  echo "  FAIL: SHA-256 mismatch"
  exit 1
fi
echo "  PASS: Archive SHA-256 matches manifest"

# 3. Verify archive size
echo "--- Step 3: Verify archive size ---"
ACTUAL_ZIP_SIZE=$(stat -f%z "$ZIP_PATH")
if [ "$ACTUAL_ZIP_SIZE" -ne "$ZIP_SIZE" ]; then
  echo "  FAIL: Size mismatch (expected $ZIP_SIZE, got $ACTUAL_ZIP_SIZE)"
  exit 1
fi
echo "  PASS: Archive size matches manifest ($ZIP_SIZE bytes)"

# 4. Extract archive
echo "--- Step 4: Extract archive ---"
unzip -o "$ZIP_PATH" -d "$WORK_DIR/extracted" > /dev/null 2>&1
EXTRACTED_BIN=$(find "$WORK_DIR/extracted" -type f -perm +111 | head -1)
if [ -z "$EXTRACTED_BIN" ]; then
  EXTRACTED_BIN=$(find "$WORK_DIR/extracted" -type f | head -1)
fi
echo "  Extracted: $EXTRACTED_BIN"
ls -la "$EXTRACTED_BIN"

# 5. Verify binary SHA-256
echo "--- Step 5: Verify binary SHA-256 ---"
ACTUAL_BIN_SHA=$(shasum -a 256 "$EXTRACTED_BIN" | cut -d' ' -f1)
echo "  Expected: $SHA_BIN"
echo "  Actual:   $ACTUAL_BIN_SHA"
if [ "$ACTUAL_BIN_SHA" != "$SHA_BIN" ]; then
  echo "  FAIL: Binary SHA-256 mismatch"
  exit 1
fi
echo "  PASS: Binary SHA-256 matches manifest"

# 6. Verify binary architecture
echo "--- Step 6: Verify binary architecture ---"
FILE_OUTPUT=$(file "$EXTRACTED_BIN")
echo "  file: $FILE_OUTPUT"
if echo "$FILE_OUTPUT" | grep -qE "x86_64|x64|intel"; then
  echo "  PASS: Binary is x86_64 architecture"
else
  echo "  FAIL: Binary is not x86_64"
  exit 1
fi

# 7. Verify binary size
echo "--- Step 7: Verify binary size ---"
ACTUAL_BIN_SIZE=$(stat -f%z "$EXTRACTED_BIN")
if [ "$ACTUAL_BIN_SIZE" -ne "$BIN_SIZE" ]; then
  echo "  FAIL: Binary size mismatch (expected $BIN_SIZE, got $ACTUAL_BIN_SIZE)"
  exit 1
fi
echo "  PASS: Binary size matches manifest ($BIN_SIZE bytes)"

# 8. Version probe
echo "--- Step 8: Version probe ---"
VERSION=$("$EXTRACTED_BIN" --version 2>/dev/null || echo "unknown")
echo "  Version: $VERSION"
if [ "$VERSION" != "1.18.9" ]; then
  echo "  FAIL: Version mismatch"
  exit 1
fi
echo "  PASS: Version 1.18.9"

# Cleanup
echo "--- Cleanup ---"
rm -rf "$WORK_DIR"
echo ""

echo "=== x86_64 Binary Verification: ALL PASS ==="
