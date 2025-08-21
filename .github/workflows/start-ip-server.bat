@echo off
echo Starting IP API Server...
echo.
echo Installing dependencies...
npm install
echo.
echo Starting server on port 3000...
echo.
echo Health check: http://localhost:3000/api/health
echo IP lookup: http://localhost:3000/api/ip/{IP}
echo.
echo Press Ctrl+C to stop the server
echo.
npm start
