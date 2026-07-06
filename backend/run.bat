@echo off
REM Windows: build + run the music server
cd /d "%~dp0src\NullTab.MusicServer"
dotnet run -c Release
