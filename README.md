# Cut Image

A modern web application designed for automatic detection, perspective rectification, and cropping of documents and cards from images.

## 🚀 Features

*   **Intelligent Detection Options**:
    *   **ML Detector**: Utilizes an ONNX-based YOLOv8-OBB (Oriented Bounding Box) model directly in the browser to detect documents and cards with high accuracy, regardless of their rotation or perspective.
    *   **CV Detector**: A fast fallback method using OpenCV.js to find contours and corners using classic computer vision techniques.
*   **Manual Adjustment & Grid Mode**: Easily adjust the detected corners (polygons) or use a grid to slice multiple cards at once.
*   **Perspective Rectification**: Automatically flattens and straightens skewed cards for a perfect rectangular output.
*   **Human-in-the-loop Telemetry**: Users can opt-in to share their manual boundary corrections. These corrections are sent to a Netlify backend and stored in MongoDB, forming a growing dataset to continuously fine-tune the ML model.

## 📁 Documentation & Instructions

Detailed guides on how the ML pipeline works, how telemetry is gathered, and how to train/fine-tune the YOLOv8-OBB model using Google Colab can be found in the `instructions/` folder:

*   [ML Dataset Guide](instructions/ML_DATASET_GUIDE.md) - Architecture of the "Human-in-the-loop" data collection.
*   [ML Instruction](instructions/ML_INSTRUCTION.md) - Steps to train the YOLOv8-OBB model locally.
*   [Colab Training Guide](instructions/COLAB_TRAINING_GUIDE.md) - Step-by-step guide for training the model in the cloud for free using Google Colab.
*   [Auto-Cut Build Guide](instructions/AUTO_CUT_BUILD.md) - Instructions for compiling the `auto-cut.py` script into a standalone executable.

## 🛠️ Tech Stack

*   **Frontend**: Vanilla HTML/JS/CSS, OpenCV.js, ONNX Runtime Web
*   **Backend**: Netlify Functions (Serverless), Node.js
*   **Database & Storage**: MongoDB Atlas, Cloudinary
*   **Machine Learning**: Ultralytics YOLOv8 (OBB)
