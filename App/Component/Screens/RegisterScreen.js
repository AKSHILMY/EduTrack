import React, { useState } from "react";
import { notifyStudentRegistered } from './NotificationHelper';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, StyleSheet, Platform, KeyboardAvoidingView, Image
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from '@expo/vector-icons';
import axios from "axios";
import useApiUrl from '../../hooks/useApiUrl';

import { sendAdminNotification } from '../../services/notificationService';

const MAX_PHOTOS = 3;

export default function RegisterScreen({ navigation }) {
  const { apiUrl: BACKEND_API_URL, loadingUrl } = useApiUrl();
  // --- STATE ---
  const [name, setName] = useState("");
  const [indexNumber, setIndexNumber] = useState("");
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [address, setAddress] = useState("");

  const [images, setImages] = useState([]); // Array of URIs (max 3)
  const [loading, setLoading] = useState(false);

  // --- 1. CAMERA FUNCTION (Multi-Photo) ---
  const pickImage = async () => {
    if (images.length >= MAX_PHOTOS) {
      Alert.alert("Maximum Reached", `You can only capture up to ${MAX_PHOTOS} photos.`);
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.5,
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;
        setImages(prev => [...prev, uri]);
        const remaining = MAX_PHOTOS - images.length - 1;
        if (remaining > 0) {
          Alert.alert("✅ Photo Captured", `${images.length + 1}/${MAX_PHOTOS} photos taken. You can add ${remaining} more for better accuracy.`);
        } else {
          Alert.alert("✅ All Photos Captured", `${MAX_PHOTOS}/${MAX_PHOTOS} photos taken. Ready to register!`);
        }
      }
    } catch (error) {
      console.log("Camera Error:", error);
      Alert.alert("Error", "Could not open camera.");
    }
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  // --- 2. REGISTER FUNCTION ---
  const handleRegister = async () => {
    if (loadingUrl) {
      Alert.alert("Connecting", "Please wait while connecting to the server...");
      return;
    }

    if (!name || !indexNumber || !grade || !section || !guardianName || !contactNumber || !address || images.length === 0) {
      return Alert.alert("Missing Data", "All fields and at least 1 face photo are required.");
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("studentName", name);
      formData.append("indexNumber", indexNumber);
      formData.append("grade", grade);
      formData.append("section", section);
      formData.append("guardianName", guardianName);
      formData.append("contactNumber", contactNumber);
      formData.append("homeAddress", address);

      // Append ALL captured images
      for (let index = 0; index < images.length; index++) {
        const uri = images[index];
        const filename = uri.split('/').pop();
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;
        const name = `face_${index}.${match ? match[1] : 'jpg'}`;

        if (Platform.OS === "web") {
          // On web, convert URI to a Blob
          const response = await fetch(uri);
          const blob = await response.blob();
          formData.append("faceImages", blob, name);
        } else {
          formData.append("faceImages", {
            uri: Platform.OS === "android" ? uri : uri.replace("file://", ""),
            name: name,
            type: type
          });
        }
      }

      console.log("Sending data to:", `${BACKEND_API_URL}/enroll-student`);

      await axios.post(`${BACKEND_API_URL}/enroll-student`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await notifyStudentRegistered(name);

      await sendAdminNotification(
        `New Student Registered: ${name} (Grade ${grade}-${section})`,
        'success'
      );

      Alert.alert("Success", `Student registered with ${images.length} face photo(s)!`, [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);

      // Reset Form
      setName("");
      setIndexNumber("");
      setGrade("");
      setSection("");
      setGuardianName("");
      setContactNumber("");
      setAddress("");
      setImages([]);

    } catch (err) {
      console.error(err);
      const serverMessage = err.response?.data?.message || "Registration failed. Check connection.";
      Alert.alert("Registration Failed", serverMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0D0D0D" }}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Register New Student</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container}>

          {/* Section: Basic Info */}
          <Text style={styles.sectionHeader}>Basic Information</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              placeholder="e.g. John Doe"
              placeholderTextColor="#666"
              value={name} onChangeText={setName}
              style={styles.input}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Index Number *</Text>
            <TextInput
              placeholder="e.g. 20001234"
              placeholderTextColor="#666"
              value={indexNumber} onChangeText={setIndexNumber}
              keyboardType="numeric"
              style={styles.input}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Grade *</Text>
            <TextInput
              placeholder="e.g. 10"
              placeholderTextColor="#666"
              value={grade} onChangeText={setGrade}
              keyboardType="numeric"
              style={styles.input}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Section *</Text>
            <TextInput
              placeholder="e.g. A"
              placeholderTextColor="#666"
              value={section} onChangeText={setSection}
              style={styles.input}
            />
          </View>

          {/* Section: Contact Info */}
          <Text style={styles.sectionHeader}>Contact Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Guardian Name *</Text>
            <TextInput
              placeholder="Parent Name"
              placeholderTextColor="#666"
              value={guardianName} onChangeText={setGuardianName}
              style={styles.input}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contact Number *</Text>
            <TextInput
              placeholder="07X XXXXXXX"
              placeholderTextColor="#666"
              value={contactNumber} onChangeText={setContactNumber}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Home Address *</Text>
            <TextInput
              placeholder="No, Street, City"
              placeholderTextColor="#666"
              value={address} onChangeText={setAddress}
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              multiline
            />
          </View>

          {/* Section: Multi-Photo Face Capture */}
          <Text style={styles.sectionHeader}>Scan Face ({images.length}/{MAX_PHOTOS} Photos)</Text>

          {/* Thumbnail Previews */}
          {images.length > 0 && (
            <View style={styles.thumbnailRow}>
              {images.map((uri, index) => (
                <View key={index} style={styles.thumbnailContainer}>
                  <Image source={{ uri }} style={styles.thumbnail} />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeImage(index)}
                  >
                    <Ionicons name="close-circle" size={22} color="#F44336" />
                  </TouchableOpacity>
                  <Text style={styles.thumbnailLabel}>Photo {index + 1}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Camera Capture Button */}
          <TouchableOpacity
            onPress={pickImage}
            style={[
              styles.cameraBox,
              images.length > 0 && images.length < MAX_PHOTOS && styles.cameraBoxPartial,
              images.length >= MAX_PHOTOS && styles.cameraBoxSuccess,
            ]}
            disabled={images.length >= MAX_PHOTOS}
          >
            {images.length >= MAX_PHOTOS ? (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="checkmark-circle" size={50} color="#27ae60" />
                <Text style={[styles.cameraText, { color: "#27ae60" }]}>All Photos Captured</Text>
              </View>
            ) : images.length > 0 ? (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="camera-outline" size={40} color="#007AFF" />
                <Text style={styles.cameraText}>Add Another Angle ({images.length}/{MAX_PHOTOS})</Text>
                <Text style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
                  More photos = better accuracy
                </Text>
              </View>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="scan-outline" size={40} color="#007AFF" />
                <Text style={styles.cameraText}>Scan Face</Text>
                <Text style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
                  Take up to {MAX_PHOTOS} photos for best results
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Register Button */}
          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading}
            style={[styles.button, loading && styles.buttonDisabled]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Register Student</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#0D0D0D",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  backButton: { padding: 10, marginRight: 10 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  container: { flexGrow: 1, padding: 20, alignItems: "center" },
  sectionHeader: {
    width: "100%", color: "#007AFF", fontSize: 14, fontWeight: "bold",
    marginTop: 15, marginBottom: 15, textTransform: "uppercase", letterSpacing: 1
  },
  inputGroup: { width: "100%", marginBottom: 15 },
  label: { color: "#ccc", marginBottom: 8, fontSize: 14, fontWeight: '600', alignSelf: "flex-start" },
  input: {
    width: "100%", backgroundColor: "#1E1E1E", color: "#fff",
    padding: 15, borderRadius: 10, borderWidth: 1, borderColor: "#333", fontSize: 16
  },
  thumbnailRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 12,
    gap: 10,
  },
  thumbnailContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#27ae60',
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#0D0D0D',
    borderRadius: 11,
  },
  thumbnailLabel: {
    color: '#999',
    fontSize: 11,
    marginTop: 4,
  },
  cameraBox: {
    width: "100%", height: 120, backgroundColor: "#1E1E1E",
    justifyContent: "center", alignItems: "center", marginBottom: 20,
    borderRadius: 10,
    borderStyle: 'dashed', borderWidth: 2, borderColor: '#007AFF'
  },
  cameraBoxPartial: {
    borderColor: '#FFA500',
    backgroundColor: 'rgba(255, 165, 0, 0.05)'
  },
  cameraBoxSuccess: {
    borderColor: '#27ae60',
    backgroundColor: 'rgba(39, 174, 96, 0.1)'
  },
  cameraText: { color: "#007AFF", fontSize: 16, marginTop: 5, fontWeight: "600" },
  button: {
    backgroundColor: "#007AFF", padding: 18, borderRadius: 10,
    width: "100%", alignItems: "center", marginTop: 20
  },
  buttonDisabled: { backgroundColor: "#333" },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 18 }
});