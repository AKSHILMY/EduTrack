const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const axios = require("axios");
const FormData = require("form-data");

// --- 1. SETUP FIREBASE ADMIN ---
try {
  let serviceAccount;

  // Check if we are in production (Render) with a base64 encoded environment variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    console.log("🔒 Loading Firebase credentials from environment variable...");
    const decodedKey = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
    serviceAccount = JSON.parse(decodedKey);
  } else {
    // Fallback to local file for development
    console.log("📂 Loading Firebase credentials from local file...");
    const serviceAccountPath = path.join(__dirname, "../serviceAccountKey.json");

    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(`File not found at: ${serviceAccountPath}`);
    }
    serviceAccount = require(serviceAccountPath);
  }

  // Initialize Firebase (only if not already running)
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log(`✅ Firebase Connected: ${serviceAccount.project_id}`);
  }

} catch (error) {
  console.error("❌ FIREBASE ERROR: Could not load serviceAccountKey.json");
  console.error("   Reason:", error.message);
  console.error("   -> Did you download a NEW key and put it in the Server folder?");
  process.exit(1); // Stop server so you can fix it
}

const db = admin.firestore();
const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

// --- 5. REGISTER STUDENT ROUTE (Proxy to FastAPI) ---
router.post("/enroll-student", upload.array("faceImages", 3), async (req, res) => {
  try {
    // 1. Get Data
    const { studentName, indexNumber, guardianName, contactNumber, homeAddress, grade, section } = req.body;

    // 2. Validate Required Text Fields
    if (!studentName || !indexNumber) {
      console.log("❌ Missing Data:", req.body);
      return res.status(400).json({ message: "Student Name and Index Number are required." });
    }

    // 3. Process ALL uploaded images into face descriptors via FastAPI
    const faceDescriptors = [];
    const files = req.files || [];

    for (let i = 0; i < files.length; i++) {
      console.log(`📸 Processing photo ${i + 1}/${files.length} via FastAPI...`);

      const formData = new FormData();
      formData.append("image", files[i].buffer, {
        filename: files[i].originalname || "image.jpg",
        contentType: files[i].mimetype || "image/jpeg",
      });

      try {
        const response = await axios.post(`${FASTAPI_URL}/api/encode`, formData, {
          headers: { ...formData.getHeaders() }
        });

        const data = response.data;
        if (data.descriptor && data.descriptor.length > 0) {
          faceDescriptors.push(data.descriptor);
        } else {
          console.log(`⚠️ Photo ${i + 1}: No face detected by FastAPI, skipping.`);
        }
      } catch (err) {
        console.error(`FastAPI encoding error for image ${i + 1}:`, err.message);
      }
    }

    const hasFace = faceDescriptors.length > 0;

    // 4. Save to Firestore
    console.log("Saving to Firestore with data:", {
      studentName, indexNumber, grade, section, guardianName, hasFace, descriptorCount: faceDescriptors.length
    });

    await db.collection("students").doc(indexNumber).set({
      studentName: studentName,
      studentId: indexNumber,
      grade: grade || "",
      section: section || "",
      guardianName: guardianName,
      guardianPhone: contactNumber,
      homeAddress: homeAddress,
      faceDescriptors: faceDescriptors.map(d => ({ values: d })), // Wrap in objects
      faceDescriptor: faceDescriptors.length > 0 ? faceDescriptors[0] : [], // Legacy compat
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Registered: ${studentName} with ${faceDescriptors.length} face descriptor(s)`);
    res.json({ success: true, message: `Student Registered with ${faceDescriptors.length} face(s)` });

  } catch (error) {
    console.error("Enrollment Error:", error);
    res.status(500).json({ message: "Server Error: " + error.message });
  }
});

// --- 6. MARK ATTENDANCE ROUTE (Proxy to FastAPI) ---
router.post("/mark-attendance", upload.single("faceImage"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No face image uploaded" });

    // 1. Load All Students from DB
    const studentsSnapshot = await db.collection("students").get();

    // 2. Prepare known faces data
    const knownFaces = [];
    studentsSnapshot.forEach(doc => {
      const data = doc.data();
      let descriptors = [];

      if (data.faceDescriptors && Array.isArray(data.faceDescriptors)) {
        for (const desc of data.faceDescriptors) {
          const arr = desc.values || desc;
          if (Array.isArray(arr) && arr.length === 128) {
            descriptors.push(arr);
          }
        }
      }

      if (descriptors.length === 0 && data.faceDescriptor && data.faceDescriptor.length === 128) {
        descriptors.push(data.faceDescriptor);
      }

      if (descriptors.length > 0) {
        knownFaces.push({
          label: data.studentName,
          descriptors: descriptors
        });
      }
    });

    if (knownFaces.length === 0) {
      return res.status(404).json({ message: "No registered faces found in database." });
    }

    // 3. Send image and known faces to FastAPI
    const formData = new FormData();
    formData.append("image", req.file.buffer, {
      filename: req.file.originalname || "image.jpg",
      contentType: req.file.mimetype || "image/jpeg",
    });
    formData.append("known_faces_json", JSON.stringify(knownFaces));

    const response = await axios.post(`${FASTAPI_URL}/api/match`, formData, {
      headers: { ...formData.getHeaders() }
    });

    const data = response.data;
    const match = data.match;

    if (!match || match.label === "unknown") {
      return res.status(404).json({ message: "Face not recognized." });
    }

    console.log(`🔍 Best match: ${match.label} (distance: ${match.distance.toFixed(4)})`);

    // 4. Log Attendance
    const studentName = match.label;

    await db.collection("attendance").add({
      studentName: studentName,
      date: new Date().toISOString().split('T')[0],
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: "Present"
    });

    console.log(`📍 Attendance Marked: ${studentName} (confidence distance: ${match.distance.toFixed(4)})`);
    res.json({ success: true, message: "Attendance Marked", student: studentName });

  } catch (error) {
    console.error("Attendance Error:", error.response?.data || error.message);
    res.status(500).json({ message: "Server Error: " + (error.response?.data?.detail || error.message) });
  }
});


router.get("/students", async (req, res) => {
  try {
    const snapshot = await db.collection("students").orderBy("createdAt", "desc").get();

    if (snapshot.empty) {
      return res.json([]); // Return empty list if no students
    }

    const students = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(students);
  } catch (error) {
    console.error("Fetch Error:", error);
    res.status(500).json({ message: "Failed to fetch students" });
  }
});

// --- 7. MANAGE STUDENTS ROUTES ---

// PUT Update Student
router.put("/students/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { studentName, grade, section, guardianName, guardianPhone } = req.body;

    await db.collection("students").doc(id).update({
      studentName, grade, section, guardianName, guardianPhone
    });

    res.json({ success: true, message: "Student Updated" });
  } catch (error) {
    console.error("Update Student Error:", error);
    res.status(500).json({ message: "Failed to update student" });
  }
});

// DELETE Student
router.delete("/students/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection("students").doc(id).delete();
    res.json({ success: true, message: "Student Deleted" });
  } catch (error) {
    console.error("Delete Student Error:", error);
    res.status(500).json({ message: "Failed to delete student" });
  }
});

module.exports = router;