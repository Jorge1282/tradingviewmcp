# start-tradingview-mcp.ps1
# Automatiza: abrir Chrome con remote debugging + TradingView Web + verificar el puerto CDP
# Uso: clic derecho > "Ejecutar con PowerShell", o desde una terminal: .\start-tradingview-mcp.ps1

$Port        = 9222
$ChromePath  = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$UserDataDir = "C:\temp\chrome-debug"
$TradingViewUrl = "https://www.tradingview.com"
$MaxWaitSeconds = 20

function Test-CdpPort {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

# Un puerto CDP activo no garantiza que TradingView este abierto: puede ser un
# Chrome de debug que quedo corriendo de una sesion anterior con otras pestañas
# (por eso antes el script "no hacia nada" si el puerto ya respondia).
function Get-TradingViewTab {
    try {
        $tabs = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json" -TimeoutSec 3
        return $tabs | Where-Object { $_.type -eq 'page' -and $_.url -match 'tradingview\.com' } | Select-Object -First 1
    } catch {
        return $null
    }
}

# Como en Chrome moderno (111+) /json/new solo acepta PUT (GET fue deprecado
# por seguridad), hay que forzar el metodo explicitamente.
function Open-TradingViewTab {
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/new?$TradingViewUrl" -Method PUT -TimeoutSec 5 | Out-Null
        return $true
    } catch {
        Write-Host "ERROR: no se pudo abrir una pestaña nueva de TradingView via CDP: $_" -ForegroundColor Red
        return $false
    }
}

Write-Host "Verificando si el puerto $Port ya esta activo..." -ForegroundColor Cyan

if (Test-CdpPort) {
    Write-Host "El puerto $Port ya esta respondiendo. Chrome ya esta corriendo con CDP habilitado." -ForegroundColor Green
} else {
    if (-not (Test-Path $ChromePath)) {
        Write-Host "ERROR: No se encontro Chrome en: $ChromePath" -ForegroundColor Red
        Write-Host "Edita la variable `$ChromePath en este script con la ruta correcta." -ForegroundColor Yellow
        exit 1
    }

    if (-not (Test-Path $UserDataDir)) {
        New-Item -ItemType Directory -Path $UserDataDir -Force | Out-Null
    }

    Write-Host "Abriendo Chrome con debugging remoto en el puerto $Port..." -ForegroundColor Cyan
    Start-Process -FilePath $ChromePath -ArgumentList @(
        "--remote-debugging-port=$Port",
        "--user-data-dir=$UserDataDir",
        $TradingViewUrl
    )

    Write-Host "Esperando a que el puerto responda (maximo $MaxWaitSeconds segundos)..." -ForegroundColor Cyan
    $elapsed = 0
    $connected = $false
    while ($elapsed -lt $MaxWaitSeconds) {
        Start-Sleep -Seconds 1
        $elapsed++
        if (Test-CdpPort) {
            $connected = $true
            break
        }
    }

    if (-not $connected) {
        Write-Host "ERROR: El puerto $Port no respondio despues de $MaxWaitSeconds segundos." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Puerto $Port activo y respondiendo." -ForegroundColor Green
$version = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing | Select-Object -ExpandProperty Content
Write-Host $version

Write-Host ""
Write-Host "Verificando si hay una pestaña de TradingView abierta..." -ForegroundColor Cyan
$tvTab = Get-TradingViewTab
if ($tvTab) {
    Write-Host "Ya hay una pestaña de TradingView abierta: $($tvTab.url)" -ForegroundColor Green
} else {
    Write-Host "No hay ninguna pestaña de TradingView. Abriendo una nueva..." -ForegroundColor Cyan
    if (Open-TradingViewTab) {
        Write-Host "Pestaña de TradingView abierta." -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "IMPORTANTE: si esta es la primera vez que se abre este perfil de Chrome," -ForegroundColor Yellow
Write-Host "tenes que loguearte manualmente en TradingView en la ventana que se abrio." -ForegroundColor Yellow
Write-Host "Las sesiones futuras van a recordar el login (mismo user-data-dir)." -ForegroundColor Yellow
Write-Host ""
Write-Host "Listo. Ahora podes abrir Claude Code y correr tv_health_check." -ForegroundColor Green
