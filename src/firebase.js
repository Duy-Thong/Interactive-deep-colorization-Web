import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Debug environment variables
console.log('Checking env variables:', {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID
});

// Verify environment variables loading
if (!process.env.REACT_APP_FIREBASE_API_KEY) {
    console.error('Environment variables are not loaded!');
}

// Verify required environment variables
const requiredEnvVars = [
    'REACT_APP_FIREBASE_API_KEY',
    'REACT_APP_FIREBASE_AUTH_DOMAIN',
    'REACT_APP_FIREBASE_PROJECT_ID'
];

const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
    measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Add debug logging
console.log('Firebase Config:', firebaseConfig);

let app, database, auth, db, storage;

// Add error handling for initialization
try {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
} catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
}

export { database, auth, storage };
export default db;
