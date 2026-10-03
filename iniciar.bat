@echo off
chcp 65001 >nul
title Leitor - Biblioteca local
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org
  pause
  exit /b 1
)
node "%~dp0servidor.js"
