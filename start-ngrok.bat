@echo off
echo Starting ngrok...
cd /d %~dp0
node run-ngrok.js
pause

