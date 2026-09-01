# create-shortcut.ps1
# Crea un acceso directo en el Escritorio para lanzar start-tradingview-mcp.ps1
# con el icono de TradingView. Se corre UNA sola vez.
# Uso: cd a la carpeta scripts y ejecutar .\create-shortcut.ps1

$ScriptDir      = $PSScriptRoot
$TargetScript   = Join-Path $ScriptDir "start-tradingview-mcp.ps1"
$IconPath       = Join-Path $ScriptDir "tradingview.ico"
$ShortcutName   = "TradingView MCP.lnk"
$DesktopPath    = [Environment]::GetFolderPath("Desktop")
$ShortcutPath   = Join-Path $DesktopPath $ShortcutName

if (-not (Test-Path $TargetScript)) {
    Write-Host "ERROR: No se encontro start-tradingview-mcp.ps1 en $ScriptDir" -ForegroundColor Red
    Write-Host "Asegurate de correr este script desde la misma carpeta 'scripts'." -ForegroundColor Yellow
    exit 1
}

Write-Host "Descargando icono de TradingView..." -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri "https://www.tradingview.com/favicon.ico" -OutFile $IconPath -UseBasicParsing
    Write-Host "Icono descargado en: $IconPath" -ForegroundColor Green
} catch {
    Write-Host "No se pudo descargar el icono, se usara el icono por defecto de PowerShell." -ForegroundColor Yellow
    $IconPath = $null
}

Write-Host "Creando acceso directo en el Escritorio..." -ForegroundColor Cyan

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath       = "powershell.exe"
$Shortcut.Arguments        = "-ExecutionPolicy Bypass -File `"$TargetScript`""
$Shortcut.WorkingDirectory = $ScriptDir
$Shortcut.Description      = "Abre Chrome con debugging remoto + TradingView Web para el MCP"

if ($IconPath -and (Test-Path $IconPath)) {
    $Shortcut.IconLocation = $IconPath
} else {
    $Shortcut.IconLocation = "powershell.exe,0"
}

$Shortcut.Save()

Write-Host ""
Write-Host "Listo! Acceso directo creado en: $ShortcutPath" -ForegroundColor Green
Write-Host "Doble click en 'TradingView MCP' en tu Escritorio para arrancar todo." -ForegroundColor Green
