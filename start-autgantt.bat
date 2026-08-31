@echo off
REM ============================================================
REM AutGantt - inicia o servidor Next.js de desenvolvimento
REM e abre o navegador no http://localhost:3000
REM ============================================================

setlocal
cd /d "%~dp0"

echo.
echo [AutGantt] Iniciando servidor de desenvolvimento...
echo [AutGantt] Pasta: %CD%
echo.

REM Verifica se node_modules existe; se nao, instala
if not exist "node_modules" (
  echo [AutGantt] node_modules nao encontrado. Rodando npm install...
  call npm install --legacy-peer-deps
  if errorlevel 1 (
    echo.
    echo [AutGantt] ERRO: npm install falhou.
    pause
    exit /b 1
  )
)

REM Abre o navegador depois de 4 segundos (em paralelo)
start "" /b cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"

REM Roda o dev server (mantem a janela aberta com os logs)
call npm run dev

REM Se npm run dev encerrar, mantem janela aberta pra ver mensagem de erro
echo.
echo [AutGantt] Servidor encerrado.
pause
