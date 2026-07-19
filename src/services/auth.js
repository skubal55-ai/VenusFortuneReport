// Firebase Authentication only — no Firestore. The user's profile
// (credits, isAdmin) now lives in Supabase Postgres and is created/read
// via the get-profile Edge Function (see services/profile.js), the first
// time it's called after signup. There's nothing to write here beyond
// creating the Firebase Auth account itself.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, ADMIN_EMAIL } from "./firebase";

export function isAdminEmail(email) {
  return !!email && email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export async function signUp(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export function signOut() {
  return firebaseSignOut(auth);
}

export function subscribeToAuthChanges(callback) {
  return onAuthStateChanged(auth, callback);
}
