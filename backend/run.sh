#!/usr/bin/env bash
# Linux/macOS: build + run the music server
cd "$(dirname "$0")/src/NullTab.MusicServer"
dotnet run -c Release
