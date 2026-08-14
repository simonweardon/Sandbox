@echo off
REM ---------------------------------------------------------------------------
REM Builds Vantage and writes a short error report you can paste back.
REM
REM Usage: double-click, or run from anywhere. Takes no arguments - it locates
REM the engine and the .uproject itself.
REM ---------------------------------------------------------------------------

setlocal enabledelayedexpansion

set "PROJECT=%~dp0..\Vantage.uproject"
set "LOG=%~dp0build-log.txt"
set "ERRORS=%~dp0build-errors.txt"

if not exist "%PROJECT%" (
    echo Could not find Vantage.uproject next to this script.
    echo Expected it at: %PROJECT%
    goto :fail
)

REM Newest engine first, so a machine with several installs picks the best one.
set "UE_ROOT="
for %%V in (5.6 5.5 5.4 5.3) do (
    if not defined UE_ROOT (
        if exist "C:\Program Files\Epic Games\UE_%%V\Engine\Build\BatchFiles\Build.bat" (
            set "UE_ROOT=C:\Program Files\Epic Games\UE_%%V"
            set "UE_VER=%%V"
        )
    )
)

if not defined UE_ROOT (
    echo Could not find an Unreal Engine install under C:\Program Files\Epic Games.
    echo If yours lives elsewhere, set UE_ROOT by hand at the top of this script.
    goto :fail
)

echo Engine:  %UE_ROOT%
echo Project: %PROJECT%
echo.
echo Building. First run takes a few minutes.
echo.

call "%UE_ROOT%\Engine\Build\BatchFiles\Build.bat" VantageEditor Win64 Development -Project="%PROJECT%" -WaitMutex > "%LOG%" 2>&1
set "BUILD_RESULT=%ERRORLEVEL%"

REM One error cascades into hundreds, so keep only the first handful - those are
REM the ones worth reading and worth sending on.
findstr /R /C:"error" /C:"Error:" "%LOG%" > "%ERRORS%" 2>nul

if "%BUILD_RESULT%"=="0" (
    echo BUILD SUCCEEDED.
    echo.
    echo Next: open Vantage.uproject, press Play, and filter the Output Log on
    echo "Vantage". The line "Vantage: Level built." means it is working.
) else (
    echo BUILD FAILED with code %BUILD_RESULT%.
    echo.
    echo First errors ^(full log in build-log.txt^):
    echo -----------------------------------------------------------------
    set /a COUNT=0
    for /f "usebackq delims=" %%L in ("%ERRORS%") do (
        set /a COUNT+=1
        if !COUNT! leq 12 echo %%L
    )
    echo -----------------------------------------------------------------
    echo.
    echo Paste the block above back to Claude.
)

echo.
pause
exit /b %BUILD_RESULT%

:fail
echo.
pause
exit /b 1
