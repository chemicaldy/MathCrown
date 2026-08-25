// MathCrown entry point.
// Order matters: app.js defines the UI/state globals that firebase-init.js's
// auth/presence callbacks reach through window; both bridge onto window for
// the HTML's inline event handlers until those move to addEventListener.
import "./styles/main.css";
import "./app.js";
import "./firebase-init.js";
