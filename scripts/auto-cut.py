import os
import sys
import glob
import configparser
import cv2
import numpy as np
import math
from PIL import Image, ImageOps


# ──────────────────────────────────────────────────────────────────────────────
# GUI helpers (tkinter)
# ──────────────────────────────────────────────────────────────────────────────

def pick_folder():
    """Open a native folder-picker dialog. Returns the selected path or None."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        folder = filedialog.askdirectory(title="Select folder with images and .ini files")
        root.destroy()
        return folder if folder else None
    except Exception:
        return None


def pick_settings():
    """
    Show a small Export Settings dialog.
    Returns a dict {"format": "png"|"jpg", "quality": int 1-100}
    or None if the user closed the window without confirming.
    """
    try:
        import tkinter as tk
        from tkinter import ttk

        result = {}

        root = tk.Tk()
        root.title("Export Settings")
        root.resizable(False, False)
        root.attributes('-topmost', True)

        # ── Center on screen ──────────────────────────────────────────────
        root.update_idletasks()
        w, h = 320, 200
        sw = root.winfo_screenwidth()
        sh = root.winfo_screenheight()
        root.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")

        pad = {"padx": 16, "pady": 6}

        # ── Format row ────────────────────────────────────────────────────
        fmt_var = tk.StringVar(value="png")

        fmt_frame = tk.LabelFrame(root, text="Format", padx=10, pady=6)
        fmt_frame.pack(fill="x", padx=16, pady=(12, 4))

        tk.Radiobutton(fmt_frame, text="PNG  (lossless)", variable=fmt_var,
                       value="png", command=lambda: _on_fmt_change()).pack(anchor="w")
        tk.Radiobutton(fmt_frame, text="JPG  (smaller file)", variable=fmt_var,
                       value="jpg", command=lambda: _on_fmt_change()).pack(anchor="w")

        # ── Quality row ───────────────────────────────────────────────────
        quality_var = tk.IntVar(value=90)
        quality_label_var = tk.StringVar(value="Quality: 90%")

        q_frame = tk.Frame(root)
        q_frame.pack(fill="x", padx=16, pady=(0, 4))

        q_label = tk.Label(q_frame, textvariable=quality_label_var, width=14, anchor="w")
        q_label.pack(side="left")

        q_slider = tk.Scale(
            q_frame, from_=1, to=100, orient="horizontal",
            variable=quality_var, showvalue=False, length=160,
            command=lambda v: quality_label_var.set(f"Quality: {int(float(v))}%")
        )
        q_slider.pack(side="left", padx=(4, 0))

        def _on_fmt_change():
            state = "normal" if fmt_var.get() == "jpg" else "disabled"
            q_slider.config(state=state)
            q_label.config(fg="black" if state == "normal" else "gray")

        # Start with quality disabled (PNG selected by default)
        _on_fmt_change()

        # ── Buttons ───────────────────────────────────────────────────────
        btn_frame = tk.Frame(root)
        btn_frame.pack(fill="x", padx=16, pady=(8, 12))

        def on_ok():
            result["format"] = fmt_var.get()
            result["quality"] = quality_var.get()
            root.destroy()

        def on_cancel():
            root.destroy()

        tk.Button(btn_frame, text="Cancel", width=10, command=on_cancel).pack(side="right", padx=(6, 0))
        tk.Button(btn_frame, text="Start Export", width=12,
                  command=on_ok, default="active").pack(side="right")

        root.bind("<Return>", lambda e: on_ok())
        root.bind("<Escape>", lambda e: on_cancel())
        root.protocol("WM_DELETE_WINDOW", on_cancel)

        root.mainloop()

        return result if result else None

    except Exception as e:
        print(f"Settings dialog not available ({e}). Using defaults: PNG.")
        return {"format": "png", "quality": 90}


# ──────────────────────────────────────────────────────────────────────────────
# Card geometry
# ──────────────────────────────────────────────────────────────────────────────

def get_rect_card_corners(card, rectWidth, rectHeight, rectSkew):
    W = rectWidth
    H = rectHeight
    S = rectSkew

    unrotated = [
        {"x": card["x"],     "y": card["y"]},
        {"x": card["x"] + W, "y": card["y"] + S},
        {"x": card["x"] + W, "y": card["y"] + S + H},
        {"x": card["x"],     "y": card["y"] + H},
    ]

    if card["angle"] == 0:
        return unrotated

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


# ──────────────────────────────────────────────────────────────────────────────
# Image encoding helpers
# ──────────────────────────────────────────────────────────────────────────────

def encode_image(img_bgra, fmt, quality, out_path):
    """Save img_bgra (BGRA numpy array) to out_path in the chosen format."""
    if fmt == "jpg":
        # Flatten alpha onto white background for JPEG
        bgr = cv2.cvtColor(img_bgra, cv2.COLOR_BGRA2BGR)
        white = np.full_like(bgr, 255)
        alpha = img_bgra[:, :, 3:4].astype(np.float32) / 255.0
        blended = (bgr.astype(np.float32) * alpha + white.astype(np.float32) * (1 - alpha)).astype(np.uint8)
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
        is_success, buffer = cv2.imencode(".jpg", blended, encode_params)
    else:
        is_success, buffer = cv2.imencode(".png", img_bgra)

    if is_success:
        with open(out_path, "wb") as f:
            f.write(buffer.tobytes())
        return True
    return False


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main():
    print("Auto-Cut Images Script")
    print("======================")

    # ── 1. Pick folder ────────────────────────────────────────────────────
    folder = pick_folder()

    if folder:
        os.chdir(folder)
        print(f"Selected folder: {folder}")
    else:
        print("No folder selected. Using current directory.")
        ini_files = glob.glob("*.ini")
        if not ini_files:
            exec_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
            if exec_dir and exec_dir != os.getcwd():
                os.chdir(exec_dir)

    # ── 2. Check for .ini files ───────────────────────────────────────────
    ini_files = glob.glob("*.ini")
    if not ini_files:
        print("\nNo .ini files found in the selected folder.")
        input("\nPress Enter to exit...")
        return

    # ── 3. Export settings ────────────────────────────────────────────────
    settings = pick_settings()
    if settings is None:
        print("Cancelled.")
        input("\nPress Enter to exit...")
        return

    fmt     = settings["format"]          # "png" or "jpg"
    quality = settings["quality"]         # 1-100
    ext     = fmt                          # file extension matches format name

    print(f"Format: {fmt.upper()}" + (f", Quality: {quality}%" if fmt == "jpg" else ""))

    # ── 4. Process ────────────────────────────────────────────────────────
    output_dir = "cut-images"
    os.makedirs(output_dir, exist_ok=True)

    for ini_file in ini_files:
        print(f"\nParsing {ini_file}...")
        config = configparser.ConfigParser(interpolation=None)
        config.read(ini_file, encoding='utf-8')

        for section in config.sections():
            img_path = section
            if not os.path.exists(img_path):
                prefix = img_path.rsplit('.', 1)[0] + '.' if '.' in img_path else img_path + '.'
                candidates = [f for f in os.listdir('.') if f.startswith(prefix) and os.path.isfile(f)]
                valid_exts = {'.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp'}
                candidates = [f for f in candidates if os.path.splitext(f)[1].lower() in valid_exts]
                
                if candidates:
                    img_path = candidates[0]
                else:
                    print(f"  Warning: Image '{img_path}' not found, skipping...")
                    continue

            print(f"  Processing image: {img_path}")

            try:
                pil_img = Image.open(img_path)
                pil_img = ImageOps.exif_transpose(pil_img)

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

            if len(img.shape) == 2:
                img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
            elif img.shape[2] == 3:
                img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)

            mode      = config.get(section, 'mode', fallback='freeform')
            cards_str = config.get(section, 'cards', fallback='')

            if not cards_str.strip():
                continue

            cards_raw = [c.strip() for c in cards_str.split('|') if c.strip()]
            prefix, _ = os.path.splitext(img_path)

            for i, card_str in enumerate(cards_raw):
                out_filename = f"{prefix}-{str(i + 1).zfill(2)}.{ext}"
                out_path = os.path.join(output_dir, out_filename)

                pts = []

                if mode == 'freeform':
                    for pt_str in card_str.split(';'):
                        x, y = map(float, pt_str.split(','))
                        pts.append({"x": x, "y": y})
                else:  # rect mode
                    rectWidth  = float(config.get(section, 'rectWidth',  fallback=0))
                    rectHeight = float(config.get(section, 'rectHeight', fallback=0))
                    rectSkew   = float(config.get(section, 'rectSkew',   fallback=0))

                    parts = card_str.split(',')
                    x     = float(parts[0])
                    y     = float(parts[1])
                    angle = float(parts[2]) if len(parts) > 2 else 0.0

                    pts = get_rect_card_corners({"x": x, "y": y, "angle": angle},
                                                rectWidth, rectHeight, rectSkew)

                if len(pts) == 4:
                    widthA  = math.hypot(pts[2]["x"] - pts[3]["x"], pts[2]["y"] - pts[3]["y"])
                    widthB  = math.hypot(pts[1]["x"] - pts[0]["x"], pts[1]["y"] - pts[0]["y"])
                    heightA = math.hypot(pts[1]["x"] - pts[2]["x"], pts[1]["y"] - pts[2]["y"])
                    heightB = math.hypot(pts[0]["x"] - pts[3]["x"], pts[0]["y"] - pts[3]["y"])

                    outW = int(round(max(widthA, widthB)))
                    outH = int(round(max(heightA, heightB)))

                    src_pts = np.array([[p["x"], p["y"]] for p in pts], dtype="float32")
                    dst_pts = np.array([[0, 0], [outW - 1, 0],
                                        [outW - 1, outH - 1], [0, outH - 1]], dtype="float32")

                    M   = cv2.getPerspectiveTransform(src_pts, dst_pts)
                    dst = cv2.warpPerspective(img, M, (outW, outH),
                                              flags=cv2.INTER_LINEAR,
                                              borderValue=(255, 255, 255, 255))

                    if not encode_image(dst, fmt, quality, out_path):
                        print(f"  Error: Failed to encode {out_filename}")

                else:
                    # Polygon cut
                    minX = max(0, int(math.floor(min(p["x"] for p in pts))))
                    minY = max(0, int(math.floor(min(p["y"] for p in pts))))
                    maxX = min(img.shape[1], int(math.ceil(max(p["x"] for p in pts))))
                    maxY = min(img.shape[0], int(math.ceil(max(p["y"] for p in pts))))

                    outW    = maxX - minX
                    outH    = maxY - minY
                    cropped = img[minY:maxY, minX:maxX].copy()

                    mask     = np.zeros((outH, outW), dtype=np.uint8)
                    poly_pts = np.array([[[int(p["x"] - minX), int(p["y"] - minY)]]
                                         for p in pts], dtype=np.int32)
                    cv2.fillPoly(mask, [poly_pts], 255)
                    cropped[:, :, 3] = mask

                    if not encode_image(cropped, fmt, quality, out_path):
                        print(f"  Error: Failed to encode {out_filename}")

            print(f"  Saved {len(cards_raw)} images.")

    print(f"\nDone! Results saved to: {os.path.abspath(output_dir)}")
    input("\nPress Enter to exit...")


if __name__ == "__main__":
    main()
