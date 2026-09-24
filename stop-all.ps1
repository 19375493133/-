$ports = @(3000, 3001, 8000, 8001, 8002, 20241)

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        if ($connection.OwningProcess -and $connection.OwningProcess -ne 0) {
            try {
                Stop-Process -Id $connection.OwningProcess -Force -ErrorAction Stop
                Write-Host "stopped port $port (PID $($connection.OwningProcess))"
            } catch {
                Write-Warning "could not stop port $port (PID $($connection.OwningProcess))"
            }
        }
    }
}

# 公网隧道进程：没有绑定端口，按进程名收掉。
$tunnels = Get-Process cloudflared -ErrorAction SilentlyContinue
foreach ($tunnel in $tunnels) {
    try {
        Stop-Process -Id $tunnel.Id -Force -ErrorAction Stop
        Write-Host "stopped cloudflared tunnel (PID $($tunnel.Id))"
    } catch {
        Write-Warning "could not stop cloudflared tunnel (PID $($tunnel.Id))"
    }
}
