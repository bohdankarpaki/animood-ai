import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Твої дані, які ти скопіював із сайту
const firebaseConfig = {
  apiKey: "AIzaSyA0jp1_geMSSu4RfbOUW57Vv7wTC97yZXY",
  authDomain: "animood-ai.firebaseapp.com",
  projectId: "animood-ai",
  storageBucket: "animood-ai.firebasestorage.app",
  messagingSenderId: "802320765435",
  appId: "1:802320765435:web:07a98105466cccdc83bb5e",
  measurementId: "G-8XQYJE10CZ"
};

// Ініціалізуємо додаток
const app = initializeApp(firebaseConfig);

// Додаємо EXPORT, щоб інші файли могли бачити ці сервіси
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);