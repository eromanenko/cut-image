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

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

VENV_DIR="../venv"

# If venv doesn't exist, try to find a suitable Python binary to create it
if [ ! -d "$VENV_DIR" ]; then
    echo "Virtual environment not found at $VENV_DIR. Attempting to create one..."
    
    # List of candidate Python paths to search
    PYTHON_CANDIDATES=(
        "/usr/local/opt/python@3.9/bin/python3"
        "/opt/homebrew/opt/python@3.9/bin/python3"
        "/usr/local/bin/python3"
        "/opt/homebrew/bin/python3"
        "python3"
    )
    
    SELECTED_PYTHON=""
    for cmd in "${PYTHON_CANDIDATES[@]}"; do
        if command -v "$cmd" &> /dev/null; then
            # Verify Python version is >= 3.8
            VERSION_STR=$("$cmd" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
            MAJOR=$(echo "$VERSION_STR" | cut -d. -f1)
            MINOR=$(echo "$VERSION_STR" | cut -d. -f2)
            if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -ge 8 ]; then
                SELECTED_PYTHON="$cmd"
                echo "Found suitable Python: $SELECTED_PYTHON (version $VERSION_STR)"
                break
            fi
        fi
    done
    
    if [ -z "$SELECTED_PYTHON" ]; then
        if command -v python3 &> /dev/null; then
            SELECTED_PYTHON="python3"
            echo "Warning: Could not find Python >= 3.8. Falling back to default system python3."
        else
            echo "Error: Python 3 is required but not found."
            exit 1
        fi
    fi
    
    echo "Creating virtual environment using $SELECTED_PYTHON..."
    "$SELECTED_PYTHON" -m venv "$VENV_DIR"
    if [ $? -ne 0 ]; then
        echo "Error: Failed to create virtual environment."
        exit 1
    fi
fi

# Activate virtual environment
echo "Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# Verify we are using the venv's python and pip
echo "Using Python: $(which python3)"
echo "Using Pip: $(which pip3)"

echo ""
echo "Installing/updating dependencies (PyInstaller, OpenCV, Numpy, Pillow)..."
pip3 install --upgrade pip
pip3 install pyinstaller opencv-python numpy pillow

echo ""
echo "Compiling auto-cut.py into an executable file..."
pyinstaller --onefile auto-cut.py

echo ""
echo "Cleaning up temporary build files..."
mv dist/auto-cut .
rm -rf build dist auto-cut.spec

# Deactivate venv
deactivate

echo ""
echo "======================================================="
echo "Done!"
echo "Your executable is located in the current folder: auto-cut"
echo "You can move it anywhere and distribute it to macOS users."
echo "======================================================="

