import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth'; // Import getAuth to initialize Firebase Authentication
import { getFirestore } from 'firebase/firestore'; // Import getFirestore to initialize Firestore

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDHHshtSYvZl9irJIl2yPJNrUQI9zVD-To",
    authDomain: "colorize-web.firebaseapp.com",
    databaseURL: "https://colorize-web-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "colorize-web",
    storageBucket: "colorize-web.firebasestorage.app",
    messagingSenderId: "607589768841",
    appId: "1:607589768841:web:3b4c2c50d405bee271f058",
    measurementId: "G-WH8S6DL2FZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const database = getDatabase(app);
const auth = getAuth(app); // Initialize Firebase Authentication
const db = getFirestore(app); // Initialize Firestore

// Export db as default and others as named exports
export { database, auth };
export default db;
