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
    NYX_DIR    where to install / where the install already is
    NYX_REF    branch or tag to install from   (default: main)
    NYX_SRC    local .zip or folder to install from instead of downloading
    NYX_PLAIN  set to 1 to disable animation / color

  NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
  unless it has a UTF-8 BOM, and a stray decoded curly quote silently ends a
  string literal - which swallows the rest of the script. All non-ASCII glyphs
  are produced from code points ([char]0x....) or base64 at runtime.
#>

$ErrorActionPreference = 'Stop'

function Invoke-NyxInstall {
  $repo = 'RDXFGXY1/nyx'
  $ref  = if ($env:NYX_REF) { $env:NYX_REF } else { 'main' }
  $parts = @('manifest.json', 'index.html', 'save.html', 'css', 'js', 'assets')
  $keep  = @('js\config.js')

  $stateDir  = Join-Path $env:LOCALAPPDATA 'nyx-updater'
  $stateFile = Join-Path $stateDir 'install-path.txt'

  # ---------- terminal capabilities ----------
  try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
  $E  = [char]27
  $CR = [char]13
  $TC = [bool]($env:WT_SESSION -or ($env:COLORTERM -match 'truecolor|24bit'))
  $ANIM = $false
  try { $ANIM = -not [Console]::IsOutputRedirected } catch { $ANIM = $false }
  if ($env:NYX_ANIM) { $ANIM = $true; $TC = $true }   # force motion (e.g. when piping)
  if ($env:NYX_PLAIN) { $ANIM = $false; $TC = $false } # force plain (wins over NYX_ANIM)

  # ---------- Tokyo Night palette (truecolor rgb + 16-color fallback) ----------
  $pink = '247;118;142'; $red = '247;118;142'; $orange = '255;158;100'
  $yellow = '224;175;104'; $green = '158;206;106'; $cyan = '125;207;255'
  $blue = '122;162;247'; $purple = '187;154;247'; $violet = '157;124;216'
  $fg = '192;202;245'; $dim = '86;95;137'
  $c16 = @{ $pink='Magenta'; $orange='Yellow'; $yellow='Yellow'; $green='Green';
    $cyan='Cyan'; $blue='Blue'; $purple='Magenta'; $violet='DarkMagenta';
    $fg='Gray'; $dim='DarkGray' }

  # ---------- glyphs (ASCII source, drawn from code points) ----------
  $gCheck = [char]0x2714; $gCross = [char]0x2716; $gArrow = [char]0x25B8
  $gDot = [char]0x00B7; $gFull = [char]0x2588; $gLight = [char]0x2591
  $bTL = [char]0x256D; $bTR = [char]0x256E; $bBL = [char]0x2570; $bBR = [char]0x256F
  $bH = [char]0x2500; $bV = [char]0x2502
  $spin = @(0x280B,0x2819,0x2839,0x2838,0x283C,0x2834,0x2826,0x2827,0x2807,0x280F) | ForEach-Object { [char]$_ }

  # ---------- primitives ----------
  function Paint($rgb, $text) {
    if ($TC) { "$E[38;2;${rgb}m$text$E[0m" } else { $text }
  }
  function PLine($rgb, $text) {
    if ($TC) { Write-Host "$E[38;2;${rgb}m$text$E[0m" }
    else { Write-Host $text -ForegroundColor $c16[$rgb] }
  }
  function Row($label, $value, $vrgb) {
    $b = Paint $violet ([string]$gArrow)
    $k = Paint $dim $label
    $v = Paint $vrgb $value
    Write-Host "  $b $k  $v"
  }
  function Ok($m)   { Write-Host ("  " + (Paint $green ([string]$gCheck)) + " " + (Paint $fg $m)) }
  function Warn($m) { Write-Host ("  " + (Paint $yellow "!") + " " + (Paint $yellow $m)) }

  # ---------- animated banner ----------
  function Show-NyxBanner {
    $b64 = 'ICAg4paI4paI4paI4pWXICAg4paI4paI4pWX4paI4paI4pWXICAg4paI4paI4pWX4paI4paI4pWXICDilojilojilZcKICAg4paI4paI4paI4paI4pWXICDilojilojilZHilZrilojilojilZcg4paI4paI4pWU4pWd4pWa4paI4paI4pWX4paI4paI4pWU4pWdCiAgIOKWiOKWiOKVlOKWiOKWiOKVlyDilojilojilZEg4pWa4paI4paI4paI4paI4pWU4pWdICDilZrilojilojilojilZTilZ0KICAg4paI4paI4pWR4pWa4paI4paI4pWX4paI4paI4pWRICDilZrilojilojilZTilZ0gICDilojilojilZTilojilojilZcKICAg4paI4paI4pWRIOKVmuKWiOKWiOKWiOKWiOKVkSAgIOKWiOKWiOKVkSAgIOKWiOKWiOKVlOKVnSDilojilojilZcKICAg4pWa4pWQ4pWdICDilZrilZDilZDilZDilZ0gICDilZrilZDilZ0gICDilZrilZDilZ0gIOKVmuKVkOKVnQo='
    $lines = ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) -replace "`r", "") -split "`n"
    $grad = @($pink, $purple, $violet, $blue, $cyan, $dim)
    Write-Host ""
    for ($i = 0; $i -lt 6; $i++) {
      if (-not $lines[$i]) { continue }
      PLine $grad[$i] $lines[$i]
      if ($ANIM) { Start-Sleep -Milliseconds 45 }
    }
    # typed subtitle
    $sub = '   new tab, reimagined  '
    $tail = $gDot.ToString() + ' installer / updater'
    if ($ANIM -and $TC) {
      Write-Host "$E[38;2;${cyan}m" -NoNewline
      foreach ($ch in $sub.ToCharArray()) { Write-Host $ch -NoNewline; Start-Sleep -Milliseconds 8 }
      Write-Host "$E[0m$E[38;2;${dim}m$tail$E[0m"
    } else {
      PLine $cyan ($sub + $tail)
    }
    Write-Host ""
  }

  # ---------- animated download (in-process async task + spinner) ----------
  function Get-NyxZip($url, $zip) {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
    if (-not $ANIM) {
      $pp = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
      try { Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing } finally { $ProgressPreference = $pp }
      Ok ("downloaded {0:N0} KB" -f ((Get-Item $zip).Length / 1KB)); return
    }
    $wc = New-Object System.Net.WebClient
    try {
      $task = $wc.DownloadFileTaskAsync([Uri]$url, $zip)
      $i = 0
      while (-not $task.IsCompleted) {
        $kb = if (Test-Path $zip) { [math]::Round((Get-Item $zip).Length / 1KB) } else { 0 }
        $sp = Paint $cyan ([string]$spin[$i % $spin.Count])
        $body = (Paint $fg 'downloading') + '  ' + (Paint $purple ('{0,6:N0} KB' -f $kb))
        Write-Host "$CR  $sp $body   " -NoNewline
        Start-Sleep -Milliseconds 90; $i++
      }
      if ($task.IsFaulted) { throw $task.Exception.InnerException }
      $kb = [math]::Round((Get-Item $zip).Length / 1KB)
      Write-Host ("$CR  " + (Paint $green ([string]$gCheck)) + " " + (Paint $fg 'downloaded ') + (Paint $purple ('{0:N0} KB' -f $kb)) + '              ')
    } finally { $wc.Dispose() }
  }

  # ---------- progress bar ----------
  function Bar($frac, $width) {
    if ($frac -lt 0) { $frac = 0 } elseif ($frac -gt 1) { $frac = 1 }
    $fill = [int][math]::Round($frac * $width)
    (Paint $cyan ([string]$gFull * $fill)) + (Paint $dim ([string]$gLight * ($width - $fill)))
  }

  # ---------- framed result box (single-color rows => exact alignment) ----------
  $BW = 48
  function BoxTop($rgb) { Write-Host ("  " + (Paint $rgb ([string]$bTL + ([string]$bH * $BW) + [string]$bTR))) }
  function BoxBot($rgb) { Write-Host ("  " + (Paint $rgb ([string]$bBL + ([string]$bH * $BW) + [string]$bBR))) }
  function BoxLine($rgb, $trgb, $text) {
    $pad = $BW - 1 - $text.Length; if ($pad -lt 0) { $pad = 0 }
    Write-Host ("  " + (Paint $rgb ([string]$bV)) + " " + (Paint $trgb $text) + (' ' * $pad) + (Paint $rgb ([string]$bV)))
  }
  function BoxStatus($rgb, $text) {
    $pad = $BW - 3 - $text.Length; if ($pad -lt 0) { $pad = 0 }
    Write-Host ("  " + (Paint $rgb ([string]$bV)) + " " + (Paint $green ([string]$gCheck)) + " " + (Paint $fg $text) + (' ' * $pad) + (Paint $rgb ([string]$bV)))
  }

  function Test-NyxDir($p) {
    if (-not $p) { return $false }
    $m = Join-Path $p 'manifest.json'
    if (-not (Test-Path $m)) { return $false }
    try { return ((Get-Content $m -Raw | ConvertFrom-Json).name -eq 'nyx') } catch { return $false }
  }
  function Get-NyxVersion($p) {
    try { (Get-Content (Join-Path $p 'manifest.json') -Raw | ConvertFrom-Json).version } catch { $null }
  }

  Show-NyxBanner

  # ---------- 1. where does it live? ----------
  $target = $null; $reason = ''
  if ($env:NYX_DIR) {
    $target = $env:NYX_DIR; $reason = 'NYX_DIR'
  } elseif ((Test-Path $stateFile) -and (Test-NyxDir (Get-Content $stateFile -Raw).Trim())) {
    $target = (Get-Content $stateFile -Raw).Trim(); $reason = 'remembered'
  } elseif (Test-NyxDir (Get-Location).Path) {
    $target = (Get-Location).Path; $reason = 'current folder'
  } else {
    foreach ($guess in @((Join-Path $env:LOCALAPPDATA 'nyx'), (Join-Path $HOME 'nyx'), (Join-Path $HOME 'Documents\nyx'))) {
      if (Test-NyxDir $guess) { $target = $guess; $reason = 'found on disk'; break }
    }
  }
  if (-not $target) { $target = Join-Path $env:LOCALAPPDATA 'nyx'; $reason = 'new install' }

  $target = [IO.Path]::GetFullPath($target)
  $fresh  = -not (Test-NyxDir $target)
  $oldVer = if ($fresh) { $null } else { Get-NyxVersion $target }

  $modeText = if ($fresh) { "fresh install  ($reason)" } else { "update  ($reason)" }
  Row 'folder ' $target $fg
  Row 'mode   ' $modeText $cyan
  if ($oldVer) { Row 'have   ' "v$oldVer" $dim }

  # ---------- 2. get the new files ----------
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("nyx-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null

  try {
    $src = Join-Path $tmp 'src'
    if ($env:NYX_SRC) {
      Row 'source ' $env:NYX_SRC $fg
      if ((Get-Item $env:NYX_SRC).PSIsContainer) {
        New-Item -ItemType Directory -Path $src -Force | Out-Null
        foreach ($p in $parts) { $s = Join-Path $env:NYX_SRC $p; if (Test-Path $s) { Copy-Item $s $src -Recurse -Force } }
      } else {
        Expand-Archive -Path $env:NYX_SRC -DestinationPath $src -Force
      }
    } else {
      $url = "https://github.com/$repo/archive/refs/heads/$ref.zip"
      Get-NyxZip $url (Join-Path $tmp 'nyx.zip')
      Expand-Archive -Path (Join-Path $tmp 'nyx.zip') -DestinationPath $src -Force
    }

    $root = $src
    if (-not (Test-Path (Join-Path $root 'manifest.json'))) {
      $inner = Get-ChildItem $root -Directory | Select-Object -First 1
      if ($inner) { $root = $inner.FullName }
    }
    if (-not (Test-NyxDir $root)) { throw "the download does not look like nyx (no valid manifest.json)" }
    $newVer = Get-NyxVersion $root
    Row 'release' "v$newVer" $green
    if ($oldVer -and $oldVer -eq $newVer) { Warn "already on v$newVer - reinstalling the same version" }

    # ---------- 3. back up the current code ----------
    if (-not $fresh) {
      $backupDir = Join-Path $stateDir 'backups'
      New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
      $bkTmp = Join-Path $tmp 'backup'
      New-Item -ItemType Directory -Path $bkTmp -Force | Out-Null
      foreach ($p in @('manifest.json', 'index.html', 'save.html', 'css', 'js')) {
        $s = Join-Path $target $p; if (Test-Path $s) { Copy-Item $s $bkTmp -Recurse -Force }
      }
      if (Get-ChildItem $bkTmp) {
        $bkZip = Join-Path $backupDir ("nyx-v$oldVer-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')
        Compress-Archive -Path (Join-Path $bkTmp '*') -DestinationPath $bkZip -Force
        Ok ("backed up current build  " + (Paint $dim (Split-Path $bkZip -Leaf)))
        Get-ChildItem $backupDir -Filter 'nyx-v*.zip' | Sort-Object LastWriteTime -Descending |
          Select-Object -Skip 3 | Remove-Item -Force -ErrorAction SilentlyContinue
      }
    }

    # ---------- 4. stash the files we must not clobber ----------
    $saved = @{}
    foreach ($k in $keep) { $f = Join-Path $target $k; if (Test-Path $f) { $saved[$k] = [IO.File]::ReadAllText($f) } }

    # ---------- 5. copy the new files in place (progress bar) ----------
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    $present = @($parts | Where-Object { Test-Path (Join-Path $root $_) })
    $total = [math]::Max($present.Count, 1); $n = 0
    foreach ($p in $present) {
      $s = Join-Path $root $p; $d = Join-Path $target $p
      if ((Get-Item $s).PSIsContainer) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        Copy-Item (Join-Path $s '*') $d -Recurse -Force
      } else { Copy-Item $s $d -Force }
      $n++
      if ($ANIM) {
        $sp = Paint $cyan ([string]$spin[$n % $spin.Count])
        Write-Host ("$CR  $sp " + (Paint $fg 'installing ') + (Bar ($n / $total) 22) + (Paint $dim (" $n/$total  $p")) + '        ') -NoNewline
        Start-Sleep -Milliseconds 55
      }
    }
    if ($ANIM) { Write-Host ("$CR  " + (Paint $green ([string]$gCheck)) + " " + (Paint $fg 'installed  ') + (Bar 1 22) + '                    ') }
    else { Ok ("installed  " + ($present -join ', ')) }

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
        Ok ("kept your $k  " + (Paint $dim ("new default -> " + (Split-Path $newFile -Leaf))))
      } else { Ok "kept your $k" }
    }

    New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    [IO.File]::WriteAllText($stateFile, $target, $utf8)

    # ---------- 7. done ----------
    Write-Host ""
    if ($fresh) {
      BoxTop $blue
      BoxStatus $blue "installed  nyx v$newVer"
      BoxLine $blue $dim "load it in your browser to finish:"
      BoxLine $blue $fg  "  1  open  brave://extensions"
      BoxLine $blue $fg  "  2  turn on  Developer mode"
      BoxLine $blue $fg  "  3  Load unpacked  ->  the folder below"
      BoxBot $blue
      Write-Host ""
      Write-Host ("  " + (Paint $cyan $target))
      Write-Host ("  " + (Paint $dim "keep that folder put - the extension's saved data is tied to its path."))
    } else {
      BoxTop $green
      BoxStatus $green "updated  v$oldVer  ->  v$newVer"
      BoxLine $green $dim "reload nyx to finish:"
      BoxLine $green $fg  "  open  brave://extensions  ->  reload arrow"
      BoxBot $green
      Write-Host ""
      Write-Host ("  " + (Paint $dim "your settings, links, notes and stash are untouched."))
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
  try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
  $tc = [bool]($env:WT_SESSION -or ($env:COLORTERM -match 'truecolor|24bit'))
  $x = [char]0x2716
  if ($tc) { Write-Host ("  " + [char]27 + "[38;2;247;118;142m$x install failed: $($_.Exception.Message)" + [char]27 + "[0m") }
  else { Write-Host "  x install failed: $($_.Exception.Message)" -ForegroundColor Red }
  Write-Host ""
}
