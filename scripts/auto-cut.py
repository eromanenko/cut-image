import os
import glob
import configparser
import cv2
import numpy as np
import math
from PIL import Image, ImageOps

def get_rect_card_corners(card, rectWidth, rectHeight, rectSkew):
    W = rectWidth
    H = rectHeight
    S = rectSkew
    
    # Unrotated
    unrotated = [
        {"x": card["x"],     "y": card["y"]},
        {"x": card["x"] + W, "y": card["y"] + S},
        {"x": card["x"] + W, "y": card["y"] + S + H},
        {"x": card["x"],     "y": card["y"] + H},
    ]
    
    if card["angle"] == 0:
        return unrotated
        
    # Center
    center_x = card["x"] + W / 2
    center_y = card["y"] + S / 2 + H / 2
    
    angleRad = (card["angle"] * math.pi) / 180.0
    cos_a = math.cos(angleRad)
    sin_a = math.sin(angleRad)
    
    rotated = []
    for pt in unrotated:
        dx = pt["x"] - center_x
        dy = pt["y"] - center_y
        rx = center_x + dx * cos_a - dy * sin_a
        ry = center_y + dx * sin_a + dy * cos_a
        rotated.append({"x": rx, "y": ry})
        
    return rotated

def main():
    print("Auto-Cut Images Script")
    print("======================")
    
    # Check current directory for .ini files
    ini_files = glob.glob("*.ini")
    if not ini_files:
        # If double-clicked on macOS, the working directory is the home directory.
        # We fall back to the folder containing the executable/script.
        import sys
        exec_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
        if exec_dir and exec_dir != os.getcwd():
            os.chdir(exec_dir)
            ini_files = glob.glob("*.ini")
            
    if not ini_files:
        print("No .ini files found in current directory.")
        return
        
    output_dir = "cut-images"
    os.makedirs(output_dir, exist_ok=True)
    
    for ini_file in ini_files:
        print(f"\nParsing {ini_file}...")
        config = configparser.ConfigParser(interpolation=None)
        config.read(ini_file, encoding='utf-8')
        
        for section in config.sections():
            img_path = section
            if not os.path.exists(img_path):
                print(f"  Warning: Image '{img_path}' not found, skipping...")
                continue
                
            print(f"  Processing image: {img_path}")
            
            # Read image with PIL to handle EXIF rotation automatically
            try:
                pil_img = Image.open(img_path)
                pil_img = ImageOps.exif_transpose(pil_img) # Fix orientation
                
                # Convert PIL image to OpenCV format
                if pil_img.mode == 'RGBA':
                    img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGBA2BGRA)
                elif pil_img.mode == 'RGB':
                    img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                elif pil_img.mode == 'L':
                    img = np.array(pil_img)
                elif pil_img.mode == 'P':
                    pil_img = pil_img.convert('RGBA')
                    img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGBA2BGRA)
                else:
                    pil_img = pil_img.convert('RGB')
                    img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            except Exception as e:
                print(f"  Error loading image '{img_path}': {e}")
                continue
            
            # If image doesn't have an alpha channel, add one so we can have transparent backgrounds
            if len(img.shape) == 2:
                img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
            elif img.shape[2] == 3:
                img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
            
            mode = config.get(section, 'mode', fallback='freeform')
            cards_str = config.get(section, 'cards', fallback='')
            
            if not cards_str.strip():
                continue
                
            cards_raw = [c.strip() for c in cards_str.split('|') if c.strip()]
            
            prefix, ext = os.path.splitext(img_path)
            
            for i, card_str in enumerate(cards_raw):
                out_filename = f"{prefix}-{str(i+1).zfill(2)}.png"
                out_path = os.path.join(output_dir, out_filename)
                
                pts = []
                
                if mode == 'freeform':
                    pt_strs = card_str.split(';')
                    for pt_str in pt_strs:
                        x, y = map(float, pt_str.split(','))
                        pts.append({"x": x, "y": y})
                else: # rect mode
                    rectWidth = float(config.get(section, 'rectWidth', fallback=0))
                    rectHeight = float(config.get(section, 'rectHeight', fallback=0))
                    rectSkew = float(config.get(section, 'rectSkew', fallback=0))
                    
                    parts = card_str.split(',')
                    x = float(parts[0])
                    y = float(parts[1])
                    angle = float(parts[2]) if len(parts) > 2 else 0.0
                    
                    card_obj = {"x": x, "y": y, "angle": angle}
                    pts = get_rect_card_corners(card_obj, rectWidth, rectHeight, rectSkew)

                
                if len(pts) == 4:
                    widthA = math.hypot(pts[2]["x"] - pts[3]["x"], pts[2]["y"] - pts[3]["y"])
                    widthB = math.hypot(pts[1]["x"] - pts[0]["x"], pts[1]["y"] - pts[0]["y"])
                    heightA = math.hypot(pts[1]["x"] - pts[2]["x"], pts[1]["y"] - pts[2]["y"])
                    heightB = math.hypot(pts[0]["x"] - pts[3]["x"], pts[0]["y"] - pts[3]["y"])
                    
                    outW = int(round(max(widthA, widthB)))
                    outH = int(round(max(heightA, heightB)))
                    
                    src_pts = np.array([
                        [pts[0]["x"], pts[0]["y"]],
                        [pts[1]["x"], pts[1]["y"]],
                        [pts[2]["x"], pts[2]["y"]],
                        [pts[3]["x"], pts[3]["y"]]
                    ], dtype="float32")
                    
                    dst_pts = np.array([
                        [0, 0],
                        [outW - 1, 0],
                        [outW - 1, outH - 1],
                        [0, outH - 1]
                    ], dtype="float32")
                    
                    M = cv2.getPerspectiveTransform(src_pts, dst_pts)
                    dst = cv2.warpPerspective(img, M, (outW, outH), flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255, 255))
                    
                    cv2.imwrite(out_path, dst)
                    
                else:
                    # Polygon cut
                    minX = min(p["x"] for p in pts)
                    minY = min(p["y"] for p in pts)
                    maxX = max(p["x"] for p in pts)
                    maxY = max(p["y"] for p in pts)
                    
                    minX = max(0, int(math.floor(minX)))
                    minY = max(0, int(math.floor(minY)))
                    maxX = min(img.shape[1], int(math.ceil(maxX)))
                    maxY = min(img.shape[0], int(math.ceil(maxY)))
                    
                    outW = maxX - minX
                    outH = maxY - minY
                    
                    cropped = img[minY:maxY, minX:maxX].copy()
                    
                    mask = np.zeros((outH, outW), dtype=np.uint8)
                    poly_pts = np.array([[[int(p["x"] - minX), int(p["y"] - minY)]] for p in pts], dtype=np.int32)
                    cv2.fillPoly(mask, [poly_pts], 255)
                    
                    cropped[:, :, 3] = mask
                    
                    cv2.imwrite(out_path, cropped)
                    
            print(f"  Saved {len(cards_raw)} images.")
            
    print("\nDone!")

if __name__ == "__main__":
    main()
