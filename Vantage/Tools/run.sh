#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Opens Vantage in the Unreal editor.
#
# Launching the .uproject with `open` hands it to the macOS file association,
# which quietly fails if the association cannot resolve the engine version.
# Invoking the editor binary directly sidesteps that and keeps the log on your
# terminal, where you can read it.
# ---------------------------------------------------------------------------

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$HERE/../Vantage.uproject"

if [[ ! -f "$PROJECT" ]]; then
    echo "Could not find Vantage.uproject next to this script."
    exit 1
fi

is_engine_root() {
    [[ -d "$1/Engine/Build/BatchFiles" ]]
}

UE_ROOT="${UE_ROOT:-}"

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
    echo "Could not find an Unreal Engine install."
    echo "Point it at yours directly:  UE_ROOT=\"/path/to/UE_5.7\" $0"
    exit 1
fi

case "$(uname -s)" in
    Darwin) EDITOR="$UE_ROOT/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" ;;
    *)      EDITOR="$UE_ROOT/Engine/Binaries/Linux/UnrealEditor" ;;
esac

if [[ ! -x "$EDITOR" ]]; then
    echo "Found engine at $UE_ROOT but no editor binary at:"
    echo "  $EDITOR"
    exit 1
fi

echo "Engine:  $UE_ROOT"
echo "Project: $PROJECT"
echo
echo "Launching. Close the editor to get this terminal back."
echo

exec "$EDITOR" "$PROJECT" "$@"
