from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import face_recognition
import numpy as np
from PIL import Image
import io
import json
from typing import List

app = FastAPI(title="Face Recognition Server")

# Enable CORS (allow all origins for simplicity in development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def image_bytes_to_numpy(image_bytes: bytes):
    image = Image.open(io.BytesIO(image_bytes))
    # Convert image to RGB if it isn't already (e.g. PNG with alpha)
    if image.mode != "RGB":
        image = image.convert("RGB")
    return np.array(image)

@app.get("/")
def read_root():
    return {"message": "Face Recognition API is running"}

@app.post("/api/encode")
async def encode_face(image: UploadFile = File(...)):
    """
    Receives an image and returns the 128D face descriptor if a face is found.
    """
    try:
        contents = await image.read()
        img_array = image_bytes_to_numpy(contents)
        
        # Find all face locations and encodings in the image
        face_locations = face_recognition.face_locations(img_array)
        face_encodings = face_recognition.face_encodings(img_array, face_locations)
        
        if len(face_encodings) == 0:
            return {"descriptor": []}
        
        # We only care about the first face found for enrollment
        descriptor = face_encodings[0].tolist()
        return {"descriptor": descriptor}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/match")
async def match_face(
    image: UploadFile = File(...),
    # Known faces data as a JSON string: [{"label": "student1", "descriptors": [[...], [...]]}, ...]
    known_faces_json: str = Form(...) 
):
    """
    Receives an image and known face descriptors, finds the best match.
    """
    try:
        contents = await image.read()
        img_array = image_bytes_to_numpy(contents)
        
        # 1. Parse known faces
        known_faces = json.loads(known_faces_json)
        if not known_faces:
             return {"match": {"label": "unknown", "distance": 1.0}, "message": "No known faces provided"}
            
        known_encodings = []
        known_labels = []
        for person in known_faces:
            label = person.get("label")
            descriptors = person.get("descriptors", [])
            for desc in descriptors:
                if len(desc) == 128:
                    known_encodings.append(np.array(desc))
                    known_labels.append(label)
                    
        if not known_encodings:
            return {"match": {"label": "unknown", "distance": 1.0}, "message": "No valid known encodings found"}

        # 2. Get encoding for the uploaded image
        face_locations = face_recognition.face_locations(img_array)
        face_encodings = face_recognition.face_encodings(img_array, face_locations)
        
        if len(face_encodings) == 0:
            return {"match": None, "message": "No face detected in the image"}
            
        uploaded_encoding = face_encodings[0]
        
        # 3. Compare with known faces
        face_distances = face_recognition.face_distance(known_encodings, uploaded_encoding)
        best_match_index = np.argmin(face_distances)
        best_distance = float(face_distances[best_match_index])
        
        # 4. Check if within threshold
        threshold = 0.6
        if best_distance <= threshold:
            best_label = known_labels[best_match_index]
            return {
                "match": {"label": best_label, "distance": best_distance},
                "message": "Match found"
            }
        else:
            return {
                "match": {"label": "unknown", "distance": best_distance},
                "message": "Face not recognized"
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
