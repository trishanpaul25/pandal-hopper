import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Values come from .env.local (see .env.example). They are public identifiers, not secrets.
const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const authConfigured = !!(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
const app = authConfigured ? (getApps().length ? getApp() : initializeApp(cfg)) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
