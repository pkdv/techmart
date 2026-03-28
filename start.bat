@echo off
echo Starting TechMart...
start "TechMart Server" cmd /k "cd /d E:\progkt claud\techmart && node server.js"
timeout /t 2
start "TechMart Tunnel" cmd /k "ssh -R 80:localhost:3000 localhost.run"
echo Done! Check the tunnel window for your link.
