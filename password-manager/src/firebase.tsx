import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBLVkVhcD__20al-QoSMWS1LyLrEqL_f5U",
  authDomain: "keyfort-cb88a.firebaseapp.com",
  projectId: "keyfort-cb88a",
  storageBucket: "keyfort-cb88a.firebasestorage.app",
  messagingSenderId: "732443119392",
  appId: "1:732443119392:web:fec6143f4efa864353d145",
  measurementId: "G-9XM4Q38S30",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
