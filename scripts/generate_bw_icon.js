const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Generate monochrome icon script using PowerShell System.Drawing in external clean script
const psScript = `
Add-Type -AssemblyName System.Drawing
$srcPath = "${path.resolve(__dirname, '../public/icons/icon-512.png').replace(/\\/g, '\\\\')}"
$destPath = "${path.resolve(__dirname, '../public/icons/icon-512_BW.png').replace(/\\/g, '\\\\')}"

$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$bw = New-Object System.Drawing.Bitmap($src.Width, $src.Height)

for ($x = 0; $x -lt $src.Width; $x++) {
    for ($y = 0; $y -lt $src.Height; $y++) {
        $c = $src.GetPixel($x, $y)
        if ($c.A -lt 10) {
            $bw.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } else {
            $gray = [int]($c.R * 0.299 + $c.G * 0.587 + $c.B * 0.114)
            $mono = if ($gray -gt 70) { 255 } else { 0 }
            $bw.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($c.A, $mono, $mono, $mono))
        }
    }
}

$bw.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
$src.Dispose()
$bw.Dispose()
Write-Host "ICON_GENERATED_OK"
`;

const tempPsFile = path.resolve(__dirname, 'temp_gen_bw.ps1');
fs.writeFileSync(tempPsFile, psScript, 'utf8');

try {
  const result = execSync(`powershell -ExecutionPolicy Bypass -File "${tempPsFile}"`, { encoding: 'utf8' });
  console.log(result.trim());
} finally {
  if (fs.existsSync(tempPsFile)) fs.unlinkSync(tempPsFile);
}

