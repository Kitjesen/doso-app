@echo off
node "%~dp0cmd-probe.mjs" %*
exit /b %ERRORLEVEL%
