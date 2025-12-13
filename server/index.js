// Import required modules
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Allow requests from React app
app.use(express.json()); // Parse JSON request bodies

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

// Get Firestore reference
const db = admin.firestore();

/**
 * POST /api/verify-secret-phrase
 * 
 * Verifies the hashed secret phrase and username
 * Used for password reset verification
 * 
 * Request body:
 * {
 *   usernameHash: string (SHA-256 hashed username),
 *   secretPhraseHash: string (SHA-256 hashed secret phrase)
 * }
 * 
 * Response on success:
 * {
 *   success: true,
 *   userId: string,
 *   message: string
 * }
 * 
 * Response on failure:
 * {
 *   success: false,
 *   message: string
 * }
 */
app.post('/api/verify-secret-phrase', async (req, res) => {
  try {
    // Extract data from request body
    const { usernameHash, secretPhraseHash } = req.body;

    // Validation: Check if required fields are provided
    if (!usernameHash || !secretPhraseHash) {
      return res.status(400).json({
        success: false,
        message: 'Username hash and secret phrase hash are required'
      });
    }

    console.log(`[INFO] Secret phrase verification attempt for username hash: ${usernameHash.substring(0, 10)}...`);

    // Step 1: Find user by username hash in Firestore
    const usersRef = db.collection('users');
    const userQuery = await usersRef
      .where('usernameHash', '==', usernameHash)
      .get();

    // Check if user exists
    if (userQuery.empty) {
      console.log(`[ERROR] Username not found`);
      return res.status(404).json({
        success: false,
        message: 'Username not found'
      });
    }

    // Get user document
    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();
    const storedHash = userData.secretPhraseHash;
    const userId = userDoc.id;

    // Step 2: Compare the hashed secret phrase
    if (secretPhraseHash !== storedHash) {
      console.log(`[ERROR] Incorrect secret phrase`);
      return res.status(403).json({
        success: false,
        message: 'Incorrect secret phrase'
      });
    }

    console.log(`[SUCCESS] Secret phrase verified for username hash: ${usernameHash.substring(0, 10)}...`);

    // Fetch the encrypted recovery DEK from userdata
    // In case the client is not logged in and cannot read Firestore
    const userDataRef = db.collection('userdata').doc(userId);
    const userDataDoc = await userDataRef.get();
    
    let encryptedDEK_recovery = null;
    if (userDataDoc.exists) {
        encryptedDEK_recovery = userDataDoc.data().encryptedDEK_recovery;
    }

    // Step 3: Return success with userId
    return res.status(200).json({
      success: true,
      userId: userId,
      message: 'Secret phrase verified successfully'
    });

  } catch (error) {
    // Log error for debugging
    console.error('[ERROR] Server error:', error);

    // Return generic error to client
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request'
    });
  }
});

/**
 * POST /api/reset-password
 * 
 * Resets user password using Firebase Admin SDK
 * Requires verified secret phrase
 * 
 * Request body:
 * {
 *   userId: string,
 *   newPassword: string,
 *   encryptedDEK: string (DEK encrypted with new password)
 * }
 * 
 * Response on success:
 * {
 *   success: true,
 *   message: string
 * }
 * 
 * Response on failure:
 * {
 *   success: false,
 *   message: string
 * }
 */
app.post('/api/reset-password', async (req, res) => {
  try {
    const { userId, newPassword, encryptedDEK } = req.body;

    // Validation
    if (!userId || !newPassword || !encryptedDEK) {
      return res.status(400).json({
        success: false,
        message: 'User ID, new password, and encrypted DEK are required'
      });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    console.log(`[INFO] Password reset attempt for user: ${userId}`);

    // Step 1: Update password in Firebase Auth using Admin SDK
    await admin.auth().updateUser(userId, {
      password: newPassword
    });

    console.log(`[SUCCESS] Password updated in Firebase Auth`);

    // Step 2: Update encrypted DEK in Firestore
    const userDataRef = db.collection('userdata').doc(userId);
    await userDataRef.set({
      encryptedDEK: encryptedDEK,
      lastPasswordChange: new Date().toISOString()
    }, { merge: true });

    console.log(`[SUCCESS] Encrypted DEK updated in Firestore`);

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('[ERROR] Password reset failed:', error);

    // Handle specific Firebase errors
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while resetting password'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running', 
    timestamp: new Date().toISOString() 
  });
});

// HTTPS Server setup (for certificates)
try {
  const httpsOptions = {
    key: fs.readFileSync(path.resolve(__dirname, '../server-key.pem')),
    cert: fs.readFileSync(path.resolve(__dirname, '../server-cert.pem')),
  };

  // Start HTTPS server
  https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`========================================`);
    console.log(`Server is running on https://localhost:${PORT}`);
    console.log(`API endpoints:`);
    console.log(`POST https://localhost:${PORT}/api/verify-secret-phrase`);
    console.log(`POST https://localhost:${PORT}/api/reset-password`);
    console.log(`GET  https://localhost:${PORT}/api/health`);
    console.log(`========================================`);
  });
} catch (error) {
  console.log('[WARNING] HTTPS certificates not found, falling back to HTTP');
  console.log('[INFO] For production, please set up HTTPS certificates');
  
  // Fallback to HTTP if certificates not found
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`API endpoints:`);
    console.log(`POST http://localhost:${PORT}/api/verify-secret-phrase`);
    console.log(`POST http://localhost:${PORT}/api/reset-password`);
    console.log(`GET  http://localhost:${PORT}/api/health`);
    console.log(`WARNING: Using HTTP (not secure)`);
    console.log(`========================================`);
  });
}