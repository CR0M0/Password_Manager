import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginRegister.css";
import "../Alert.css";
import { FaUser, FaLock, FaEnvelope } from "react-icons/fa";
import { auth, db } from "../../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

type AlertConfig = {
  message: string;
  onConfirm?: () => void;
  showCancel?: boolean;
};

const LoginRegister = () => {
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [justRegistered, setJustRegistered] = useState(false);

  // Registration variables
  const [email, setEmail] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  // Login variables
  const [action, setAction] = useState("login");
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Secret phrase variables
  const [generatedPhrase, setGeneratedPhrase] = useState("");
  const [phraseConfirmed, setPhraseConfirmed] = useState(false);

  // Password reset variables
  const [resetUsername, setResetUsername] = useState("");
  const [resetSecretPhrase, setResetSecretPhrase] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");

  // Custom Alert
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !justRegistered) {
        navigate("/home");
      } else if (!user) {
        setCheckingAuth(false);
      } else if (user && justRegistered) {
        setCheckingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [navigate, justRegistered]);

  const registerLink = () => {
    setAction("register");
  };

  const loginLink = () => {
    setAction("login");
  };

  const handleForgotPassword = () => {
    setAction("forgot-password");
  };

  // Generate secret recovery phrase
  const generateSecretPhrase = (): string => {
    const words = [
      "alpha",
      "bravo",
      "charlie",
      "delta",
      "echo",
      "foxtrot",
      "golf",
      "hotel",
      "indiana",
      "juliet",
      "kilo",
      "lima",
      "mike",
      "november",
      "oscar",
      "night",
      "quebec",
      "romeo",
      "sierra",
      "tango",
      "uniform",
      "victor",
      "history",
      "xray",
      "yankee",
      "zulu",
      "phoenix",
      "dragon",
      "tiger",
      "falcon",
      "eagle",
      "hawk",
      "raven",
      "wolf",
      "bear",
      "lion",
      "panther",
      "cobra",
      "viper",
      "shark",
      "whale",
      "dolphin",
      "thunder",
      "lightning",
      "storm",
      "blizzard",
      "tornado",
      "hurricane",
      "mountain",
      "river",
      "ocean",
      "forest",
      "desert",
      "valley",
      "crystal",
      "diamond",
      "emerald",
      "ruby",
      "sapphire",
      "topaz",
      "meteor",
      "comet",
      "stellar",
      "galaxy",
      "nebula",
      "cosmos",
      "knight",
      "warrior",
      "guardian",
      "sentinel",
      "ranger",
      "hunter",
      "shadow",
      "ghost",
      "phantom",
      "specter",
      "wraith",
      "spirit",
      "flame",
      "inferno",
      "blaze",
      "ember",
      "spark",
      "ash",
      "frost",
      "ice",
      "snow",
      "winter",
      "arctic",
      "tundra",
      "quantum",
      "nexus",
      "cipher",
      "enigma",
      "puzzle",
      "riddle",
      "apex",
      "zenith",
      "summit",
      "peak",
      "pinnacle",
      "crown",
      "velocity",
      "momentum",
      "kinetic",
      "dynamic",
      "pulse",
      "surge",
    ];

    const phrase: string[] = [];
    const usedIndices = new Set<number>();

    while (phrase.length < 12) {
      const randomIndex = Math.floor(Math.random() * words.length);
      if (!usedIndices.has(randomIndex)) {
        usedIndices.add(randomIndex);
        phrase.push(words[randomIndex]);
      }
    }

    return phrase.join("-");
  };

  // Generate random DEK (Data Encryption Key)
  const generateDEK = (): string => {
    const array = new Uint8Array(32); // 256 bits
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!registerUsername || !email || !registerPassword) {
      displayAlert("Please fill in all fields");
      return;
    }

    const usernameLowercase = registerUsername.trim().toLowerCase();
    const emailLowercase = email.trim().toLowerCase();

    if (usernameLowercase.length < 3) {
      displayAlert("Username must be at least 3 characters");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailLowercase)) {
      displayAlert("Please enter a valid email address");
      return;
    }

    setLoading(true);

    try {
      const { collection, query, where, getDocs, doc, setDoc } = await import(
        "firebase/firestore"
      );
      const CryptoJS = (await import("crypto-js")).default;

      setJustRegistered(true);

      const usersRef = collection(db, "users");
      const usernameHash = CryptoJS.SHA256(usernameLowercase).toString();

      // Check username
      const usernameQuery = query(
        usersRef,
        where("usernameHash", "==", usernameHash)
      );
      const usernameSnapshot = await getDocs(usernameQuery);

      if (!usernameSnapshot.empty) {
        displayAlert("Username already taken. Please choose another.");
        setJustRegistered(false);
        setLoading(false);
        return;
      }

      // Check email
      const emailQuery = query(usersRef, where("email", "==", emailLowercase));
      const emailSnapshot = await getDocs(emailQuery);

      if (!emailSnapshot.empty) {
        displayAlert(
          "This email is already registered. Please use a different email or login."
        );
        setJustRegistered(false);
        setLoading(false);
        return;
      }

      // Create user account
      const { createUserWithEmailAndPassword } = await import("firebase/auth");
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        emailLowercase,
        registerPassword
      );

      // Generate secret phrase and DEK
      const secretPhrase = generateSecretPhrase();
      const dek = generateDEK();

      // Hash secret phrase
      const hashedPhrase = CryptoJS.SHA256(secretPhrase).toString();

      // Encrypt DEK with master password
      const encryptedDEK_master = CryptoJS.AES.encrypt(
        dek,
        registerPassword
      ).toString();

      // Encrypt DEK with secret phrase
      const encryptedDEK_recovery = CryptoJS.AES.encrypt(
        dek,
        secretPhrase
      ).toString();

      // Store user data
      await setDoc(doc(db, "users", userCredential.user.uid), {
        usernameHash: usernameHash,
        email: emailLowercase,
        secretPhraseHash: hashedPhrase,
        createdAt: new Date().toISOString(),
      });

      // Store encrypted DEKs
      await setDoc(doc(db, "userdata", userCredential.user.uid), {
        encryptedDEK: encryptedDEK_master,
        encryptedDEK_recovery: encryptedDEK_recovery,
        folders: "", // Empty initially
        lastUpdated: new Date().toISOString(),
      });

      console.log("Registration successful, showing secret phrase");

      // Store master password and DEK in sessionStorage
      sessionStorage.setItem("masterPassword", registerPassword);
      sessionStorage.setItem("dek", dek);
      console.log(
        "DEK stored in sessionStorage:",
        dek.substring(0, 10) + "..."
      );

      // Show secret phrase
      setGeneratedPhrase(secretPhrase);
      setAction("show-secret-phrase");
      setLoading(false);
    } catch (error: any) {
      console.error("Registration error:", error);
      setJustRegistered(false);
      if (error.code === "auth/email-already-in-use") {
        displayAlert("This email is already registered. Please login instead.");
      } else if (error.code === "auth/weak-password") {
        displayAlert("Password is too weak. Please use a stronger password.");
      } else if (error.code === "auth/invalid-email") {
        displayAlert("Invalid email format");
      } else {
        displayAlert("Registration failed: " + error.message);
      }
      setLoading(false);
    }
  };

  const handlePhraseConfirmed = () => {
    setRegisterUsername("");
    setEmail("");
    setRegisterPassword("");
    setGeneratedPhrase("");
    setPhraseConfirmed(false);
    setJustRegistered(false);

    // Small delay to ensure state is set before navigation
    setTimeout(() => {
      navigate("/home");
    }, 100);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !resetUsername ||
      !resetSecretPhrase ||
      !resetNewPassword ||
      !resetConfirmPassword
    ) {
      displayAlert("Please fill in all fields");
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      displayAlert("Passwords do not match");
      return;
    }

    if (resetNewPassword.length < 6) {
      displayAlert("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const CryptoJS = (await import("crypto-js")).default;

      const usernameLowercase = resetUsername.trim().toLowerCase();
      const usernameHash = CryptoJS.SHA256(usernameLowercase).toString();
      const secretPhraseHash = CryptoJS.SHA256(resetSecretPhrase).toString();

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
        setLoading(false);
        return;
      }

      const userId = verifyData.userId;

      // Step 2: Get encrypted DEK from recovery
      const { doc, getDoc } = await import("firebase/firestore");
      const userDataRef = doc(db, "userdata", userId);
      const userDataDoc = await getDoc(userDataRef);

      if (!userDataDoc.exists()) {
        displayAlert("User data not found");
        setLoading(false);
        return;
      }

      const userData = userDataDoc.data();
      const encryptedDEK_recovery = userData.encryptedDEK_recovery;

      // Step 3: Decrypt DEK using secret phrase
      const dekBytes = CryptoJS.AES.decrypt(
        encryptedDEK_recovery,
        resetSecretPhrase
      );
      const dek = dekBytes.toString(CryptoJS.enc.Utf8);

      if (!dek) {
        displayAlert("Failed to decrypt recovery key. Invalid secret phrase.");
        setLoading(false);
        return;
      }

      // Step 4: Re-encrypt DEK with new password
      const newEncryptedDEK = CryptoJS.AES.encrypt(
        dek,
        resetNewPassword
      ).toString();

      // Step 5: Call server to update password
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
          userId,
          newPassword: resetNewPassword,
          encryptedDEK: newEncryptedDEK,
        }),
      });

      const resetData = await resetResponse.json();

      if (resetData.success) {
        displayAlert(
          "Password reset successfully! You can now login with your new password.",
          false,
          () => {
            setResetUsername("");
            setResetSecretPhrase("");
            setResetNewPassword("");
            setResetConfirmPassword("");
            setAction("login");
          }
        );
      } else {
        displayAlert(resetData.message || "Password reset failed");
      }

      setLoading(false);
    } catch (error: any) {
      console.error("Reset password error:", error);
      displayAlert(
        "An error occurred. Please make sure your server is running and try again."
      );
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      displayAlert("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      const { collection, query, where, getDocs, doc, getDoc } = await import(
        "firebase/firestore"
      );
      const CryptoJS = (await import("crypto-js")).default;

      const usernameLowercase = username.trim().toLowerCase();
      const usernameHash = CryptoJS.SHA256(usernameLowercase).toString();

      console.log(
        "Looking for user with hash:",
        usernameHash.substring(0, 10) + "..."
      );

      const usersRef = collection(db, "users");
      const usernameQuery = query(
        usersRef,
        where("usernameHash", "==", usernameHash)
      );
      const querySnapshot = await getDocs(usernameQuery);

      if (querySnapshot.empty) {
        console.log("Username not found");
        displayAlert("Username not found");
        setLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userEmail = userDoc.data().email;
      const userId = userDoc.id;

      console.log("User found, attempting login with email");

      const { signInWithEmailAndPassword } = await import("firebase/auth");
      await signInWithEmailAndPassword(auth, userEmail, password);

      console.log("Login successful, decrypting DEK");

      // Get encrypted DEK from Firestore
      const userDataRef = doc(db, "userdata", userId);
      const userDataDoc = await getDoc(userDataRef);

      if (userDataDoc.exists()) {
        const userData = userDataDoc.data();
        const encryptedDEK = userData.encryptedDEK;

        // Decrypt DEK with master password
        const dekBytes = CryptoJS.AES.decrypt(encryptedDEK, password);
        const dek = dekBytes.toString(CryptoJS.enc.Utf8);

        if (!dek) {
          displayAlert("Failed to decrypt your data. Wrong password.");
          await signOut(auth);
          setLoading(false);
          return;
        }

        // CRITICAL: Store DEK BEFORE navigation
        sessionStorage.setItem("masterPassword", password);
        sessionStorage.setItem("dek", dek);
        console.log(
          "DEK stored in sessionStorage:",
          dek.substring(0, 10) + "..."
        );

        // Small delay to ensure sessionStorage is written (used to resolve loading bug)
        await new Promise((resolve) => setTimeout(resolve, 50));

        console.log("Navigating to home...");
        navigate("/home");
      } else {
        displayAlert("User data not found");
        await signOut(auth);
        setLoading(false);
      }
    } catch (error: any) {
      console.error("Login error:", error);
      if (
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        displayAlert("Invalid password");
      } else {
        displayAlert("Login failed: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          color: "white",
          fontSize: "1.5rem",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <>
      <div className="logo">
        <h1>KeyFort</h1>
      </div>

      <div className={`wrapper ${action}`}>
        {/*Login form*/}
        <div className="form-box login">
          <form onSubmit={handleLogin}>
            <h1>Login</h1>

            <div className="input-box">
              <input
                type="text"
                placeholder="Username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <FaUser className="icon" />
            </div>
            <div className="input-box">
              <input
                type="password"
                placeholder="Master Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FaLock className="icon" />
            </div>

            <div className="remember-forgot">
              {/* 
              <label>
                <input type="checkbox" />
                Remember me
              </label>
              */}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleForgotPassword();
                }}
              >
                Forgot password?
              </a>
            </div>

            <button type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>

            <div className="register-link">
              <p>
                Don't have an account?{" "}
                <a href="#" onClick={registerLink}>
                  Register
                </a>
              </p>
            </div>
          </form>
        </div>

        {/*Registration form*/}
        <div className="form-box register">
          <form onSubmit={handleRegister}>
            <h1>Registration</h1>

            <div className="input-box">
              <input
                type="text"
                placeholder="Username"
                required
                value={registerUsername}
                onChange={(e) => setRegisterUsername(e.target.value)}
              />
              <FaUser className="icon" />
            </div>

            <div className="input-box">
              <input
                type="email"
                placeholder="Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <FaEnvelope className="icon" />
            </div>

            <div className="input-box">
              <input
                type="password"
                placeholder="Master Password"
                required
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
              />
              <FaLock className="icon" />
            </div>

            <button type="submit" disabled={loading}>
              {loading ? "Registering..." : "Register"}
            </button>

            <div className="register-link">
              <p>
                Already have an account?{" "}
                <a href="#" onClick={loginLink}>
                  Login
                </a>
              </p>
            </div>
          </form>
        </div>

        {/* Secret Phrase form */}
        <div className="form-box secret-phrase">
          <h2>IMPORTANT: Save Your Secret Recovery Phrase</h2>

          <div className="warning-box">
            <p>
              <strong>This is the ONLY time you will see this phrase!</strong>
            </p>
            <p>You will need this phrase to:</p>
            <ul>
              <li>Reset your master password if you forget it</li>
              <li>Recover your account</li>
            </ul>
            <p>
              <strong>
                ⚠️ WITHOUT THIS PHRASE, YOU CANNOT RECOVER YOUR ACCOUNT IF YOU
                FORGET YOUR PASSWORD! ⚠️
              </strong>
            </p>
            <p>
              <strong>Write it down and store it in a safe place.</strong>
            </p>
          </div>

          <div className="secret-phrase-box">
            <p className="phrase-label">Your 12-Word Secret Recovery Phrase:</p>
            <div className="phrase-display">{generatedPhrase}</div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(generatedPhrase);
                displayAlert("Secret phrase copied to clipboard!");
              }}
              className="copy-button"
              type="button"
            >
              Copy to Clipboard
            </button>
          </div>

          <div className="confirmation-section">
            <label className="confirmation-label">
              <input
                type="checkbox"
                checked={phraseConfirmed}
                onChange={(e) => setPhraseConfirmed(e.target.checked)}
              />
              <span>
                I have saved my secret recovery phrase in a safe place and
                understand that without it, I cannot recover my account if I
                forget my password
              </span>
            </label>
          </div>

          <button
            onClick={handlePhraseConfirmed}
            className="confirm-button"
            disabled={!phraseConfirmed}
            type="button"
          >
            Continue to Home
          </button>
        </div>

        {/* Forgot Password form */}
        <div className="form-box forgot-password">
          <form onSubmit={handleResetPassword}>
            <h1>Reset Password</h1>

            <p
              style={{
                fontSize: "14px",
                textAlign: "center",
                marginBottom: "20px",
              }}
            >
              Enter your username, secret phrase, and new password
            </p>

            <div className="input-box">
              <input
                type="text"
                placeholder="Username"
                required
                value={resetUsername}
                onChange={(e) => setResetUsername(e.target.value)}
              />
              <FaUser className="icon" />
            </div>

            <div className="input-box">
              <input
                type="text"
                placeholder="Secret Recovery Phrase (12 words)"
                required
                value={resetSecretPhrase}
                onChange={(e) => setResetSecretPhrase(e.target.value)}
              />
              <FaLock className="icon" />
            </div>

            <div className="input-box">
              <input
                type="password"
                placeholder="New Password"
                required
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
              />
              <FaLock className="icon" />
            </div>

            <div className="input-box">
              <input
                type="password"
                placeholder="Confirm New Password"
                required
                value={resetConfirmPassword}
                onChange={(e) => setResetConfirmPassword(e.target.value)}
              />
              <FaLock className="icon" />
            </div>

            <button type="submit" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>

            <div className="register-link">
              <p>
                Remember your password?{" "}
                <a href="#" onClick={loginLink}>
                  Back to Login
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>

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
    </>
  );
};

export default LoginRegister;
