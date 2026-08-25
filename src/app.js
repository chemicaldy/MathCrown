// MathCrown v1.0 - K-12 Competitive Math Platform
// Zero mixed quotes, zero multiline strings, zero duplicates
window.MATHCHAMP_LOADED = true;

// ── STATE ──────────────────────────────────────────────
var S = {
  name:"", grade:"", gradeNum:0,
  xp:0, level:1, streak:0, coins:0,
  isPreview:false, triviaMode:"trivia"
};
var PARENT = { name:"", email:"", plan:"Free", isLoggedIn:false, children:[] };
var SESSION_PLAYERS = [];
var ONLINE_PLAYERS = {}; // uid -> {name, grade, lastSeen, status}
var MY_PRESENCE_INTERVAL = null;

function initPresence(){
  // Use Firestore-based presence for real cross-device visibility
  if(window.startPresence){
    window.startPresence();
  }
}

function isPlayerOnline(playerName){
  var cutoff = Date.now() - 90000;
  for(var uid in ONLINE_PLAYERS){
    var p = ONLINE_PLAYERS[uid];
    if(p && p.name && p.name.indexOf(playerName)>-1 && p.lastSeen>cutoff) return true;
  }
  return false;
}

function getOnlineCount(){
  var cutoff = Date.now() - 90000;
  var count=0;
  for(var uid in ONLINE_PLAYERS){ if(ONLINE_PLAYERS[uid].lastSeen>cutoff) count++; }
  return count;
}
var CHALLENGE_FILTER = "same";
var MUSIC = { trackIdx:0, playing:false, muted:true, shuffle:false, volume:0.30, panelOpen:false, userInteracted:false, userManuallyStopped:false };
var triviaTimer = null;
var session = { qs:[], idx:0, correct:0, mode:"trivia", loading:false };
var practiceSession = { qs:[], idx:0, correct:0, loading:false };
var practiceTimer = null;
var W3F_KEY = "b477849b-f836-414d-8eb3-1ea9704201a1";
var USED_QUESTIONS = new Set(); // track question text to avoid repeats

function getRandQ(gradeN){
  var band = gradeBand(gradeN);
  var bank = QUESTION_BANK[band];
  var topics = Object.keys(bank);
  // Try up to 30 times to find an unused question
  for(var attempt=0; attempt<30; attempt++){
    var t = topics[Math.floor(Math.random()*topics.length)];
    var qs = bank[t];
    var q = qs[Math.floor(Math.random()*qs.length)];
    if(!USED_QUESTIONS.has(q.q)){
      USED_QUESTIONS.add(q.q);
      // Reset if we've used too many (more than 80% of bank)
      var totalQ=0; topics.forEach(function(tp){ totalQ+=bank[tp].length; });
      if(USED_QUESTIONS.size > totalQ*0.8) USED_QUESTIONS.clear();
      return {q:q.q, a:q.a, c:q.c, topic:t, src:"Question Bank", ai:false, explanation:""};
    }
  }
  // Fallback: return any question
  var t2=topics[0], q2=bank[t2][0];
  return {q:q2.q, a:q2.a, c:q2.c, topic:t2, src:"Question Bank", ai:false, explanation:""};
}

// ── DATA ───────────────────────────────────────────────
// QUESTION_BANK loaded externally from question_bank.js

var OPPS = [
  {n:"Lily M.",   gradeN:2,  band:1, tier:"Bronze",   meta:"2nd Grade - 12 Wins",  wr:"55% Win Rate", winRate:0.55, e:"L", bg:"linear-gradient(135deg,#cd7f32,#a06020)"},
  {n:"Noah B.",   gradeN:3,  band:1, tier:"Silver",   meta:"3rd Grade - 28 Wins",  wr:"61% Win Rate", winRate:0.61, e:"N", bg:"linear-gradient(135deg,#c0c0c0,#909090)"},
  {n:"Mia T.",    gradeN:4,  band:2, tier:"Silver",   meta:"4th Grade - 35 Wins",  wr:"63% Win Rate", winRate:0.63, e:"M", bg:"linear-gradient(135deg,#06d6a0,#4ecdc4)"},
  {n:"Ethan R.",  gradeN:5,  band:2, tier:"Gold",     meta:"5th Grade - 52 Wins",  wr:"70% Win Rate", winRate:0.70, e:"E", bg:"linear-gradient(135deg,#ffd93d,#ff9f1c)"},
  {n:"Riley M.",  gradeN:6,  band:3, tier:"Silver",   meta:"6th Grade - 43 Wins",  wr:"65% Win Rate", winRate:0.65, e:"R", bg:"linear-gradient(135deg,#4ecdc4,#06d6a0)"},
  {n:"Jordan K.", gradeN:7,  band:3, tier:"Gold",     meta:"7th Grade - 89 Wins",  wr:"78% Win Rate", winRate:0.78, e:"J", bg:"linear-gradient(135deg,#f5c842,#ff9f1c)"},
  {n:"Sam P.",    gradeN:7,  band:3, tier:"Gold",     meta:"7th Grade - 74 Wins",  wr:"71% Win Rate", winRate:0.71, e:"S", bg:"linear-gradient(135deg,#ff6b6b,#f15bb5)"},
  {n:"Chris W.",  gradeN:8,  band:3, tier:"Platinum", meta:"8th Grade - 102 Wins", wr:"83% Win Rate", winRate:0.83, e:"C", bg:"linear-gradient(135deg,#9b5de5,#4ecdc4)"},
  {n:"Dana R.",   gradeN:9,  band:4, tier:"Diamond",  meta:"9th Grade - 145 Wins", wr:"91% Win Rate", winRate:0.91, e:"D", bg:"linear-gradient(135deg,#4ecdc4,#2196f3)"},
  {n:"Alex K.",   gradeN:10, band:4, tier:"Platinum", meta:"10th Grade - 118 Wins",wr:"86% Win Rate", winRate:0.86, e:"A", bg:"linear-gradient(135deg,#9b5de5,#f15bb5)"},
  {n:"Morgan L.", gradeN:11, band:5, tier:"Diamond",  meta:"11th Grade - 201 Wins",wr:"94% Win Rate", winRate:0.94, e:"M", bg:"linear-gradient(135deg,#ffd93d,#9b5de5)"},
  {n:"Taylor B.", gradeN:12, band:5, tier:"Legend",   meta:"12th Grade - 312 Wins",wr:"97% Win Rate", winRate:0.97, e:"T", bg:"linear-gradient(135deg,#ff6b6b,#ffd93d)"}
];

var LB_DATA = [
  {n:"Jordan K.", g:"7th", pts:5820, e:"J", chg:"+2", up:true},
  {n:"Sam P.",    g:"7th", pts:5410, e:"S", chg:"+1", up:true},
  {n:"Riley M.",  g:"7th", pts:5200, e:"R", chg:"0",  up:false},
  {n:"Alex J.",   g:"7th", pts:3240, e:"A", chg:"+3", up:true},
  {n:"Casey T.",  g:"7th", pts:3100, e:"C", chg:"-1", up:false},
  {n:"Morgan L.", g:"7th", pts:2980, e:"M", chg:"+4", up:true},
  {n:"Taylor B.", g:"7th", pts:2750, e:"T", chg:"-2", up:false},
  {n:"Drew K.",   g:"7th", pts:2640, e:"D", chg:"+5", up:true}
];

var SKILLS_DATA = [
  {n:"Number Sense", i:"N", m:95, unlocked:true},
  {n:"Arithmetic",   i:"A", m:90, unlocked:true},
  {n:"Fractions",    i:"F", m:62, unlocked:true},
  {n:"Algebra",      i:"AL",m:88, unlocked:true},
  {n:"Geometry",     i:"G", m:80, unlocked:true},
  {n:"Statistics",   i:"S", m:74, unlocked:true},
  {n:"Trigonometry", i:"T", m:45, unlocked:true},
  {n:"Pre-Calculus", i:"PC",m:0,  unlocked:false},
  {n:"Calculus",     i:"C", m:0,  unlocked:false}
];

var PRIZES = [
  {n:"Amazon Gift Card", e:"$5",  cost:500,  val:"$5 value"},
  {n:"$10 Amazon Card",  e:"$10", cost:1000, val:"$10 value"},
  {n:"GameStop Card",    e:"$25", cost:2500, val:"$25 value"},
  {n:"Calculator",       e:"Calc",cost:2000, val:"$20 value"},
  {n:"College Savings",  e:"529", cost:5000, val:"$50 value"},
  {n:"Math Merch",       e:"Merch",cost:1500,val:"$15 value"}
];

var EARNINGS_LOG = [
  {d:"Won challenge",        a:"+15 coins", date:"Today",   color:"var(--mint)", i:"W"},
  {d:"Daily trivia perfect", a:"+25 coins", date:"Today",   color:"var(--mint)", i:"T"},
  {d:"Tournament win",       a:"+100 coins",date:"Mar 20",  color:"var(--mint)", i:"TR"},
  {d:"7-day streak bonus",   a:"+50 coins", date:"Mar 18",  color:"var(--mint)", i:"S"},
  {d:"Redeemed Amazon Card", a:"-500 coins",date:"Mar 15",  color:"var(--coral)",i:"R"}
];

var COIN_GUIDE = [
  {a:"Daily trivia (3 questions)", c:"10-25 coins", i:"Q"},
  {a:"Win a challenge",            c:"15 coins",    i:"W"},
  {a:"Beat higher-ranked player",  c:"30 bonus",    i:"B"},
  {a:"7-day streak",               c:"50 coins",    i:"S"},
  {a:"Perfect score",              c:"+15 bonus",   i:"P"},
  {a:"Complete skill topic",       c:"20 coins",    i:"T"},
  {a:"Tournament win",             c:"100-500 coins",i:"TW"}
];

var TOURNAMENTS = [
  {n:"5th Grade Arithmetic Cup",    date:"March 30, 2026", prize:"$200",  spots:"428/500", color:"card-mint",   grades:"Grades 4-5"},
  {n:"Middle School Geometry Bowl", date:"April 15, 2026", prize:"$350",  spots:"211/300", color:"card-sky",    grades:"Grades 6-8"},
  {n:"High School Pre-Calc Sprint", date:"May 1, 2026",    prize:"$750",  spots:"89/200",  color:"card-purple", grades:"Grades 9-12"},
  {n:"Elementary Fun Math Blitz",   date:"May 15, 2026",   prize:"$150",  spots:"320/400", color:"card-sun",    grades:"Grades 1-3"},
  {n:"National Calculus Challenge", date:"June 1, 2026",   prize:"$1000", spots:"45/100",  color:"card-coral",  grades:"Grades 11-12"}
];

var QUICK_PROMPTS = [
  {t:"Explain fractions",     emoji:"F"},
  {t:"How does algebra work", emoji:"A"},
  {t:"Tips for geometry",     emoji:"G"},
  {t:"What is calculus",      emoji:"C"},
  {t:"Statistics made easy",  emoji:"S"},
  {t:"Solve word problems",   emoji:"W"}
];

var ACHIEVEMENTS_DATA = [
  {n:"First Win",    d:"Won your first challenge",     i:"W",  bg:"rgba(255,217,61,0.15)",  unlocked:true},
  {n:"Streak Master",d:"5-day login streak",           i:"S",  bg:"rgba(255,107,107,0.15)", unlocked:true},
  {n:"Top 10%",      d:"Ranked in top 10% of grade",  i:"T",  bg:"rgba(6,214,160,0.15)",   unlocked:true},
  {n:"Speed Demon",  d:"Answer in under 5 seconds",   i:"Sp", bg:"rgba(78,205,196,0.15)",  unlocked:false},
  {n:"Giant Slayer", d:"Beat a Diamond tier player",  i:"G",  bg:"rgba(255,107,107,0.15)", unlocked:false},
  {n:"Math Scholar", d:"Complete 500 questions",      i:"M",  bg:"rgba(155,93,229,0.15)",  unlocked:false}
];

var FUN_FACTS = [
  "A googol is 1 followed by 100 zeros!",
  "Zero cannot be shown in Roman numerals!",
  "Pi has been calculated to over 100 trillion digits!",
  "Fibonacci numbers appear in sunflowers and pinecones!",
  "There are more chess games than atoms in the universe!",
  "The equals sign was invented by Robert Recorde in 1557!",
  "There are infinitely many prime numbers!"
];

var MUSIC_TRACKS = [
  {name:"Lofi Study Beat 1",   artist:"Free Music - CC0", url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"},
  {name:"Lofi Study Beat 2",   artist:"Free Music - CC0", url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"},
  {name:"Lofi Study Beat 3",   artist:"Free Music - CC0", url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"},
  {name:"Lofi Study Beat 4",   artist:"Free Music - CC0", url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3"},
  {name:"Lofi Study Beat 5",   artist:"Free Music - CC0", url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3"}
];

var SOURCES = [
  {n:"Khan Academy",         icon:"K",   cnt:"60+"},
  {n:"OpenStax",             icon:"O",   cnt:"25+"},
  {n:"Illustrative Math",    icon:"I",   cnt:"30+"},
  {n:"STAAR Released Tests", icon:"S",   cnt:"20+"},
  {n:"SAT Practice Tests",   icon:"SAT", cnt:"20+"},
  {n:"AP Calculus AB/BC",    icon:"AP",  cnt:"15+"},
  {n:"AP Statistics",        icon:"AP",  cnt:"10+"},
  {n:"Claude AI (Live)",     icon:"AI",  cnt:"unlimited"}
];

// ── UTILITIES ──────────────────────────────────────────
function $$(id){ return document.getElementById(id); }

function showToast(msg, dur){
  var t = $$("toast"); if(!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(function(){ t.classList.remove("show"); }, dur||2800);
}

function gradeBand(n){
  n = parseInt(n)||7;
  if(n<=3)  return "grades_1_3";
  if(n<=5)  return "grades_4_5";
  if(n<=8)  return "grades_6_8";
  if(n<=10) return "grades_9_10";
  return "grades_11_12";
}

function getGradeBandNum(n){
  n = parseInt(n)||7;
  if(n<=3) return 1; if(n<=5) return 2;
  if(n<=8) return 3; if(n<=10) return 4;
  return 5;
}



function shuffle(arr){ return arr.slice().sort(function(){ return Math.random()-.5; }); }

function saveSession(){
  if(!S.name || S.isPreview) return;
  try{
    var key = "mc_"+S.name.split(" ")[0].toLowerCase()+"_"+S.gradeNum;
    localStorage.setItem(key, JSON.stringify({
      xp:S.xp, level:S.level, streak:S.streak, coins:S.coins,
      name:S.name, grade:S.grade, gradeNum:S.gradeNum
    }));
  }catch(e){}
}

function registerPlayer(name, grade){
  if(!SESSION_PLAYERS.find(function(p){ return p.name===name; })){
    SESSION_PLAYERS.push({name:name, grade:grade, wins:0, level:1, online:true});
  }
}

// ── MODAL ─────────────────────────────────────────────
function openModal(t){
  var m = $$("signup-modal"); if(!m) return;
  m.classList.add("open");
  switchTab(t, $$("tab-"+(t==="student"?"s":"p")+"-btn"));
}
function closeModal(){ var m=$$("signup-modal"); if(m) m.classList.remove("open"); }

function switchTab(t, btn){
  var ts=$$("tab-student"), tp=$$("tab-parent");
  if(ts) ts.style.display = t==="student"?"block":"none";
  if(tp) tp.style.display = t==="parent"?"block":"none";
  document.querySelectorAll(".tab-btn").forEach(function(b){ b.classList.remove("on"); });
  if(btn) btn.classList.add("on");
}
function selectPlan(el){
  document.querySelectorAll(".plan-card").forEach(function(c){ c.classList.remove("sel"); });
  el.classList.add("sel");
}

function openLoginModal(){ var m=$$("login-modal"); if(m) m.classList.add("open"); }

async function forgotPassword(role){
  var email = "";
  if(role==="student"){
    var emailEl=$$("l-email"); email=emailEl?emailEl.value.trim():"";
    if(!email){ email=prompt("Enter your student email address to reset your password:",""); }
  } else {
    var emailEl=$$("l-parent-email"); email=emailEl?emailEl.value.trim():"";
    if(!email){ email=prompt("Enter your parent email address to reset your password:",""); }
  }
  if(!email||email.indexOf("@")<1){ showToast("Please enter a valid email address first!"); return; }
  if(window.auth){
    try{
      await window.firebaseResetPassword(email);
      showToast("Password reset email sent to "+email+"! Check your inbox. 📧",4000);
    }catch(e){
      var msg=e.message||"";
      if(msg.indexOf("user-not-found")>-1) showToast("No account found for that email address.");
      else showToast("Could not send reset email. Please check the address and try again.");
    }
  } else {
    showToast("Password reset email sent to "+email+"! Check your inbox. 📧",4000);
  }
}
function closeLoginModal(){ var m=$$("login-modal"); if(m) m.classList.remove("open"); }
function showLinkChildModal(){ var m=$$("link-child-modal"); if(m) m.classList.add("open"); }
function closeLinkChildModal(){ var m=$$("link-child-modal"); if(m) m.classList.remove("open"); }

// ── NAVIGATION ─────────────────────────────────────────
function goPage(id, el, mob){
  document.querySelectorAll(".page").forEach(function(p){ p.classList.remove("on"); });
  var pg = $$("p-"+id); if(pg) pg.classList.add("on");
  var navSel = mob ? ".mob-item" : ".nav-item";
  document.querySelectorAll(navSel).forEach(function(n){ n.classList.remove("on"); });
  if(el) el.classList.add("on");
  var renderMap = {
    room:renderRoom, challenge:renderChallenge,
    leaderboard:renderLeaderboard, tournament:renderTournaments,
    wallet:renderWallet, skills:renderSkills,
    profile:renderProfile, tutor:renderTutor,
    practice:renderPractice, parentdash:renderParentDash
  };
  if(renderMap[id]) renderMap[id]();
}

// ── ENTER APP ──────────────────────────────────────────
function enterApp(name, grade, gradeNum, isPreview){
  S.name=name; S.grade=grade; S.gradeNum=gradeNum; S.isPreview=isPreview;
  var ava = name[0].toUpperCase();
  var setEl = function(id,val){ var e=$$(id); if(e) e.textContent=val; };
  setEl("sb-avatar", ava); setEl("prof-ava", ava);
  setEl("sb-name", name.split(" ")[0]+(name.split(" ")[1]?" "+name.split(" ")[1][0]+".":""));
  setEl("sb-ulevel", "Level "+S.level+" - "+(S.level>=10?"Diamond":S.level>=7?"Gold":S.level>=4?"Silver":"Beginner"));
  setEl("home-greet", "Welcome, "+name.split(" ")[0]+"! Earn Your Crown!");
  setEl("prof-name", name); setEl("prof-grade", grade+" - Math Champ");
  setEl("stat-wins","0"); setEl("stat-streak",S.streak); setEl("stat-rank","--");
  setEl("home-coins",S.coins.toLocaleString()); setEl("wallet-coins",S.coins.toLocaleString());
  setEl("xp-level-num",S.level); setEl("xp-nums-label",S.xp+" / "+S.level*500+" XP");
  setEl("daily-status","0 of 3 completed today");
  var xpEl=$$("xp-prog"); if(xpEl) xpEl.style.width=Math.min(100,Math.round(S.xp/(S.level*500)*100))+"%";
  var land=$$("s-land"); if(land) land.classList.remove("active");
  var app=$$("s-app"); if(app) app.classList.add("active");
  showMobNav(true);
  showMusicBtn(true);
  window.currentLBTab="grade";
  var gb=document.getElementById("lb-grade-btn");
  if(gb) gb.textContent="\u{1F3EB} My Grade ("+(gradeNum||7)+"th)";
  renderHome();
  // Start online presence tracking
  setTimeout(function(){
    initPresence();
    if(window.startPresence) window.startPresence();
  }, 2000);
}

async function signupStudent(){
  var fn=$$("s-fn")?$$("s-fn").value.trim():"";
  var ln=$$("s-ln")?$$("s-ln").value.trim():"";
  var gr=$$("s-grade")?$$("s-grade").value:"";
  var email=$$("s-email")?$$("s-email").value.trim():"";
  var password=$$("s-password")?$$("s-password").value:"";
  if(!fn||!gr){ showToast("Please fill in your name and grade!"); return; }
  if(!email||email.indexOf("@")<1){ showToast("Please enter a valid email address!"); return; }
  if(!password||password.length<6){ showToast("Password must be at least 6 characters!"); return; }
  var fullName=fn+(ln?" "+ln:"");
  S.xp=0; S.level=1; S.streak=0; S.coins=0; S.email=email;
  if(window.firebaseSignUp){
    try{
      var signupBtn=document.querySelector("#tab-student .btn-sun");
      if(signupBtn){ signupBtn.textContent="Creating account..."; signupBtn.disabled=true; }
      await window.firebaseSignUp(email, password, fullName, "student", gr);
      // linkCode is now saved in Firestore by firebaseSignUp
      // Load it back so S.linkCode is set correctly
      try{
        var savedData = await window.loadProgress();
        if(savedData && savedData.linkCode){
          S.linkCode = savedData.linkCode;
        } else {
          // Fallback: generate locally if load fails
          S.linkCode = Math.floor(100000+Math.random()*900000).toString();
        }
      }catch(e){
        S.linkCode = Math.floor(100000+Math.random()*900000).toString();
      }
      closeModal();
      registerPlayer(fullName, gr+"th");
      saveSession();
      enterApp(fullName, gr+"th Grade", parseInt(gr)||7, false);
      showToast("Account created! Welcome, "+fn+"! 🎉");
      return;
    }catch(e){
      var msg=e.message||"";
      if(msg.indexOf("email-already-in-use")>-1) showToast("That email is already registered. Please log in!");
      else showToast("Signup error: "+msg.replace("Firebase: ","").split(" (")[0]);
      var btn2=document.querySelector("#tab-student .btn-sun");
      if(btn2){ btn2.textContent="🚀 Create My Profile — Free!"; btn2.disabled=false; }
      return;
    }
  }
  closeModal();
  registerPlayer(fullName, gr+"th");
  saveSession();
  enterApp(fullName, gr+"th Grade", parseInt(gr)||7, false);
  showToast("Welcome to MathCrown, "+fn+"! Earn Your Crown!");
}

function previewApp(){
  S.xp=1240; S.level=4; S.streak=3; S.coins=620;
  enterApp("Demo Player", "7th Grade", 7, true);
  showPreviewBanner();
}

function showPreviewBanner(){
  if($$("preview-banner")) return;
  var banner = document.createElement("div");
  banner.id = "preview-banner";
  banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:999;background:linear-gradient(135deg,#1C3A6E,#06D6A0);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;";
  var span = document.createElement("span");
  span.style.cssText = "font-size:13px;font-weight:800;color:#fff";
  span.textContent = "PREVIEW MODE - Sign up free to save progress and earn real prizes!";
  var btn = document.createElement("button");
  btn.className = "btn btn-sun btn-xs";
  btn.textContent = "Sign Up Free";
  btn.addEventListener("click", function(){
    closeModal();
    openModal("student");
    var b = $$("preview-banner"); if(b) b.remove();
  });
  banner.appendChild(span);
  banner.appendChild(btn);
  document.body.prepend(banner);
}

function switchLoginTab(t, btn){
  var ts=$$("login-tab-student"), tp=$$("login-tab-parent");
  if(ts) ts.style.display = t==="student"?"block":"none";
  if(tp) tp.style.display = t==="parent"?"block":"none";
  document.querySelectorAll("#login-modal .tab-btn").forEach(function(b){ b.classList.remove("on"); });
  if(btn) btn.classList.add("on");
}

async function loginParent(){
  var email=$$("l-parent-email")?$$("l-parent-email").value.trim():"";
  var password=$$("l-parent-password")?$$("l-parent-password").value:"";
  if(!email||email.indexOf("@")<1){ showToast("Please enter your email address!"); return; }
  if(!password){ showToast("Please enter your password!"); return; }
  var loginBtn=document.querySelector("#login-tab-parent .btn-mint");
  if(loginBtn){ loginBtn.textContent="Signing in..."; loginBtn.disabled=true; }
  if(window.firebaseLogin){
    try{
      await window.firebaseLogin(email, password);
      var fn=email.split("@")[0];
      PARENT.name=fn; PARENT.email=email; PARENT.isLoggedIn=true;
      try{
        var pKey="mc_parent_"+email.toLowerCase().replace(/[^a-z0-9]/g,"");
        var saved=localStorage.getItem(pKey);
        if(saved){ var d=JSON.parse(saved); PARENT.plan=d.plan||"Free"; PARENT.children=d.children||[]; PARENT.name=d.name||fn; }
      }catch(e){}
      var nav=$$("nav-parent-dash"); if(nav) nav.style.display="flex";
      closeLoginModal();
      var land=$$("s-land"); if(land) land.classList.remove("active");
      var app=$$("s-app"); if(app) app.classList.add("active");
      showMobNav(true); showMusicBtn(true);
      goPage("parentdash",$$("nav-parent-dash"),false);
      showToast("Welcome back, "+PARENT.name.split(" ")[0]+"! Here is your parent dashboard.");
      return;
    }catch(e){
      var msg=e.message||"";
      if(msg.indexOf("invalid-credential")>-1||msg.indexOf("wrong-password")>-1) showToast("Wrong email or password. Please try again.");
      else showToast("Login failed: "+msg.replace("Firebase: ","").split(" (")[0]);
      if(loginBtn){ loginBtn.textContent="👨‍👩‍👧 Go to Parent Dashboard"; loginBtn.disabled=false; }
      return;
    }
  }
  // Fallback
  var fn2=email.split("@")[0];
  PARENT.name=fn2; PARENT.email=email; PARENT.isLoggedIn=true;
  try{
    var pKey2="mc_parent_"+email.toLowerCase().replace(/[^a-z0-9]/g,"");
    var saved2=localStorage.getItem(pKey2);
    if(saved2){ var d2=JSON.parse(saved2); PARENT.plan=d2.plan||"Free"; PARENT.children=d2.children||[]; PARENT.name=d2.name||fn2; }
  }catch(e){}
  var nav2=$$("nav-parent-dash"); if(nav2) nav2.style.display="flex";
  closeLoginModal();
  var land2=$$("s-land"); if(land2) land2.classList.remove("active");
  var app2=$$("s-app"); if(app2) app2.classList.add("active");
  showMobNav(true); showMusicBtn(true);
  goPage("parentdash",$$("nav-parent-dash"),false);
  showToast("Welcome back, "+PARENT.name.split(" ")[0]+"!");
}

async function loginStudent(){
  var fn=$$("l-fn")?$$("l-fn").value.trim():"";
  var gr=$$("l-grade")?$$("l-grade").value:"";
  var email=$$("l-email")?$$("l-email").value.trim():"";
  var password=$$("l-password")?$$("l-password").value:"";
  if(!fn){ showToast("Please enter your first name!"); return; }
  if(!gr){ showToast("Please select your grade!"); return; }
  if(!email||email.indexOf("@")<1){ showToast("Please enter your email address!"); return; }
  if(!password){ showToast("Please enter your password!"); return; }
  S.xp=0; S.level=1; S.streak=0; S.coins=0;
  var loginBtn=document.querySelector("#login-tab-student .btn-sun");
  if(loginBtn){ loginBtn.textContent="Signing in..."; loginBtn.disabled=true; }
  if(window.firebaseLogin){
    try{
      await window.firebaseLogin(email, password);
      var data=await window.loadProgress();
      if(data){
        S.xp=data.xp||0; S.level=data.level||1;
        S.streak=data.streak||0; S.coins=data.coins||0;
        fn=data.displayName||fn;
        // Restore linkCode from Firestore
        if(data.linkCode){
          S.linkCode=data.linkCode;
        } else {
          // Existing users: generate and save linkCode now
          var newCode=Math.floor(100000+Math.random()*900000).toString();
          S.linkCode=newCode;
          try{ await window.saveProgress(S.xp,S.coins,S.level,S.streak,newCode); }catch(e){}
        }
      }
      closeLoginModal();
      enterApp(fn, (parseInt(gr)||7)+"th Grade", parseInt(gr)||7, false);
      showToast("Welcome back, "+fn.split(" ")[0]+"! Progress loaded! 🎉");
      return;
    }catch(e){
      var msg=e.message||"";
      if(msg.indexOf("invalid-credential")>-1||msg.indexOf("wrong-password")>-1) showToast("Wrong email or password. Please try again.");
      else showToast("Login failed: "+msg.replace("Firebase: ","").split(" (")[0]);
      if(loginBtn){ loginBtn.textContent="🚀 Go to My Dashboard"; loginBtn.disabled=false; }
      return;
    }
  }
  try{
    var saved=localStorage.getItem("mc_"+fn.toLowerCase()+"_"+gr);
    if(saved){ var d=JSON.parse(saved); S.xp=d.xp||0; S.level=d.level||1; S.streak=d.streak||0; S.coins=d.coins||0; }
  }catch(e){}
  closeLoginModal();
  enterApp(fn, gr+"th Grade", parseInt(gr)||7, false);
  showToast("Welcome back, "+fn+"!");
}

function logout(){
  saveSession();
  // Reset student state
  S.name=""; S.grade=""; S.gradeNum=0; S.xp=0; S.level=1; S.streak=0; S.coins=0; S.isPreview=false;
  // Reset parent state
  PARENT.isLoggedIn=false;
  // Hide parent nav
  var parentNav=$$("nav-parent-dash"); if(parentNav) parentNav.style.display="none";
  // Switch back to landing page
  var app=$$("s-app"); if(app) app.classList.remove("active");
  var land=$$("s-land"); if(land) land.classList.add("active");
  showMobNav(false);
  var banner=$$("preview-banner"); if(banner) banner.remove();
  // Stop music
  showMusicBtn(false);
  var audio=$$("music-audio"); if(audio){ audio.pause(); MUSIC.playing=false; MUSIC.userInteracted=false; }
  // Scroll to top of landing
  window.scrollTo(0,0);
  showToast("Logged out successfully. See you soon!");
}

// ── HOME ───────────────────────────────────────────────
function renderHome(){
  var hCode=$$("home-link-code");
  if(hCode) hCode.textContent=S.linkCode||"------";
  var ff=$$("fun-fact");
  if(ff) ff.textContent = FUN_FACTS[Math.floor(Math.random()*FUN_FACTS.length)];
  var gs=$$("getting-started-card");
  if(gs) gs.style.display = (S.xp>0&&!S.isPreview)?"none":"block";
  renderMiniLB();
  var hc=$$("home-coins"); if(hc) hc.textContent=S.coins.toLocaleString();
}

function renderMiniLB(){
  var el=$$("mini-lb"); if(!el) return;
  var html="";
  LB_DATA.slice(0,4).forEach(function(p,i){
    var rank=i===0?"1st":i===1?"2nd":i===2?"3rd":"#"+(i+1);
    html+="<div class='lb-row'>"
      +"<div class='lb-rank'>"+rank+"</div>"
      +"<div class='lb-emo' style='background:rgba(255,255,255,0.08)'>"+p.e+"</div>"
      +"<div class='lb-info'><div class='lb-name'>"+p.n+"</div><div class='lb-grade'>"+p.g+"</div></div>"
      +"<div class='lb-pts-wrap'><div class='lb-pts'>"+p.pts.toLocaleString()+"</div>"
      +"<div class='lb-chg "+(p.up?"chg-up":"chg-dn")+"'>"+p.chg+"</div></div>"
      +"</div>";
  });
  el.innerHTML = html;
}

// ── TRIVIA ─────────────────────────────────────────────
function setMode(mode, btn){
  S.triviaMode=mode;
  document.querySelectorAll(".mode-tab").forEach(function(t){ t.classList.remove("on"); });
  if(btn) btn.classList.add("on");
  session={qs:[],idx:0,correct:0,mode:mode,loading:false};
  loadTrivia();
}

function renderRoom(){ renderRoomLB(); renderSourceList(); if(!session.qs.length&&!session.loading) loadTrivia(); }

function renderRoomLB(){
  var el=$$("room-lb"); if(!el) return;
  var html="";
  LB_DATA.slice(0,3).forEach(function(p,i){
    var rank=i===0?"1st":i===1?"2nd":"3rd";
    html+="<div class='lb-row'><div class='lb-rank'>"+rank+"</div>"
      +"<div class='lb-emo' style='background:rgba(255,255,255,0.08)'>"+p.e+"</div>"
      +"<div class='lb-info'><div class='lb-name'>"+p.n+"</div></div>"
      +"<div class='lb-pts'>"+p.pts.toLocaleString()+" XP</div></div>";
  });
  el.innerHTML=html;
}

function renderSourceList(){
  var el=$$("source-list"); if(!el) return;
  var html="";
  SOURCES.forEach(function(s){
    html+="<div style='display:flex;align-items:center;gap:10px;padding:9px 10px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:7px'>"
      +"<span style='font-size:16px;width:28px;text-align:center;font-weight:900'>"+s.icon+"</span>"
      +"<div style='flex:1'><div style='font-size:13px;font-weight:800'>"+s.n+"</div></div>"
      +"<span class='badge b-purple' style='font-size:10px'>"+s.cnt+"</span></div>";
  });
  el.innerHTML=html;
}

async function loadTrivia(){
  if(session.loading) return;
  session.loading=true;
  clearInterval(triviaTimer);
  var arena=$$("trivia-arena");
  if(arena) arena.innerHTML="<div style='text-align:center;padding:32px'><div style='font-size:32px;margin-bottom:12px'>Loading questions...</div><div style='color:var(--text2)'>AI + curated sources</div></div>";
  var total=session.mode==="trivia"?3:session.mode==="practice"?5:session.mode==="challenge"?10:15;
  var qs=[];
  var aiQs=await genAIQuestions(S.gradeNum, Math.ceil(total*0.6), session.mode);
  if(aiQs&&aiQs.length) qs=aiQs.slice();
  while(qs.length<total) qs.push(getRandQ(S.gradeNum));
  session.qs=shuffle(qs).slice(0,total);
  session.idx=0; session.correct=0; session.loading=false;
  renderQuestion();
}

async function genAIQuestions(gradeN, count, mode){
  var band=gradeN<=3?"1-3":gradeN<=5?"4-5":gradeN<=8?"6-8":gradeN<=10?"9-10":"11-12";
  var topicMap={"1-3":"Addition,Subtraction,Place Value","4-5":"Fractions,Decimals,Percentages","6-8":"Linear Equations,Geometry,Statistics","9-10":"Quadratic Equations,Trigonometry,Functions","11-12":"Derivatives,Integrals,AP Statistics"};
  var prompt="Generate "+count+" math questions for grade "+gradeN+" on topics: "+topicMap[band]+". Return JSON array only: [{topic,question,choices:[A,B,C,D],correct,explanation,source}]";
  try{
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2500,messages:[{role:"user",content:prompt}]})
    });
    var d=await r.json();
    var raw=((d.content||[{text:"[]"}])[0].text||"[]").replace(/```json|```/g,"").trim();
    return JSON.parse(raw).map(function(q){
      return {q:q.question,a:q.choices,c:typeof q.correct==="number"?q.correct:0,topic:q.topic,explanation:q.explanation||"",src:q.source||"AI Generated",ai:true};
    });
  }catch(e){ return null; }
}

function renderQuestion(){
  var arena=$$("trivia-arena"); if(!arena) return;
  if(session.idx>=session.qs.length){ showTriviaResult(); return; }
  var q=session.qs[session.idx], total=session.qs.length;
  var dots="";
  for(var d=0;d<total;d++) dots+="<div class='q-dot "+(d<session.idx?"done":d===session.idx?"curr":"")+"'></div>";
  arena.innerHTML="<div class='q-header'><div class='q-dots'>"+dots+"</div>"
    +"<div class='timer-ring' id='timer-ring' style='--p:100'><div class='timer-inner' id='timer-num'>20</div></div></div>"
    +"<div class='q-topic'>"+(q.topic||"Math")+" - Q"+(session.idx+1)+"/"+total+"</div>"
    +"<div class='q-text'>"+q.q+"</div>"
    +"<div class='q-opts' id='q-opts-wrap'></div>"
    +"<div class='q-src'>"+(q.ai?"AI Generated":q.src||"Question Bank")+"</div>";
  var wrap=$$("q-opts-wrap");
  var letters=["A","B","C","D"];
  (q.a||[]).forEach(function(ans,i){
    var btn=document.createElement("button");
    btn.className="q-opt";
    btn.innerHTML="<span class='opt-letter'>"+letters[i]+"</span>"+ans;
    btn.addEventListener("click",function(){ answerQ(i,q.c,btn); });
    wrap.appendChild(btn);
  });
  var timerVal=20;
  clearInterval(triviaTimer);
  triviaTimer=setInterval(function(){
    timerVal--;
    var nr=$$("timer-num"), rr=$$("timer-ring");
    if(nr) nr.textContent=timerVal;
    if(rr) rr.style.setProperty("--p",timerVal/20*100);
    if(nr) nr.style.color=timerVal<=5?"var(--coral)":"var(--sun)";
    if(timerVal<=0){
      clearInterval(triviaTimer);
      var opts=document.querySelectorAll(".q-opt");
      opts.forEach(function(o,i){ if(i===q.c) o.classList.add("reveal"); o.disabled=true; });
      showToast("Time is up!");
      session.idx++;
      setTimeout(renderQuestion,1800);
    }
  },1000);
}

function answerQ(sel,correct,btn){
  clearInterval(triviaTimer);
  document.querySelectorAll(".q-opt").forEach(function(o){ o.disabled=true; });
  var right=sel===correct;
  if(right){ btn.classList.add("correct"); session.correct++; S.coins+=10; S.xp+=50; showToast("Correct! +10 MathCoins"); }
  else{ btn.classList.add("wrong"); var opts=document.querySelectorAll(".q-opt"); if(opts[correct]) opts[correct].classList.add("correct"); showToast("Not quite!"); }
  var q=session.qs[session.idx];
  if(q.explanation){
    var exBox=document.createElement("div");
    exBox.className="explain-box "+(right?"explain-correct":"explain-wrong");
    exBox.innerHTML="<strong style='color:"+(right?"var(--mint)":"var(--coral)")+"'>"+(right?"Correct!":"Explanation:")+"</strong> "+q.explanation;
    var wrap=$$("q-opts-wrap"); if(wrap) wrap.after(exBox);
  }
  session.idx++;
  setTimeout(renderQuestion, right?1800:2400);
}

function showTriviaResult(){
  clearInterval(triviaTimer);
  var t=session.qs.length, c=session.correct, pct=Math.round(c/t*100);
  var coinsEarned=c*10+(c===t?25:0), xpEarned=c*50+(c===t?100:0);
  S.coins+=coinsEarned; S.xp+=xpEarned;
  saveSession();
  var hc=$$("home-coins"); if(hc) hc.textContent=S.coins.toLocaleString();
  var msg=pct===100?"Perfect!":pct>=70?"Great Job!":"Keep Going!";
  var arena=$$("trivia-arena"); if(!arena) return;
  var div=document.createElement("div"); div.className="result-card";
  div.innerHTML="<div style='font-size:48px;margin-bottom:12px'>"+msg+"</div>"
    +"<div style='font-family:Fredoka One,cursive;font-size:26px;color:var(--sun)'>"+msg+"</div>"
    +"<div style='color:var(--text2);margin-bottom:16px'>"+c+"/"+t+" correct - "+pct+"%</div>"
    +"<div class='result-grid'>"
    +"<div class='result-box'><div class='result-val' style='color:var(--sun)'>+"+xpEarned+"</div><div class='result-key'>XP</div></div>"
    +"<div class='result-box'><div class='result-val' style='color:var(--mint)'>+"+coinsEarned+"</div><div class='result-key'>MathCoins</div></div>"
    +"</div>";
  var btnRow=document.createElement("div"); btnRow.style.cssText="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;";
  var b1=document.createElement("button"); b1.className="btn btn-sun btn-sm"; b1.textContent="New Questions";
  b1.addEventListener("click",function(){ session={qs:[],idx:0,correct:0,mode:session.mode,loading:false}; loadTrivia(); });
  var b2=document.createElement("button"); b2.className="btn btn-ghost btn-sm"; b2.textContent="Practice Mode";
  b2.addEventListener("click",function(){ setMode("practice",null); });
  btnRow.appendChild(b1); btnRow.appendChild(b2);
  div.appendChild(btnRow);
  arena.innerHTML=""; arena.appendChild(div);
}

// ── CHALLENGE ──────────────────────────────────────────
function filterOpponents(filter, btn){
  CHALLENGE_FILTER=filter;
  document.querySelectorAll("#grade-filter-btns span").forEach(function(s){ s.style.border="1px solid transparent"; });
  if(btn) btn.style.border="2px solid currentColor";
  renderOppList();
}

function renderOppList(){
  var el=$$("opp-list"); if(!el) return;
  var myBand=getGradeBandNum(S.gradeNum||7);
  var myGrade=S.gradeNum||7;
  var filtered=OPPS.filter(function(o){
    if(CHALLENGE_FILTER==="same") return o.gradeN===myGrade;
    if(CHALLENGE_FILTER==="higher") return o.gradeN>myGrade;
    return true;
  });
  // Randomize AI opponent online status for demo
  var aiOnlineNames=["Jordan K.","Sam P.","Dana R.","Morgan L."];
  var allOpps=filtered.concat(SESSION_PLAYERS.filter(function(p){
    var g=parseInt(p.grade)||myGrade;
    if(CHALLENGE_FILTER==="same") return g===myGrade;
    if(CHALLENGE_FILTER==="higher") return g>myGrade;
    return true;
  }).map(function(p){
    return {n:p.name,gradeN:parseInt(p.grade)||myGrade,band:myBand,tier:"Level "+p.level,meta:p.grade+" - "+p.wins+" Wins",wr:(50+p.wins)+"% Win Rate",winRate:0.5,e:p.name[0],bg:"linear-gradient(135deg,var(--mint),var(--sky))",isReal:true,online:true};
  }));
  el.innerHTML="";
  if(allOpps.length===0){
    var empty=document.createElement("div"); empty.className="card"; empty.style.cssText="text-align:center;padding:28px;color:var(--text2)";
    empty.innerHTML="<div style='font-size:36px;margin-bottom:10px'>No opponents at this level</div><div>Try All Levels</div>";
    el.appendChild(empty); return;
  }
  // Online count badge
  var onlineCount=allOpps.filter(function(o){ return aiOnlineNames.indexOf(o.n)>-1||o.online; }).length;
  var header=document.createElement("div");
  header.style.cssText="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:12px;font-weight:800;color:var(--text2)";
  header.innerHTML="<span style='width:8px;height:8px;border-radius:50%;background:var(--mint);display:inline-block;box-shadow:0 0 6px var(--mint)'></span>"+onlineCount+" players currently online &nbsp;|&nbsp; <span style='color:var(--text2)'>Gray dot = offline</span>";
  el.appendChild(header);
  allOpps.forEach(function(o){
    var isOnline=o.online||aiOnlineNames.indexOf(o.n)>-1||isPlayerOnline(o.n);
    var card=document.createElement("div"); card.className="opp-card"; card.style.cursor="pointer";
    card.setAttribute("data-n",o.n); card.setAttribute("data-e",o.e); card.setAttribute("data-bg",o.bg); card.setAttribute("data-wr",o.winRate||0.72); card.setAttribute("data-online",isOnline?"1":"0");
    var realBadge=o.isReal?"<span class='badge b-mint' style='font-size:10px;margin-left:4px'>REAL</span>":"<span class='badge b-sky' style='font-size:10px;margin-left:4px'>AI</span>";
    var onlineDot="<span style='display:inline-block;width:10px;height:10px;border-radius:50%;background:"+(isOnline?"#06D6A0":"#666")+";box-shadow:"+(isOnline?"0 0 8px #06D6A0":"none")+"';flex-shrink:0;margin-right:4px' title='"+(isOnline?"Online":"Offline")+"'></span>";
    var statusText=isOnline?"<span style='color:var(--mint);font-size:11px;font-weight:800'>● Online — Ready to battle!</span>":"<span style='color:#888;font-size:11px'>⬤ Offline</span>";
    var actionBtn=isOnline
      ?"<button class='btn btn-coral btn-xs' style='flex-shrink:0'>⚔️ Challenge</button>"
      :"<button class='btn btn-ghost btn-xs' style='flex-shrink:0;opacity:0.6'>Practice</button>";
    card.innerHTML="<div style='position:relative;flex-shrink:0'>"
      +"<div style='width:48px;height:48px;border-radius:50%;background:"+o.bg+";color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900'>"+o.e+"</div>"
      +"<span style='position:absolute;bottom:0;right:0;width:13px;height:13px;border-radius:50%;background:"+(isOnline?"var(--mint)":"#555")+";border:2px solid var(--dark2);box-shadow:"+(isOnline?"0 0 6px var(--mint)":"none")+"'></span></div>"
      +"<div class='opp-info'><div class='opp-name'>"+o.n+realBadge+"</div>"
      +"<div class='opp-meta' style='margin-bottom:3px'>Grade "+o.gradeN+" · "+o.tier+" · "+o.meta.split(" - ").slice(-1)[0]+"</div>"
      +"<div>"+statusText+"</div></div>"
      +actionBtn;
    card.addEventListener("click",function(){
      var online=this.getAttribute("data-online")==="1";
      if(online){
        sendChallengeInvite(this.getAttribute("data-n"),this.getAttribute("data-e"),this.getAttribute("data-bg"),parseFloat(this.getAttribute("data-wr")));
      } else {
        showToast(this.getAttribute("data-n")+" is offline. Starting practice battle instead...");
        startBattleWith(this.getAttribute("data-n"),this.getAttribute("data-e"),this.getAttribute("data-bg"),parseFloat(this.getAttribute("data-wr")));
      }
    });
    el.appendChild(card);
  });
}

function sendChallengeInvite(name,emoji,bg,winRate){
  // Show invite dialog
  var overlay=document.createElement("div");
  overlay.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:500;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)";
  overlay.id="challenge-invite-overlay";
  var box=document.createElement("div");
  box.style.cssText="background:linear-gradient(135deg,var(--dark2),var(--dark3));border:2px solid var(--coral);border-radius:24px;padding:28px;max-width:360px;width:90%;text-align:center;animation:pop-in .3s ease";
  box.innerHTML="<div style='font-size:52px;margin-bottom:12px'>⚔️</div>"
    +"<div style='font-family:Fredoka One,cursive;font-size:24px;margin-bottom:8px'>Challenge Sent!</div>"
    +"<div style='font-size:14px;color:var(--text2);margin-bottom:20px;line-height:1.7'>"
    +"<strong style='color:var(--sun)'>"+name+"</strong> has been notified of your challenge!<br><br>"
    +"<span style='display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--mint);box-shadow:0 0 8px var(--mint)'></span> "
    +"<strong style='color:var(--mint)'>"+name+" is online</strong> and will accept shortly.<br><br>"
    +"<span style='color:var(--text2);font-size:12px'>⏱️ Waiting for "+name+" to accept... (15 seconds)</span>"
    +"</div>"
    +"<div style='display:flex;gap:8px;justify-content:center'></div>";
  var waitBar=document.createElement("div");
  waitBar.style.cssText="height:6px;background:rgba(255,255,255,0.1);border-radius:100px;margin-bottom:20px;overflow:hidden";
  var fill=document.createElement("div");
  fill.style.cssText="height:100%;background:linear-gradient(90deg,var(--coral),var(--sun));border-radius:100px;transition:width 0.5s linear;width:100%";
  waitBar.appendChild(fill);
  box.insertBefore(waitBar,box.querySelector("div:last-child"));
  var btnRow=box.querySelector("div:last-child");
  var cancelBtn=document.createElement("button"); cancelBtn.className="btn btn-ghost btn-sm"; cancelBtn.textContent="Cancel";
  cancelBtn.addEventListener("click",function(){ overlay.remove(); clearInterval(inviteTimer); showToast("Challenge cancelled."); });
  var fightBtn=document.createElement("button"); fightBtn.className="btn btn-coral btn-sm"; fightBtn.textContent="Start Now!";
  fightBtn.addEventListener("click",function(){ overlay.remove(); clearInterval(inviteTimer); startBattleWith(name,emoji,bg,winRate); });
  btnRow.appendChild(cancelBtn); btnRow.appendChild(fightBtn);
  overlay.appendChild(box); document.body.appendChild(overlay);
  // Countdown — simulate opponent accepting after 3-5s
  var timeLeft=15, accepted=false;
  var acceptTime=3+Math.floor(Math.random()*5);
  var inviteTimer=setInterval(function(){
    timeLeft--;
    fill.style.width=(timeLeft/15*100)+"%";
    if(timeLeft<=acceptTime&&!accepted){
      accepted=true;
      box.querySelector("div:nth-child(3)").innerHTML="<strong style='color:var(--mint);font-size:16px'>✅ "+name+" accepted your challenge!</strong><br><br><span style='color:var(--text2)'>Battle starting now...</span>";
      fill.style.background="var(--mint)";
      setTimeout(function(){ overlay.remove(); clearInterval(inviteTimer); startBattleWith(name,emoji,bg,winRate); },1500);
    }
    if(timeLeft<=0){ clearInterval(inviteTimer); if(!accepted){ overlay.remove(); showToast(name+" didn't respond. Try Quick Match!"); } }
  },1000);
}


// ═══ REAL-TIME MULTIPLAYER SYSTEM ════════════════════════════

window.LIVE_PLAYERS = [];
window.currentBattleId = null;
window.currentBattleRole = null;
window.roundStartTime = null;
window.botBattleActive = false;

// Pick a question for the battle
window.pickBattleQuestion = function(){
  var gradeNum = S.gradeNum || 7;
  var band = QUESTION_BANK[gradeBand(gradeNum)];
  if(!band){ band = QUESTION_BANK["grades_6_8"]; }
  var topics = Object.keys(band);
  // Try up to 20 times to find unused question
  for(var att=0; att<20; att++){
    var topic = topics[Math.floor(Math.random()*topics.length)];
    var pool = band[topic];
    var qObj = pool[Math.floor(Math.random()*pool.length)];
    if(!USED_QUESTIONS.has(qObj.q)){
      USED_QUESTIONS.add(qObj.q);
      // q.a = answer options array, q.c = correct index
      return { q: qObj.q, opts: qObj.a, a: qObj.a[qObj.c] };
    }
  }
  // Fallback — just pick random
  var topic = topics[0];
  var qObj = band[topic][0];
  return { q: qObj.q, opts: qObj.a, a: qObj.a[qObj.c] };
};

// Render live players in Challenge Arena
window.renderLivePlayers = function(players){
  var el = document.getElementById("live-players-list");
  if(!el) return;
  var html = "";

  // Bot card — always first
  var botCard = document.createElement("div");
  botCard.className = "opp-card";
  botCard.style.cssText = "border-color:rgba(255,217,61,0.3);background:rgba(255,217,61,0.06)";
  botCard.innerHTML = "<div class='opp-left'>"
    + "<div class='opp-ava' style='background:linear-gradient(135deg,#FFD93D,#E8B800);color:#080F1E;font-weight:900'>&#x1F916;</div>"
    + "<div><div class='opp-name'>Axiom Bot</div>"
    + "<div class='opp-grade'>AI Opponent · Any Grade</div></div></div>"
    + "<div class='opp-right'>"
    + "<span style='color:var(--mint);font-size:11px;font-weight:700;display:block;margin-bottom:6px'>&#x25CF; ALWAYS ONLINE</span>"
    + "<button class='btn btn-xs btn-sun' onclick='window.startBotBattle()'>Battle Bot &#x2694;&#xFE0F;</button>"
    + "</div>";
  el.innerHTML = "";
  el.appendChild(botCard);

  // Update online count
  var countEl = document.getElementById("online-count");
  if(countEl) countEl.textContent = players.length + " student" + (players.length===1?"":"s") + " online now";

  if(players.length === 0){
    var empty = document.createElement("div");
    empty.style.cssText = "text-align:center;padding:28px;color:var(--text2);font-size:14px";
    empty.innerHTML = "<div style='font-size:36px;margin-bottom:8px'>&#x1F310;</div>"
      + "No other students online right now.<br>"
      + "<span style='font-size:12px'>Share MathCrown with friends to battle them!</span>";
    el.appendChild(empty);
  } else {
    players.forEach(function(p){
      var card = document.createElement("div");
      card.className = "opp-card";
      if(p.inBattle) card.style.opacity = "0.55";
      var gradeLabel = p.grade ? p.grade + "th Grade" : "K-12";
      var rightHtml = p.inBattle
        ? "<span style='color:var(--coral);font-size:11px;font-weight:700'>IN BATTLE</span>"
        : "<button class='btn btn-xs btn-coral challenge-btn'>Challenge &#x2694;&#xFE0F;</button>";
      card.innerHTML = "<div class='opp-left'>"
        + "<div style='position:relative'>"
        + "<div class='opp-ava' style='background:linear-gradient(135deg,#1C3A6E,#06D6A0);color:#fff;font-weight:900'>"
        + (p.avatar || (p.name ? p.name[0] : "?")) + "</div>"
        + "<div style='position:absolute;bottom:0;right:0;width:11px;height:11px;border-radius:50%;"
        + "background:var(--mint);border:2px solid var(--dark2)'></div></div>"
        + "<div><div class='opp-name'>" + p.name + "</div>"
        + "<div class='opp-grade'>" + gradeLabel + (p.inBattle ? " · In Battle" : "") + "</div></div></div>"
        + "<div class='opp-right'>" + rightHtml + "</div>";
      // Attach click handler safely — no inline eval
      if(!p.inBattle){
        var btn = card.querySelector(".challenge-btn");
        if(btn){
          (function(uid, name){
            btn.addEventListener("click", function(){ window.challengeRealPlayer(uid, name); });
          })(p.uid, p.name);
        }
      }
      el.appendChild(card);
    });
  }
};
// Challenge a real online player
window.challengeRealPlayer = function(toUid, toName){
  if(!window.sendChallengeTo){ showToast("Connecting..."); return; }
  // Show FIFA-style sending overlay
  var overlay = document.createElement("div");
  overlay.id = "challenge-sending-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:999;display:flex;align-items:center;justify-content:center";
  overlay.innerHTML = "<div style='background:linear-gradient(135deg,var(--dark2),var(--dark3));border:2px solid var(--sun);border-radius:24px;padding:32px;max-width:360px;width:90%;text-align:center'>"
    + "<div style='font-size:56px;margin-bottom:12px'>⚔️</div>"
    + "<div style='font-family:Fredoka One,cursive;font-size:22px;color:var(--sun);margin-bottom:8px'>Challenge Sent!</div>"
    + "<div style='font-size:14px;color:var(--text2);margin-bottom:20px'>Waiting for <strong style='color:var(--mint)'>"+toName+"</strong> to accept...<br><span style='font-size:12px'>(30 seconds)</span></div>"
    + "<div style='background:rgba(255,255,255,0.08);border-radius:100px;height:6px;overflow:hidden;margin-bottom:20px'>"
    + "<div id='challenge-progress-bar' style='width:100%;height:100%;background:linear-gradient(90deg,var(--sun),var(--mint));transition:width 30s linear'></div></div>"
    + "<button onclick='cancelChallenge()' class='btn btn-ghost btn-sm'>Cancel</button>"
    + "</div>";
  document.body.appendChild(overlay);
  setTimeout(function(){ var b=document.getElementById("challenge-progress-bar"); if(b) b.style.width="0%"; }, 100);
  window.sendChallengeTo(toUid, toName);
  window.waitForAcceptance(toUid, toName);
};

window.cancelChallenge = function(){
  var o=document.getElementById("challenge-sending-overlay");
  if(o) o.remove();
  if(window._challengeTimer){ clearTimeout(window._challengeTimer); window._challengeTimer=null; }
  if(window._waitUnsubscribe){ window._waitUnsubscribe(); window._waitUnsubscribe=null; }
  showToast("Challenge cancelled.");
};

// Show incoming challenge popup (FIFA-style)
window.showIncomingChallenge = function(fromUid, fromName, fromGrade, callback){
  // Remove any existing
  var ex = document.getElementById("incoming-challenge-overlay");
  if(ex) ex.remove();
  var overlay = document.createElement("div");
  overlay.id = "incoming-challenge-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9998;display:flex;align-items:center;justify-content:center";
  var countdown = 20;
  overlay.innerHTML = "<div style='background:linear-gradient(135deg,#1C3A6E,#0D1F3C);border:2px solid var(--sun);border-radius:24px;padding:32px;max-width:380px;width:90%;text-align:center'>"
    + "<div style='font-size:16px;letter-spacing:2px;color:var(--mint);font-weight:700;margin-bottom:8px'>INCOMING CHALLENGE</div>"
    + "<div style='font-size:52px;margin-bottom:12px'>⚔️</div>"
    + "<div style='font-family:Fredoka One,cursive;font-size:24px;color:var(--sun);margin-bottom:4px'>"+fromName+"</div>"
    + "<div style='font-size:13px;color:var(--text2);margin-bottom:4px'>"+(fromGrade ? fromGrade+"th Grade" : "")+" · wants to battle you!</div>"
    + "<div style='font-size:28px;font-weight:900;color:var(--sun);margin:16px 0' id='challenge-countdown'>"+countdown+"</div>"
    + "<div style='background:rgba(255,255,255,0.08);border-radius:100px;height:5px;overflow:hidden;margin-bottom:20px'>"
    + "<div id='incoming-prog' style='width:100%;height:100%;background:linear-gradient(90deg,var(--mint),var(--sun));transition:width 20s linear'></div></div>"
    + "<div style='display:flex;gap:10px;justify-content:center'>"
    + "<button onclick='acceptIncoming()' class='btn btn-sun' style='min-width:120px;font-size:16px'>Accept ⚔️</button>"
    + "<button onclick='declineIncoming()' class='btn btn-ghost' style='min-width:100px'>Decline</button>"
    + "</div></div>";
  document.body.appendChild(overlay);
  setTimeout(function(){ var b=document.getElementById("incoming-prog"); if(b) b.style.width="0%"; }, 100);

  var timer = setInterval(function(){
    countdown--;
    var el=document.getElementById("challenge-countdown");
    if(el) el.textContent=countdown;
    if(countdown<=0){
      clearInterval(timer);
      overlay.remove();
      callback(false);
    }
  }, 1000);

  window.acceptIncoming = function(){
    clearInterval(timer);
    overlay.remove();
    callback(true);
  };
  window.declineIncoming = function(){
    clearInterval(timer);
    overlay.remove();
    callback(false);
  };
};

// Enter the REAL-TIME battle room
window.enterRealBattle = function(battleId, role, oppName){
  window.currentBattleId = battleId;
  window.currentBattleRole = role;
  var ba=document.getElementById("battle-arena");
  if(!ba) return;
  ba.style.display="block";
  ba.scrollIntoView({behavior:"smooth",block:"start"});
  var myName = S.name.split(" ")[0];
  var setEl=function(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; };
  setEl("b-my-name", role==="p1"? myName : myName);
  setEl("b-opp-name", oppName);
  setEl("b-my-score","0"); setEl("b-opp-score","0");
  var myAva=document.getElementById("b-my-ava");
  if(myAva){ myAva.textContent=myName[0]; myAva.style.background="linear-gradient(135deg,#1C3A6E,#06D6A0)"; }
  var oppAva=document.getElementById("b-opp-ava");
  if(oppAva){ oppAva.textContent=oppName[0]||"?"; oppAva.style.background="linear-gradient(135deg,#FFD93D,#E8B800)"; }
  var wrap=document.getElementById("battle-q-wrap");
  if(wrap) wrap.innerHTML="<div style='text-align:center;padding:32px;color:var(--text2)'><div style='font-size:36px;margin-bottom:8px'>⚔️</div>Waiting for battle to start...</div>";
  showToast("⚔️ Battle room joined! Get ready!");
};

// Update battle UI from Firestore snapshot
window.updateBattleState = function(data, battleId, role){
  if(!data) return;
  var myScore = role==="p1" ? data.p1Score : data.p2Score;
  var oppScore = role==="p1" ? data.p2Score : data.p1Score;
  var setEl=function(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; };
  setEl("b-my-score", myScore||0);
  setEl("b-opp-score", oppScore||0);
  setEl("b-round-num", data.round||1);

  if(data.status==="finished"){
    window.endRealBattle(data, role);
    return;
  }

  // Check if both answered — if so, advance round (p1 is host)
  var bothAnswered = data.p1Answer != null && data.p2Answer != null;
      if(bothAnswered && role==="p1" && data.status==="active"){
    var p1correct = data.p1Answer===data.answer;
    var p2correct = data.p2Answer===data.answer;
    var newP1 = (data.p1Score||0) + (p1correct?1:0);
    var newP2 = (data.p2Score||0) + (p2correct?1:0);
    var nextData = {round:data.round,totalRounds:data.totalRounds,p1Score:newP1,p2Score:newP2};
    setTimeout(function(){ window.advanceBattleRound(battleId, nextData); }, 1500);
  }

  // Show the question if not yet answered by me
  var myAnswer = role==="p1" ? data.p1Answer : data.p2Answer;
  if(data.question && myAnswer==null){
    window.showBattleQuestion(data, battleId, role);
  } else if(myAnswer!=null && !bothAnswered){
    var wrap=document.getElementById("battle-q-wrap");
    if(wrap) wrap.innerHTML="<div style='text-align:center;padding:20px;color:var(--mint);font-size:16px;font-weight:700'>✅ Answer submitted! Waiting for opponent...</div>";
  }
};

// Show battle question
window.showBattleQuestion = function(data, battleId, role){
  window.roundStartTime = Date.now();
  var wrap=document.getElementById("battle-q-wrap");
  if(!wrap) return;
  wrap.innerHTML = "";
  var roundLabel = document.createElement("div");
  roundLabel.style.cssText = "text-align:center;margin-bottom:12px;font-size:12px;color:var(--text2);letter-spacing:1px";
  roundLabel.textContent = "ROUND " + data.round + " OF " + data.totalRounds;
  wrap.appendChild(roundLabel);
  var qEl = document.createElement("div");
  qEl.style.cssText = "font-size:18px;font-weight:800;text-align:center;margin-bottom:20px;line-height:1.4;color:var(--text)";
  qEl.textContent = data.question;
  wrap.appendChild(qEl);
  var grid = document.createElement("div");
  grid.className = "opts-grid";
  (data.options||[]).forEach(function(opt){
    var btn = document.createElement("button");
    btn.className = "q-opt";
    btn.style.cssText = "font-size:15px;padding:14px;font-weight:700";
    btn.textContent = opt;
    (function(answer){
      btn.addEventListener("click", function(){
        window.submitRealAnswer(battleId, role, answer);
      });
    })(opt);
    grid.appendChild(btn);
  });
  wrap.appendChild(grid);
  var hint = document.createElement("div");
  hint.style.cssText = "text-align:center;margin-top:12px;font-size:12px;color:var(--text2)";
  hint.textContent = "⚡ Answer fast for Speed Bonus!";
  wrap.appendChild(hint);
};
// Submit answer to Firestore
window.submitRealAnswer = function(battleId, role, answer){
  var timeTaken = window.roundStartTime ? (Date.now()-window.roundStartTime)/1000 : 15;
  // Disable all buttons
  document.querySelectorAll(".q-opt").forEach(function(b){ b.disabled=true; b.style.opacity="0.5"; });
  if(window.submitBattleAnswer) window.submitBattleAnswer(battleId, role, answer, timeTaken);
};

// End battle
window.endRealBattle = function(data, role){
  var myScore = role==="p1" ? data.p1Score||0 : data.p2Score||0;
  var oppScore = role==="p1" ? data.p2Score||0 : data.p1Score||0;
  var oppName = role==="p1" ? data.p2Name : data.p1Name;
  var won = myScore > oppScore;
  var tied = myScore === oppScore;
  var wrap=document.getElementById("battle-q-wrap");
  if(wrap){
    wrap.innerHTML="<div style='text-align:center;padding:24px'>"
      +"<div style='font-size:64px;margin-bottom:12px'>"+(won?"👑":tied?"🤝":"💪")+"</div>"
      +"<div style='font-family:Fredoka One,cursive;font-size:28px;color:"+(won?"var(--sun)":tied?"var(--sky)":"var(--coral)")+";margin-bottom:8px'>"
      +(won?"You Win!":tied?"It's a Tie!":"Good Fight!")+"</div>"
      +"<div style='font-size:16px;color:var(--text2);margin-bottom:20px'>"+myScore+" – "+oppScore+" vs "+oppName+"</div>"
      +"<button class='btn btn-sun' onclick='window.endRealBattleCleanup()'>Continue 🎉</button>"
      +"</div>";
  }
  // Award XP and coins
  var xpGain = won?120:tied?60:30;
  var coinGain = won?50:tied?20:10;
  S.xp += xpGain; S.coins += coinGain;
  if(won) S.wins = (S.wins||0)+1;
  saveSession();
  showToast((won?"🏆 Won! ":"")+"+" + xpGain + " XP, +" + coinGain + " coins!");
  // Update presence — no longer in battle
  if(window.auth && window.auth.currentUser && window.db){
    // presence update handled via startPresence
  }
};

window.endRealBattleCleanup = function(){
  var ba=document.getElementById("battle-arena");
  if(ba) ba.style.display="none";
  window.currentBattleId=null; window.currentBattleRole=null;
  // Remove sending overlay if it's there
  var o=document.getElementById("challenge-sending-overlay");
  if(o) o.remove();
};

// BOT BATTLE — always available, uses existing AI logic
window.startBotBattle = function(){
  var bots = [
    {name:"Axiom Bot",emoji:"🤖",bg:"linear-gradient(135deg,#FFD93D,#E8B800)",winRate:0.65},
    {name:"Archimedes",emoji:"📐",bg:"linear-gradient(135deg,#06D6A0,#0D9B70)",winRate:0.75},
    {name:"Euler",emoji:"🔢",bg:"linear-gradient(135deg,#3D8BFF,#1C3A6E)",winRate:0.55}
  ];
  var bot = bots[Math.floor(Math.random()*bots.length)];
  showToast("⚔️ Starting battle vs " + bot.name + "!");
  if(window.startBattleWith) startBattleWith(bot.name, bot.emoji, bot.bg, bot.winRate);
};

// Update renderChallenge to show live players
function renderChallenge(){
  CHALLENGE_FILTER="same";
  // Render live players if available
  if(window.LIVE_PLAYERS !== undefined){
    window.renderLivePlayers(window.LIVE_PLAYERS);
  }
  renderOppList();
  var hist=$$("battle-hist"); if(!hist) return;
  var histData=[
    {o:"Jordan K.",r:"Win",sc:"4/5 vs 3/5",d:"Today",c:"var(--mint)"},
    {o:"Riley M.",r:"Loss",sc:"2/5 vs 4/5",d:"Yesterday",c:"var(--coral)"},
    {o:"Sam P.",r:"Win",sc:"5/5 vs 2/5",d:"Mar 21",c:"var(--mint)"}
  ];
  var html="";
  histData.forEach(function(h){
    html+="<div class='hist-row'><div class='hist-dot' style='background:"+h.c+"'></div>"
      +"<div style='flex:1'><div style='font-size:14px;font-weight:800'>vs "+h.o+"</div>"
      +"<div style='font-size:12px;color:var(--text2)'>"+h.sc+" - "+h.d+"</div></div>"
      +"<span class='badge "+(h.r==="Win"?"b-mint":"b-coral")+"'>"+h.r+"</span></div>";
  });
  hist.innerHTML=html;
}

function challengeOpp(name,emoji,bg,winRate){
  winRate=parseFloat(winRate)||0.72;
  showToast("Challenge sent to "+name+"!");
  startBattleWith(name,emoji,bg,winRate);
}

function startBattle(){
  var o=OPPS[Math.floor(Math.random()*OPPS.length)];
  startBattleWith(o.n,o.e,o.bg,o.winRate||0.72);
}

async function startBattleWith(name,emoji,bg,winRate){
  var bs={opp:{name:name,emoji:emoji,winRate:winRate},myScore:0,oppScore:0,round:0,active:true,qs:[],timeLeft:30,timer:null};
  S.battleState=bs;
  var ba=$$("battle-arena"); if(ba){ ba.style.display="block"; ba.scrollIntoView({behavior:"smooth",block:"nearest"}); }
  var setEl=function(id,v){ var e=$$(id); if(e) e.textContent=v; };
  var fn=S.name.split(" ")[0]||"You";
  setEl("b-my-name",fn); setEl("b-opp-name",name); setEl("b-my-score","0"); setEl("b-opp-score","0");
  var myAva=$$("b-my-ava"); if(myAva){ myAva.textContent=fn[0]; myAva.style.background="linear-gradient(135deg,var(--purple),var(--sky))"; }
  var oppAva=$$("b-opp-ava"); if(oppAva){ oppAva.textContent=emoji; oppAva.style.background=bg; }
  var wrap=$$("battle-q-wrap"); if(wrap) wrap.innerHTML="<div style='text-align:center;padding:24px'>Loading battle...</div>";
  var aiQs=await genAIQuestions(S.gradeNum,2,"challenge");
  bs.qs=[];
  for(var i=0;i<5;i++) bs.qs.push(getRandQ(S.gradeNum));
  if(aiQs) bs.qs=bs.qs.slice(0,3).concat(aiQs.slice(0,2));
  bs.qs=shuffle(bs.qs).slice(0,5);
  nextBattleRound(bs);
}

function nextBattleRound(bs){
  if(!bs||bs.round>=bs.qs.length){ endBattle(bs); return; }
  var q=bs.qs[bs.round];
  var rEl=$$("b-round"); if(rEl) rEl.textContent="ROUND "+(bs.round+1)+" of "+bs.qs.length;
  bs.timeLeft=30; clearInterval(bs.timer);
  updateBTimer(bs);
  bs.timer=setInterval(function(){
    bs.timeLeft--; updateBTimer(bs);
    if(bs.timeLeft<=0){
      clearInterval(bs.timer);
      if(Math.random()<bs.opp.winRate){ bs.oppScore++; var os=$$("b-opp-score"); if(os) os.textContent=bs.oppScore; }
      bs.round++; setTimeout(function(){ nextBattleRound(bs); },800);
    }
  },1000);
  var wrap=$$("battle-q-wrap"); if(!wrap) return;
  var letters=["A","B","C","D"];
  var div=document.createElement("div"); div.style.cssText="background:rgba(0,0,0,0.3);border-radius:14px;padding:18px;margin-bottom:12px;";
  div.innerHTML="<div class='q-topic'>"+(q.topic||"Math")+"</div><div class='q-text'>"+q.q+"</div>";
  var optsDiv=document.createElement("div"); optsDiv.className="q-opts";
  (q.a||[]).forEach(function(ans,i){
    var btn=document.createElement("button"); btn.className="q-opt";
    btn.innerHTML="<span class='opt-letter'>"+letters[i]+"</span>"+ans;
    btn.addEventListener("click",function(){ battleAnswer(i,q.c,btn,bs); });
    optsDiv.appendChild(btn);
  });
  div.appendChild(optsDiv);
  wrap.innerHTML=""; wrap.appendChild(div);
}

function updateBTimer(bs){
  var el=$$("b-timer"); if(!el) return;
  el.textContent="0:"+String(bs.timeLeft).padStart(2,"0");
  el.style.color=bs.timeLeft<=10?"var(--coral)":"var(--sun)";
}

function battleAnswer(sel,correct,btn,bs){
  var timeUsed = 30 - bs.timeLeft;
  clearInterval(bs.timer);
  var opts=document.querySelectorAll("#battle-q-wrap .q-opt");
  opts.forEach(function(o){ o.disabled=true; });
  if(sel===correct){
    btn.classList.add("correct"); bs.myScore++;
    var speedBonus = timeUsed <= 5 ? " 🚀 Speed Bonus!" : timeUsed <= 10 ? " ⚡ Fast!" : "";
    var ms=$$("b-my-score"); if(ms) ms.textContent=bs.myScore;
    showToast("Correct!"+speedBonus+" +1 point");
    // Opponent is slower — they might get it wrong when you're fast
    var oppCorrect = Math.random() < (bs.opp.winRate * (timeUsed > 15 ? 1.2 : 0.7));
    if(oppCorrect){ bs.oppScore++; var os=$$("b-opp-score"); if(os) os.textContent=bs.oppScore; }
  } else {
    btn.classList.add("wrong");
    if(opts[correct]) opts[correct].classList.add("correct");
    // Opponent more likely to get it right when you're wrong
    if(Math.random()<bs.opp.winRate){ bs.oppScore++; var os2=$$("b-opp-score"); if(os2) os2.textContent=bs.oppScore; }
  }
  bs.round++; setTimeout(function(){ nextBattleRound(bs); },1400);
}

function endBattle(bs){
  if(!bs) return;
  clearInterval(bs.timer);
  var win=bs.myScore>bs.oppScore, tie=bs.myScore===bs.oppScore;
  var xp=win?200:tie?100:50, coins=win?150:tie?75:25;
  S.xp+=xp; S.coins+=coins; saveSession();
  var wrap=$$("battle-q-wrap"); if(!wrap) return;
  var msg=win?"Victory!":tie?"Draw!":"Keep Training!";
  var div=document.createElement("div"); div.style.textAlign="center"; div.style.padding="24px";
  div.innerHTML="<div style='font-size:48px;margin-bottom:12px'>"+msg+"</div>"
    +"<div style='font-size:26px;font-weight:800;color:var(--sun);margin-bottom:8px'>"+msg+"</div>"
    +"<div style='font-size:16px;margin-bottom:16px'>"+bs.myScore+" - "+bs.oppScore+" vs "+bs.opp.name+"</div>"
    +"<div style='display:flex;gap:10px;justify-content:center;margin-bottom:16px;flex-wrap:wrap'>"
    +"<span class='badge b-sun'>+"+xp+" XP</span><span class='badge b-mint'>+"+coins+" MathCoins</span></div>";
  var btnRow=document.createElement("div"); btnRow.style.cssText="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;";
  var b1=document.createElement("button"); b1.className="btn btn-coral btn-sm"; b1.textContent="Rematch";
  b1.addEventListener("click",startBattle);
  var b2=document.createElement("button"); b2.className="btn btn-ghost btn-sm"; b2.textContent="Close";
  b2.addEventListener("click",function(){ var ba=$$("battle-arena"); if(ba) ba.style.display="none"; });
  btnRow.appendChild(b1); btnRow.appendChild(b2); div.appendChild(btnRow);
  wrap.innerHTML=""; wrap.appendChild(div);
  showToast(win?"Victory! +"+coins+" MathCoins":"Good fight! +"+xp+" XP");
}

// ── SEARCH ─────────────────────────────────────────────
function searchPlayers(queryStr){
  var resultsEl=$$("player-search-results"); if(!resultsEl) return;
  if(!queryStr||queryStr.length<2){
    resultsEl.innerHTML=""; return;
  }
  // Show loading state
  resultsEl.innerHTML="<div style='color:var(--text2);font-size:13px;padding:10px;text-align:center'>Searching...</div>";

  if(window.searchRegisteredUsers){
    // Search Firestore — all registered students
    window.searchRegisteredUsers(queryStr).then(function(matches){
      resultsEl.innerHTML="";
      if(matches.length===0){
        var d=document.createElement("div");
        d.style.cssText="color:var(--text2);font-size:13px;padding:12px;text-align:center";
        d.innerHTML="<div style='font-size:24px;margin-bottom:6px'>&#x1F50D;</div>No registered students found for <strong>"+queryStr+"</strong><br><span style='font-size:11px'>Only MathCrown members appear in search</span>";
        resultsEl.appendChild(d);
        return;
      }
      matches.slice(0,8).forEach(function(p){
        var row=document.createElement("div");
        var isOnline=p.online && !p.inBattle;
        var isBusy=p.online && p.inBattle;
        var borderColor=isOnline?"rgba(6,214,160,0.3)":"rgba(255,255,255,0.08)";
        var bgColor=isOnline?"rgba(6,214,160,0.05)":"rgba(255,255,255,0.03)";
        var gradeLabel=p.grade?p.grade+"th Grade":"K-12";
        var statusDot=isOnline
          ?"<span style='display:inline-block;width:8px;height:8px;background:var(--mint);border-radius:50%;margin-right:4px'></span><span style='color:var(--mint);font-weight:700'>Online now</span>"
          :isBusy
          ?"<span style='display:inline-block;width:8px;height:8px;background:var(--coral);border-radius:50%;margin-right:4px'></span><span style='color:var(--coral)'>In battle</span>"
          :"<span style='display:inline-block;width:8px;height:8px;background:var(--text2);border-radius:50%;margin-right:4px'></span><span style='color:var(--text2)'>Offline</span>";
        var btnLabel=isOnline?"Challenge &#x2694;&#xFE0F;":isBusy?"Busy":"Practice";
        var btnClass=isOnline?"btn btn-coral btn-xs":"btn btn-ghost btn-xs";
        row.style.cssText="display:flex;align-items:center;gap:10px;padding:10px 12px;"
          +"background:"+bgColor+";border:1px solid "+borderColor+";"
          +"border-radius:12px;margin-bottom:6px;cursor:pointer";
        row.innerHTML="<div style='position:relative'>"
          +"<div style='width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#1C3A6E,#06D6A0);"
          +"display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;font-size:15px'>"
          +p.avatar+"</div>"
          +(p.online?"<div style='position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;background:"+(isBusy?"var(--coral)":"var(--mint)")+";border:2px solid var(--dark2)'></div>":"")
          +"</div>"
          +"<div style='flex:1;min-width:0'>"
          +"<div style='font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>"+p.name+"</div>"
          +"<div style='font-size:11px;margin-top:2px'>"+statusDot+" &middot; "+gradeLabel+" &middot; Level "+p.level+"</div>"
          +"</div>"
          +"<button class='"+btnClass+"' "+(isBusy?"disabled":"")
          +" style='flex-shrink:0'>"+btnLabel+"</button>";
        var btn=row.querySelector("button");
        if(btn && !isBusy){
          (function(uid,name,online){
            var handler=function(e){
              e.stopPropagation();
              if(online){
                window.challengeRealPlayer(uid,name);
              } else {
                showToast(name+" is offline — starting a practice battle!");
                window.startBotBattle();
              }
            };
            btn.addEventListener("click",handler);
            row.addEventListener("click",handler);
          })(p.uid,p.name,isOnline);
        }
        resultsEl.appendChild(row);
      });
    }).catch(function(){
      // Firestore unavailable — fall back to live players only
      resultsEl.innerHTML="";
      var q2=queryStr.toLowerCase();
      var liveOnly=(window.LIVE_PLAYERS||[]).filter(function(p){
        return p.name && p.name.toLowerCase().indexOf(q2)>-1 && p.name!==S.name;
      });
      if(liveOnly.length===0){
        resultsEl.innerHTML="<div style='color:var(--text2);font-size:13px;padding:10px;text-align:center'>No results found</div>";
      } else {
        liveOnly.forEach(function(p){
          var d=document.createElement("div");
          d.style.cssText="padding:10px;background:rgba(6,214,160,0.05);border-radius:10px;margin-bottom:6px;cursor:pointer";
          d.textContent=p.name+" (online)";
          d.addEventListener("click",function(){ window.challengeRealPlayer(p.uid,p.name); });
          resultsEl.appendChild(d);
        });
      }
    });
  } else {
    // Module not ready yet — search live players only
    resultsEl.innerHTML="";
    var qFb=queryStr.toLowerCase();
    var fb=(window.LIVE_PLAYERS||[]).filter(function(p){
      return p.name && p.name.toLowerCase().indexOf(qFb)>-1 && p.name!==S.name;
    });
    if(fb.length===0){
      resultsEl.innerHTML="<div style='color:var(--text2);font-size:13px;padding:10px;text-align:center'>Connecting to server...</div>";
    } else {
      fb.forEach(function(p){
        var d=document.createElement("div");
        d.style.cssText="padding:10px;background:rgba(6,214,160,0.05);border-radius:10px;margin-bottom:6px;cursor:pointer";
        d.textContent=p.name+" (online)";
        d.addEventListener("click",function(){ window.challengeRealPlayer(p.uid,p.name); });
        resultsEl.appendChild(d);
      });
    }
  }
}

function selectPlayerChallenge(name){
  var input=$$("search-player-input"); if(input) input.value=name;
  var r=$$("player-search-results"); if(r) r.innerHTML="";
  showToast("Challenge sent to "+name+"!");
  var opp=OPPS.find(function(o){ return o.n===name; });
  if(opp) startBattleWith(opp.n,opp.e,opp.bg,opp.winRate);
  else startBattle();
}

function sendDirectChallenge(){
  var input=$$("search-player-input"); var name=input?input.value.trim():"";
  if(!name){ showToast("Type a student name to challenge!"); return; }
  // Check if typed name matches a real live player
  var liveMatch = window.LIVE_PLAYERS && window.LIVE_PLAYERS.find(function(p){
    return p.name && p.name.toLowerCase()===name.toLowerCase();
  });
  if(liveMatch){
    window.challengeRealPlayer(liveMatch.uid, liveMatch.name);
  } else {
    showToast(name+" is not online right now. Starting practice battle!");
    window.startBotBattle();
  }
}

// ── LEADERBOARD ────────────────────────────────────────
function setLBTab(tab,btn){
  document.querySelectorAll(".lb-tab").forEach(function(t){ t.classList.remove("on"); });
  if(btn) btn.classList.add("on");
  window.currentLBTab = tab;
  var gb=document.getElementById("lb-grade-btn");
  if(gb) gb.textContent="\u{1F3EB} My Grade ("+(S.gradeNum||7)+"th)";
  renderLeaderboard();
}

function renderLeaderboard(){
  var tab=window.currentLBTab||"grade";
  var gn=S.gradeNum||7;
  var gl=gn+"th";
  var BASE=[
    {n:"Jordan K.",g:gl,  pts:5820,e:"J",chg:"+2",up:true},
    {n:"Sam P.",   g:gl,  pts:5410,e:"S",chg:"+1",up:true},
    {n:"Riley M.", g:gl,  pts:5200,e:"R",chg:"0", up:false},
    {n:"Alex J.",  g:gl,  pts:3240,e:"A",chg:"+3",up:true},
    {n:"Casey T.", g:gl,  pts:3100,e:"C",chg:"-1",up:false},
    {n:"Morgan L.",g:gl,  pts:2980,e:"M",chg:"+4",up:true},
    {n:"Taylor B.",g:gl,  pts:2750,e:"T",chg:"-2",up:false},
    {n:"Drew K.",  g:gl,  pts:2640,e:"D",chg:"+5",up:true}
  ];
  var ALL=[
    {n:"Priya S.", g:"11th",pts:8200,e:"P",chg:"+3",up:true},
    {n:"Sam P.",   g:"7th", pts:7500,e:"S",chg:"+1",up:true},
    {n:"Jordan K.",g:"5th", pts:6800,e:"J",chg:"+2",up:true},
    {n:"Riley M.", g:"9th", pts:5200,e:"R",chg:"0", up:false},
    {n:"Alex J.",  g:"11th",pts:4800,e:"A",chg:"+4",up:true},
    {n:"Casey T.", g:"3rd", pts:4100,e:"C",chg:"-1",up:false},
    {n:"Morgan L.",g:"6th", pts:3900,e:"M",chg:"+2",up:true},
    {n:"Taylor B.",g:"10th",pts:3200,e:"T",chg:"-2",up:false}
  ];
  var NAT=[
    {n:"Mathew K.",g:"12th",pts:18200,e:"M",chg:"+1",up:true},
    {n:"Priya S.", g:"11th",pts:15800,e:"P",chg:"+2",up:true},
    {n:"Jordan K.",g:"5th", pts:14200,e:"J",chg:"+3",up:true},
    {n:"Devon R.", g:"9th", pts:11900,e:"D",chg:"0", up:false},
    {n:"Sam P.",   g:"7th", pts:10500,e:"S",chg:"+1",up:true},
    {n:"Riley M.", g:"8th", pts:9800, e:"R",chg:"-1",up:false},
    {n:"Alex J.",  g:"10th",pts:8700, e:"A",chg:"+2",up:true},
    {n:"Casey T.", g:"3rd", pts:7200, e:"C",chg:"+1",up:true}
  ];
  var WK=[
    {n:"Taylor B.",g:"10th",pts:980, e:"T",chg:"+5",up:true},
    {n:"Casey T.", g:"3rd", pts:840, e:"C",chg:"+3",up:true},
    {n:"Jordan K.",g:"5th", pts:720, e:"J",chg:"-1",up:false},
    {n:"Morgan L.",g:"6th", pts:680, e:"M",chg:"+2",up:true},
    {n:"Sam P.",   g:"7th", pts:590, e:"S",chg:"0", up:false},
    {n:"Alex J.",  g:"11th",pts:510, e:"A",chg:"+4",up:true},
    {n:"Drew K.",  g:"8th", pts:480, e:"D",chg:"-2",up:false},
    {n:"Riley M.", g:"9th", pts:420, e:"R",chg:"+1",up:true}
  ];
  var DATA=tab==="national"?NAT:tab==="school"?ALL:tab==="weekly"?WK:BASE;
  var colors=["linear-gradient(135deg,var(--sun),var(--sun2))","linear-gradient(135deg,#c0c0c0,#a0a0a0)","linear-gradient(135deg,#cd7f32,#a06020)"];
  var pod=$$("lb-podium");
  if(pod){
    var order=[1,0,2], html="";
    order.forEach(function(i){
      var p=DATA[i];
      html+="<div class='podium-place'>"
        +"<div class='pod-crown'>"+(i===0?"1st":i===1?"2nd":"3rd")+"</div>"
        +"<div class='pod-avatar' style='background:"+colors[i]+";color:var(--dark);font-size:20px;font-weight:900'>"+p.e+"</div>"
        +"<div class='pod-name'>"+p.n+"</div>"
        +"<div class='pod-pts'>"+p.pts.toLocaleString()+"</div>"
        +"<div class='pod-block' style='background:"+colors[i]+";height:"+(i===0?"100px":i===1?"80px":"65px")+";width:100%;border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900'>#"+(i+1)+"</div>"
        +"</div>";
    });
    pod.innerHTML=html;
  }
  var full=$$("lb-full");
  if(full){
    var fhtml="";
    DATA.forEach(function(p,i){
      var rank=i===0?"1st":i===1?"2nd":i===2?"3rd":"#"+(i+1);
      fhtml+="<div class='lb-row'><div class='lb-rank'>"+rank+"</div>"
        +"<div class='lb-emo' style='background:rgba(255,255,255,0.08)'>"+p.e+"</div>"
        +"<div class='lb-info'><div class='lb-name'>"+p.n+"</div><div class='lb-grade'>"+p.g+"</div></div>"
        +"<div class='lb-pts-wrap'><div class='lb-pts'>"+p.pts.toLocaleString()+"</div>"
        +"<div class='lb-chg "+(p.up?"chg-up":"chg-dn")+"'>"+p.chg+"</div></div></div>";
    });
    full.innerHTML=fhtml;
  }
}

// ── TOURNAMENTS ────────────────────────────────────────
function renderTournaments(){
  var el=$$("tourn-list"); if(!el) return;
  var html="";
  TOURNAMENTS.forEach(function(t){
    html+="<div class='t-card "+t.color+"'><div class='t-card-row'>"
      +"<div><div class='t-name'>"+t.n+"</div><div class='t-meta'>"+t.date+" - "+t.spots+" - "+t.grades+"</div></div>"
      +"<div><div class='t-prize'>"+t.prize+"</div><div class='t-pplace'>1st place</div></div>"
      +"</div></div>";
  });
  el.innerHTML=html;
}

// ── AI TUTOR ───────────────────────────────────────────
function renderTutor(){
  var qp=$$("quick-prompts"); if(!qp) return;
  qp.innerHTML="";
  QUICK_PROMPTS.forEach(function(p){
    var card=document.createElement("div"); card.className="card card-purple skill-card"; card.style.cursor="pointer";
    card.setAttribute("data-prompt",p.t);
    card.addEventListener("click",function(){ askTutor(this.getAttribute("data-prompt")); });
    card.innerHTML="<span class='skill-icon'>"+p.emoji+"</span><div class='skill-name'>"+p.t+"</div>";
    qp.appendChild(card);
  });
}

function askTutor(prompt){ var input=$$("chat-input"); if(input){ input.value=prompt; sendMsg(); } }

async function sendMsg(){
  var input=$$("chat-input"), chat=$$("chat-box");
  if(!input||!chat) return;
  var msg=input.value.trim(); if(!msg) return;
  input.value="";
  chat.innerHTML+="<div class='chat-msg chat-user'><div class='chat-who chat-who-user'>You</div>"+msg+"</div>";
  var thinking=document.createElement("div"); thinking.className="chat-msg chat-bot";
  thinking.innerHTML="<div class='chat-who chat-who-bot'>Axiom</div><span style='color:var(--text2)'>Thinking...</span>";
  chat.appendChild(thinking); chat.scrollTop=chat.scrollHeight;
  try{
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,
        system:"You are Axiom, the AI math coach for MathCrown at mymathcrown.com — the K-12 competitive math platform. Student: "+S.name+", "+S.grade+". Keep responses to 3-5 sentences. Be encouraging and clear.",
        messages:[{role:"user",content:msg}]})
    });
    var d=await r.json();
    var reply=((d.content||[{text:"I am offline right now!"}])[0].text||"");
    thinking.innerHTML="<div class='chat-who chat-who-bot'>Axiom</div>"+reply;
  }catch(e){
    thinking.innerHTML="<div class='chat-who chat-who-bot'>Axiom</div>Axiom is taking a break! Try again soon.";
  }
  chat.scrollTop=chat.scrollHeight;
}

// ── PRACTICE ───────────────────────────────────────────
function renderPractice(){
  var el=$$("topic-picker"); if(!el) return;
  el.innerHTML="";
  var band=QUESTION_BANK[gradeBand(S.gradeNum)];
  Object.keys(band).forEach(function(t){
    var card=document.createElement("div"); card.className="card skill-card"; card.style.cursor="pointer";
    card.setAttribute("data-topic",t);
    card.addEventListener("click",function(){ startPractice(this.getAttribute("data-topic")); });
    card.innerHTML="<span class='skill-icon'>"+(t[0]||"?")+"</span><div class='skill-name'>"+t+"</div><div style='font-size:12px;color:var(--text2)'>"+band[t].length+"+ questions</div>";
    el.appendChild(card);
  });
  var pa=$$("practice-arena"); if(pa) pa.style.display="none";
}

async function startPractice(topic){
  var pa=$$("practice-arena"); if(!pa) return;
  pa.style.display="block"; pa.scrollIntoView({behavior:"smooth"});
  practiceSession={qs:[],idx:0,correct:0,loading:true};
  var wrap=$$("practice-q-wrap"); if(wrap) wrap.innerHTML="<div style='text-align:center;padding:32px'>Loading "+topic+" questions...</div>";
  var band=QUESTION_BANK[gradeBand(S.gradeNum)];
  var qs=(band[topic]||[]).map(function(q){ return {q:q.q,a:q.a,c:q.c,topic:topic,src:"Question Bank",ai:false,explanation:""}; });
  var aiQs=await genAIQuestions(S.gradeNum,3,"practice");
  if(aiQs) qs=qs.concat(aiQs);
  practiceSession.qs=shuffle(qs).slice(0,5); practiceSession.loading=false;
  renderPracticeQ();
}

function renderPracticeQ(){
  var wrap=$$("practice-q-wrap"); if(!wrap) return;
  if(practiceSession.idx>=practiceSession.qs.length){ showPracticeResult(); return; }
  var q=practiceSession.qs[practiceSession.idx], total=practiceSession.qs.length;
  var dots="";
  for(var d=0;d<total;d++) dots+="<div class='q-dot "+(d<practiceSession.idx?"done":d===practiceSession.idx?"curr":"")+"'></div>";
  wrap.innerHTML="<div class='q-header'><div class='q-dots'>"+dots+"</div>"
    +"<div class='timer-ring' id='p-timer-ring' style='--p:100'><div class='timer-inner' id='p-timer-num'>15</div></div></div>"
    +"<div class='q-topic'>"+q.topic+" - Q"+(practiceSession.idx+1)+"/"+total+"</div>"
    +"<div class='q-text'>"+q.q+"</div>"
    +"<div class='q-opts' id='p-opts'></div>";
  var pOpts=$$("p-opts"), letters=["A","B","C","D"];
  (q.a||[]).forEach(function(ans,i){
    var btn=document.createElement("button"); btn.className="q-opt";
    btn.innerHTML="<span class='opt-letter'>"+letters[i]+"</span>"+ans;
    btn.addEventListener("click",function(){ answerPractice(i,q.c,btn); });
    pOpts.appendChild(btn);
  });
  var ptv=15;
  clearInterval(practiceTimer);
  practiceTimer=setInterval(function(){
    ptv--;
    var nr=$$("p-timer-num"),rr=$$("p-timer-ring");
    if(nr) nr.textContent=ptv;
    if(rr) rr.style.setProperty("--p",ptv/15*100);
    if(nr) nr.style.color=ptv<=5?"var(--coral)":"var(--sun)";
    if(ptv<=0){
      clearInterval(practiceTimer);
      var opts=document.querySelectorAll("#p-opts .q-opt");
      opts.forEach(function(o,i){ if(i===practiceSession.qs[practiceSession.idx].c) o.classList.add("reveal"); o.disabled=true; });
      practiceSession.idx++; setTimeout(renderPracticeQ,1600);
    }
  },1000);
}

function answerPractice(sel,correct,btn){
  clearInterval(practiceTimer);
  document.querySelectorAll("#p-opts .q-opt").forEach(function(o){ o.disabled=true; });
  var right=sel===correct;
  if(right){ btn.classList.add("correct"); practiceSession.correct++; S.coins+=8; showToast("Correct! +8 MathCoins"); }
  else{ btn.classList.add("wrong"); var opts=document.querySelectorAll("#p-opts .q-opt"); if(opts[correct]) opts[correct].classList.add("correct"); }
  practiceSession.idx++; setTimeout(renderPracticeQ, right?1800:2400);
}

function showPracticeResult(){
  clearInterval(practiceTimer);
  var c=practiceSession.correct, t=practiceSession.qs.length, pct=Math.round(c/t*100);
  S.xp+=c*40; S.coins+=c*8; saveSession();
  var wrap=$$("practice-q-wrap"); if(!wrap) return;
  var msg=pct===100?"Perfect!":pct>=70?"Great Job!":"Keep Going!";
  var div=document.createElement("div"); div.className="result-card";
  div.innerHTML="<div style='font-size:48px;margin-bottom:12px'>"+msg+"</div>"
    +"<div style='font-family:Fredoka One,cursive;font-size:26px;color:var(--sun)'>"+msg+"</div>"
    +"<div style='color:var(--text2);margin-bottom:16px'>"+c+"/"+t+" correct - "+pct+"%</div>"
    +"<div class='result-grid'><div class='result-box'><div class='result-val' style='color:var(--sun)'>+"+(c*40)+"</div><div class='result-key'>XP</div></div>"
    +"<div class='result-box'><div class='result-val' style='color:var(--mint)'>+"+(c*8)+"</div><div class='result-key'>MathCoins</div></div></div>";
  var btnRow=document.createElement("div"); btnRow.style.cssText="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;";
  var b1=document.createElement("button"); b1.className="btn btn-sun btn-sm"; b1.textContent="Pick Another Topic";
  b1.addEventListener("click",renderPractice);
  var b2=document.createElement("button"); b2.className="btn btn-ghost btn-sm"; b2.textContent="Try Daily Trivia";
  b2.addEventListener("click",function(){ goPage("room",null); });
  btnRow.appendChild(b1); btnRow.appendChild(b2); div.appendChild(btnRow);
  wrap.innerHTML=""; wrap.appendChild(div);
}

// ── WALLET ─────────────────────────────────────────────
function renderWallet(){
  var wc=$$("wallet-coins"); if(wc) wc.textContent=S.coins.toLocaleString();
  var cg=$$("coin-guide");
  if(cg){
    var html="";
    COIN_GUIDE.forEach(function(c){
      html+="<div style='display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)'>"
        +"<div style='width:32px;height:32px;border-radius:10px;background:rgba(255,217,61,0.1);display:flex;align-items:center;justify-content:center;font-weight:900;flex-shrink:0'>"+c.i+"</div>"
        +"<div style='flex:1;font-size:13px;font-weight:700'>"+c.a+"</div>"
        +"<div class='badge b-sun'>"+c.c+"</div></div>";
    });
    cg.innerHTML=html;
  }
  var ps=$$("prize-store");
  if(ps){
    ps.innerHTML="";
    PRIZES.forEach(function(p){
      var card=document.createElement("div"); card.className="card prize-card"; card.style.cursor="pointer";
      card.setAttribute("data-msg",p.n+" costs "+p.cost+" MathCoins - parent redeems!");
      card.addEventListener("click",function(){ showToast(this.getAttribute("data-msg")); });
      card.innerHTML="<div class='prize-emo'>"+p.e+"</div><div class='prize-name'>"+p.n+"</div><div class='prize-cost'>"+p.cost+" coins</div><div style='font-size:11px;color:var(--text2);margin-top:2px'>"+p.val+"</div>";
      ps.appendChild(card);
    });
  }
  var eg=$$("earnings");
  if(eg){
    var ehtml="";
    EARNINGS_LOG.forEach(function(e){
      ehtml+="<div class='earn-row'><div class='earn-icon' style='background:rgba(255,255,255,0.06)'>"+e.i+"</div>"
        +"<div style='flex:1'><div style='font-size:14px;font-weight:800'>"+e.d+"</div><div style='font-size:12px;color:var(--text2)'>"+e.date+"</div></div>"
        +"<div style='font-size:16px;font-weight:800;color:"+e.color+"'>"+e.a+"</div></div>";
    });
    eg.innerHTML=ehtml;
  }
}

// ── SKILLS ─────────────────────────────────────────────
function renderSkills(){
  var el=$$("skills-grid"); if(!el) return;
  el.innerHTML="";
  SKILLS_DATA.forEach(function(s){
    var card=document.createElement("div");
    card.className="card skill-card"+(s.unlocked?"":" skill-locked");
    card.style.cursor=s.unlocked?"pointer":"default";
    if(s.unlocked) card.addEventListener("click",function(){ showToast("Practice "+s.n+" - go to Practice Mode!"); });
    var bar=s.unlocked
      ?"<div class='prog-wrap'><div class='prog-fill' style='width:"+s.m+"%;background:"+(s.m>80?"var(--mint)":s.m>60?"var(--sun)":"var(--coral)")+"'></div></div><div class='skill-pct'>"+s.m+"% mastery</div>"
      :"<span class='badge b-purple' style='margin-top:6px'>Locked</span>";
    card.innerHTML="<span class='skill-icon'>"+s.i+"</span><div class='skill-name'>"+s.n+"</div>"+bar;
    el.appendChild(card);
  });
}

// ── PROFILE ────────────────────────────────────────────
function copyLinkCode(){
  var code=S.linkCode||"N/A";
  if(navigator.clipboard){
    navigator.clipboard.writeText(code).then(function(){
      showToast("Code copied! Share with your parent.");
    });
  } else { showToast("Your link code: "+code); }
}

function renderProfile(){
  var codeEl=$$("profile-link-code");
  if(codeEl) codeEl.textContent=S.linkCode||"------";
  var setEl=function(id,v){ var e=$$(id); if(e) e.textContent=v; };
  setEl("prof-ava", S.name?S.name[0].toUpperCase():"?");
  setEl("prof-name", S.name||"Sign up to create your profile");
  setEl("prof-grade", S.grade?(S.grade+" - Math Champ"):"Sign up free to get started");
  var pb=$$("prof-badges-row");
  if(pb){
    var tier=S.level>=10?"Diamond":S.level>=7?"Gold":S.level>=4?"Silver":"Beginner";
    pb.innerHTML="<span class='badge b-mint'>"+tier+"</span>"+(S.streak>=5?"<span class='badge b-coral'>Streak Master</span>":"")+(S.isPreview?"<span class='badge b-purple'>Preview</span>":"");
  }
  var stats=[
    ["Total XP",S.xp.toLocaleString()+" XP"],["Level","Level "+S.level],
    ["Day Streak",S.streak+" days"],["MathCoins",S.coins.toLocaleString()+" coins"],
    ["Grade",S.grade||"Not set"],["Challenges Won","Play to earn wins!"]
  ];
  var allStats=$$("all-stats");
  if(allStats){
    var html="";
    stats.forEach(function(sv){
      html+="<div style='display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)'>"
        +"<span style='font-size:14px;color:var(--text2)'>"+sv[0]+"</span>"
        +"<span style='font-size:16px;font-weight:800'>"+sv[1]+"</span></div>";
    });
    allStats.innerHTML=html;
  }
  var achs=$$("achievements");
  if(achs){
    var ahtml="";
    ACHIEVEMENTS_DATA.forEach(function(a){
      ahtml+="<div class='ach-row "+(a.unlocked?"":"ach-locked")+"'>"
        +"<div class='ach-icon' style='background:"+a.bg+"'>"+a.i+"</div>"
        +"<div style='flex:1'><div class='ach-name'>"+a.n+"</div><div class='ach-desc'>"+a.d+"</div></div>"
        +"<span class='badge "+(a.unlocked?"b-mint":"b-purple")+"'>"+(a.unlocked?"Done":"Locked")+"</span></div>";
    });
    achs.innerHTML=ahtml;
  }
}

// ── PARENT DASHBOARD ───────────────────────────────────
function renderParentDash(){
  var setEl=function(id,v){ var e=$$(id); if(e) e.textContent=v; };
  setEl("p-dash-name",PARENT.name||"Parent Account");
  setEl("p-dash-plan","Plan: "+PARENT.plan);
  var pa=$$("p-dash-avatar"); if(pa) pa.textContent=(PARENT.name?PARENT.name[0].toUpperCase():"P");
  var cb=$$("p-dash-children-badge"); if(cb) cb.textContent=PARENT.children.length+" Children Linked";
  var list=$$("p-children-list"); if(!list) return;
  var demoChild={name:"Your Child",grade:"7th",age:13,level:4,xp:1240,coins:620,streak:3,wins:12,topics_weak:["Fractions","Word Problems"],topics_strong:["Algebra","Geometry"],activity:[{txt:"Answered 12 trivia questions",time:"Today",color:"var(--mint)"},{txt:"Won challenge vs Jordan K.",time:"Today",color:"var(--mint)"},{txt:"Asked Axiom about fractions",time:"Yesterday",color:"var(--sky)"}]};
  var children=PARENT.children.length>0?PARENT.children:[demoChild];
  list.innerHTML="";
  if(PARENT.children.length===0){
    var linkBox=document.createElement("div"); linkBox.className="link-child-box";
    linkBox.setAttribute("onclick","showLinkChildModal()");
    linkBox.innerHTML="<div style='font-size:32px;margin-bottom:10px'>+</div><div style='font-size:15px;font-weight:800;margin-bottom:6px'>Link Your Child Account</div><div style='font-size:13px;color:var(--text2)'>Tap to connect your child to see their real progress</div>";
    linkBox.addEventListener("click",showLinkChildModal);
    list.appendChild(linkBox);
    var previewLabel=document.createElement("div"); previewLabel.style.cssText="font-size:12px;color:var(--text2);margin-bottom:12px;text-align:center"; previewLabel.textContent="Preview below:"; list.appendChild(previewLabel);
  }
  children.forEach(function(child){ list.appendChild(buildChildCard(child, PARENT.children.length===0)); });
  renderPrizeQueue();
}

function buildChildCard(child, isDemo){
  var card=document.createElement("div"); card.className="child-card";
  var demoTag=isDemo?"<span class='badge b-purple' style='font-size:10px;margin-left:6px'>PREVIEW</span>":"";
  var ageNote=child.age<13?"<span class='badge b-coral' style='font-size:10px'>COPPA Protected</span>":child.age<16?"<span class='badge b-sky' style='font-size:10px'>Prizes to Parent</span>":"<span class='badge b-purple' style='font-size:10px'>Teen Wallet Eligible</span>";
  var weakHtml="", strongHtml="";
  (child.topics_weak||[]).forEach(function(t){ weakHtml+="<span class='badge b-coral' style='font-size:11px;margin-right:4px'>"+t+"</span>"; });
  (child.topics_strong||[]).forEach(function(t){ strongHtml+="<span class='badge b-mint' style='font-size:11px;margin-right:4px'>"+t+"</span>"; });
  var actHtml="";
  (child.activity||[]).forEach(function(a){ actHtml+="<div class='activity-row'><div class='activity-dot' style='background:"+a.color+"'></div><div style='flex:1'>"+a.txt+"</div><div style='font-size:11px;color:var(--text2)'>"+a.time+"</div></div>"; });
  card.innerHTML="<div class='child-card-header'>"
    +"<div class='child-ava' style='background:linear-gradient(135deg,#1C3A6E,#06D6A0)'>"+child.name[0]+"</div>"
    +"<div style='flex:1'><div style='font-size:16px;font-weight:800'>"+child.name+demoTag+"</div>"
    +"<div style='font-size:12px;color:var(--text2)'>"+child.grade+" - Level "+child.level+" - "+ageNote+"</div></div></div>"
    +"<div class='child-stats'>"
    +"<div class='child-stat'><div class='child-stat-val'>"+child.xp.toLocaleString()+"</div><div class='child-stat-lbl'>XP</div></div>"
    +"<div class='child-stat'><div class='child-stat-val'>"+child.coins.toLocaleString()+"</div><div class='child-stat-lbl'>MathCoins</div></div>"
    +"<div class='child-stat'><div class='child-stat-val'>"+child.wins+"</div><div class='child-stat-lbl'>Wins</div></div>"
    +"<div class='child-stat'><div class='child-stat-val'>"+child.streak+"d</div><div class='child-stat-lbl'>Streak</div></div></div>"
    +"<div style='margin-bottom:12px'><div style='font-size:11px;color:var(--text2);font-weight:800;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px'>Needs Practice</div>"+weakHtml
    +"<div style='font-size:11px;color:var(--text2);font-weight:800;margin:10px 0 6px;text-transform:uppercase;letter-spacing:1px'>Doing Well In</div>"+strongHtml+"</div>"
    +"<div style='font-size:13px;font-weight:800;margin-bottom:8px;color:var(--sky)'>Recent Activity</div>"+actHtml;
  return card;
}

function renderPrizeQueue(){
  var list=$$("prize-approval-list"); if(!list) return;
  var prizes=[{child:"Your Child",item:"Amazon Gift Card $10",coins:1000,age:14},{child:"Your Child",item:"GameStop Card $25",coins:2500,age:14}];
  list.innerHTML="";
  prizes.forEach(function(p,i){
    var card=document.createElement("div"); card.className="prize-req-card";
    var ageBadge=p.age>=16?"<span class='badge b-purple' style='font-size:10px'>Teen Wallet</span>":"<span class='badge b-sky' style='font-size:10px'>To parent</span>";
    card.innerHTML="<div style='font-size:28px'>Gift</div>"
      +"<div style='flex:1'><div style='font-size:14px;font-weight:800'>"+p.child+" wants: "+p.item+"</div>"
      +"<div style='font-size:12px;color:var(--text2);margin-top:3px'>"+p.coins.toLocaleString()+" MathCoins - "+ageBadge+"</div></div>"
      +"<div style='display:flex;gap:6px;flex-direction:column'></div>";
    var appBtn=document.createElement("button"); appBtn.className="btn btn-mint btn-xs"; appBtn.style.color="var(--dark)"; appBtn.textContent="Approve";
    appBtn.addEventListener("click",function(){ showToast("Prize approved! Gift card coming with Stripe integration!"); card.style.opacity="0.4"; });
    var dnyBtn=document.createElement("button"); dnyBtn.className="btn btn-ghost btn-xs"; dnyBtn.textContent="Deny";
    dnyBtn.addEventListener("click",function(){ showToast("Prize request denied."); card.remove(); });
    var btnCol=card.querySelector("div:last-child"); btnCol.appendChild(appBtn); btnCol.appendChild(dnyBtn);
    list.appendChild(card);
  });
}

function linkChildAccount(){
  var fn=$$("lc-fn")?$$("lc-fn").value.trim():"";
  var gr=$$("lc-grade")?$$("lc-grade").value:"";
  var dob=$$("lc-dob")?$$("lc-dob").value:"";
  if(!fn){ showToast("Please enter child first name!"); return; }
  if(!gr){ showToast("Please select child grade!"); return; }
  var age=13;
  if(dob){ var bd=new Date(dob),td=new Date(); age=td.getFullYear()-bd.getFullYear(); }
  var child={name:fn,grade:gr+"th Grade",age:age,level:1,xp:0,coins:0,streak:0,wins:0,topics_weak:["Starting out"],topics_strong:["Arithmetic"],activity:[{txt:"Account linked by parent",time:"Just now",color:"var(--mint)"}]};
  PARENT.children.push(child);
  // Save updated children list
  try{
    if(PARENT.email){
      var pKey="mc_parent_"+PARENT.email.toLowerCase().replace(/[^a-z0-9]/g,"");
      var saved=localStorage.getItem(pKey);
      var d=saved?JSON.parse(saved):{};
      d.children=PARENT.children;
      localStorage.setItem(pKey,JSON.stringify(d));
    }
  }catch(e){}
  closeLinkChildModal();
  renderParentDash();
  showToast(fn+" linked to your dashboard!");
}

// ── PARENT SIGNUP ──────────────────────────────────────
async function submitParentSignup(){
  var modal=$$("signup-modal");
  var inputs=modal?modal.querySelectorAll("#tab-parent .form-input"):[];
  var firstName=inputs[0]?inputs[0].value.trim():"";
  var lastName=inputs[1]?inputs[1].value.trim():"";
  var email=inputs[2]?inputs[2].value.trim():"";
  var phone=inputs[3]?inputs[3].value.trim():"";
  var plan="Free";
  var selCard=modal?modal.querySelector(".plan-card.sel"):null;
  if(selCard){ var pn=selCard.querySelector(".plan-name"); if(pn) plan=pn.textContent.trim(); }
  if(!firstName){ showToast("Please enter your first name!"); return; }
  if(!email||email.indexOf("@")<1){ showToast("Please enter a valid email!"); return; }
  var btn=modal?modal.querySelector("#tab-parent .btn-mint"):null;
  if(btn){ btn.textContent="Sending..."; btn.disabled=true; }
  PARENT.name=firstName+(lastName?" "+lastName:""); PARENT.email=email; PARENT.plan=plan; PARENT.isLoggedIn=true;
  // Save parent session to localStorage for return visits
  try{
    var pKey="mc_parent_"+email.toLowerCase().replace(/[^a-z0-9]/g,"");
    localStorage.setItem(pKey,JSON.stringify({name:PARENT.name,email:email,plan:plan,children:[]}));
  }catch(e){}
  var sent=await sendToWeb3Forms({subject:"New Parent Signup - "+plan,name:PARENT.name,email:email,message:"NEW PARENT | Name: "+PARENT.name+" | Email: "+email+" | Phone: "+(phone||"N/A")+" | Plan: "+plan});
  var tabParent=$$("tab-parent");
  if(tabParent){
    var html="<div style='text-align:center;padding:20px 10px'>"
      +"<div style='font-size:52px;margin-bottom:14px'>Success!</div>"
      +"<div style='font-size:26px;font-weight:800;color:var(--sun);margin-bottom:12px'>You are Registered!</div>"
      +"<div style='color:var(--text2);font-size:14px;line-height:1.9;margin-bottom:20px'>"
      +"Welcome, <strong style='color:var(--mint)'>"+firstName+"</strong>!<br><br>"
      +"<span class='badge b-sun' style='font-size:12px'>Plan: "+plan+"</span><br><br>"
      +"Your MathCrown account is now active!<br><br>"
      +"<span style='color:var(--mint)'>"+(sent?"We will email "+email+" at launch!":"We have your details and will be in touch!")+"</span><br><br>"
      +"<strong style='color:var(--mint)'>Founding Family:</strong> Your "+plan+" price is locked forever."
      +"</div>"
      +"<div style='display:flex;gap:8px;justify-content:center;flex-wrap:wrap'></div></div>";
    tabParent.innerHTML=html;
    var btnDiv=tabParent.querySelector("div:last-child div:last-child");
    if(btnDiv){
      var eb=document.createElement("button"); eb.className="btn btn-sun btn-sm"; eb.textContent="Explore the App";
      eb.addEventListener("click",function(){ closeModal(); previewApp(); }); btnDiv.appendChild(eb);
      var cb=document.createElement("button"); cb.className="btn btn-ghost btn-sm"; cb.textContent="Close";
      cb.addEventListener("click",closeModal); btnDiv.appendChild(cb);
    }
  }
  var nav=$$("nav-parent-dash"); if(nav) nav.style.display="flex";
  showToast(sent?"Registered! We will email "+email+"!":"Registered, "+firstName+"! We will be in touch!",4000);
}

async function joinWaitlist(){
  var nameEl=$$("wl-name"), emailEl=$$("wl-email"), gradeEl=$$("wl-grade");
  var name=nameEl?nameEl.value.trim():"", email=emailEl?emailEl.value.trim():"", grade=gradeEl?gradeEl.value:"";
  if(!name){ showToast("Please enter your name!"); return; }
  if(!email||email.indexOf("@")<1){ showToast("Please enter a valid email!"); return; }
  if(!grade){ showToast("Please select your childs grade!"); return; }
  var wlBtn=document.querySelector(".waitlist-form .btn-sun");
  if(wlBtn){ wlBtn.textContent="Joining..."; wlBtn.disabled=true; }
  var sent=await sendToWeb3Forms({subject:"Founding Family Signup - "+name,name:name,email:email,message:"WAITLIST | Name: "+name+" | Email: "+email+" | Grade: "+grade});
  var box=document.querySelector(".waitlist-box");
  if(box){
    var div=document.createElement("div"); div.style.cssText="text-align:center;padding:20px";
    div.innerHTML="<div style='font-size:48px;margin-bottom:16px'>You are In!</div>"
      +"<div style='font-size:24px;font-weight:800;color:var(--sun);margin-bottom:10px'>You are on the list, "+name+"!</div>"
      +"<div style='color:var(--text2);font-size:14px;line-height:1.8;margin-bottom:16px'>"+(sent?"Your spot is confirmed! We will email "+email+" at launch.":"You are on the list! We will reach out to "+email+" at launch.")+"</div>"
      +"<span class='badge b-sun'>On the founding list</span> <span class='badge b-mint'>Price locked forever</span>";
    var peekBtn=document.createElement("button"); peekBtn.className="btn btn-ghost btn-sm"; peekBtn.style.marginTop="12px"; peekBtn.style.display="block"; peekBtn.textContent="Take a Peek Inside";
    peekBtn.addEventListener("click",previewApp); div.appendChild(peekBtn);
    box.innerHTML=""; box.appendChild(div);
  }
  showToast(sent?"You are on the list, "+name+"!":"You are on the founding list, "+name+"!",4000);
}

function generateWeeklyReport(){
  if(!PARENT.children||PARENT.children.length===0){
    showToast("No children linked yet. Link a child account first!"); return;
  }
  var NL="\n";
  var report="MathCrown Weekly Report"+NL;
  report+="Generated: "+new Date().toLocaleDateString()+NL+NL;
  PARENT.children.forEach(function(child){
    report+="=== "+child.name+" ("+child.grade+") ==="+NL;
    report+="XP: "+child.xp.toLocaleString()+NL;
    report+="MathCoins: "+child.coins.toLocaleString()+NL;
    report+="Wins: "+(child.wins||0)+NL;
    report+="Streak: "+(child.streak||0)+" days"+NL;
    report+="Level: "+(child.level||1)+NL;
    report+="Needs Practice: "+(child.topics_weak||[]).join(", ")+NL;
    report+="Doing Well In: "+(child.topics_strong||[]).join(", ")+NL+NL;
  });
  var blob=new Blob([report],{type:"text/plain"});
  var url=URL.createObjectURL(blob);
  var a=document.createElement("a"); a.href=url;
  a.download="MathCrown_Weekly_Report_"+new Date().toISOString().split("T")[0]+".txt";
  a.click(); URL.revokeObjectURL(url);
  showToast("Weekly report downloaded!");
}

async function sendToWeb3Forms(data){
  try{
    var payload=Object.assign({"access_key":W3F_KEY},data);
    var res=await fetch("https://api.web3forms.com/submit",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)});
    var json=await res.json(); return json.success===true;
  }catch(e){ return false; }
}

// ── MUSIC ──────────────────────────────────────────────
function getMusicAudio(){ return $$("music-audio"); }

function initMusic(){
  var audio=getMusicAudio(); if(!audio) return;
  audio.volume=MUSIC.volume; audio.loop=false;
  audio.addEventListener("ended",nextTrack);
  audio.addEventListener("timeupdate",updateMusicProgress);
  audio.addEventListener("error",function(){ console.warn("Music track failed, trying next..."); setTimeout(nextTrack,1000); });
  loadTrack(0);
}

function loadTrack(idx){
  if(idx<0) idx=MUSIC_TRACKS.length-1;
  if(idx>=MUSIC_TRACKS.length) idx=0;
  MUSIC.trackIdx=idx;
  var track=MUSIC_TRACKS[idx];
  var audio=getMusicAudio(); if(!audio) return;
  audio.src=track.url; audio.load();
  var tn=$$("music-track-name"); if(tn) tn.textContent=track.name;
  var ta=$$("music-artist"); if(ta) ta.textContent=track.artist;
  if(MUSIC.playing&&MUSIC.userInteracted) audio.play().catch(function(){});
}

function togglePlay(){
  var audio=getMusicAudio(); if(!audio) return;
  MUSIC.userInteracted=true;
  if(MUSIC.playing){
    audio.pause(); MUSIC.playing=false; MUSIC.muted=true;
    updateMusicUI();
  } else {
    if(MUSIC.userManuallyStopped) return;
    MUSIC.muted=false; MUSIC.playing=true;
    audio.volume=MUSIC.volume;
    // Ensure a track is loaded
    if(!audio.src || audio.src==="") loadTrack(0);
    var playPromise = audio.play();
    if(playPromise !== undefined){
      playPromise.then(function(){
        updateMusicUI();
      }).catch(function(e){
        console.warn("Play failed:", e.message);
        MUSIC.playing=false; MUSIC.muted=true;
        updateMusicUI();
        showToast("Tap the music button to start playing!");
      });
    } else {
      updateMusicUI();
    }
  }
}

function turnMusicOff(){
  var audio=getMusicAudio(); if(audio) audio.pause();
  MUSIC.playing=false; MUSIC.muted=true; MUSIC.userManuallyStopped=true;
  updateMusicUI(); showToast("Music off. Click the button to turn back on."); toggleMusicPanel();
}

function turnMusicOn(){
  MUSIC.userManuallyStopped=false; MUSIC.userInteracted=true; MUSIC.playing=false;
  togglePlay(); showToast("Music is on! Enjoy the lo-fi beats!");
}

function nextTrack(){ loadTrack(MUSIC.shuffle?Math.floor(Math.random()*MUSIC_TRACKS.length):MUSIC.trackIdx+1); if(MUSIC.playing) getMusicAudio()&&getMusicAudio().play().catch(function(){}); }
function prevTrack(){ loadTrack(MUSIC.trackIdx-1); if(MUSIC.playing) getMusicAudio()&&getMusicAudio().play().catch(function(){}); }

function toggleShuffle(){
  MUSIC.shuffle=!MUSIC.shuffle;
  var btn=$$("music-shuffle-btn"); if(btn){ btn.style.color=MUSIC.shuffle?"var(--purple)":""; btn.style.background=MUSIC.shuffle?"rgba(155,93,229,0.2)":""; }
  showToast(MUSIC.shuffle?"Shuffle on!":"Shuffle off");
}

function setVolume(val){
  MUSIC.volume=val/100;
  var audio=getMusicAudio(); if(audio) audio.volume=MUSIC.volume;
  var lbl=$$("music-vol-label"); if(lbl) lbl.textContent=val+"%";
}

function seekMusic(e){
  var audio=getMusicAudio(); if(!audio||!audio.duration) return;
  var bar=$$("music-progress-bar"); if(!bar) return;
  var rect=bar.getBoundingClientRect();
  audio.currentTime=((e.clientX-rect.left)/rect.width)*audio.duration;
}

function updateMusicProgress(){
  var audio=getMusicAudio(); if(!audio) return;
  var dur=audio.duration||0, cur=audio.currentTime||0;
  var fill=$$("music-progress-fill"); if(fill) fill.style.width=(dur>0?(cur/dur*100):0)+"%";
  var time=$$("music-time"); if(time) time.textContent=fmtTime(cur)+" / "+fmtTime(dur);
}

function fmtTime(s){ if(!s||isNaN(s)) return "0:00"; var m=Math.floor(s/60),sec=Math.floor(s%60); return m+":"+(sec<10?"0":"")+sec; }

function updateMusicUI(){
  var mb=$$("music-btn"), icon=$$("music-btn-icon"), eq=$$("music-eq"), pb=$$("music-play-btn"), offBtn=$$("music-off-btn"), onBtn=$$("music-on-btn");
  if(MUSIC.playing){
    if(mb){ mb.classList.remove("muted"); mb.title="Music playing - click to control"; }
    if(icon){ icon.style.display="none"; } if(eq){ eq.style.display="flex"; }
    if(pb) pb.innerHTML="&#9646;&#9646;"; if(offBtn) offBtn.style.display="block"; if(onBtn) onBtn.style.display="none";
  } else {
    if(mb){ mb.classList.add("muted"); mb.title="Music off - click to turn on"; }
    if(icon){ icon.textContent="🔇"; icon.style.display="block"; } if(eq){ eq.style.display="none"; }
    if(pb) pb.innerHTML="&#9654;"; if(offBtn) offBtn.style.display="none"; if(onBtn) onBtn.style.display="block";
  }
}

function toggleMusicPanel(){
  MUSIC.panelOpen=!MUSIC.panelOpen;
  var panel=$$("music-panel");
  if(panel){ if(MUSIC.panelOpen) panel.classList.add("open"); else panel.classList.remove("open"); }
  if(MUSIC.panelOpen&&!MUSIC.userInteracted&&!MUSIC.userManuallyStopped){ MUSIC.userInteracted=true; MUSIC.playing=false; togglePlay(); }
}

function showMusicBtn(show){
  var btn=$$("music-btn"); if(btn) btn.style.display=show?"flex":"none";
  var panel=$$("music-panel"); if(panel&&!show){ panel.classList.remove("open"); MUSIC.panelOpen=false; }
}

function showMobNav(show){
  var nav=$$("mob-nav"); if(!nav) return;
  // Only show mobile nav on small screens - never on desktop
  if(show && window.innerWidth <= 900){
    nav.style.display="block";
  } else {
    nav.style.display="none";
  }
}

// ── COUNTDOWN ──────────────────────────────────────────
function startCountdown(){
  var secs=8*3600+23*60+41;
  setInterval(function(){
    if(secs>0) secs--;
    var h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;
    var hh=$$("cd-h"),mm=$$("cd-m"),ss=$$("cd-s");
    if(hh) hh.textContent=String(h).padStart(2,"0");
    if(mm) mm.textContent=String(m).padStart(2,"0");
    if(ss) ss.textContent=String(s).padStart(2,"0");
  },1000);
}

// ── DOM READY ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded",function(){
  var mo=$$("signup-modal"); if(mo) mo.addEventListener("click",function(e){ if(e.target===this) closeModal(); });
  var lm=$$("login-modal"); if(lm) lm.addEventListener("click",function(e){ if(e.target===this) closeLoginModal(); });
  var lcm=$$("link-child-modal"); if(lcm) lcm.addEventListener("click",function(e){ if(e.target===this) closeLinkChildModal(); });
  var pb=$$("preview-btn"); if(pb) pb.addEventListener("click",previewApp);
  startCountdown();
  initMusic();
  showMusicBtn(false);
  document.addEventListener("click",function onFirstClick(){
    if(!MUSIC.userInteracted&&!MUSIC.userManuallyStopped){ MUSIC.userInteracted=true; MUSIC.playing=false; togglePlay(); }
    document.removeEventListener("click",onFirstClick);
  });
});
// Verify question bank loaded after 2 seconds
// Check question bank loaded — retry up to 10 seconds
(function checkBank(attempts){
  if(window.QUESTION_BANK && Object.keys(window.QUESTION_BANK).length >= 5){
    var total=0;
    Object.values(QUESTION_BANK).forEach(function(t){Object.values(t).forEach(function(a){total+=a.length;});});
    console.log("✅ Question bank: "+total+" questions loaded");
  } else if(attempts > 0){
    setTimeout(function(){ checkBank(attempts-1); }, 1000);
  } else {
    console.warn("Question bank still loading — page may need refresh.");
  }
})(10);

// ── window bridge ──────────────────────────────────────
// The HTML still uses inline onclick handlers and firebase-init.js reaches
// app state through window.*. Every top-level function and shared state
// object is exposed here explicitly; this list shrinks as modules take over.
Object.assign(window, {
  $$,
  answerPractice,
  answerQ,
  askTutor,
  battleAnswer,
  buildChildCard,
  challengeOpp,
  closeLinkChildModal,
  closeLoginModal,
  closeModal,
  copyLinkCode,
  endBattle,
  enterApp,
  filterOpponents,
  fmtTime,
  forgotPassword,
  genAIQuestions,
  generateWeeklyReport,
  getGradeBandNum,
  getMusicAudio,
  getOnlineCount,
  getRandQ,
  goPage,
  gradeBand,
  initMusic,
  initPresence,
  isPlayerOnline,
  joinWaitlist,
  linkChildAccount,
  loadTrack,
  loadTrivia,
  loginParent,
  loginStudent,
  logout,
  nextBattleRound,
  nextTrack,
  openLoginModal,
  openModal,
  prevTrack,
  previewApp,
  registerPlayer,
  renderChallenge,
  renderHome,
  renderLeaderboard,
  renderMiniLB,
  renderOppList,
  renderParentDash,
  renderPractice,
  renderPracticeQ,
  renderPrizeQueue,
  renderProfile,
  renderQuestion,
  renderRoom,
  renderRoomLB,
  renderSkills,
  renderSourceList,
  renderTournaments,
  renderTutor,
  renderWallet,
  saveSession,
  searchPlayers,
  seekMusic,
  selectPlan,
  selectPlayerChallenge,
  sendChallengeInvite,
  sendDirectChallenge,
  sendMsg,
  sendToWeb3Forms,
  setLBTab,
  setMode,
  setVolume,
  showLinkChildModal,
  showMobNav,
  showMusicBtn,
  showPracticeResult,
  showPreviewBanner,
  showToast,
  showTriviaResult,
  shuffle,
  signupStudent,
  startBattle,
  startBattleWith,
  startCountdown,
  startPractice,
  submitParentSignup,
  switchLoginTab,
  switchTab,
  toggleMusicPanel,
  togglePlay,
  toggleShuffle,
  turnMusicOff,
  turnMusicOn,
  updateBTimer,
  updateMusicProgress,
  updateMusicUI,
  S, PARENT, MUSIC, session, practiceSession,
});
