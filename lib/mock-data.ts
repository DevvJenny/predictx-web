import { calculateCompletedPayout } from "@/lib/calculations";
// All dates are computed relative to new Date() — no hardcoded past/future dates.

const addDays = (n: number, hour = 15): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

/**
 * Compute the lock target ISO from a kickoff ISO and a lockTime key.
 * Mirrors LOCK_OFFSET_MINUTES in lib/calculations.ts without importing from it
 * (avoids a circular dependency at module-evaluation time since calculations.ts
 * does not import from mock-data.ts, but we want to keep mock-data self-contained).
 *
 * kickoff: 0 min offset | halftime: 52 min | 60min: 65 min
 */
function computeLockISO(kickoff: string, lockTime: "kickoff" | "halftime" | "60min"): string {
  const offsets = { kickoff: 0, halftime: 52, "60min": 65 } as const;
  const ms = new Date(kickoff).getTime() + offsets[lockTime] * 60_000;
  return new Date(ms).toISOString();
}

import { XLM_USD_RATE } from "@/lib/constants";

// ── Storage keys ──────────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  wallet: "predictx_wallet",
  stakes: "predictx_stakes",
  votes: "predictx_votes",
  pools: "predictx_pools",
  transactions: "predictx_transactions",
};

export function resetAllData() {
  if (typeof window === "undefined") return;
  Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem("wallet-storage");
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type MatchStatus = "upcoming" | "live" | "completed";
export type PollStatus = "active" | "locked" | "voting" | "resolved";
export type LockTime = "kickoff" | "halftime" | "60min";
export type PollCategory =
  | "player_event"
  | "team_event"
  | "score_prediction"
  | "other";
export type WalletProvider = "Freighter" | "Lobstr" | "xBull";

/**
 * Returns a human-readable label for a poll's lock time.
 *
 * - `"kickoff"`  → "At Kick-off"
 * - `"halftime"` → "At Half-Time (45')"
 * - `"60min"`    → "At 60th Minute"
 * - ISO datetime → localised date/time string (custom lock)
 *
 * Use this everywhere a lock time is shown to the user so that
 * raw enum values ("kickoff", "halftime", "60min") never appear as UI copy.
 */
export function lockTimeLabel(lockTime: LockTime | string): string {
  switch (lockTime) {
    case "kickoff":
      return "At Kick-off";
    case "halftime":
      return "At Half-Time (45')";
    case "60min":
      return "At 60th Minute";
    default: {
      // Treat unrecognised values as ISO datetime strings (custom lock)
      const d = new Date(lockTime);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return lockTime;
    }
  }
}

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  kickoff: string;
  status: MatchStatus;
  score?: { home: number; away: number };
}

export interface Poll {
  id: string;
  matchId: string;
  question: string;
  category: PollCategory;
  yesPool: number;
  noPool: number;
  /** Number of distinct wallet addresses that have staked on this poll. */
  participants: number;
  /** Total number of stake transactions placed on this poll (may exceed `participants`). */
  stakeCount: number;
  /** Wallet addresses of every distinct staker; used to compute `participants`. */
  stakers: string[];
  status: PollStatus;
  lockTime: LockTime;
  recentActivity: string;
  outcome?: "yes" | "no";
  /**
   * Computed ISO datetime at which this poll stops accepting stakes.
   * For built-in lockTime values this is derived from the match kickoff;
   * for "custom" polls created via the modal this stores the exact user-chosen time.
   * When present, getLockTargetISO prefers this over the derived offset so custom
   * polls count down to the correct time.
   */
  lockTargetISO?: string;
}

export interface Stake {
  id: string;
  pollId: string;
  matchId: string;
  matchName: string;
  question: string;
  side: "yes" | "no";
  amount: number;
  status: "active" | "pending_resolution" | "completed";
  /** Stellar public key of the wallet that placed this stake. */
  wallet: string;
  outcome?: "won" | "lost";
  profit?: number;
  roi?: number;
  resolutionNote?: string;
  /**
   * Whether the winner has already claimed their payout.
   * Only relevant when outcome === "won". Defaults to false (unclaimed).
   */
  claimed?: boolean;
  /** Gross payout before the 5% platform fee; only meaningful on won stakes. */
  grossPayout?: number;
}

export interface VotingOpportunity {
  pollId: string;
  matchId: string;
  matchName: string;
  question: string;
  reward: number;
  evidence: string;
}

export interface Transaction {
  hash: string;
  type: "stake" | "claim" | "vote_reward" | "poll_creation";
  amount: number;
  amountXLM: number;
  description: string;
  timestamp: string;
  ledger: number;
  fee: string;
  status: "confirmed" | "failed";
}

export interface PlatformStats {
  totalValueLocked: number;
  activePredictions: number;
  communityMembers: number;
  totalPayouts: number;
}

export interface MatchEventTimelineItem {
  time: string;
  event: string;
}

export interface MatchEvidence {
  matchId: string;
  timeline: MatchEventTimelineItem[];
  highlightsUrl?: string;
  statsUrl?: string;
}

// ── Matches ───────────────────────────────────────────────────────────────────
// Kickoff times are captured as module-level constants so the POLLS array can
// reference them when pre-computing lockTargetISO values.
const M1_KICKOFF = addDays(1, 15);
const M2_KICKOFF = addDays(2, 17);
const M3_KICKOFF = addDays(3, 12);
const M4_KICKOFF = addDays(4, 15);
const M5_KICKOFF = addDays(0, 13);
const M6_KICKOFF = addDays(-1, 15);

export const MATCHES: Match[] = [
  {
    id: "m1",
    homeTeam: "Chelsea",
    awayTeam: "Manchester United",
    venue: "Stamford Bridge",
    kickoff: M1_KICKOFF,
    status: "upcoming",
  },
  {
    id: "m2",
    homeTeam: "Arsenal",
    awayTeam: "Liverpool",
    venue: "Emirates Stadium",
    kickoff: M2_KICKOFF,
    status: "upcoming",
  },
  {
    id: "m3",
    homeTeam: "Manchester City",
    awayTeam: "Tottenham",
    venue: "Etihad Stadium",
    kickoff: M3_KICKOFF,
    status: "upcoming",
  },
  {
    id: "m4",
    homeTeam: "Newcastle",
    awayTeam: "Aston Villa",
    venue: "St. James' Park",
    kickoff: M4_KICKOFF,
    status: "upcoming",
  },
  {
    id: "m5",
    homeTeam: "Brighton",
    awayTeam: "West Ham",
    venue: "Amex Stadium",
    kickoff: M5_KICKOFF,
    status: "live",
    score: { home: 1, away: 0 },
  },
  {
    id: "m6",
    homeTeam: "Everton",
    awayTeam: "Wolves",
    venue: "Goodison Park",
    kickoff: M6_KICKOFF,
    status: "completed",
    score: { home: 2, away: 1 },
  },
];

// ── Polls (4–5 per match, 28 total) ───────────────────────────────────────────
export const POLLS: Poll[] = [
  // m1 — Chelsea vs Manchester United
  {
    id: "m1-p1",
    matchId: "m1",
    question: "Will Palmer score a goal?",
    category: "player_event",
    yesPool: 8400,
    noPool: 3600,
    participants: 67,
    status: "active",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M1_KICKOFF, "kickoff"),
    recentActivity: "34 people staked Yes in last hour",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m1-p2",
    matchId: "m1",
    question: "Will Rashford be subbed out before 70min?",
    category: "player_event",
    yesPool: 2100,
    noPool: 5400,
    participants: 45,
    status: "active",
    lockTime: "halftime",
    lockTargetISO: computeLockISO(M1_KICKOFF, "halftime"),
    recentActivity: "Pool grew $800 in last 2 hours",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m1-p3",
    matchId: "m1",
    question: "Will Chelsea win?",
    category: "team_event",
    yesPool: 9200,
    noPool: 4300,
    participants: 78,
    status: "active",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M1_KICKOFF, "kickoff"),
    recentActivity: "12 people staked No in last 30min",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m1-p4",
    matchId: "m1",
    question: "Will there be a penalty?",
    category: "team_event",
    yesPool: 3800,
    noPool: 7200,
    participants: 55,
    status: "active",
    lockTime: "60min",
    lockTargetISO: computeLockISO(M1_KICKOFF, "60min"),
    recentActivity: "Pool grew $1,200 in last hour",
    stakeCount: 0,
    stakers: [],
  },

  // m2 — Arsenal vs Liverpool
  {
    id: "m2-p1",
    matchId: "m2",
    question: "Will Saka get an assist?",
    category: "player_event",
    yesPool: 5600,
    noPool: 4400,
    participants: 62,
    status: "active",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M2_KICKOFF, "kickoff"),
    recentActivity: "28 people staked Yes in last hour",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m2-p2",
    matchId: "m2",
    question: "Will Arsenal keep a clean sheet?",
    category: "team_event",
    yesPool: 3200,
    noPool: 8800,
    participants: 74,
    status: "active",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M2_KICKOFF, "kickoff"),
    recentActivity: "Pool grew $2,000 in 30min",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m2-p3",
    matchId: "m2",
    question: "Will both teams score?",
    category: "score_prediction",
    yesPool: 9100,
    noPool: 2900,
    participants: 58,
    status: "active",
    lockTime: "halftime",
    lockTargetISO: computeLockISO(M2_KICKOFF, "halftime"),
    recentActivity: "19 people staked Yes in last 2 hours",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m2-p4",
    matchId: "m2",
    question: "Will the first goal be scored before 20min?",
    category: "team_event",
    yesPool: 4700,
    noPool: 5300,
    participants: 49,
    status: "active",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M2_KICKOFF, "kickoff"),
    recentActivity: "Pool grew $600 in last hour",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m2-p5",
    matchId: "m2",
    question: "Will total goals be over 2.5?",
    category: "score_prediction",
    yesPool: 7300,
    noPool: 3700,
    participants: 66,
    status: "active",
    lockTime: "60min",
    lockTargetISO: computeLockISO(M2_KICKOFF, "60min"),
    recentActivity: "41 people staked Yes in last hour",
    stakeCount: 0,
    stakers: [],
  },

  // m3 — Manchester City vs Tottenham
  {
    id: "m3-p1",
    matchId: "m3",
    question: "Will Haaland receive a yellow card?",
    category: "player_event",
    yesPool: 1200,
    noPool: 8800,
    participants: 38,
    status: "active",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M3_KICKOFF, "kickoff"),
    recentActivity: "Pool grew $400 in last hour",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m3-p2",
    matchId: "m3",
    question: "Will Manchester City win by 2+ goals?",
    category: "score_prediction",
    yesPool: 7800,
    noPool: 4200,
    participants: 72,
    status: "active",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M3_KICKOFF, "kickoff"),
    recentActivity: "52 people staked Yes in last hour",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m3-p3",
    matchId: "m3",
    question: "Will there be a VAR review?",
    category: "other",
    yesPool: 6400,
    noPool: 5600,
    participants: 44,
    status: "active",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M3_KICKOFF, "kickoff"),
    recentActivity: "Pool grew $1,500 in last 2 hours",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m3-p4",
    matchId: "m3",
    question: "Will total goals be over 2.5?",
    category: "score_prediction",
    yesPool: 5500,
    noPool: 4500,
    participants: 56,
    status: "active",
    lockTime: "halftime",
    lockTargetISO: computeLockISO(M3_KICKOFF, "halftime"),
    recentActivity: "22 people staked Yes in last 30min",
    stakeCount: 0,
    stakers: [],
  },

  // m4 — Newcastle vs Aston Villa
  {
    id: "m4-p1",
    matchId: "m4",
    question: "Will there be a red card?",
    category: "other",
    yesPool: 2300,
    noPool: 9700,
    participants: 41,
    status: "active",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M4_KICKOFF, "kickoff"),
    recentActivity: "Pool grew $300 in last hour",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m4-p2",
    matchId: "m4",
    question: "Will Newcastle win?",
    category: "team_event",
    yesPool: 6100,
    noPool: 5900,
    participants: 63,
    status: "active",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M4_KICKOFF, "kickoff"),
    recentActivity: "17 people staked Yes in last hour",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m4-p3",
    matchId: "m4",
    question: "Will both teams score?",
    category: "score_prediction",
    yesPool: 7200,
    noPool: 4800,
    participants: 57,
    status: "active",
    lockTime: "halftime",
    lockTargetISO: computeLockISO(M4_KICKOFF, "halftime"),
    recentActivity: "Pool grew $900 in last hour",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m4-p4",
    matchId: "m4",
    question: "Will there be a penalty?",
    category: "team_event",
    yesPool: 3500,
    noPool: 8500,
    participants: 39,
    status: "active",
    lockTime: "60min",
    lockTargetISO: computeLockISO(M4_KICKOFF, "60min"),
    recentActivity: "Pool grew $700 in last 2 hours",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m4-p5",
    matchId: "m4",
    question: "Will Watkins score?",
    category: "player_event",
    yesPool: 4900,
    noPool: 6100,
    participants: 48,
    status: "active",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M4_KICKOFF, "kickoff"),
    recentActivity: "25 people staked No in last hour",
    stakeCount: 0,
    stakers: [],
  },

  // m5 — Brighton vs West Ham (live)
  {
    id: "m5-p1",
    matchId: "m5",
    question: "Will Brighton win?",
    category: "team_event",
    yesPool: 8900,
    noPool: 3100,
    participants: 74,
    status: "locked",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M5_KICKOFF, "kickoff"),
    recentActivity: "61 people staked Yes before kickoff",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m5-p2",
    matchId: "m5",
    question: "Will total goals be over 2.5?",
    category: "score_prediction",
    yesPool: 5800,
    noPool: 4200,
    participants: 55,
    status: "locked",
    lockTime: "halftime",
    lockTargetISO: computeLockISO(M5_KICKOFF, "halftime"),
    recentActivity: "Pool reached $10K before halftime",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m5-p3",
    matchId: "m5",
    question: "Will there be a VAR review?",
    category: "other",
    yesPool: 6200,
    noPool: 5800,
    participants: 47,
    status: "locked",
    lockTime: "60min",
    lockTargetISO: computeLockISO(M5_KICKOFF, "60min"),
    recentActivity: "Pool grew $1,800 before 60min",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m5-p4",
    matchId: "m5",
    question: "Will both teams score?",
    category: "score_prediction",
    yesPool: 4100,
    noPool: 7900,
    participants: 60,
    status: "locked",
    lockTime: "halftime",
    lockTargetISO: computeLockISO(M5_KICKOFF, "halftime"),
    recentActivity: "43 people staked No before halftime",
    stakeCount: 0,
    stakers: [],
  },

  // m6 — Everton vs Wolves (completed)
  {
    id: "m6-p1",
    matchId: "m6",
    question: "Will Everton win?",
    category: "team_event",
    yesPool: 7200,
    noPool: 4800,
    participants: 71,
    status: "voting",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M6_KICKOFF, "kickoff"),
    recentActivity: "Voting in progress — 2 hours remaining",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m6-p2",
    matchId: "m6",
    question: "Will total goals be over 2.5?",
    category: "score_prediction",
    yesPool: 5400,
    noPool: 5600,
    participants: 64,
    status: "voting",
    lockTime: "halftime",
    lockTargetISO: computeLockISO(M6_KICKOFF, "halftime"),
    recentActivity: "Voting in progress",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m6-p3",
    matchId: "m6",
    question: "Will there be a red card?",
    category: "other",
    yesPool: 1800,
    noPool: 9200,
    participants: 43,
    status: "voting",
    lockTime: "kickoff",
    lockTargetISO: computeLockISO(M6_KICKOFF, "kickoff"),
    recentActivity: "Voting in progress — cast your vote now",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m6-p4",
    matchId: "m6",
    question: "Will both teams score?",
    category: "score_prediction",
    yesPool: 8100,
    noPool: 2900,
    participants: 58,
    status: "voting",
    lockTime: "halftime",
    lockTargetISO: computeLockISO(M6_KICKOFF, "halftime"),
    recentActivity: "Voting in progress",
    stakeCount: 0,
    stakers: [],
  },
  {
    id: "m6-p5",
    matchId: "m6",
    question: "Will there be a VAR review?",
    category: "other",
    yesPool: 4300,
    noPool: 6700,
    participants: 36,
    status: "voting",
    lockTime: "60min",
    lockTargetISO: computeLockISO(M6_KICKOFF, "60min"),
    recentActivity: "Admin review in progress",
    stakeCount: 0,
    stakers: [],
  },
];

// ── Match Evidence ────────────────────────────────────────────────────────────
export const MATCH_EVIDENCE: Record<string, MatchEvidence> = {
  m1: {
    matchId: "m1",
    timeline: [
      { time: "0'", event: "Match starts — Chelsea vs Manchester United" },
      { time: "12'", event: "Yellow Card — Shaw (MAN)" },
      { time: "18'", event: "⚽ Goal! Cole Palmer (CHE) — Assists: Caicedo" },
      { time: "31'", event: "Yellow Card — Dalot (MAN)" },
      { time: "45+2'", event: "Half Time: Chelsea 1 - 0 Manchester United" },
      { time: "52'", event: "⚽ Goal! Bruno Fernandes (MAN) — Free kick" },
      { time: "68'", event: "Yellow Card — James (CHE)" },
      { time: "71'", event: "Substitution — Mainoo replaces McTominay" },
      { time: "85'", event: "⚽ Goal! Jackson (CHE)" },
      { time: "90+4'", event: "Full Time: Chelsea 2 - 1 Manchester United" },
    ],
    highlightsUrl: "https://www.youtube.com/results?search_query=Chelsea+vs+Manchester+United",
    statsUrl: "https://www.premierleague.com/matches/Chelsea",
  },
  m2: {
    matchId: "m2",
    timeline: [
      { time: "0'", event: "Match starts — Arsenal vs Liverpool" },
      { time: "8'", event: "⚽ Goal! Saka (ARS) — Early breakthrough" },
      { time: "24'", event: "Yellow Card — Van Dijk (LIV)" },
      { time: "45'", event: "Half Time: Arsenal 1 - 0 Liverpool" },
      { time: "56'", event: "⚽ Goal! Salah (LIV)" },
      { time: "72'", event: "Yellow Card — Nketiah (ARS)" },
      { time: "78'", event: "VAR Check: Potential handball — No penalty" },
      { time: "81'", event: "⚽ Goal! Martinelli (ARS)" },
      { time: "90+2'", event: "Yellow Card — Gravenberch (LIV)" },
      { time: "90+5'", event: "Full Time: Arsenal 2 - 1 Liverpool" },
    ],
    highlightsUrl: "https://www.youtube.com/results?search_query=Arsenal+vs+Liverpool",
    statsUrl: "https://www.premierleague.com/matches/Arsenal",
  },
  m3: {
    matchId: "m3",
    timeline: [
      { time: "0'", event: "Match starts — Manchester City vs Tottenham" },
      { time: "5'", event: "⚽ Goal! Haaland (MAN) — Tap in" },
      { time: "19'", event: "⚽ Goal! Foden (MAN)" },
      { time: "38'", event: "Yellow Card — Romero (TOT)" },
      { time: "45'", event: "Half Time: Manchester City 2 - 0 Tottenham" },
      { time: "51'", event: "⚽ Goal! Richarlison (TOT)" },
      { time: "62'", event: "⚽ Goal! Alvarez (MAN)" },
      { time: "74'", event: "VAR Review: Potential foul — Play on" },
      { time: "88'", event: "Yellow Card — Akanji (MAN)" },
      { time: "90+3'", event: "Full Time: Manchester City 3 - 1 Tottenham" },
    ],
    highlightsUrl: "https://www.youtube.com/results?search_query=Manchester+City+vs+Tottenham",
    statsUrl: "https://www.premierleague.com/matches/Manchester+City",
  },
  m4: {
    matchId: "m4",
    timeline: [
      { time: "0'", event: "Match starts — Newcastle vs Aston Villa" },
      { time: "11'", event: "⚽ Goal! Isak (NEW)" },
      { time: "28'", event: "Yellow Card — Cash (AVL)" },
      { time: "35'", event: "⚽ Goal! Watkins (AVL)" },
      { time: "45'", event: "Half Time: Newcastle 1 - 1 Aston Villa" },
      { time: "57'", event: "⚽ Goal! Joelinton (NEW)" },
      { time: "69'", event: "Yellow Card — Konsa (AVL)" },
      { time: "76'", event: "VAR Check: Goal review — Allowed" },
      { time: "82'", event: "Substitution — Mings replaces Konsa" },
      { time: "90+2'", event: "Full Time: Newcastle 2 - 1 Aston Villa" },
    ],
    highlightsUrl: "https://www.youtube.com/results?search_query=Newcastle+vs+Aston+Villa",
    statsUrl: "https://www.premierleague.com/matches/Newcastle",
  },
  m5: {
    matchId: "m5",
    timeline: [
      { time: "0'", event: "Match starts — Brighton vs West Ham (LIVE)" },
      { time: "3'", event: "⚽ Goal! Mitoma (BRI)" },
      { time: "14'", event: "Yellow Card — Fornals (WHU)" },
      { time: "28'", event: "⚽ Goal! Kudus (WHU)" },
      { time: "35'", event: "Yellow Card — Lewis Dunk (BRI)" },
      { time: "45'", event: "Half Time: Brighton 1 - 1 West Ham" },
      { time: "52'", event: "⚽ Goal! Ayew (WHU) — Assist: Soucek" },
      { time: "NOW", event: "54' — Match in progress" },
    ],
    highlightsUrl: "https://www.youtube.com/results?search_query=Brighton+vs+West+Ham",
    statsUrl: "https://www.premierleague.com/matches/Brighton",
  },
  m6: {
    matchId: "m6",
    timeline: [
      { time: "0'", event: "Match starts — Everton vs Wolves" },
      { time: "12'", event: "⚽ Goal! Calvert-Lewin (EVE)" },
      { time: "18'", event: "Yellow Card — Semedo (WOL)" },
      { time: "32'", event: "⚽ Goal! Hwang Hee-chan (WOL)" },
      { time: "45'", event: "Half Time: Everton 1 - 1 Wolves" },
      { time: "58'", event: "⚽ Goal! McNeil (EVE)" },
      { time: "71'", event: "Yellow Card — Lemina (WOL)" },
      { time: "77'", event: "VAR Review: Handball check — No penalty" },
      { time: "88'", event: "Yellow Card — Doherty (WOL)" },
      { time: "90+5'", event: "Full Time: Everton 2 - 1 Wolves" },
    ],
    highlightsUrl: "https://www.youtube.com/results?search_query=Everton+vs+Wolves",
    statsUrl: "https://www.premierleague.com/matches/Everton",
  },
};

// ── Mock User ─────────────────────────────────────────────────────────────────
export const MOCK_USER = {
  address: "GDKXJNLE2YQFPQZ5TK3VZRKPTMJ4OLR3QB7IU6FSCZ6KQF7H4V29F3H",
  displayAddress: "GDKX...9F3H",
  balanceUSD: 2500,
  balanceXLM: 2500 / XLM_USD_RATE, // ~20,833 XLM
};

export const MOCK_BADGES = ["Early Predictor", "3-Win Streak"];

// ── Default stakes ────────────────────────────────────────────────────────────
// The seeded wallet address matches MOCK_USER so that first-time users who
// connect with the demo key see the sample history. New wallets start empty.
const SEED_WALLET = "GDKXJNLE2YQFPQZ5TK3VZRKPTMJ4OLR3QB7IU6FSCZ6KQF7H4V29F3H";

export const MOCK_STAKES: Stake[] = [
  // Active (3)
  {
    id: "s1",
    pollId: "m1-p1",
    matchId: "m1",
    matchName: "Chelsea vs Man Utd",
    question: "Will Palmer score a goal?",
    side: "yes",
    amount: 200,
    status: "active",
    wallet: SEED_WALLET,
  },
  {
    id: "s2",
    pollId: "m2-p2",
    matchId: "m2",
    matchName: "Arsenal vs Liverpool",
    question: "Will Arsenal keep a clean sheet?",
    side: "no",
    amount: 500,
    status: "active",
    wallet: SEED_WALLET,
  },
  {
    id: "s3",
    pollId: "m3-p4",
    matchId: "m3",
    matchName: "Man City vs Tottenham",
    question: "Will total goals be over 2.5?",
    side: "yes",
    amount: 150,
    status: "active",
    wallet: SEED_WALLET,
  },
  // Pending resolution (2)
  {
    id: "s4",
    pollId: "m6-p3",
    matchId: "m6",
    matchName: "Everton vs Wolves",
    question: "Will there be a red card?",
    side: "no",
    amount: 300,
    status: "pending_resolution",
    resolutionNote: "Voting in progress",
    wallet: SEED_WALLET,
  },
  {
    id: "s5",
    pollId: "m6-p5",
    matchId: "m6",
    matchName: "Everton vs Wolves",
    question: "Will there be a VAR review?",
    side: "no",
    amount: 180,
    status: "pending_resolution",
    resolutionNote: "Admin review",
    wallet: SEED_WALLET,
  },
  // Completed — 4 wins, 2 losses (profit and roi computed via calculateCompletedPayout with 5% platform fee applied)
  {
    id: "s6",
    pollId: "m6-p1",
    matchId: "m6",
    matchName: "Everton vs Wolves",
    question: "Will Everton win?",
    side: "yes",
    amount: 100,
    status: "completed",
    outcome: "won",
    profit: calculateCompletedPayout(100, 150).profit,
    roi: calculateCompletedPayout(100, 150).roi,
    grossPayout: 150,
    claimed: false,
    wallet: SEED_WALLET,
  },
  {
    id: "s7",
    pollId: "m6-p2",
    matchId: "m6",
    matchName: "Everton vs Wolves",
    question: "Will total goals be over 2.5?",
    side: "yes",
    amount: 200,
    status: "completed",
    outcome: "won",
    profit: calculateCompletedPayout(200, 320).profit,
    roi: calculateCompletedPayout(200, 320).roi,
    grossPayout: 320,
    claimed: false,
    wallet: SEED_WALLET,
  },
  {
    id: "s8",
    pollId: "m5-p1",
    matchId: "m5",
    matchName: "Brighton vs West Ham",
    question: "Will Brighton win?",
    side: "yes",
    amount: 250,
    status: "completed",
    outcome: "won",
    profit: calculateCompletedPayout(250, 437).profit,
    roi: calculateCompletedPayout(250, 437).roi,
    grossPayout: 437,
    claimed: false,
    wallet: SEED_WALLET,
  },
  {
    id: "s9",
    pollId: "m5-p2",
    matchId: "m5",
    matchName: "Brighton vs West Ham",
    question: "Will total goals be over 2.5?",
    side: "no",
    amount: 400,
    status: "completed",
    outcome: "won",
    profit: calculateCompletedPayout(400, 750).profit,
    roi: calculateCompletedPayout(400, 750).roi,
    grossPayout: 750,
    claimed: false,
    wallet: SEED_WALLET,
  },
  {
    id: "s10",
    pollId: "m4-p1",
    matchId: "m4",
    matchName: "Newcastle vs Aston Villa",
    question: "Will there be a red card?",
    side: "yes",
    amount: 100,
    status: "completed",
    outcome: "lost",
    profit: -100,
    roi: -100.0,
    wallet: SEED_WALLET,
  },
  {
    id: "s11",
    pollId: "m3-p1",
    matchId: "m3",
    matchName: "Man City vs Tottenham",
    question: "Will Haaland receive a yellow card?",
    side: "yes",
    amount: 300,
    status: "completed",
    outcome: "lost",
    profit: -300,
    roi: -100.0,
    wallet: SEED_WALLET,
  },
];

// ── Voting opportunities ──────────────────────────────────────────────────────
//
// Rules kept consistent with use-voting.ts:
//   • Every pollId MUST reference a poll whose status === "voting" so
//     availablePolls() can surface it.
//   • reward = (yesPool + noPool) * 0.005  — matches getVoteReward formula.
//
// Dev assertion (runs only in development builds):
if (process.env.NODE_ENV === "development") {
  // Resolved at module evaluation time — safe to run once on first import.
  const _assertOpportunities = () => {
    const votingPollIds = new Set(
      POLLS.filter((p) => p.status === "voting").map((p) => p.id),
    );

    for (const opp of MOCK_VOTING_OPPORTUNITIES) {
      const poll = POLLS.find((p) => p.id === opp.pollId);

      if (!poll) {
        console.warn(
          `[MOCK] VotingOpportunity pollId "${opp.pollId}" has no matching poll.`,
        );
        continue;
      }

      if (!votingPollIds.has(opp.pollId)) {
        console.warn(
          `[MOCK] VotingOpportunity pollId "${opp.pollId}" has status "${poll.status}", not "voting".`,
        );
      }

      const expectedReward = (poll.yesPool + poll.noPool) * 0.005;
      if (Math.abs(opp.reward - expectedReward) > 0.01) {
        console.warn(
          `[MOCK] VotingOpportunity "${opp.pollId}" reward ${opp.reward} ≠ expected ${expectedReward}.`,
        );
      }
    }
  };

  // Defer to avoid TDZ — POLLS and MOCK_VOTING_OPPORTUNITIES are defined
  // in this same module but must both be initialised before we check them.
  setTimeout(_assertOpportunities, 0);
}

export const MOCK_VOTING_OPPORTUNITIES: VotingOpportunity[] = [
  {
    // m6-p1: (7200 + 4800) * 0.005 = 60
    pollId: "m6-p1",
    matchId: "m6",
    matchName: "Everton vs Wolves",
    question: "Will Everton win?",
    reward: 60,
    evidence: "Match in progress — vote on the final result",
  },
  {
    // m6-p2: (5400 + 5600) * 0.005 = 55
    pollId: "m6-p2",
    matchId: "m6",
    matchName: "Everton vs Wolves",
    question: "Will total goals be over 2.5?",
    reward: 55,
    evidence: "Full-time — 2 goals scored in total",
  },
  {
    // m6-p3: (1800 + 9200) * 0.005 = 55
    pollId: "m6-p3",
    matchId: "m6",
    matchName: "Everton vs Wolves",
    question: "Will there be a red card?",
    reward: 55,
    evidence: "Match ended without red cards per official report",
  },
  {
    // m6-p5: (4300 + 6700) * 0.005 = 55
    pollId: "m6-p5",
    matchId: "m6",
    matchName: "Everton vs Wolves",
    question: "Will there be a VAR review?",
    reward: 55,
    evidence: "VAR used to review handball in 74th minute",
  },
];

// ── Platform stats ────────────────────────────────────────────────────────────
export const PLATFORM_STATS: PlatformStats = {
  totalValueLocked: 847_293,
  activePredictions: 234,
  communityMembers: 12_847,
  totalPayouts: 3_200_000,
};

// ── Transactions (Stellar format — 64 hex chars, 100 stroops fee) ─────────────
export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    hash: "a3f2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2",
    type: "stake",
    amount: 200,
    amountXLM: 200 / XLM_USD_RATE,
    description: 'Staked $200 on "Will Palmer score?" – YES',
    timestamp: addDays(-3, 10),
    ledger: 50_123_456,
    fee: "100 stroops (0.0000100 XLM)",
    status: "confirmed",
  },
  {
    hash: "b4e5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5",
    type: "stake",
    amount: 500,
    amountXLM: 500 / XLM_USD_RATE,
    description: 'Staked $500 on "Will Arsenal keep a clean sheet?" – NO',
    timestamp: addDays(-3, 11),
    ledger: 50_123_789,
    fee: "100 stroops (0.0000100 XLM)",
    status: "confirmed",
  },
  {
    hash: "c5f6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6",
    type: "stake",
    amount: 150,
    amountXLM: 150 / XLM_USD_RATE,
    description: 'Staked $150 on "Will total goals be over 2.5?" – YES',
    timestamp: addDays(-2, 14),
    ledger: 50_134_012,
    fee: "100 stroops (0.0000100 XLM)",
    status: "confirmed",
  },
  {
    hash: "d6a7e8f9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
    type: "claim",
    amount: 437,
    amountXLM: 437 / XLM_USD_RATE,
    description: 'Claimed winnings from "Will Brighton win?" pool',
    timestamp: addDays(-1, 18),
    ledger: 50_145_678,
    fee: "100 stroops (0.0000100 XLM)",
    status: "confirmed",
  },
  {
    hash: "e7b8f9a0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
    type: "vote_reward",
    amount: 15,
    amountXLM: 15 / XLM_USD_RATE,
    description: 'Vote reward for resolving "Will Everton win?" poll',
    timestamp: addDays(-1, 19),
    ledger: 50_145_901,
    fee: "100 stroops (0.0000100 XLM)",
    status: "confirmed",
  },
  {
    hash: "f8c9a0b1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9",
    type: "vote_reward",
    amount: 8,
    amountXLM: 8 / XLM_USD_RATE,
    description: "Vote reward for resolving VAR review poll",
    timestamp: addDays(0, 9),
    ledger: 50_156_234,
    fee: "100 stroops (0.0000100 XLM)",
    status: "confirmed",
  },
  {
    hash: "a9d0b1c2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    type: "poll_creation",
    amount: 0,
    amountXLM: 0,
    description: 'Poll creation fee — "Will there be a red card?"',
    timestamp: addDays(-4, 12),
    ledger: 50_098_765,
    fee: "100 stroops (0.0000100 XLM)",
    status: "confirmed",
  },
];
/**
 * Mock/sample data for development and testing
 */

export const mockData = {
  // Implementation placeholder
};
