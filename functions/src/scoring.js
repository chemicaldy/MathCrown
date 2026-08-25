// Award formulas — the single authority on XP/coin amounts. The client shows
// the same numbers for instant feedback, but totals only ever change here.

export function levelFor(xp) {
  // Mirrors the client display "S.xp / (S.level*500) XP".
  return Math.max(1, Math.floor(xp / 500) + 1);
}

export function computeAward(mode, correct, total, battleOutcome) {
  const perfect = total > 0 && correct === total;
  switch (mode) {
    case "trivia":
      return { xp: correct * 50 + (perfect ? 100 : 0), coins: correct * 10 + (perfect ? 25 : 0) };
    case "practice":
      return { xp: correct * 40, coins: correct * 8 };
    case "battle": {
      if (battleOutcome === "win") return { xp: 200, coins: 150 };
      if (battleOutcome === "tie") return { xp: 100, coins: 75 };
      if (battleOutcome === "loss") return { xp: 50, coins: 25 };
      // Bot battle (no server-verifiable outcome): award on graded answers
      // only — a claimed "win" against a local bot is not trusted.
      return { xp: correct * 30 + 20, coins: correct * 6 };
    }
    default:
      return { xp: 0, coins: 0 };
  }
}

// UTC day key used for daily streak accounting.
export function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

export function nextStreak(prevStreak, lastPlayedDay, now) {
  const today = dayKey(now);
  if (lastPlayedDay === today) return prevStreak || 1;
  const yesterday = dayKey(new Date(now.getTime() - 86400000));
  return lastPlayedDay === yesterday ? (prevStreak || 0) + 1 : 1;
}
