Write-Host "Starting ngrok tunnel on port 5000..." -ForegroundColor Cyan
Write-Host ""

# Start ngrok in background
$ngrokProcess = Start-Process -FilePath "ngrok" -ArgumentList "http","5000" -PassThru -WindowStyle Minimized

# Wait for ngrok to start
Write-Host "Waiting for ngrok to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# Get the public URL from ngrok API
$maxAttempts = 20
$url = $null

for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction Stop
        if ($response.tunnels -and $response.tunnels.Count -gt 0 -and $response.tunnels[0].public_url) {
            $url = $response.tunnels[0].public_url
            break
        }
    } catch {
        Write-Host "Attempt $i/$maxAttempts : Waiting for ngrok API..." -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

if ($url) {
    Write-Host ""
    Write-Host "SUCCESS! ngrok tunnel established!" -ForegroundColor Green
    Write-Host "Public URL: $url" -ForegroundColor Cyan
    Write-Host ""
    
    # Update .env file
    $envPath = Join-Path $PSScriptRoot ".env"
    $envContent = ""
    
    if (Test-Path $envPath) {
        $envContent = Get-Content $envPath -Raw
    } else {
        $examplePath = Join-Path $PSScriptRoot "env.example"
        if (Test-Path $examplePath) {
            $envContent = Get-Content $examplePath -Raw
        }
    }
    
    # Update APP_URL
    if ($envContent -match "APP_URL=") {
        $envContent = $envContent -replace "APP_URL=.*", "APP_URL=$url"
    } else {
        $envContent += "`nAPP_URL=$url`n"
    }
    
    Set-Content -Path $envPath -Value $envContent -NoNewline
    Write-Host "Updated .env file!" -ForegroundColor Green
    Write-Host "APP_URL=$url" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "ngrok is running. Keep this window open!" -ForegroundColor Yellow
    Write-Host "Email tracking is now enabled!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Restart your backend server" -ForegroundColor White
    Write-Host "2. Send a NEW campaign (old emails have old tracking URLs)" -ForegroundColor White
    Write-Host ""
    Write-Host "Press Ctrl+C to stop ngrok." -ForegroundColor Yellow
    Write-Host ""
    
    # Keep script running
    try {
        Wait-Process -Id $ngrokProcess.Id
    } catch {
        Write-Host "ngrok stopped." -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "ERROR: Could not get ngrok URL. Please check:" -ForegroundColor Red
    Write-Host "1. Is ngrok installed? (ngrok --version)" -ForegroundColor Yellow
    Write-Host "2. Is authtoken configured? (ngrok config add-authtoken YOUR_TOKEN)" -ForegroundColor Yellow
    Write-Host "3. Check http://localhost:4040 for the web interface" -ForegroundColor Yellow
    Write-Host ""
    Stop-Process -Id $ngrokProcess.Id -ErrorAction SilentlyContinue
    exit 1
}
