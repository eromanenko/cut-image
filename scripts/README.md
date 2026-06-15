# Instructions for compiling `auto-cut`

Since Python scripts are cross-platform, `auto-cut.py` will work on both Windows and macOS. However, to package the script into a user-friendly format (a single executable file that doesn't require users to install Python), the build process must be executed **directly on the target operating system**. Windows does not support cross-compiling executables for Mac, and vice versa.

This guide will help you compile the script into a standalone application for either OS.

## Prerequisites (Both OS)
Before compiling, you need to have Python installed on your system.
1. Download Python from the official website: https://www.python.org/downloads/
2. Install it like a regular application.
   - **For Windows:** Make sure to check the box **"Add Python to PATH"** during installation.

---

## Compiling for Windows

1. Open the `scripts` folder in File Explorer.
2. Double-click the `build-exe.bat` file.
3. A command prompt window will open. It will automatically:
   - Install the required libraries (`pyinstaller`, `opencv-python`, `numpy`, `pillow`).
   - Compile `auto-cut.py` into a single `auto-cut.exe` file.
   - Clean up temporary build folders.
4. When it says "Done!", press any key to close the window.
5. You will find the newly created **`auto-cut.exe`** in the `scripts` folder. This is your standalone application for Windows.

---

## Compiling for macOS

To compile for macOS, you must perform these steps **on a Mac computer**.

1. Copy the `scripts` folder to your Mac (via USB drive, cloud storage, GitHub, etc.).
2. Open the **Terminal** application (you can find it via Spotlight: Cmd + Space -> type "Terminal").
3. Navigate to the `scripts` folder. You can type `cd ` (with a space) and drag the folder into the Terminal window, then press Enter.
   For example: `cd ~/Downloads/scripts`
4. Make the build script executable by running:
   ```bash
   chmod +x build-macos.sh
   ```
5. Run the build script:
   ```bash
   ./build-macos.sh
   ```
6. The script will install the necessary dependencies and compile the executable.
7. Upon successful completion, a new file named **`auto-cut`** (with no extension) will appear in the folder. This is your standalone application for macOS.
