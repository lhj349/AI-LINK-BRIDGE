$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginRoot = Join-Path $packageRoot "plugin"
if (-not (Test-Path -LiteralPath (Join-Path $pluginRoot "manifest.json"))) {
    $pluginRoot = $packageRoot
}

$manifestPath = Join-Path $pluginRoot "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Plugin manifest.json was not found. Keep the installer beside the plugin files."
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if (-not $manifest.id -or -not $manifest.version) {
    throw "Invalid plugin manifest: id or version is missing."
}

$externalRoot = Join-Path $env:APPDATA "Adobe\UXP\Plugins\External"
$targetName = "{0}_{1}" -f $manifest.id, $manifest.version
$targetPath = Join-Path $externalRoot $targetName
$pluginFiles = @(
    "manifest.json",
    "index.html",
    "main.js",
    "styles.css",
    "geometry.js",
    "layer-repaint.js",
    "preset-panel.js",
    "preset-store.js"
)

New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
foreach ($file in $pluginFiles) {
    $source = Join-Path $pluginRoot $file
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Required plugin file is missing: $file"
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $targetPath $file) -Force
}

$installedManifest = Get-Content -LiteralPath (Join-Path $targetPath "manifest.json") -Raw | ConvertFrom-Json
if ($installedManifest.id -ne $manifest.id -or $installedManifest.version -ne $manifest.version) {
    throw "Plugin verification failed after copying files."
}

Write-Host ""
Write-Host "AI Link Bridge plugin installed successfully." -ForegroundColor Green
Write-Host "Installed to: $targetPath"
Write-Host "Restart Photoshop, then open Plugins > AI Link Bridge."

