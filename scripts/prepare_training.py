import os
import shutil

# Paths
base_dir = "dataset"
images_dir = os.path.join(base_dir, "images")
labels_dir = os.path.join(base_dir, "labels")

train_images_dir = os.path.join(base_dir, "train", "images")
train_labels_dir = os.path.join(base_dir, "train", "labels")
val_images_dir = os.path.join(base_dir, "val", "images")
val_labels_dir = os.path.join(base_dir, "val", "labels")

# Create dirs
for d in [train_images_dir, train_labels_dir, val_images_dir, val_labels_dir]:
    os.makedirs(d, exist_ok=True)

# Get all images and sort them
images = sorted([f for f in os.listdir(images_dir) if f.endswith('.jpg')])

train_count = 0
val_count = 0

for i, img_name in enumerate(images):
    # Every 5th scan goes to validation (index 4, 9, 14...)
    is_val = (i % 5 == 4)
    
    label_name = img_name.replace('.jpg', '.txt')
    
    src_img = os.path.join(images_dir, img_name)
    src_lbl = os.path.join(labels_dir, label_name)
    
    if not os.path.exists(src_lbl):
        continue
        
    if is_val:
        dst_img = os.path.join(val_images_dir, img_name)
        dst_lbl = os.path.join(val_labels_dir, label_name)
        val_count += 1
    else:
        dst_img = os.path.join(train_images_dir, img_name)
        dst_lbl = os.path.join(train_labels_dir, label_name)
        train_count += 1
        
    shutil.copy(src_img, dst_img)
    shutil.copy(src_lbl, dst_lbl)

print(f"Dataset split complete! Train: {train_count}, Val: {val_count}")

# Generate dataset.yaml with absolute paths to avoid YOLO path resolution issues
abs_base_dir = os.path.abspath(base_dir)

yaml_content = f"""path: {abs_base_dir}
train: train/images
val: val/images

names:
  0: card
"""

with open("dataset.yaml", "w", encoding="utf-8") as f:
    f.write(yaml_content)

print("dataset.yaml generated successfully!")
