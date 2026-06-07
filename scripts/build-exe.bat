@echo off
echo Installing dependencies (PyInstaller, OpenCV, Numpy)...
pip install pyinstaller opencv-python numpy

echo.
echo Compiling auto-cut.py into an executable file...
pyinstaller --onefile auto-cut.py

echo.
echo Cleaning up temporary build files...
move /y dist\auto-cut.exe . > nul
rmdir /s /q build
rmdir /s /q dist
del /q auto-cut.spec

echo.
echo =======================================================
echo Done!
echo Your executable is located in the current folder: auto-cut.exe
echo You can move it anywhere and distribute it to users.
echo =======================================================
pause
