# serve.ps1
# Starts a simple HTTP server from the project root and opens the default browser.

# Try to use Python 3's http.server
try {
    # Start the server in a new PowerShell window so the current session stays interactive
    $cmd = 'python -m http.server 8000'
    Start-Process -FilePath powershell -ArgumentList "-NoExit","-Command","$cmd"
    Start-Sleep -Seconds 1
    Start-Process "http://localhost:8000"
} catch {
    Write-Error "Failed to start server. Ensure Python 3 is installed and on PATH. You can alternatively run: python -m http.server 8000"
}
