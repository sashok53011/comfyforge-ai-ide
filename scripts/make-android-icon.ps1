# Generates the Android launcher icon set for ComfyForge AI IDE (no image model
# required): a dark tile with a glowing 3-node graph, plus adaptive-icon
# foregrounds (symbol on transparent) and per-density launcher/round PNGs.
#
#   pwsh -File scripts/make-android-icon.ps1
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\android\app\src\main\res'

function New-RoundedPath([System.Drawing.RectangleF]$rect, [double]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = [float]($radius * 2)
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

# Symbol only: 3 connected nodes, transparent background, 512x512.
function New-SymbolBitmap {
  $size = 512
  $bmp = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $glowColor = [System.Drawing.Color]::FromArgb(70, 129, 140, 241)
  $glow = [System.Drawing.Pen]::new($glowColor, 30)
  $glow.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $glow.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $line = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 129, 140, 241), 16)
  $line.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $line.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $n1 = [System.Drawing.PointF]::new(148, 176)
  $n2 = [System.Drawing.PointF]::new(364, 148)
  $n3 = [System.Drawing.PointF]::new(252, 364)

  foreach ($pair in @(@($n1, $n2), @($n2, $n3), @($n1, $n3))) {
    $g.DrawLine($glow, $pair[0], $pair[1])
    $g.DrawLine($line, $pair[0], $pair[1])
  }

  $nodeW = [float]104
  foreach ($n in @($n1, $n2, $n3)) {
    $cx = [float]$n.X
    $cy = [float]$n.Y
    $half = [float]($nodeW / 2)
    $rect = [System.Drawing.RectangleF]::new($cx - $half, $cy - $half, $nodeW, $nodeW)
    $path = New-RoundedPath $rect 24

    $glowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(90, 129, 140, 241))
    $g.FillPath($glowBrush, $path)

    $fill = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      $rect,
      [System.Drawing.Color]::FromArgb(255, 99, 102, 241),
      [System.Drawing.Color]::FromArgb(255, 139, 92, 246),
      [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    $g.FillPath($fill, $path)

    $border = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 199, 210, 254), 4)
    $g.DrawPath($border, $path)

    $glowBrush.Dispose(); $fill.Dispose(); $border.Dispose(); $path.Dispose()
  }

  # cyan accent spark on the top-right node
  $accent = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 34, 211, 238))
  $g.FillEllipse($accent, $n2.X + 30, $n2.Y - 58, 30, 30)
  $accent.Dispose()

  $glow.Dispose(); $line.Dispose()
  $g.Dispose()
  return $bmp
}

# Full-bleed tile: dark background + subtle grid + symbol.
function New-TileBitmap {
  $size = 512
  $bmp = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::FromArgb(255, 11, 13, 20))

  $dot = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 30, 41, 59))
  for ($x = 16; $x -lt $size; $x += 32) {
    for ($y = 16; $y -lt $size; $y += 32) {
      $g.FillEllipse($dot, $x, $y, 3, 3)
    }
  }
  $dot.Dispose()

  $symbol = New-SymbolBitmap
  $g.DrawImage($symbol, 0, 0, $size, $size)
  $symbol.Dispose()
  $g.Dispose()
  return $bmp
}

function Save-Resized([System.Drawing.Bitmap]$source, [string]$path, [int]$width) {
  $bmp = [System.Drawing.Bitmap]::new($width, $width)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($source, 0, 0, $width, $width)
  $g.Dispose()
  $dir = Split-Path $path -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# Symbol centred on a transparent canvas at ~66% (adaptive-icon safe zone).
function Save-Foreground([System.Drawing.Bitmap]$symbol, [string]$path, [int]$size) {
  $bmp = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $inner = [int]($size * 0.66)
  $offset = [int](($size - $inner) / 2)
  $g.DrawImage($symbol, $offset, $offset, $inner, $inner)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$densities = [ordered]@{
  'mipmap-mdpi'    = @{ launcher = 48;  foreground = 108 }
  'mipmap-hdpi'    = @{ launcher = 72;  foreground = 162 }
  'mipmap-xhdpi'   = @{ launcher = 96;  foreground = 216 }
  'mipmap-xxhdpi'  = @{ launcher = 144; foreground = 324 }
  'mipmap-xxxhdpi' = @{ launcher = 192; foreground = 432 }
}

$tile = New-TileBitmap
$symbol = New-SymbolBitmap

try {
  foreach ($dir in $densities.Keys) {
    $base = Join-Path $root $dir
    Save-Resized $tile (Join-Path $base 'ic_launcher.png') $densities[$dir].launcher
    Save-Resized $tile (Join-Path $base 'ic_launcher_round.png') $densities[$dir].launcher
    Save-Foreground $symbol (Join-Path $base 'ic_launcher_foreground.png') $densities[$dir].foreground
    Write-Host "  $dir done"
  }
} finally {
  $tile.Dispose()
  $symbol.Dispose()
}

# Adaptive-icon background: dark instead of the template's white.
$bgFile = Join-Path $root 'values\ic_launcher_background.xml'
(Get-Content $bgFile -Raw) -replace '#FFFFFF', '#0B0D14' | Set-Content $bgFile -NoNewline -Encoding UTF8

Write-Host "Icon set written to $root"
