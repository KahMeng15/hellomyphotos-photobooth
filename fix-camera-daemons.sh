#!/usr/bin/env bash
# fix-camera-daemons.sh
# Restores macOS camera daemons that were permanently disabled by the
# hellomyphotos photobooth app (com.apple.ptpcamerad, com.apple.imagecaptured).
# Run this once to fix Capture One, Lightroom Classic, and any other tether app.
#
# Usage:
#   chmod +x fix-camera-daemons.sh
#   ./fix-camera-daemons.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
ok()      { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
section() { echo -e "\n${BOLD}$*${RESET}"; }

echo ""
echo -e "${BOLD}========================================${RESET}"
echo -e "${BOLD}  macOS Camera Daemon Restoration Tool  ${RESET}"
echo -e "${BOLD}========================================${RESET}"
echo ""
info "This script re-enables the macOS camera services that were"
info "permanently disabled by the hellomyphotos photobooth app."
echo ""

UID_PATH="gui/$(id -u)"

# ---------------------------------------------------------------------------
# Step 1: Re-enable disabled services in launchd's persistent database
# ---------------------------------------------------------------------------
section "Step 1 — Re-enabling launchd services..."

SERVICES=(
  "com.apple.ptpcamerad"
  "com.apple.imagecaptured"
  "com.apple.PTPCamera"
)

for svc in "${SERVICES[@]}"; do
  launchctl enable "${UID_PATH}/${svc}" 2>/dev/null && ok "Enabled ${svc}" || warn "Could not enable ${svc} (may not exist on this macOS version)"
done

# ---------------------------------------------------------------------------
# Step 2: Reload the plist agents that were booted out
# ---------------------------------------------------------------------------
section "Step 2 — Reloading launch agents..."

PLISTS=(
  "/System/Library/LaunchAgents/com.apple.ptpcamerad.plist"
  "/System/Library/LaunchAgents/com.apple.imagecaptured.plist"
)

for plist in "${PLISTS[@]}"; do
  if [[ -f "$plist" ]]; then
    launchctl load "$plist" 2>/dev/null && ok "Loaded $(basename $plist)" || warn "$(basename $plist) already loaded or could not be loaded"
  else
    warn "Plist not found (expected on older macOS): $plist"
  fi
done

# ---------------------------------------------------------------------------
# Step 3: Bootstrap ptpcamerad the modern way (macOS 13+)
# ---------------------------------------------------------------------------
section "Step 3 — Bootstrapping services (macOS Ventura+ method)..."

for plist in "${PLISTS[@]}"; do
  if [[ -f "$plist" ]]; then
    launchctl bootstrap "${UID_PATH}" "$plist" 2>/dev/null && ok "Bootstrapped $(basename $plist)" || warn "$(basename $plist) already bootstrapped (that's fine)"
  fi
done

# ---------------------------------------------------------------------------
# Step 4: Verify services are now running
# ---------------------------------------------------------------------------
section "Step 4 — Verifying..."

echo ""
RUNNING=0
for svc in "ptpcamerad" "imagecaptured"; do
  STATUS=$(launchctl list 2>/dev/null | grep "$svc" || true)
  if [[ -n "$STATUS" ]]; then
    ok "  ${svc} is running: $STATUS"
    RUNNING=$((RUNNING + 1))
  else
    warn "  ${svc} not yet listed — it will start on next camera plug-in event"
  fi
done

echo ""
echo -e "${BOLD}========================================${RESET}"
if [[ $RUNNING -gt 0 ]]; then
  echo -e "${GREEN}${BOLD}  Done! Camera daemons restored.${RESET}"
else
  echo -e "${YELLOW}${BOLD}  Done! Services re-enabled in launchd.${RESET}"
fi
echo -e "${BOLD}========================================${RESET}"
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo "  1. Unplug your camera USB cable"
echo "  2. Plug it back in"
echo "  3. macOS will auto-launch PTPCamera for the device"
echo "  4. Open Capture One / Lightroom Classic — tethering should work again"
echo ""
echo -e "${BOLD}Note:${RESET} The photobooth app has been patched and will no longer"
echo "permanently disable these services in future sessions."
echo ""
