// AttendanceScreen.safeImagePicker.js
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Image, Alert, Linking, SafeAreaView,
} from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import axios from "axios";
import { useTheme } from '../../context/ThemeContext';
import useApiUrl from '../../hooks/useApiUrl';

export default function AttendanceScreen({ navigation }) {
  const { apiUrl: BACKEND_API_URL, loadingUrl } = useApiUrl();
  const { colors } = useTheme(); // Use Theme// Use Theme
  const [permissionState, setPermissionState] = useState(null); // null | "granted" | "denied"
  const [isLoading, setIsLoading] = useState(false);
  const [pickedUri, setPickedUri] = useState(null);
  const [scanResult, setScanResult] = useState(null);

  // Request permission and auto-open camera on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        setPermissionState(status);
        if (status === "granted") {
          await openCameraAndUpload({ autoLaunched: true });
        }
      } catch (err) {
        console.warn("Permission request failed:", err);
        setPermissionState("denied");
      }
    })();
  }, []);

  const openCameraAndUpload = async ({ autoLaunched = false } = {}) => {
    if (permissionState !== "granted") {
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        setPermissionState(status);
        if (status !== "granted") {
          if (!autoLaunched) {
            Alert.alert(
              "Permission required",
              "Please grant camera permission in settings to take a photo.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Open Settings",
                  onPress: () => Linking.openSettings(),
                },
              ]
            );
          }
          return;
        }
      } catch (err) {
        console.warn("Permission request failed:", err);
        return;
      }
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
      });

      if (result.canceled === true) return;

      const uri = result.uri ?? result.assets?.[0]?.uri;
      if (!uri) return;

      setPickedUri(uri);
      await uploadImage(uri);
    } catch (err) {
      console.error("Camera open failed:", err);
      setScanResult({ success: false, message: "Could not open camera." });
    }
  };

  const uploadImage = async (uri) => {
    if (loadingUrl) {
      Alert.alert("Connecting", "Please wait while connecting to the server...");
      return;
    }
    setIsLoading(true);
    setScanResult(null);

    try {
      const formData = new FormData();
      const uriParts = uri.split(".");
      const fileType = (uriParts[uriParts.length - 1] || "jpg").split(/\#|\?/)[0];
      const filename = `photo.${fileType}`;

      if (Platform.OS === "web") {
        // On web, we need to convert the URI to a Blob
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append("faceImage", blob, filename);
      } else {
        formData.append("faceImage", {
          uri: Platform.OS === "android" ? uri : uri.replace("file://", ""),
          name: filename,
          type: `image/${fileType}`,
        });
      }

      const res = await axios.post(
        `${BACKEND_API_URL}/mark-attendance`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 25000,
        }
      );

      // ✅ UPDATE: Combine the message and the student name
      const serverMsg = res.data?.message || "Attendance Marked";
      const studentName = res.data?.student || ""; // Get student name from backend

      const displayMessage = studentName
        ? `${serverMsg}\n👤 ${studentName}`
        : serverMsg;

      setScanResult({
        success: true,
        message: displayMessage,
      });

    } catch (err) {
      console.error("Upload failed:", err?.response?.data ?? err.message ?? err);
      const msg = err?.response?.data?.message ?? "Student not recognized.";
      setScanResult({ success: false, message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  if (permissionState === null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.scanText, { color: colors.text }]}>Checking camera permission…</Text>
      </SafeAreaView>
    );
  }

  if (permissionState !== "granted") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.scanText, { color: colors.text }]}>
          We need permission to use your camera
        </Text>
        <TouchableOpacity
          style={styles.viewButton}
          onPress={async () => {
            try {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              setPermissionState(status);
              if (status === "granted") openCameraAndUpload();
              else
                Alert.alert(
                  "Permission denied",
                  "Camera permission was not granted. You can enable it in settings.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Open Settings", onPress: () => Linking.openSettings() },
                  ]
                );
            } catch (err) {
              console.warn(err);
            }
          }}
        >
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <FontAwesome5 name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Attendance</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.scanText, { color: colors.text }]}>Tap the button to take a photo</Text>

        <View style={[styles.scanFrame, { backgroundColor: colors.card }]}>
          {pickedUri ? (
            <Image
              source={{ uri: pickedUri }}
              style={styles.camera}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.camera, styles.emptyCamera]}>
              <Text style={{ color: colors.subText }}>No photo yet</Text>
            </View>
          )}

          <View style={styles.overlay}>
            {isLoading && <ActivityIndicator size="large" color="#fff" />}
            {scanResult && !isLoading && (
              <View style={styles.resultContainer}>
                <FontAwesome5
                  name={scanResult.success ? "check-circle" : "times-circle"}
                  size={60}
                  color={scanResult.success ? "#4CAF50" : "#F44336"}
                />
                <Text
                  style={[
                    styles.resultText,
                    { color: scanResult.success ? "#4CAF50" : "#F44336" },
                  ]}
                >
                  {scanResult.message}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.captureButton, isLoading && { opacity: 0.6 }]}
            onPress={() => openCameraAndUpload({ autoLaunched: false })}
            disabled={isLoading}
          >
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.smallButton, { backgroundColor: colors.card }, isLoading && { opacity: 0.6 }]}
            onPress={() => {
              setPickedUri(null);
              setScanResult(null);
            }}
            disabled={isLoading}
          >
            <FontAwesome5 name="trash" size={18} color={colors.text} />
            <Text style={[styles.smallButtonText, { color: colors.text }]}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    justifyContent: "center",
  },
  backButton: { position: "absolute", left: 0, padding: 8 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  content: { flex: 1, alignItems: "center" },
  scanText: {
    fontSize: 16,
    marginBottom: 12,
    fontWeight: "600",
  },
  scanFrame: {
    width: 320,
    height: 420,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#007BFF",
    marginBottom: 20,
    overflow: "hidden",
  },
  camera: { flex: 1, width: "100%" },
  emptyCamera: { justifyContent: "center", alignItems: "center" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  resultContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  resultText: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(0,123,255,0.5)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#fff",
    marginHorizontal: 12,
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#007BFF",
  },
  smallButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  smallButtonText: { marginLeft: 6 },
  viewButton: {
    backgroundColor: "#007BFF",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 20,
    minWidth: 120,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});