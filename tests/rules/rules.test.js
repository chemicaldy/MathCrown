// Firestore security-rules suite for MathCrown (Phase 4).
// Runs against the Firestore emulator via:
//   npm run test:rules
// (firebase emulators:exec --only firestore ... vitest run -c tests/rules/vitest.config.js)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, afterAll, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

let env;

const STUDENT = "student_1";
const STUDENT2 = "student_2";
const PARENT = "parent_1";
const STRANGER = "stranger_1";

const validProfile = (overrides = {}) => ({
  displayName: "Ada",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "student",
  grade: "5",
  avatar: "crown",
  createdAt: serverTimestamp(),
  xp: 0,
  coins: 0,
  level: 1,
  streak: 0,
  ...overrides,
});

// Firestore handle for an authed user (students carry no role claim).
const db = (uid, claims) => env.authenticatedContext(uid, claims).firestore();

// Seed data with rules bypassed.
const seed = (fn) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));

const seedUser = (uid, data = {}) =>
  seed((admin) =>
    setDoc(doc(admin, "users", uid), {
      displayName: "Ada",
      name: "Ada Lovelace",
      email: `${uid}@example.com`,
      role: "student",
      grade: "5",
      avatar: "crown",
      createdAt: new Date(),
      xp: 120,
      coins: 40,
      level: 3,
      streak: 2,
      ...data,
    })
  );

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-mathcrown",
    firestore: {
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

// ---------------------------------------------------------------- users

describe("users/{uid}", () => {
  it("student can create their own profile with valid fields", async () => {
    await assertSucceeds(setDoc(doc(db(STUDENT), "users", STUDENT), validProfile()));
  });

  it("cannot create a profile for another uid", async () => {
    await assertFails(setDoc(doc(db(STRANGER), "users", STUDENT), validProfile()));
  });

  it("unauthenticated create is denied", async () => {
    await assertFails(
      setDoc(doc(env.unauthenticatedContext().firestore(), "users", STUDENT), validProfile())
    );
  });

  it('create with role "parent" is denied', async () => {
    await assertFails(
      setDoc(doc(db(STUDENT), "users", STUDENT), validProfile({ role: "parent" }))
    );
  });

  it("create with nonzero xp is denied", async () => {
    await assertFails(setDoc(doc(db(STUDENT), "users", STUDENT), validProfile({ xp: 9999 })));
  });

  it("create with nonzero coins / level != 1 is denied", async () => {
    await assertFails(setDoc(doc(db(STUDENT), "users", STUDENT), validProfile({ coins: 50 })));
    await assertFails(setDoc(doc(db(STUDENT), "users", STUDENT), validProfile({ level: 99 })));
  });

  it('create with "<script>" in name is denied', async () => {
    await assertFails(
      setDoc(doc(db(STUDENT), "users", STUDENT), validProfile({ displayName: "<script>" }))
    );
    await assertFails(
      setDoc(doc(db(STUDENT), "users", STUDENT), validProfile({ name: "x<script>y" }))
    );
  });

  it("create with disallowed extra field (plan) is denied", async () => {
    await assertFails(
      setDoc(doc(db(STUDENT), "users", STUDENT), validProfile({ plan: "pro" }))
    );
  });

  it("owner can update displayName", async () => {
    await seedUser(STUDENT);
    await assertSucceeds(
      updateDoc(doc(db(STUDENT), "users", STUDENT), { displayName: "Ada L" })
    );
  });

  it("owner update of xp via legacy saveProgress shape is denied", async () => {
    await seedUser(STUDENT);
    await assertFails(
      updateDoc(doc(db(STUDENT), "users", STUDENT), {
        xp: 500,
        coins: 100,
        level: 4,
        streak: 3,
      })
    );
  });

  it("owner update of role / plan / parentUid is denied", async () => {
    await seedUser(STUDENT);
    const d = doc(db(STUDENT), "users", STUDENT);
    await assertFails(updateDoc(d, { role: "parent" }));
    await assertFails(updateDoc(d, { plan: "pro" }));
    await assertFails(updateDoc(d, { parentUid: STUDENT2 }));
  });

  it('update with "<script>" in displayName is denied', async () => {
    await seedUser(STUDENT);
    await assertFails(
      updateDoc(doc(db(STUDENT), "users", STUDENT), { displayName: "<script>alert(1)</script>" })
    );
  });

  it("owner can read their own profile", async () => {
    await seedUser(STUDENT);
    await assertSucceeds(getDoc(doc(db(STUDENT), "users", STUDENT)));
  });

  it("stranger cannot read another user's profile", async () => {
    await seedUser(STUDENT);
    await assertFails(getDoc(doc(db(STRANGER), "users", STUDENT)));
  });

  it("linked parent can read the child's profile; unlinked parent cannot", async () => {
    await seedUser(STUDENT, { parentUid: PARENT });
    await assertSucceeds(getDoc(doc(db(PARENT, { role: "parent" }), "users", STUDENT)));
    await assertFails(
      getDoc(doc(db("other_parent", { role: "parent" }), "users", STUDENT))
    );
  });

  it("owner cannot delete their profile", async () => {
    await seedUser(STUDENT);
    await assertFails(deleteDoc(doc(db(STUDENT), "users", STUDENT)));
  });
});

// ------------------------------------------------------------- presence

describe("presence/{uid}", () => {
  const validPresence = (overrides = {}) => ({
    uid: STUDENT,
    name: "Ada",
    grade: "5",
    level: 3,
    lastSeen: serverTimestamp(),
    online: true,
    inBattle: false,
    ...overrides,
  });

  beforeEach(() => seedUser(STUDENT, { displayName: "Ada" }));

  it("owner can write their presence doc", async () => {
    await assertSucceeds(setDoc(doc(db(STUDENT), "presence", STUDENT), validPresence()));
  });

  it("presence with a name that mismatches users.displayName is denied", async () => {
    await assertFails(
      setDoc(doc(db(STUDENT), "presence", STUDENT), validPresence({ name: "Imposter" }))
    );
  });

  it('presence name containing "<script>" is denied', async () => {
    await assertFails(
      setDoc(doc(db(STUDENT), "presence", STUDENT), validPresence({ name: "<script>" }))
    );
  });

  it("writing presence for another uid is denied", async () => {
    await assertFails(setDoc(doc(db(STRANGER), "presence", STUDENT), validPresence()));
  });

  it("presence with a uid field that mismatches auth is denied", async () => {
    await assertFails(
      setDoc(doc(db(STUDENT), "presence", STUDENT), validPresence({ uid: STRANGER }))
    );
  });

  it("presence with a client-supplied lastSeen is denied", async () => {
    await assertFails(
      setDoc(doc(db(STUDENT), "presence", STUDENT), validPresence({ lastSeen: new Date() }))
    );
  });

  it("any signed-in user can read presence", async () => {
    await seed((admin) =>
      setDoc(doc(admin, "presence", STUDENT), { uid: STUDENT, online: true })
    );
    await assertSucceeds(getDoc(doc(db(STRANGER), "presence", STUDENT)));
  });

  it("unauthenticated presence read is denied", async () => {
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), "presence", STUDENT))
    );
  });

  it("owner can delete their presence doc", async () => {
    await seed((admin) =>
      setDoc(doc(admin, "presence", STUDENT), { uid: STUDENT, online: true })
    );
    await assertSucceeds(deleteDoc(doc(db(STUDENT), "presence", STUDENT)));
  });
});

// ----------------------------------------------------------- challenges

describe("challenges/{toUid}", () => {
  const SENDER = STUDENT;
  const RECIPIENT = STUDENT2;

  const validChallenge = (overrides = {}) => ({
    fromUid: SENDER,
    fromName: "Ada",
    status: "pending",
    createdAt: serverTimestamp(),
    ...overrides,
  });

  const seedChallenge = (status = "pending") =>
    seed((admin) =>
      setDoc(doc(admin, "challenges", RECIPIENT), {
        fromUid: SENDER,
        fromName: "Ada",
        status,
        createdAt: new Date(),
      })
    );

  it("sender can create a challenge to another user", async () => {
    await assertSucceeds(
      setDoc(doc(db(SENDER), "challenges", RECIPIENT), validChallenge())
    );
  });

  it("create with spoofed fromUid is denied", async () => {
    await assertFails(
      setDoc(
        doc(db(STRANGER), "challenges", RECIPIENT),
        validChallenge({ fromUid: SENDER })
      )
    );
  });

  it("challenging yourself is denied", async () => {
    await assertFails(setDoc(doc(db(SENDER), "challenges", SENDER), validChallenge()));
  });

  it('create with status != "pending" is denied', async () => {
    await assertFails(
      setDoc(doc(db(SENDER), "challenges", RECIPIENT), validChallenge({ status: "accepted" }))
    );
  });

  it("create with a client-supplied createdAt is denied", async () => {
    await assertFails(
      setDoc(doc(db(SENDER), "challenges", RECIPIENT), validChallenge({ createdAt: new Date() }))
    );
  });

  it("recipient and sender can read; strangers cannot", async () => {
    await seedChallenge();
    await assertSucceeds(getDoc(doc(db(RECIPIENT), "challenges", RECIPIENT)));
    await assertSucceeds(getDoc(doc(db(SENDER), "challenges", RECIPIENT)));
    await assertFails(getDoc(doc(db(STRANGER), "challenges", RECIPIENT)));
  });

  it("recipient can accept a pending challenge", async () => {
    await seedChallenge();
    await assertSucceeds(
      updateDoc(doc(db(RECIPIENT), "challenges", RECIPIENT), { status: "accepted" })
    );
  });

  it("second status change (accepted -> declined) is denied", async () => {
    await seedChallenge();
    await assertSucceeds(
      updateDoc(doc(db(RECIPIENT), "challenges", RECIPIENT), { status: "accepted" })
    );
    await assertFails(
      updateDoc(doc(db(RECIPIENT), "challenges", RECIPIENT), { status: "declined" })
    );
  });

  it("recipient cannot set an arbitrary status or touch other fields", async () => {
    await seedChallenge();
    await assertFails(
      updateDoc(doc(db(RECIPIENT), "challenges", RECIPIENT), { status: "hacked" })
    );
    await assertFails(
      updateDoc(doc(db(RECIPIENT), "challenges", RECIPIENT), {
        status: "accepted",
        fromName: "Mallory",
      })
    );
  });

  it("sender cannot update the status", async () => {
    await seedChallenge();
    await assertFails(
      updateDoc(doc(db(SENDER), "challenges", RECIPIENT), { status: "accepted" })
    );
  });

  it("recipient can delete the challenge", async () => {
    await seedChallenge();
    await assertSucceeds(deleteDoc(doc(db(RECIPIENT), "challenges", RECIPIENT)));
  });

  it("sender can delete the challenge; strangers cannot", async () => {
    await seedChallenge();
    await assertFails(deleteDoc(doc(db(STRANGER), "challenges", RECIPIENT)));
    await assertSucceeds(deleteDoc(doc(db(SENDER), "challenges", RECIPIENT)));
  });

  describe("accept notifications (challenges/{fromUid}_notify)", () => {
    const NOTIFY_ID = `${SENDER}_notify`;

    const notifyDoc = (overrides = {}) => ({
      fromUid: RECIPIENT, // the acceptor is the notify doc's author
      fromName: "Grace",
      status: "pending",
      createdAt: serverTimestamp(),
      ...overrides,
    });

    it("acceptor can create the notify doc addressed to the sender", async () => {
      await assertSucceeds(
        setDoc(doc(db(RECIPIENT), "challenges", NOTIFY_ID), notifyDoc())
      );
    });

    it("notify doc with spoofed fromUid is denied", async () => {
      await assertFails(
        setDoc(doc(db(STRANGER), "challenges", NOTIFY_ID), notifyDoc({ fromUid: RECIPIENT }))
      );
    });

    it("self-addressed notify doc is denied", async () => {
      await assertFails(
        setDoc(
          doc(db(SENDER), "challenges", NOTIFY_ID),
          notifyDoc({ fromUid: SENDER })
        )
      );
    });

    it("sender can read and delete their notify doc; strangers cannot read it", async () => {
      await seed((admin) =>
        setDoc(doc(admin, "challenges", NOTIFY_ID), {
          fromUid: RECIPIENT,
          fromName: "Grace",
          status: "pending",
          createdAt: new Date(),
        })
      );
      await assertFails(getDoc(doc(db(STRANGER), "challenges", NOTIFY_ID)));
      await assertSucceeds(getDoc(doc(db(SENDER), "challenges", NOTIFY_ID)));
      await assertSucceeds(deleteDoc(doc(db(SENDER), "challenges", NOTIFY_ID)));
    });
  });
});

// -------------------------------------------------------------- battles

describe("battles/{battleId}", () => {
  const BATTLE = "battle_1";
  const seedBattle = () =>
    seed((admin) =>
      setDoc(doc(admin, "battles", BATTLE), {
        p1Uid: STUDENT,
        p2Uid: STUDENT2,
        state: "countdown",
        p1Score: 0,
        p2Score: 0,
      })
    );

  it("a participant can create a battle doc", async () => {
    await assertSucceeds(
      setDoc(doc(db(STUDENT), "battles", BATTLE), {
        p1Uid: STUDENT,
        p2Uid: STUDENT2,
        state: "countdown",
      })
    );
  });

  it("a non-participant cannot create a battle doc naming others", async () => {
    await assertFails(
      setDoc(doc(db(STRANGER), "battles", BATTLE), {
        p1Uid: STUDENT,
        p2Uid: STUDENT2,
      })
    );
  });

  it("participants can read; non-participants cannot", async () => {
    await seedBattle();
    await assertSucceeds(getDoc(doc(db(STUDENT), "battles", BATTLE)));
    await assertSucceeds(getDoc(doc(db(STUDENT2), "battles", BATTLE)));
    await assertFails(getDoc(doc(db(STRANGER), "battles", BATTLE)));
  });

  it("participant can update battle state", async () => {
    await seedBattle();
    await assertSucceeds(
      updateDoc(doc(db(STUDENT2), "battles", BATTLE), { p2Score: 5, state: "live" })
    );
  });

  it("participant cannot reassign p1Uid/p2Uid", async () => {
    await seedBattle();
    await assertFails(
      updateDoc(doc(db(STUDENT), "battles", BATTLE), { p2Uid: STRANGER })
    );
  });

  it("non-participant cannot update", async () => {
    await seedBattle();
    await assertFails(
      updateDoc(doc(db(STRANGER), "battles", BATTLE), { p1Score: 999 })
    );
  });

  it("participant can delete; non-participant cannot", async () => {
    await seedBattle();
    await assertFails(deleteDoc(doc(db(STRANGER), "battles", BATTLE)));
    await assertSucceeds(deleteDoc(doc(db(STUDENT), "battles", BATTLE)));
  });
});

// ------------------------------------------- function-only collections

describe("function-only collections", () => {
  it("leaderboard: signed-in read OK, unauthenticated read and all writes denied", async () => {
    await seed((admin) => setDoc(doc(admin, "leaderboard", STUDENT), { xp: 500 }));
    await assertSucceeds(getDoc(doc(db(STRANGER), "leaderboard", STUDENT)));
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), "leaderboard", STUDENT))
    );
    await assertFails(setDoc(doc(db(STUDENT), "leaderboard", STUDENT), { xp: 999999 }));
    await assertFails(updateDoc(doc(db(STUDENT), "leaderboard", STUDENT), { xp: 999999 }));
  });

  it("entitlements: owner read OK, linked parent read OK, stranger read and writes denied", async () => {
    await seedUser(STUDENT, { parentUid: PARENT });
    await seed((admin) => setDoc(doc(admin, "entitlements", STUDENT), { plan: "pro" }));
    await assertSucceeds(getDoc(doc(db(STUDENT), "entitlements", STUDENT)));
    await assertSucceeds(getDoc(doc(db(PARENT, { role: "parent" }), "entitlements", STUDENT)));
    await assertFails(getDoc(doc(db(STRANGER), "entitlements", STUDENT)));
    await assertFails(setDoc(doc(db(STUDENT), "entitlements", STUDENT), { plan: "elite" }));
  });

  it("linkCodes: no client read or write", async () => {
    await seed((admin) => setDoc(doc(admin, "linkCodes", "ABC123"), { uid: STUDENT }));
    await assertFails(getDoc(doc(db(STUDENT), "linkCodes", "ABC123")));
    await assertFails(getDoc(doc(db(PARENT, { role: "parent" }), "linkCodes", "ABC123")));
    await assertFails(setDoc(doc(db(STUDENT), "linkCodes", "XYZ789"), { uid: STUDENT }));
  });

  it("tutorUsage: owner read OK, others and writes denied", async () => {
    await seed((admin) => setDoc(doc(admin, "tutorUsage", STUDENT), { used: 3 }));
    await assertSucceeds(getDoc(doc(db(STUDENT), "tutorUsage", STUDENT)));
    await assertFails(getDoc(doc(db(STRANGER), "tutorUsage", STUDENT)));
    await assertFails(updateDoc(doc(db(STUDENT), "tutorUsage", STUDENT), { used: 0 }));
  });

  it("users/{uid}/sessions: owner and linked parent read OK, stranger read and writes denied", async () => {
    await seedUser(STUDENT, { parentUid: PARENT });
    await seed((admin) =>
      setDoc(doc(admin, "users", STUDENT, "sessions", "s1"), { xpEarned: 20 })
    );
    await assertSucceeds(getDoc(doc(db(STUDENT), "users", STUDENT, "sessions", "s1")));
    await assertSucceeds(
      getDoc(doc(db(PARENT, { role: "parent" }), "users", STUDENT, "sessions", "s1"))
    );
    await assertFails(getDoc(doc(db(STRANGER), "users", STUDENT, "sessions", "s1")));
    await assertFails(
      setDoc(doc(db(STUDENT), "users", STUDENT, "sessions", "s2"), { xpEarned: 99999 })
    );
  });

  it("waitlist: valid signed-in create OK", async () => {
    await assertSucceeds(
      setDoc(doc(db(STUDENT), "waitlist", "w1"), {
        name: "Ada Lovelace",
        email: "ada@example.com",
        grade: "5",
      })
    );
  });

  it("waitlist: extra fields, bad types, reads and deletes denied", async () => {
    await assertFails(
      setDoc(doc(db(STUDENT), "waitlist", "w2"), {
        name: "Ada",
        email: "ada@example.com",
        grade: "5",
        isAdmin: true,
      })
    );
    await assertFails(
      setDoc(doc(db(STUDENT), "waitlist", "w3"), { name: 42, email: "x", grade: "5" })
    );
    await seed((admin) =>
      setDoc(doc(admin, "waitlist", "w4"), { name: "A", email: "a@b.c", grade: "5" })
    );
    await assertFails(getDoc(doc(db(STUDENT), "waitlist", "w4")));
    await assertFails(deleteDoc(doc(db(STUDENT), "waitlist", "w4")));
  });

  it("unknown collections are fully denied", async () => {
    await seed((admin) => setDoc(doc(admin, "secrets", "s1"), { key: "value" }));
    await assertFails(getDoc(doc(db(STUDENT), "secrets", "s1")));
    await assertFails(setDoc(doc(db(STUDENT), "anything", "a1"), { foo: "bar" }));
  });
});
