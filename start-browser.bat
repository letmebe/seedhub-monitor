@echo off
chcp 65001 >nul
echo ========================================
echo   SeedHub 资源监控系统 - 启动脚本
echo ========================================
echo.

:: 检查 Edge 是否已开启调试端口
netstat -ano | findstr ":9222" >nul
if %errorlevel% equ 0 (
    echo ✓ 检测到 Edge 已在调试模式运行 (端口 9222)
    echo.
) else (
    echo 正在启动 Edge 调试模式...
    
    :: 关闭所有 Edge 进程
    taskkill /F /IM msedge.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
    
    :: 启动 Edge 调试模式
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --no-first-run --no-default-browser-check
    timeout /t 3 /nobreak >nul
    
    echo ✓ Edge 调试模式已启动
    echo.
)

echo ========================================
echo   使用说明
echo ========================================
echo.
echo 1. Edge 调试模式已启动
echo 2. 在 Edge 中手动访问 SeedHub 网站
echo 3. 确认可以正常访问（绕过 Cloudflare 验证）
echo 4. 运行抓取脚本: node scrape.js
echo.
echo 按任意键退出...
pause >nul
