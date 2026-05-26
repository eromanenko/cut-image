import os
import requests
import json
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")

if not MONGODB_URI:
    print("Error: MONGODB_URI not found in .env file")
    exit(1)

# Configuration
DB_NAME = "cut_image_ai"
COLLECTION_NAME = "telemetry"
OUTPUT_DIR = "dataset"
IMAGES_DIR = os.path.join(OUTPUT_DIR, "images")
LABELS_DIR = os.path.join(OUTPUT_DIR, "labels")

# Create output directories
os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(LABELS_DIR, exist_ok=True)

def download_dataset():
    print(f"Connecting to MongoDB: {DB_NAME}...")
    client = MongoClient(MONGODB_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]

    total_docs = collection.count_documents({})
    print(f"Found {total_docs} records in the database.")

    cursor = collection.find({})
    
    count = 0
    for doc in cursor:
        doc_id = str(doc["_id"])
        image_url = doc.get("imageUrl")
        coordinates = doc.get("coordinates", [])

        if not image_url or not coordinates:
            print(f"Skipping document {doc_id} - missing image URL or coordinates.")
            continue

        # 1. Download the image
        image_path = os.path.join(IMAGES_DIR, f"{doc_id}.jpg")
        if not os.path.exists(image_path):
            try:
                response = requests.get(image_url, stream=True)
                response.raise_for_status()
                with open(image_path, "wb") as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
            except Exception as e:
                print(f"Failed to download image {image_url}: {e}")
                continue

        # 2. Generate YOLOv8-OBB annotations
        # Format: class_index x1 y1 x2 y2 x3 y3 x4 y4
        # Class index for "card" will be 0
        label_path = os.path.join(LABELS_DIR, f"{doc_id}.txt")
        
        with open(label_path, "w") as f:
            for card in coordinates:
                # Our coordinates are stored as an array of 4 objects: [{x, y}, {x, y}, {x, y}, {x, y}]
                if len(card) != 4:
                    continue
                
                x1, y1 = card[0]['x'], card[0]['y']
                x2, y2 = card[1]['x'], card[1]['y']
                x3, y3 = card[2]['x'], card[2]['y']
                x4, y4 = card[3]['x'], card[3]['y']
                
                # Write YOLO-OBB line
                f.write(f"0 {x1:.6f} {y1:.6f} {x2:.6f} {y2:.6f} {x3:.6f} {y3:.6f} {x4:.6f} {y4:.6f}\n")
        
        count += 1
        if count % 10 == 0:
            print(f"Processed {count}/{total_docs} records...")

    print(f"\nDone! Successfully downloaded {count} image-label pairs into the '{OUTPUT_DIR}' directory.")
    print("This dataset is now ready to be used for training a YOLOv8-OBB model!")

if __name__ == "__main__":
    download_dataset()
