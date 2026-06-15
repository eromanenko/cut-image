#!/bin/bash

# ==============================================================================
# COMPILATION INSTRUCTIONS FOR MACOS:
# 1. Open the Terminal application on a macOS computer.
# 2. Navigate to the folder where this file is located (e.g.: cd ~/Downloads/scripts)
# 3. Grant execution permissions to this script: chmod +x build-macos.sh
# 4. Run the script: ./build-macos.sh
# 
# For more detailed instructions, see the README-macOS.md file
# ==============================================================================

echo "Installing dependencies (PyInstaller, OpenCV, Numpy, Pillow)..."
pip3 install pyinstaller opencv-python numpy pillow

echo ""
echo "Compiling auto-cut.py into an executable file..."
pyinstaller --onefile auto-cut.py

echo ""
echo "Cleaning up temporary build files..."
mv dist/auto-cut .
rm -rf build dist auto-cut.spec

echo ""
echo "======================================================="
echo "Done!"
echo "Your executable is located in the current folder: auto-cut"
echo "You can move it anywhere and distribute it to macOS users."
echo "======================================================="
