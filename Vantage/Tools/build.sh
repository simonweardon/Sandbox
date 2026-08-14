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

# An engine root is any directory containing Engine/Build/BatchFiles.
is_engine_root() {
    [[ -d "$1/Engine/Build/BatchFiles" ]]
}

# Honour an explicit UE_ROOT from the environment before guessing anything:
#   UE_ROOT="/path/to/UE_5.5" ./build.sh
UE_ROOT="${UE_ROOT:-}"

if [[ -n "$UE_ROOT" ]] && ! is_engine_root "$UE_ROOT"; then
    echo "UE_ROOT was set to '$UE_ROOT' but that is not an engine root."
    echo "It should be the folder containing Engine/Build/BatchFiles."
    exit 1
fi

# Globs rather than a fixed version list, sorted newest first, so this keeps
# working when the engine is updated.
if [[ -z "$UE_ROOT" ]]; then
    while IFS= read -r CANDIDATE; do
        if is_engine_root "$CANDIDATE"; then
            UE_ROOT="$CANDIDATE"
            break
        fi
    done < <(
        {
            ls -d /Users/Shared/Epic\ Games/UE_* 2>/dev/null
            ls -d /Applications/UE_* 2>/dev/null
            ls -d /Applications/Epic\ Games/UE_* 2>/dev/null
            ls -d "$HOME"/Epic\ Games/UE_* 2>/dev/null
            ls -d "$HOME"/UnrealEngine /opt/UnrealEngine 2>/dev/null
        } | sort -rV
    )
fi

# Last resort: ask Spotlight where the editor lives and walk back up to the root.
if [[ -z "$UE_ROOT" ]] && command -v mdfind >/dev/null 2>&1; then
    while IFS= read -r APP; do
        CANDIDATE="${APP%/Engine/Binaries/Mac/UnrealEditor.app}"
        if [[ "$CANDIDATE" != "$APP" ]] && is_engine_root "$CANDIDATE"; then
            UE_ROOT="$CANDIDATE"
            break
        fi
    done < <(mdfind "kMDItemFSName == 'UnrealEditor.app'" 2>/dev/null | head -20)
fi

if [[ -z "$UE_ROOT" ]]; then
    echo "Could not find an Unreal Engine install in any of the usual places."
    echo
    echo "Point it at yours directly:"
    echo "    UE_ROOT=\"/path/to/UE_5.5\" $0"
    echo
    echo "That path is the folder containing Engine/Build/BatchFiles."
    echo "If you are not sure where it is, try:"
    echo "    mdfind \"kMDItemFSName == 'UnrealEditor.app'\""
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
