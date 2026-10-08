#!/usr/bin/env bash
# Build the web bundle, archive the iOS app and upload it to App Store Connect.
#
#   npm run ios:archive                 # archive + upload (build number = UTC timestamp)
#   BUILD_NUMBER=42 npm run ios:archive # pin the build number
#   UPLOAD=0 npm run ios:archive        # archive only, export an .ipa to ios/build/export
#
# Needs: Xcode signed in to the Apple Developer account (Xcode → Settings →
# Accounts), or an App Store Connect API key via ASC_KEY_ID, ASC_ISSUER_ID and
# ASC_KEY_PATH (the .p8). The team id comes from APPLE_TEAM_ID or the
# DEVELOPMENT_TEAM already set in the Xcode project.
#
# The marketing version (1.0, 1.1, …) lives in Xcode: bump MARKETING_VERSION
# under the App target before a release that changes it. The build number must
# increase for every upload, which the timestamp default guarantees.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=ios/App/App.xcodeproj
SCHEME=App
OUT=ios/build
ARCHIVE="$OUT/DoorMan.xcarchive"
BUILD_NUMBER="${BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}"
UPLOAD="${UPLOAD:-1}"

TEAM="${APPLE_TEAM_ID:-}"
if [[ -z "$TEAM" ]]; then
  TEAM=$(sed -n 's/.*DEVELOPMENT_TEAM = \([A-Z0-9]*\);.*/\1/p' "$PROJECT/project.pbxproj" | head -1 || true)
fi
if [[ -z "$TEAM" || "$TEAM" == "TEAMID" ]]; then
  echo "Set APPLE_TEAM_ID (10-character Apple team id) or pick the team in Xcode first." >&2
  exit 1
fi

if grep -q '"TEAMID\.' public/.well-known/apple-app-site-association; then
  echo "public/.well-known/apple-app-site-association still has the TEAMID placeholder; replace it with $TEAM before releasing." >&2
  exit 1
fi

AUTH=()
if [[ -n "${ASC_KEY_ID:-}" ]]; then
  : "${ASC_ISSUER_ID:?ASC_ISSUER_ID is required with ASC_KEY_ID}"
  : "${ASC_KEY_PATH:?ASC_KEY_PATH is required with ASC_KEY_ID}"
  AUTH=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi

echo "==> Web bundle + cap sync"
npm run ios:sync

echo "==> Archive (build $BUILD_NUMBER, team $TEAM)"
rm -rf "$ARCHIVE"
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates "${AUTH[@]}" \
  DEVELOPMENT_TEAM="$TEAM" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  archive | tail -5

EXPORT_PLIST=$(mktemp -t ExportOptions).plist
if [[ "$UPLOAD" == "1" ]]; then
  cp ios/App/ExportOptions.plist "$EXPORT_PLIST"
else
  # Local .ipa instead of an upload.
  plutil -replace destination -string export -o "$EXPORT_PLIST" ios/App/ExportOptions.plist
fi
plutil -replace teamID -string "$TEAM" "$EXPORT_PLIST"

echo "==> Export ($( [[ "$UPLOAD" == "1" ]] && echo upload to App Store Connect || echo .ipa to $OUT/export ))"
rm -rf "$OUT/export"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$EXPORT_PLIST" \
  -exportPath "$OUT/export" -allowProvisioningUpdates "${AUTH[@]}" | tail -5
rm -f "$EXPORT_PLIST"

VERSION=$(plutil -extract ApplicationProperties.CFBundleShortVersionString raw "$ARCHIVE/Info.plist")
echo "==> Done: DoorMan $VERSION ($BUILD_NUMBER)"
if [[ "$UPLOAD" == "1" ]]; then
  echo "    Processing takes ~10 minutes; then it appears under TestFlight in App Store Connect."
fi
