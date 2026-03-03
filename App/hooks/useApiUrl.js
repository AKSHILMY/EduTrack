import Constants from 'expo-constants';

function getAPIUrl() {
    // In Expo development, the debuggerHost contains the dev machine's IP
    const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
    if (debuggerHost) {
        const host = debuggerHost.split(':')[0]; // Remove port
        return `http://${host}:3000/api`;
    }
    // Fallback for production or if detection fails
    return process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000/api";
}

export default function useApiUrl() {
    return {
        apiUrl: getAPIUrl(),
        loadingUrl: false
    };
}
