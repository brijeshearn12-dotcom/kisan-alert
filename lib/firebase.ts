import { initializeApp, getApps, getApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
}

// Initialize Firebase for SSR/Next.js client-side compatibility
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
const database = getDatabase(app)

export { app, database }

/**
 * Server-side helper to write notifications to Firebase Realtime Database
 * using the REST API to ensure serverless compatibility.
 */
export async function sendFirebaseNotification(
  userId: string,
  payload: { message: string; timestamp: number; read: boolean }
) {
  const dbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
  if (!dbUrl) {
    console.error('NEXT_PUBLIC_FIREBASE_DATABASE_URL is not set.')
    return
  }

  try {
    const response = await fetch(`${dbUrl}/notifications/${userId}.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error(
        'Failed to write notification to Firebase:',
        response.statusText
      )
    }
  } catch (error) {
    console.error('Error writing notification to Firebase:', error)
  }
}
