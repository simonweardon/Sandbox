#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Builds Vantage on macOS or Linux and prints a short error report you can
# paste back. Takes no arguments - it locates the engine and project itself.
# ---------------------------------------------------------------------------

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$HERE/../Vantage.uproject"
LOG="$HERE/build-log.txt"

if [[ ! -f "$PROJECT" ]]; then
    echo "Could not find Vantage.uproject next to this script."
    echo "Expected it at: $PROJECT"
    exit 1
fi

# Newest engine first, so a machine with several installs picks the best one.
UE_ROOT=""
for CANDIDATE in \
    "/Users/Shared/Epic Games/UE_5.6" \
    "/Users/Shared/Epic Games/UE_5.5" \
    "/Users/Shared/Epic Games/UE_5.4" \
    "$HOME/UnrealEngine" \
    "/opt/UnrealEngine"
do
    if [[ -d "$CANDIDATE/Engine/Build/BatchFiles" ]]; then
        UE_ROOT="$CANDIDATE"
        break
    fi
done

if [[ -z "$UE_ROOT" ]]; then
    echo "Could not find an Unreal Engine install."
    echo "Set UE_ROOT by hand at the top of this script and re-run."
    exit 1
fi

case "$(uname -s)" in
    Darwin) BUILD="$UE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh";   PLATFORM="Mac"   ;;
    *)      BUILD="$UE_ROOT/Engine/Build/BatchFiles/Linux/Build.sh"; PLATFORM="Linux" ;;
esac

echo "Engine:   $UE_ROOT"
echo "Project:  $PROJECT"
echo "Platform: $PLATFORM"
echo
echo "Building. First run takes a few minutes."
echo

"$BUILD" VantageEditor "$PLATFORM" Development -Project="$PROJECT" -WaitMutex > "$LOG" 2>&1
RESULT=$?

if [[ $RESULT -eq 0 ]]; then
    echo "BUILD SUCCEEDED."
    echo
    echo 'Next: open Vantage.uproject, press Play, and filter the Output Log on'
    echo '"Vantage". The line "Vantage: Level built." means it is working.'
else
    echo "BUILD FAILED with code $RESULT."
    echo
    echo "First errors (full log in build-log.txt):"
    echo "-----------------------------------------------------------------"
    # One error cascades into hundreds, so keep only the first handful.
    grep -E "error:|Error:" "$LOG" | head -12
    echo "-----------------------------------------------------------------"
    echo
    echo "Paste the block above back to Claude."
fi

exit $RESULT
