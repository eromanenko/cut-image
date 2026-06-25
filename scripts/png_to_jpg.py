import os
from PIL import Image
from pathlib import Path

def main():
    # Folder where the script is executed
    source_dir = Path.cwd()
    target_dir = source_dir / "JPEG"
    
    # Ask for JPEG quality
    quality_input = input("Enter JPEG quality (1-100) [Default: 95]: ").strip()
    if quality_input == "":
        quality = 95
    else:
        try:
            quality = int(quality_input)
            if quality < 1 or quality > 100:
                print("Quality must be between 1 and 100. Using default: 95.")
                quality = 95
        except ValueError:
            print("Invalid input. Using default quality: 95.")
            quality = 95
            
    # Create JPEG folder if it doesn't exist
    target_dir.mkdir(exist_ok=True)
    
    # Find all PNG files (recursively)
    # Ignore files if they are in the target directory
    png_files = [p for p in source_dir.rglob("*.png") if "JPEG" not in p.parts]
    
    if not png_files:
        print("No PNG files found.")
        input("Press Enter to exit...")
        return

    print(f"Found {len(png_files)} PNG files. Starting conversion...")
    
    for png_file in png_files:
        try:
            with Image.open(png_file) as img:
                # Handle transparency (alpha channel)
                # If the image has a transparent background, replace it with white
                if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                    alpha = img.convert('RGBA').split()[-1]
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    bg.paste(img, mask=alpha)
                    rgb_im = bg
                else:
                    rgb_im = img.convert('RGB')
                
                # Maintain subfolder structure inside the JPEG folder
                rel_path = png_file.relative_to(source_dir)
                jpg_filename = rel_path.with_suffix('.jpg')
                target_file = target_dir / jpg_filename
                
                # Create subfolders in JPEG if they are needed
                target_file.parent.mkdir(parents=True, exist_ok=True)
                
                # Save in JPG format
                rgb_im.save(target_file, 'JPEG', quality=quality)
                print(f"Converted: {rel_path} -> {target_file.relative_to(source_dir)}")
                
        except Exception as e:
            print(f"Error converting {png_file.name}: {e}")
            
    print("Done!")
    input("Press Enter to exit...")

if __name__ == "__main__":
    main()
