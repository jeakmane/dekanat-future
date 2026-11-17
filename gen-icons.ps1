# Генератор иконок PWA: скруглённый квадрат #6d5ef2 + белая «Д»
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot 'public\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-Icon([int]$size, [string]$path, [double]$scalePadding = 0) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Фон (для maskable — полный, для обычной — прозрачный за скруглением)
    $g.Clear([System.Drawing.Color]::Transparent)

    $accent = [System.Drawing.Color]::FromArgb(109, 94, 242)
    $brush = New-Object System.Drawing.SolidBrush $accent

    $pad = [int]($size * $scalePadding)
    $d = $size - 2 * $pad
    $radius = [int]($d * 0.22)

    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $x = $pad; $y = $pad
    $gp.AddArc($x, $y, $radius, $radius, 180, 90)
    $gp.AddArc($x + $d - $radius, $y, $radius, $radius, 270, 90)
    $gp.AddArc($x + $d - $radius, $y + $d - $radius, $radius, $radius, 0, 90)
    $gp.AddArc($x, $y + $d - $radius, $radius, $radius, 90, 90)
    $gp.CloseFigure()
    $g.FillPath($brush, $gp)

    # Буква «Д» белым
    $font = New-Object System.Drawing.Font ('Arial', [int]($d * 0.52), [System.Drawing.FontStyle]::Bold)
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
    $g.DrawString([char]0x0414, $font, $white, $rect, $fmt)

    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output "OK: $path"
}

New-Icon 192 (Join-Path $outDir 'icon-192.png')
New-Icon 512 (Join-Path $outDir 'icon-512.png')
# Maskable: иконка меньше, чтобы не обрезалась при маске
New-Icon 512 (Join-Path $outDir 'icon-maskable-512.png') 0.12
