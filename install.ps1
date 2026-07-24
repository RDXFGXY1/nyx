<#
  Nyx - installer / updater for Windows (PowerShell 5.1+)

    install or update:  irm https://raw.githubusercontent.com/RDXFGXY1/nyx/main/install.ps1 | iex

  Why this is safe for your data
  ------------------------------
  Your settings, links, notes, stash, vault token, dictionaries and stats all
  live in the BROWSER's profile (chrome.storage + localStorage), not in this
  folder. An unpacked extension keeps its identity - and therefore its storage
  - as long as the folder PATH stays the same. So this script always updates
  files in place and never moves or renames the install directory.

  js/config.js (your personal links) is never overwritten. If the new release
  ships a different one it is written next to it as js/config.new.js.

  Environment variables (optional)
    NYX_DIR   where to install / where the install already is
    NYX_REF   branch or tag to install from   (default: main)
    NYX_SRC   local .zip or folder to install from instead of downloading

  NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
  unless it has a UTF-8 BOM, and a stray decoded curly quote silently ends a
  string literal - which swallows the rest of the script.
#>

$ErrorActionPreference = 'Stop'

function Invoke-NyxInstall {
  $repo = 'RDXFGXY1/nyx'
  $ref  = if ($env:NYX_REF) { $env:NYX_REF } else { 'main' }

  # files that make up the extension - everything else in the repo
  # (backend, desktop, tui) is not needed to run it
  $parts = @('manifest.json', 'index.html', 'save.html', 'css', 'js', 'assets')
  # never overwritten: your personal settings file
  $keep  = @('js\config.js')

  $stateDir  = Join-Path $env:LOCALAPPDATA 'nyx-updater'
  $stateFile = Join-Path $stateDir 'install-path.txt'

  function Step($m) { Write-Host "  $m" -ForegroundColor DarkGray }
  function Good($m) { Write-Host "  $m" -ForegroundColor Green }
  function Note($m) { Write-Host "  $m" -ForegroundColor Yellow }

  function Test-NyxDir($p) {
    if (-not $p) { return $false }
    $m = Join-Path $p 'manifest.json'
    if (-not (Test-Path $m)) { return $false }
    try { return ((Get-Content $m -Raw | ConvertFrom-Json).name -eq 'nyx') } catch { return $false }
  }

  function Get-NyxVersion($p) {
    try { (Get-Content (Join-Path $p 'manifest.json') -Raw | ConvertFrom-Json).version } catch { $null }
  }

  # NYX in block letters, Tokyo-night neon gradient. The glyphs are stored as
  # base64 so this .ps1 stays pure ASCII (see the note at the top of the file);
  # they are decoded and printed as UTF-8 at runtime.
  function Show-NyxBanner {
    try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
    $b64 = 'ICAg4paI4paI4paI4pWXICAg4paI4paI4pWX4paI4paI4pWXICAg4paI4paI4pWX4paI4paI4pWXICDilojilojilZcKICAg4paI4paI4paI4paI4pWXICDilojilojilZHilZrilojilojilZcg4paI4paI4pWU4pWd4pWa4paI4paI4pWX4paI4paI4pWU4pWdCiAgIOKWiOKWiOKVlOKWiOKWiOKVlyDilojilojilZEg4pWa4paI4paI4paI4paI4pWU4pWdICDilZrilojilojilojilZTilZ0KICAg4paI4paI4pWR4pWa4paI4paI4pWX4paI4paI4pWRICDilZrilojilojilZTilZ0gICDilojilojilZTilojilojilZcKICAg4paI4paI4pWRIOKVmuKWiOKWiOKWiOKWiOKVkSAgIOKWiOKWiOKVkSAgIOKWiOKWiOKVlOKVnSDilojilojilZcKICAg4pWa4pWQ4pWdICDilZrilZDilZDilZDilZ0gICDilZrilZDilZ0gICDilZrilZDilZ0gIOKVmuKVkOKVnQo='
    $art   = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) -replace "`r", ""
    $lines = $art -split "`n"
    $rgb   = @('247;118;142', '187;154;247', '157;124;216', '122;162;247', '125;207;255', '86;95;137')
    $c16   = @('Magenta', 'Magenta', 'DarkMagenta', 'Blue', 'Cyan', 'DarkGray')
    $tc    = [bool]($env:WT_SESSION -or ($env:COLORTERM -match 'truecolor|24bit'))
    $e     = [char]27
    Write-Host ""
    for ($i = 0; $i -lt 6; $i++) {
      if (-not $lines[$i]) { continue }
      if ($tc) { Write-Host ("$e[38;2;$($rgb[$i])m" + $lines[$i] + "$e[0m") }
      else     { Write-Host $lines[$i] -ForegroundColor $c16[$i] }
    }
    if ($tc) { Write-Host ("$e[38;2;125;207;255m      new tab, reimagined  $e[38;2;86;95;137m- installer / updater$e[0m") }
    else     { Write-Host "      new tab, reimagined  - installer / updater" -ForegroundColor DarkGray }
    Write-Host ""
  }

  Show-NyxBanner

  # ---------- 1. where does it live? ----------
  $target = $null
  $reason = ''

  if ($env:NYX_DIR) {
    $target = $env:NYX_DIR; $reason = 'NYX_DIR'
  } elseif ((Test-Path $stateFile) -and (Test-NyxDir (Get-Content $stateFile -Raw).Trim())) {
    $target = (Get-Content $stateFile -Raw).Trim(); $reason = 'remembered from last run'
  } elseif (Test-NyxDir (Get-Location).Path) {
    $target = (Get-Location).Path; $reason = 'current folder'
  } else {
    foreach ($guess in @(
      (Join-Path $env:LOCALAPPDATA 'nyx'),
      (Join-Path $HOME 'nyx'),
      (Join-Path $HOME 'Documents\nyx')
    )) {
      if (Test-NyxDir $guess) { $target = $guess; $reason = 'found on disk'; break }
    }
  }

  if (-not $target) {
    $target = Join-Path $env:LOCALAPPDATA 'nyx'
    $reason = 'new install'
  }

  $target = [IO.Path]::GetFullPath($target)
  # fresh = there is no nyx install at that path yet, however we got the path
  $fresh  = -not (Test-NyxDir $target)
  $oldVer = if ($fresh) { $null } else { Get-NyxVersion $target }

  Step "folder     $target  ($reason)"
  if ($oldVer) { Step "installed  v$oldVer" }

  # ---------- 2. get the new files ----------
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("nyx-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null

  try {
    $src = Join-Path $tmp 'src'

    if ($env:NYX_SRC) {
      Step "source     $env:NYX_SRC"
      if ((Get-Item $env:NYX_SRC).PSIsContainer) {
        New-Item -ItemType Directory -Path $src -Force | Out-Null
        foreach ($p in $parts) {
          $s = Join-Path $env:NYX_SRC $p
          if (Test-Path $s) { Copy-Item $s $src -Recurse -Force }
        }
      } else {
        Expand-Archive -Path $env:NYX_SRC -DestinationPath $src -Force
      }
    } else {
      try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
      $url = "https://github.com/$repo/archive/refs/heads/$ref.zip"
      $zip = Join-Path $tmp 'nyx.zip'
      Step "download   $url"
      $pp = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
      try { Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing } finally { $ProgressPreference = $pp }
      Step ("got        {0:N0} KB" -f ((Get-Item $zip).Length / 1KB))
      Expand-Archive -Path $zip -DestinationPath $src -Force
    }

    # the github zip unpacks into a single <repo>-<ref> folder
    $root = $src
    if (-not (Test-Path (Join-Path $root 'manifest.json'))) {
      $inner = Get-ChildItem $root -Directory | Select-Object -First 1
      if ($inner) { $root = $inner.FullName }
    }

    if (-not (Test-NyxDir $root)) { throw "the download does not look like nyx (no valid manifest.json)" }
    $newVer = Get-NyxVersion $root
    Step "release    v$newVer"

    if ($oldVer -and $oldVer -eq $newVer) { Note "already on v$newVer - reinstalling the same version" }

    # ---------- 3. back up the current code ----------
    if (-not $fresh) {
      $backupDir = Join-Path $stateDir 'backups'
      New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
      $bkTmp = Join-Path $tmp 'backup'
      New-Item -ItemType Directory -Path $bkTmp -Force | Out-Null
      foreach ($p in @('manifest.json', 'index.html', 'save.html', 'css', 'js')) {
        $s = Join-Path $target $p
        if (Test-Path $s) { Copy-Item $s $bkTmp -Recurse -Force }
      }
      if (Get-ChildItem $bkTmp) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $bkZip = Join-Path $backupDir "nyx-v$oldVer-$stamp.zip"
        Compress-Archive -Path (Join-Path $bkTmp '*') -DestinationPath $bkZip -Force
        Step "backup     $bkZip"
        # keep only the three most recent
        Get-ChildItem $backupDir -Filter 'nyx-v*.zip' |
          Sort-Object LastWriteTime -Descending | Select-Object -Skip 3 |
          Remove-Item -Force -ErrorAction SilentlyContinue
      }
    }

    # ---------- 4. stash the files we must not clobber ----------
    $saved = @{}
    foreach ($k in $keep) {
      $f = Join-Path $target $k
      if (Test-Path $f) { $saved[$k] = [IO.File]::ReadAllText($f) }
    }

    # ---------- 5. copy the new files in place ----------
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    $copied = @()
    foreach ($p in $parts) {
      $s = Join-Path $root $p
      if (-not (Test-Path $s)) { continue }
      $d = Join-Path $target $p
      if ((Get-Item $s).PSIsContainer) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        Copy-Item (Join-Path $s '*') $d -Recurse -Force
      } else {
        Copy-Item $s $d -Force
      }
      $copied += $p
    }
    Good "updated    $($copied -join ', ')"

    # ---------- 6. put personal files back ----------
    $utf8 = New-Object Text.UTF8Encoding $false
    foreach ($k in $keep) {
      if (-not $saved.ContainsKey($k)) { continue }
      $f = Join-Path $target $k
      $shipped = if (Test-Path $f) { [IO.File]::ReadAllText($f) } else { '' }
      [IO.File]::WriteAllText($f, $saved[$k], $utf8)
      if ($shipped -and $shipped -ne $saved[$k]) {
        $newFile = $f -replace '\.js$', '.new.js'
        [IO.File]::WriteAllText($newFile, $shipped, $utf8)
        Note "kept       $k  (new default saved as $(Split-Path $newFile -Leaf))"
      } else {
        Step "kept       $k"
      }
    }

    # remember where we put it
    New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    [IO.File]::WriteAllText($stateFile, $target, $utf8)

    # ---------- 7. what now ----------
    Write-Host ""
    if ($fresh) {
      Good "installed  v$newVer"
      Write-Host ""
      Write-Host "  load it once:" -ForegroundColor White
      Write-Host "    1. open  brave://extensions   (or chrome://extensions)"
      Write-Host "    2. turn on  Developer mode"
      Write-Host "    3. click  Load unpacked  and pick:"
      Write-Host "       $target" -ForegroundColor Cyan
      Write-Host ""
      Write-Host "  keep that folder where it is - the extension's saved data is tied to this path."
    } else {
      Good ("updated    v{0} -> v{1}" -f $oldVer, $newVer)
      Write-Host ""
      Write-Host "  last step: open  brave://extensions  and click the reload arrow on nyx." -ForegroundColor White
      Write-Host "  your settings, links, notes and stash are untouched."
    }
    Write-Host ""
  }
  finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

try {
  Invoke-NyxInstall
} catch {
  Write-Host ""
  Write-Host "  install failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ""
}
