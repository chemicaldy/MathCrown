  import { initializeApp } from "firebase/app";
  import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut }
    from "firebase/auth";
  import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc, deleteDoc,
           collection, query, orderBy, limit, onSnapshot, where, getDocs, serverTimestamp, addDoc }
    from "firebase/firestore";
  import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app);

  if (import.meta.env.VITE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }
  window.auth = auth;
  window.db = db;

  // Thin callable-invocation helper for the non-module app code.
  window.callFn = async function(name, data) {
    const res = await httpsCallable(functions, name)(data);
    return res.data;
  };

  window.firebaseSignUp = async function(email, password, displayName, role, grade) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // linkCode is assigned server-side by the onUserCreated function —
    // security rules deny it (and all progress fields) as client writes.
    await setDoc(doc(db, "users", cred.user.uid), {
      name: displayName,
      displayName: displayName,
      email: email,
      role: role,
      grade: grade || "",
      xp: 0, coins: 0, level: 1, streak: 0,
      createdAt: serverTimestamp()
    });
    return cred.user;
  };

  window.firebaseLogin = async function(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  };

  window.firebaseLogout = function() { return signOut(auth); };

  // (saveProgress removed: direct client writes of xp/coins/level/streak are
  //  denied by security rules. All progress flows through the recordSession
  //  Cloud Function — see src/data/progress.js.)

  window.loadProgress = async function() {
    const user = auth.currentUser;
    if (!user) return null;
    const snap = await getDoc(doc(db, "users", user.uid));
    return snap.exists() ? snap.data() : null;
  };

  window.startLeaderboard = function(callback) {
    const q = query(collection(db, "users"), orderBy("xp", "desc"), limit(20));
    return onSnapshot(q, snapshot => {
      const leaders = snapshot.docs.map((d, i) => ({
        rank: i + 1, name: d.data().displayName,
        xp: d.data().xp, level: d.data().level,
        grade: d.data().grade
      }));
      callback(leaders);
    });
  };

  // ── REAL-TIME PRESENCE ──────────────────────────────────────
  let presenceInterval = null;
  let challengeListener = null;
  let battleListener = null;

  window.startPresence = async function() {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;
    const presRef = doc(db, "presence", uid);

    // Field set and constraints must match firestore.rules: name must equal
    // users/{uid}.displayName and lastSeen must be a server timestamp.
    // NOTE: does NOT touch inBattle — battle join/leave own that flag; the
    // old heartbeat force-reset it to false every tick mid-battle.
    const writePresence = async () => {
      try {
        await setDoc(presRef, {
          uid,
          name: window.S ? window.S.name : "Player",
          grade: window.S ? String(window.S.gradeNum || "") : "",
          level: window.S ? (window.S.level || 1) : 1,
          online: true,
          lastSeen: serverTimestamp()
        }, { merge: true });
      } catch(e) { console.warn("presence write failed:", e); }
    };

    await writePresence();
    clearInterval(presenceInterval);
    // 60s heartbeat: presence writes are billed per write; 25s tripled cost
    // for no accuracy gain given the 2-minute liveness window.
    presenceInterval = setInterval(writePresence, 60000);

    window.addEventListener("beforeunload", () => {
      try {
        setDoc(presRef, { online: false, lastSeen: serverTimestamp() }, { merge: true });
      } catch(e) { /* page is closing */ }
    });

    window.listenOnlinePlayers();
    window.listenForChallenges();
  };

  window.stopPresence = async function() {
    const user = auth.currentUser;
    if (!user) return;
    clearInterval(presenceInterval);
    try {
      await setDoc(doc(db, "presence", user.uid), { status: "offline" }, { merge: true });
    } catch(e) {}
  };

  // ── ONLINE PLAYERS LISTENER ──────────────────────────────────
  window.listenOnlinePlayers = function() {
    const q = query(collection(db, "presence"),
      where("online", "==", true));
    onSnapshot(q, snapshot => {
      const uid = auth.currentUser ? auth.currentUser.uid : null;
      const players = [];
      snapshot.docs.forEach(d => {
        if (d.id !== uid) {
          const data = d.data();
          // Check lastSeen within 2 minutes
          const lastSeen = data.lastSeen ? data.lastSeen.toMillis() : 0;
          if (Date.now() - lastSeen < 120000) {
            players.push({ uid: d.id, ...data });
          }
        }
      });
      window.LIVE_PLAYERS = players;
      if (window.renderLivePlayers) window.renderLivePlayers(players);
      // Update room badge
      const badge = document.getElementById("room-badge");
      if (badge) {
        badge.textContent = players.length;
        badge.style.display = players.length > 0 ? "flex" : "none";
      }
    });
  };

  // ── SEND CHALLENGE ────────────────────────────────────────────
  window.sendChallengeTo = async function(toUid, toName) {
    const user = auth.currentUser;
    if (!user) return;
    const challengeRef = doc(db, "challenges", toUid);
    await setDoc(challengeRef, {
      fromUid: user.uid,
      fromName: window.S ? window.S.name : "Challenger",
      fromGrade: window.S ? window.S.gradeNum : 0,
      toUid,
      toName,
      status: "pending",
      createdAt: serverTimestamp()
    });
    showToast("⚔️ Challenge sent to " + toName + "! Waiting...");
    // Auto-cancel after 30s if not accepted
    window._challengeTimer = setTimeout(async () => {
      try {
        const snap = await getDoc(challengeRef);
        if (snap.exists() && snap.data().status === "pending") {
          await deleteDoc(challengeRef);
          const overlay = document.getElementById("challenge-sending-overlay");
          if (overlay) overlay.remove();
          showToast(toName + " didn't respond. Starting bot battle...");
          if (window.startBotBattle) window.startBotBattle();
        }
      } catch(e) {}
    }, 30000);
  };

  // ── LISTEN FOR INCOMING CHALLENGES ───────────────────────────
  window.listenForChallenges = function() {
    const user = auth.currentUser;
    if (!user) return;
    if (challengeListener) challengeListener();
    const ref = doc(db, "challenges", user.uid);
    let processing = false;
    challengeListener = onSnapshot(ref, async snap => {
      if (!snap.exists() || processing) return;
      const data = snap.data();
      if (data.status !== "pending") return;
      processing = true;
      if (window.showIncomingChallenge) {
        window.showIncomingChallenge(data.fromUid, data.fromName, data.fromGrade, async accepted => {
          if (accepted) {
            const battleId = data.fromUid + "_" + user.uid + "_" + Date.now();
            const q = window.pickBattleQuestion ? window.pickBattleQuestion()
              : { q:"2+2=?", opts:["3","4","5","6"], a:"4" };
            // Step 1: Create battle document
            await setDoc(doc(db, "battles", battleId), {
              p1: data.fromUid, p1Name: data.fromName, p1Score: 0, p1Time: 0,
              p2: user.uid, p2Name: window.S ? window.S.name : "Player 2",
              p2Score: 0, p2Time: 0,
              round: 1, totalRounds: 5,
              question: q.q, options: q.opts, answer: q.a,
              status: "active",
              createdAt: serverTimestamp()
            });
            // Step 2: Write battleId to challenger's OWN notify doc (they own it = no permission issue)
            await setDoc(doc(db, "challenges", data.fromUid + "_notify"), {
              battleId: battleId,
              forUid: data.fromUid,
              status: "ready",
              createdAt: serverTimestamp()
            });
            // Step 3: Delete the incoming challenge doc
            try { await deleteDoc(ref); } catch(e) {}
            // Step 4: Acceptor enters battle
            if (window.joinBattleRoom) window.joinBattleRoom(battleId, "p2", data.fromName);
          } else {
            try { await deleteDoc(ref); } catch(e) {}
            processing = false;
          }
        });
      }
    });
  };

  // ── ACCEPT CHALLENGE & START BATTLE ROOM ─────────────────────
  window.acceptChallengeAndStart = async function(fromUid, fromName) {
    const user = auth.currentUser;
    if (!user) return;
    const battleId = fromUid + "_" + user.uid + "_" + Date.now();
    const q = window.pickBattleQuestion ? window.pickBattleQuestion() : { q: "2 + 2 = ?", opts: ["3","4","5","6"], a: "4" };
    await setDoc(doc(db, "battles", battleId), {
      p1: fromUid, p1Name: fromName, p1Score: 0, p1Time: 0,
      p2: user.uid, p2Name: window.S.name, p2Score: 0, p2Time: 0,
      round: 1, totalRounds: 5,
      question: q.q, options: q.opts, answer: q.a,
      status: "active",
      createdAt: serverTimestamp()
    });
    if (window.joinBattleRoom) window.joinBattleRoom(battleId, "p2", fromName);
  };

  // ── CHALLENGER: WATCH FOR ACCEPTANCE ─────────────────────────
  window.waitForAcceptance = function(toUid, toName) {
    const user = auth.currentUser;
    if (!user) return;
    // Watch OWN notify doc — challenger owns {myUid}_notify so no permission issues
    const notifyRef = doc(db, "challenges", user.uid + "_notify");
    const unsub = onSnapshot(notifyRef, snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === "ready" && data.battleId && data.forUid === user.uid) {
        unsub();
        if (window._challengeTimer) { clearTimeout(window._challengeTimer); window._challengeTimer = null; }
        const overlay = document.getElementById("challenge-sending-overlay");
        if (overlay) overlay.remove();
        // Clean up notify doc
        deleteDoc(notifyRef).catch(()=>{});
        // Enter battle as p1
        if (window.joinBattleRoom) window.joinBattleRoom(data.battleId, "p1", toName);
      }
    });
    // Store unsub so cancel can clean it up
    window._waitUnsubscribe = unsub;
  };

  // ── BATTLE ROOM LISTENER ──────────────────────────────────────
  window.joinBattleRoom = function(battleId, role, oppName) {
    if (battleListener) battleListener();
    // Clear any pending challenge timer (so 30s doesn't fire after match starts)
    if (window._challengeTimer) { clearTimeout(window._challengeTimer); window._challengeTimer = null; }
    // Remove sending overlay if still showing
    const sendOverlay = document.getElementById("challenge-sending-overlay");
    if (sendOverlay) sendOverlay.remove();
    // Remove incoming overlay if still showing
    const inOverlay = document.getElementById("incoming-challenge-overlay");
    if (inOverlay) inOverlay.remove();
    // Set in-battle presence
    const user = auth.currentUser;
    if (user) {
      setDoc(doc(db, "presence", user.uid), { inBattle: true }, { merge: true });
    }
    showToast("⚔️ Battle starting with " + oppName + "! Get ready!");
    if (window.enterRealBattle) window.enterRealBattle(battleId, role, oppName);
    battleListener = onSnapshot(doc(db, "battles", battleId), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (window.updateBattleState) window.updateBattleState(data, battleId, role);
    });
  };

  // ── SUBMIT ANSWER TO BATTLE ───────────────────────────────────
  window.submitBattleAnswer = async function(battleId, role, answer, timeTaken) {
    const field = role === "p1" ? "p1Answer" : "p2Answer";
    const timeField = role === "p1" ? "p1Time" : "p2Time";
    await updateDoc(doc(db, "battles", battleId), {
      [field]: answer,
      [timeField]: timeTaken
    });
  };

  // ── ADVANCE TO NEXT ROUND ─────────────────────────────────────
  window.advanceBattleRound = async function(battleId, currentData) {
    const nextRound = (currentData.round || 1) + 1;
    if (nextRound > (currentData.totalRounds || 5)) {
      await updateDoc(doc(db, "battles", battleId), { status: "finished" });
      return;
    }
    const q = window.pickBattleQuestion ? window.pickBattleQuestion() : { q: "3+3=?", opts: ["5","6","7","8"], a: "6" };
    await updateDoc(doc(db, "battles", battleId), {
      round: nextRound,
      question: q.q, options: q.opts, answer: q.a,
      p1Answer: null, p2Answer: null,
      p1Time: 0, p2Time: 0
    });
  };

  // (Former duplicate firebaseSignUp/firebaseLogin/firebaseLogout/saveProgress/
  //  loadProgress/startLeaderboard definitions removed — the canonical versions
  //  above are the only ones. The duplicate signUp silently dropped the linkCode
  //  field, which broke parent-child linking for every new account.)

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      window.auth = auth;
      const data = await window.loadProgress();
      if (data) console.log("✅ User:", data.displayName);
    }
  });

  // Expose password reset
  window.firebaseResetPassword = async function(email) {
    const { sendPasswordResetEmail } = await import("firebase/auth");
    await sendPasswordResetEmail(auth, email);
  };

  // ── SEARCH REGISTERED USERS ─────────────────────────────────
  window.searchRegisteredUsers = async function(queryStr) {
    if (!queryStr || queryStr.length < 2) return [];
    const results = [];
    const q = queryStr.toLowerCase();
    const myUid = auth.currentUser ? auth.currentUser.uid : null;

    // Step 1: Always include matching LIVE_PLAYERS immediately (no Firestore needed)
    if (window.LIVE_PLAYERS) {
      window.LIVE_PLAYERS.forEach(p => {
        if (p.uid === myUid) return;
        const name = (p.name || "").toLowerCase();
        if (name.indexOf(q) > -1) {
          results.push({
            uid: p.uid,
            name: p.name,
            grade: p.grade || "",
            level: 1,
            online: true,
            inBattle: p.inBattle || false,
            avatar: (p.name || "S")[0].toUpperCase()
          });
        }
      });
    }

    // Step 2: Query Firestore users — NO orderBy to avoid index requirement
    try {
      const snap = await getDocs(query(
        collection(db, "users"),
        limit(300)
      ));
      snap.docs.forEach(d => {
        if (d.id === myUid) return;
        // Skip if already in results from LIVE_PLAYERS
        if (results.some(r => r.uid === d.id)) return;
        const data = d.data();
        const name = (data.name || data.displayName || "").toLowerCase();
        if (name.indexOf(q) > -1) {
          const isOnline = window.LIVE_PLAYERS &&
            window.LIVE_PLAYERS.some(p => p.uid === d.id);
          const liveData = isOnline
            ? window.LIVE_PLAYERS.find(p => p.uid === d.id)
            : null;
          results.push({
            uid: d.id,
            name: data.name || data.displayName || "Student",
            grade: data.grade || "",
            level: data.level || 1,
            xp: data.xp || 0,
            online: isOnline,
            inBattle: liveData ? liveData.inBattle : false,
            avatar: (data.name || data.displayName || "S")[0].toUpperCase()
          });
        }
      });
    } catch(e) {
      console.log("Firestore search error:", e.message);
      // LIVE_PLAYERS results above are still returned
    }

    // Online players first
    results.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    return results;
  };

  window.auth = auth;
  window.db = db;
  console.log("✅ MathCrown Firebase + Multiplayer loaded");
