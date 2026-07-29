#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP="/Applications/Open-Ramble.app"
BINARY="$SCRIPT_DIR/.build/release/open-ramble"
SIGN_IDENTITY="${SIGN_IDENTITY:-Open-Ramble Dev}"
BUNDLE_ID="ai.open-ramble.macos-helper"
LOGIN_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
SIGNING_DIR="/tmp/oc"
SIGNING_CERT="$SIGNING_DIR/cert.pem"
SIGNING_KEY="$SIGNING_DIR/key.pem"
SIGNING_P12="$SIGNING_DIR/dev-legacy.p12"

ensure_signing_identity() {
  if security find-identity -v -p codesigning | grep -F "$SIGN_IDENTITY" >/dev/null; then
    return
  fi

  echo "Signing identity not found. Bootstrapping stable identity: $SIGN_IDENTITY"
  mkdir -p "$SIGNING_DIR"

  if [ ! -f "$SIGNING_KEY" ] || [ ! -f "$SIGNING_CERT" ]; then
    openssl req -x509 -newkey rsa:2048 \
      -keyout "$SIGNING_KEY" \
      -out "$SIGNING_CERT" \
      -days 7300 \
      -nodes \
      -subj "/CN=$SIGN_IDENTITY" \
      -addext "keyUsage=digitalSignature" \
      -addext "extendedKeyUsage=codeSigning"
  fi

  openssl pkcs12 -export -legacy \
    -out "$SIGNING_P12" \
    -inkey "$SIGNING_KEY" \
    -in "$SIGNING_CERT" \
    -passout pass:omni >/dev/null 2>&1

  security import "$SIGNING_P12" -k "$LOGIN_KEYCHAIN" -P "omni" -T /usr/bin/codesign >/dev/null
  security add-trusted-cert -r trustRoot -k "$LOGIN_KEYCHAIN" "$SIGNING_CERT" >/dev/null 2>&1 || true

  if ! security find-identity -v -p codesigning | grep -F "$SIGN_IDENTITY" >/dev/null; then
    echo "Failed to provision signing identity: $SIGN_IDENTITY" >&2
    exit 1
  fi
}

current_authority() {
  codesign -dv --verbose=4 "$APP" 2>&1 | sed -n 's/^Authority=//p' | sed -n '1p'
}

current_requirement() {
  codesign -d -r- "$APP" 2>&1 | sed -n 's/^designated => //p'
}

expected_leaf_hash() {
  security find-identity -v -p codesigning |
    sed -n "s/^[[:space:]]*[0-9][0-9]*) \([0-9A-Fa-f]*\) \"$SIGN_IDENTITY\"$/\1/p" |
    sed -n '1p' |
    tr '[:upper:]' '[:lower:]'
}

sync_privacy_keys() {
  local source_plist="$SCRIPT_DIR/Sources/OpenRamble/Info.plist"
  local target_plist="$APP/Contents/Info.plist"

  if [ ! -f "$source_plist" ]; then
    return 0
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to sync Info.plist privacy keys" >&2
    exit 1
  fi

  SOURCE_PLIST="$source_plist" TARGET_PLIST="$target_plist" python3 - <<'PY'
import os, plistlib, sys

src_path = os.environ["SOURCE_PLIST"]
tgt_path = os.environ["TARGET_PLIST"]

with open(src_path, "rb") as f:
    src = plistlib.load(f)
with open(tgt_path, "rb") as f:
    tgt = plistlib.load(f)

changed = 0
for k, v in src.items():
    if not isinstance(v, str):
        continue
    if tgt.get(k) != v:
        print(f"  syncing {k}")
        changed += 1
    tgt[k] = v

with open(tgt_path, "wb") as f:
    plistlib.dump(tgt, f)
PY
}

reset_screen_recording_if_identity_changed() {
  local authority requirement leaf_hash
  authority="$(current_authority || true)"
  requirement="$(current_requirement | tr '[:upper:]' '[:lower:]' || true)"
  leaf_hash="$(expected_leaf_hash || true)"

  if [ -z "$authority" ] || [ "$authority" != "$SIGN_IDENTITY" ] || [ -z "$leaf_hash" ] || ! printf '%s' "$requirement" | grep -Fq "certificate leaf = h\"$leaf_hash\""; then
    echo "Detected stale signing identity (${authority:-adhoc-or-missing}). Resetting Screen Recording TCC for $BUNDLE_ID"
    tccutil reset ScreenCapture "$BUNDLE_ID" || true
  fi
}

ensure_signing_identity

if [ "$APP" != "/Applications/Open-Ramble.app" ]; then
  echo "Error: APP guard failed" >&2
  exit 1
fi

if [ ! -d "$APP" ]; then
  echo "App bundle not found: $APP" >&2
  exit 1
fi

if [ ! -f "$APP/Contents/Info.plist" ]; then
  echo "Info.plist not found: $APP/Contents/Info.plist" >&2
  exit 1
fi

echo "Building..."
cd "$SCRIPT_DIR"
swift build -c release

if [ ! -x "$BINARY" ]; then
  echo "Built binary not found or not executable: $BINARY" >&2
  exit 1
fi

echo "Killing running Open-Ramble..."
pkill -f "Open-Ramble.app" 2>/dev/null || true
sleep 1

reset_screen_recording_if_identity_changed

echo "Installing binary..."
cp "$BINARY" "$APP/Contents/MacOS/open-ramble"

echo "Syncing Info.plist privacy keys from source..."
sync_privacy_keys
/usr/libexec/PlistBuddy -c "Print :NSSpeechRecognitionUsageDescription" "$APP/Contents/Info.plist" >/dev/null
/usr/libexec/PlistBuddy -c "Print :NSMicrophoneUsageDescription" "$APP/Contents/Info.plist" >/dev/null

echo "Stamping repo root: $REPO_ROOT"
/usr/libexec/PlistBuddy -c "Set :OpenRambleRepoRoot $REPO_ROOT" "$APP/Contents/Info.plist" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Add :OpenRambleRepoRoot string $REPO_ROOT" "$APP/Contents/Info.plist"

echo "Cleaning previous signature and stale artifacts..."
rm -rf "$APP/Contents/_CodeSignature"
find "$APP/Contents" -name "*.cstemp" -delete

echo "Signing with stable identity: $SIGN_IDENTITY..."
codesign --force --sign "$SIGN_IDENTITY" \
  --identifier "$BUNDLE_ID" \
  "$APP"

echo "Verifying signature..."
if ! codesign --verify --strict --verbose=4 "$APP"; then
  echo "Error: signature verification failed for $APP" >&2
  exit 1
fi
echo "Signature valid."

echo ""
echo "Done. Run: open -a Open-Ramble"
echo ""
echo "TCC permissions persist across rebuilds with this signing identity, and Screen Recording is reset automatically if the signing identity changed."
