import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./home.css";
import "../Alert.css";
import { v4 as uuidv4 } from "uuid";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import CryptoJS from "crypto-js";

type Entry = {
  id: string;
  email: string;
  password: string;
  website: string;
  show: boolean;
};

type Folder = {
  id: string;
  name: string;
  entries: Entry[];
  collapsed: boolean;
};

type AlertConfig = {
  message: string;
  onConfirm?: () => void;
  showCancel?: boolean;
};

export default function Home() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [showUpdatePassword, setShowUpdatePassword] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState("");
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const [dek, setDek] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Update password form
  const [updateUsername, setUpdateUsername] = useState("");
  const [updateSecretPhrase, setUpdateSecretPhrase] = useState("");
  const [updateNewPassword, setUpdateNewPassword] = useState("");
  const [updateConfirmPassword, setUpdateConfirmPassword] = useState("");

  // Entry form
  const [entryWebsite, setEntryWebsite] = useState("");
  const [entryEmail, setEntryEmail] = useState("");
  const [entryPassword, setEntryPassword] = useState("");

  // Auto-logout when page/tab is closed
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (auth.currentUser) {
        await signOut(auth);
      }
      sessionStorage.removeItem("masterPassword");
      sessionStorage.removeItem("dek");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // Session Management
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("Auth state changed:", user ? "User logged in" : "No user");

      if (!user) {
        // No user logged in, redirect to login
        console.log("No user, redirecting to login");
        navigate("/");
        return;
      }

      // User is logged in
      setCurrentUser(user);

      // Check if DEK is in sessionStorage with retry mechanism
      let storedDek = sessionStorage.getItem("dek");
      let retries = 0;

      // Retry up to 3 times with 100ms delay (handles bug on initial login)
      while (!storedDek && retries < 3) {
        console.log(`DEK not found, retry ${retries + 1}/3...`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        storedDek = sessionStorage.getItem("dek");
        retries++;
      }

      if (storedDek) {
        console.log("DEK found in sessionStorage");
        setDek(storedDek);
        setIsLoading(false);
      } else {
        console.log(
          "DEK not found in sessionStorage after retries - session expired"
        );
        // DEK not found - this means session expired or page refreshed
        displayAlert(
          "Session expired. Please login again.",
          false,
          async () => {
            await signOut(auth);
            sessionStorage.clear();
            navigate("/");
          }
        );
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Load folders when DEK is set
  useEffect(() => {
    if (dek && currentUser) {
      console.log("Loading folders...");
      loadFoldersFromFirestore();
    }
  }, [dek, currentUser]);

  // Encryption/Decryption functions using DEK
  const encryptData = (data: string): string => {
    return CryptoJS.AES.encrypt(data, dek).toString();
  };

  const decryptData = (encryptedData: string): string => {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, dek);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      if (!decrypted) {
        throw new Error("Decryption failed");
      }
      return decrypted;
    } catch (error) {
      console.error("Decryption failed:", error);
      return "";
    }
  };

  // Custom Alert
  const displayAlert = (
    message: string,
    showCancel = false,
    onConfirm?: () => void
  ) => {
    setAlertConfig({ message, showCancel, onConfirm });
  };

  const closeAlert = () => {
    setAlertConfig(null);
  };

  const handleAlertConfirm = () => {
    if (alertConfig?.onConfirm) {
      alertConfig.onConfirm();
    }
    closeAlert();
  };

  // Load folders from Firestore
  const loadFoldersFromFirestore = async () => {
    if (!currentUser) {
      console.error("No user logged in");
      return;
    }

    try {
      console.log("Loading folders for user:", currentUser.uid);
      const userDocRef = doc(db, "userdata", currentUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const data = userDoc.data();
        console.log("Document data found");

        if (data.folders && data.folders !== "") {
          try {
            const decryptedFolders = JSON.parse(decryptData(data.folders));
            if (decryptedFolders && Array.isArray(decryptedFolders)) {
              setFolders(decryptedFolders);
              console.log(
                "Folders loaded successfully:",
                decryptedFolders.length
              );
            } else {
              console.error("Decryption failed");
              displayAlert("Failed to decrypt data.", false, async () => {
                await signOut(auth);
                sessionStorage.clear();
                navigate("/");
              });
            }
          } catch (error) {
            console.error("Error decrypting folders:", error);
            displayAlert("Failed to decrypt data.", false, async () => {
              await signOut(auth);
              sessionStorage.clear();
              navigate("/");
            });
          }
        } else {
          console.log("No folders data found, starting fresh");
          setFolders([]);
        }
      } else {
        console.log("No document found for user, creating new");
        setFolders([]);
        await saveFoldersToFirestore([]);
      }
    } catch (error) {
      console.error("Error loading folders:", error);
      displayAlert("Error loading your data. Please try again.");
    }
  };

  // Save folders to Firestore
  const saveFoldersToFirestore = async (foldersToSave: Folder[]) => {
    if (!currentUser || !dek) {
      console.error("Cannot save - no user or DEK");
      return;
    }

    try {
      console.log("Saving folders to Firestore:", foldersToSave.length);
      const userDocRef = doc(db, "userdata", currentUser.uid);
      const encryptedFolders = encryptData(JSON.stringify(foldersToSave));

      await setDoc(
        userDocRef,
        {
          folders: encryptedFolders,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );

      console.log("Folders saved successfully");
    } catch (error) {
      console.error("Error saving folders:", error);
      displayAlert("Error saving your data. Please try again.");
    }
  };

  // Logout
  const handleLogout = async () => {
    displayAlert("Are you sure you want to logout?", true, async () => {
      try {
        sessionStorage.removeItem("masterPassword");
        sessionStorage.removeItem("dek");
        await signOut(auth);
        navigate("/");
      } catch (error) {
        console.error("Logout error:", error);
        displayAlert("Error logging out. Please try again.");
      }
    });
  };

  // Update Password
  const handleUpdatePassword = async () => {
    if (
      !updateUsername.trim() ||
      !updateSecretPhrase.trim() ||
      !updateNewPassword.trim() ||
      !updateConfirmPassword.trim()
    ) {
      displayAlert("Please fill in all fields.");
      return;
    }

    if (updateNewPassword !== updateConfirmPassword) {
      displayAlert("Passwords do not match.");
      return;
    }

    if (updateNewPassword.length < 6) {
      displayAlert("Password must be at least 6 characters.");
      return;
    }

    try {
      const usernameHash = CryptoJS.SHA256(
        updateUsername.trim().toLowerCase()
      ).toString();
      const secretPhraseHash = CryptoJS.SHA256(updateSecretPhrase).toString();

      // Step 1: Verify secret phrase with server
      const serverUrl =
        window.location.protocol === "https:"
          ? "https://localhost:5000/api/verify-secret-phrase"
          : "http://localhost:5000/api/verify-secret-phrase";

      const verifyResponse = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          usernameHash,
          secretPhraseHash,
        }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyData.success) {
        displayAlert(
          verifyData.message ||
            "Verification failed. Please check your information."
        );
        return;
      }

      // Step 2: Re-encrypt DEK with new password
      const newEncryptedDEK = CryptoJS.AES.encrypt(
        dek,
        updateNewPassword
      ).toString();

      // Step 3: Call server to update password
      const resetUrl =
        window.location.protocol === "https:"
          ? "https://localhost:5000/api/reset-password"
          : "http://localhost:5000/api/reset-password";

      const resetResponse = await fetch(resetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: currentUser.uid,
          newPassword: updateNewPassword,
          encryptedDEK: newEncryptedDEK,
        }),
      });

      const resetData = await resetResponse.json();

      if (resetData.success) {
        displayAlert(
          "Password updated successfully! Please login with your new password.",
          false,
          async () => {
            // Clear inputs and close overlay
            setUpdateUsername("");
            setUpdateSecretPhrase("");
            setUpdateNewPassword("");
            setUpdateConfirmPassword("");
            setShowUpdatePassword(false);

            // Logout user
            sessionStorage.clear();
            await signOut(auth);
            navigate("/");
          }
        );
      } else {
        displayAlert(resetData.message || "Password update failed.");
      }
    } catch (error) {
      console.error("Update password error:", error);
      displayAlert(
        "An error occurred. Please make sure your server is running and try again."
      );
    }
  };

  // Add Folder
  const addFolder = async () => {
    if (!newFolderName.trim()) {
      displayAlert("Please enter a folder name.");
      return;
    }

    const updatedFolders = [
      ...folders,
      { id: uuidv4(), name: newFolderName, entries: [], collapsed: false },
    ];

    setFolders(updatedFolders);
    await saveFoldersToFirestore(updatedFolders);
    setNewFolderName("");
  };

  // Delete Folder
  const deleteFolder = (folderId: string) => {
    displayAlert(
      "Are you sure you want to delete this folder? This action cannot be reversed.",
      true,
      async () => {
        const updatedFolders = folders.filter(
          (folder) => folder.id !== folderId
        );
        setFolders(updatedFolders);
        await saveFoldersToFirestore(updatedFolders);
      }
    );
  };

  // Open Entry Form
  const openEntryForm = (folderId: string) => {
    setCurrentFolderId(folderId);
    setShowEntryForm(true);
  };

  // Add Entry
  const addEntry = async () => {
    if (!entryWebsite.trim() || !entryEmail.trim() || !entryPassword.trim()) {
      displayAlert(
        "Please fill in all fields (Website, Email, and Password) to save the entry."
      );
      return;
    }

    const updatedFolders = folders.map((folder) =>
      folder.id === currentFolderId
        ? {
            ...folder,
            entries: [
              ...folder.entries,
              {
                id: uuidv4(),
                website: entryWebsite,
                email: entryEmail,
                password: entryPassword,
                show: false,
              },
            ],
          }
        : folder
    );

    setFolders(updatedFolders);
    await saveFoldersToFirestore(updatedFolders);

    setEntryWebsite("");
    setEntryEmail("");
    setEntryPassword("");
    setShowEntryForm(false);
    setCurrentFolderId("");
  };

  // Delete Entry
  const deleteEntry = (folderId: string, entryId: string) => {
    displayAlert(
      "Are you sure you want to delete this entry? This action cannot be reversed.",
      true,
      async () => {
        const updatedFolders = folders.map((folder) =>
          folder.id === folderId
            ? {
                ...folder,
                entries: folder.entries.filter((entry) => entry.id !== entryId),
              }
            : folder
        );
        setFolders(updatedFolders);
        await saveFoldersToFirestore(updatedFolders);
      }
    );
  };

  // Copy to Clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        displayAlert(`${label} copied to clipboard!`);
      },
      (err) => {
        console.error("Copy failed:", err);
        displayAlert("Failed to copy. Please try again.");
      }
    );
  };

  // Toggle Password Visibility
  const togglePassword = (folderId: string, entryId: string) => {
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId
          ? {
              ...folder,
              entries: folder.entries.map((entry) =>
                entry.id === entryId ? { ...entry, show: !entry.show } : entry
              ),
            }
          : folder
      )
    );
  };

  // Toggle Folder Collapse
  const toggleFolder = (folderId: string) => {
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId
          ? { ...folder, collapsed: !folder.collapsed }
          : folder
      )
    );
  };

  if (isLoading) {
    return (
      <div className="home-page">
        <div className="overlay"></div>
        <div className="content">
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <h2>Loading...</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="overlay"></div>
      <div className="content">
        {/* Header with buttons */}
        <div className="header">
          <h1>KeyFort Password Manager</h1>
          <div className="header-buttons">
            <button
              className="update-password-btn"
              onClick={() => setShowUpdatePassword(true)}
            >
              Change Password
            </button>
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>

        {/* Main Content or Update Password Form */}
        {!showUpdatePassword ? (
          <>
            {/* Add Folder */}
            <div className="add-folder">
              <input
                type="text"
                placeholder="New folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addFolder()}
              />
              <button onClick={addFolder}>Add Folder</button>
            </div>

            {/* Folders */}
            <div className="folders">
              {folders.length === 0 ? (
                <div
                  style={{ textAlign: "center", padding: "2rem", opacity: 0.7 }}
                >
                  <p>
                    No folders yet. Create your first folder to get started!
                  </p>
                </div>
              ) : (
                folders.map((folder) => (
                  <div key={folder.id} className="folder">
                    <div className="folder-header">
                      <h2
                        onClick={() => toggleFolder(folder.id)}
                        className="folder-title"
                      >
                        {folder.name} {folder.collapsed ? "▼" : "▲"}
                      </h2>
                      <button
                        className="delete-folder-btn"
                        onClick={() => deleteFolder(folder.id)}
                      >
                        Delete Folder
                      </button>
                    </div>
                    {!folder.collapsed && (
                      <>
                        <button
                          className="add-entry-btn"
                          onClick={() => openEntryForm(folder.id)}
                        >
                          + Add Entry
                        </button>
                        {folder.entries.length === 0 ? (
                          <p
                            style={{
                              opacity: 0.7,
                              padding: "1rem",
                              textAlign: "center",
                            }}
                          >
                            No entries yet. Click "+ Add Entry" to add one.
                          </p>
                        ) : (
                          <ul>
                            {folder.entries.map((entry) => (
                              <li key={entry.id}>
                                <div className="entry-field">
                                  <strong>Website:</strong> {entry.website}
                                </div>
                                <div className="entry-field">
                                  <strong>Email:</strong> {entry.email}
                                </div>
                                <div className="entry-field">
                                  <strong>Password:</strong>{" "}
                                  <span
                                    className="password"
                                    onClick={() =>
                                      togglePassword(folder.id, entry.id)
                                    }
                                  >
                                    {entry.show ? entry.password : "••••••••"}
                                  </span>
                                </div>
                                <div className="entry-actions">
                                  <button
                                    className="copy-btn"
                                    onClick={() =>
                                      copyToClipboard(entry.website, "Website")
                                    }
                                  >
                                    Copy Website
                                  </button>
                                  <button
                                    className="copy-btn"
                                    onClick={() =>
                                      copyToClipboard(entry.email, "Email")
                                    }
                                  >
                                    Copy Email
                                  </button>
                                  <button
                                    className="copy-btn"
                                    onClick={() =>
                                      copyToClipboard(
                                        entry.password,
                                        "Password"
                                      )
                                    }
                                  >
                                    Copy Password
                                  </button>
                                  <button
                                    className="delete-entry-btn"
                                    onClick={() =>
                                      deleteEntry(folder.id, entry.id)
                                    }
                                  >
                                    Delete
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          /* Update Password Overlay */
          <div className="update-password-overlay">
            <button
              className="close-btn"
              onClick={() => {
                setShowUpdatePassword(false);
                setUpdateUsername("");
                setUpdateSecretPhrase("");
                setUpdateNewPassword("");
                setUpdateConfirmPassword("");
              }}
            >
              ✕
            </button>
            <h2>Change Password</h2>
            <p>
              Enter your username, secret phrase, and new password to update
              your password.
            </p>
            <div className="input-box">
              <input
                type="text"
                placeholder="Username"
                value={updateUsername}
                onChange={(e) => setUpdateUsername(e.target.value)}
              />
            </div>
            <div className="input-box">
              <input
                type="text"
                placeholder="Secret Phrase (12 words)"
                value={updateSecretPhrase}
                onChange={(e) => setUpdateSecretPhrase(e.target.value)}
              />
            </div>
            <div className="input-box">
              <input
                type="password"
                placeholder="New Password"
                value={updateNewPassword}
                onChange={(e) => setUpdateNewPassword(e.target.value)}
              />
            </div>
            <div className="input-box">
              <input
                type="password"
                placeholder="Confirm New Password"
                value={updateConfirmPassword}
                onChange={(e) => setUpdateConfirmPassword(e.target.value)}
              />
            </div>
            <button className="submit-btn" onClick={handleUpdatePassword}>
              Update Password
            </button>
          </div>
        )}
      </div>

      {/* Entry Form Overlay */}
      {showEntryForm && (
        <div className="entry-form-overlay">
          <div className="entry-form-content">
            <button
              className="close-btn"
              onClick={() => {
                setShowEntryForm(false);
                setEntryWebsite("");
                setEntryEmail("");
                setEntryPassword("");
              }}
            >
              ✕
            </button>
            <h2>Add New Entry</h2>
            <div className="input-box">
              <input
                type="text"
                placeholder="Website"
                value={entryWebsite}
                onChange={(e) => setEntryWebsite(e.target.value)}
              />
            </div>
            <div className="input-box">
              <input
                type="email"
                placeholder="Email"
                value={entryEmail}
                onChange={(e) => setEntryEmail(e.target.value)}
              />
            </div>
            <div className="input-box">
              <input
                type="password"
                placeholder="Password"
                value={entryPassword}
                onChange={(e) => setEntryPassword(e.target.value)}
              />
            </div>
            <button className="submit-btn" onClick={addEntry}>
              Save Entry
            </button>
          </div>
        </div>
      )}

      {/* Custom Alert */}
      {alertConfig && (
        <div className="alert-overlay">
          <div className="alert-content">
            <button className="alert-close-btn" onClick={closeAlert}>
              ✕
            </button>
            <p className="alert-message">{alertConfig.message}</p>
            <div className="alert-buttons">
              {alertConfig.showCancel && (
                <button className="alert-cancel-btn" onClick={closeAlert}>
                  Cancel
                </button>
              )}
              <button
                className="alert-confirm-btn"
                onClick={handleAlertConfirm}
              >
                {alertConfig.showCancel ? "Confirm" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
