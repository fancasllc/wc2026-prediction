import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode, TouchEvent } from "react";
import Papa from "papaparse";
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Flame,
  History,
  ListPlus,
  Menu,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  Trophy,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

type View = "open" | "closed" | "matchDetail" | "people" | "personDetail" | "admin" | "settings";

const FIFA_RANKING_URL = "https://www.jsports.co.jp/football/fifa/football_men_ranking/";
const FIFA_STANDINGS_URL = "https://www.flashscore.co.jp/soccer/world/world-championship/standings/SbLsX4y7/standings/";
const WORLD_CUP_NEWS_URL = "https://www.olympics.com/ja/news/fifa-world-cup-2026-schedule-results-scores-standings-list-japan";
const BET_CHANNEL_URL = "https://bet-channel.com/matches?ct=10037";

const COUNTRY_FLAG_CODES: Record<string, string> = {
  アメリカ: "us",
  アルジェリア: "dz",
  アルゼンチン: "ar",
  イラク: "iq",
  イラン: "ir",
  イングランド: "gb-eng",
  ウズベキスタン: "uz",
  ウルグアイ: "uy",
  エクアドル: "ec",
  エジプト: "eg",
  オーストラリア: "au",
  オーストリア: "at",
  オランダ: "nl",
  カタール: "qa",
  カナダ: "ca",
  ガーナ: "gh",
  カーボベルデ: "cv",
  キュラソー: "cw",
  クロアチア: "hr",
  コートジボワール: "ci",
  コロンビア: "co",
  コンゴ民主共和国: "cd",
  サウジアラビア: "sa",
  スイス: "ch",
  スウェーデン: "se",
  スコットランド: "gb-sct",
  スペイン: "es",
  セネガル: "sn",
  チェコ: "cz",
  チュニジア: "tn",
  トルコ: "tr",
  ドイツ: "de",
  ニュージーランド: "nz",
  ノルウェー: "no",
  ハイチ: "ht",
  パナマ: "pa",
  パラグアイ: "py",
  ブラジル: "br",
  フランス: "fr",
  ベルギー: "be",
  ボスニア: "ba",
  ボスニア・ヘルツェゴビナ: "ba",
  ポルトガル: "pt",
  メキシコ: "mx",
  モロッコ: "ma",
  ヨルダン: "jo",
  韓国: "kr",
  南アフリカ: "za",
  日本: "jp",
};

const STAGE_NOTICE_CARDS = [
  {
    id: "round-of-32",
    title: "ラウンド・オブ・32",
    startsAt: "2026-06-29T04:00:00+09:00",
  },
  {
    id: "round-of-16",
    title: "ラウンド・オブ・16",
    startsAt: "2026-07-05T02:00:00+09:00",
  },
  {
    id: "quarter-finals",
    title: "準々決勝",
    startsAt: "2026-07-10T05:00:00+09:00",
  },
  {
    id: "third-place",
    title: "3位決定戦",
    startsAt: "2026-07-19T06:00:00+09:00",
  },
  {
    id: "final",
    title: "決勝",
    startsAt: "2026-07-20T04:00:00+09:00",
  },
];

type MatchOption = {
  id: string;
  label: string;
};

type MatchRecord = {
  id: string;
  title: string;
  stage: string;
  venue: string;
  startsAt: string;
  closesAt: string;
  question: string;
  notice?: string;
  options: MatchOption[];
  resultOptionId?: string;
  settledAt?: string;
  homeScore?: number;
  awayScore?: number;
  handicapOptionId?: string;
  handicapPoints?: number;
  externalOdds?: ExternalOddsRecord;
};

type ExternalOddsRecord = {
  source: string;
  sourceUrl: string;
  homeLabel: string;
  awayLabel: string;
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
  fetchedAt: string;
};

type YoutubeVideo = {
  id: string;
  title: string;
  url: string;
  embedUrl: string;
  thumbnailUrl: string;
  publishedAt?: string | null;
  channelTitle: string;
  sourceUrl: string;
  fetchedAt: string;
};

type ScheduledMatchCandidate = {
  id: string;
  title: string;
  startsAt: string;
  options: string[];
};

type VoteRecord = {
  id: string;
  matchId: string;
  optionId: string;
  userName: string;
  amount: number;
  createdAt: string;
};

type UserPointSnapshot = {
  snapshotDate: string;
  userName: string;
  settledNet: number;
  grossPayout: number;
  updatedAt?: string;
};

type PointAdjustmentRecord = {
  id: string;
  adjustmentId: string;
  title: string;
  reason: string;
  userName: string;
  amount: number;
  createdAt: string;
};

type AppData = {
  matches: MatchRecord[];
  votes: VoteRecord[];
  knownUsers: string[];
  userPointSnapshots?: UserPointSnapshot[];
  pointAdjustments?: PointAdjustmentRecord[];
};

type BackupRecord = {
  id: string;
  reason: string;
  createdAt: string;
  matchCount: number;
  voteCount: number;
  userCount: number;
  byteSize: number;
  externalStatus?: "not_configured" | "uploaded" | "failed" | string;
  externalProvider?: string | null;
  externalBucket?: string | null;
  externalObjectKey?: string | null;
  externalUrl?: string | null;
  externalError?: string | null;
  externalUploadedAt?: string | null;
};

type BackupStorageStatus = {
  configured: boolean;
  provider: string;
  bucket: string | null;
  prefix: string;
};

type AutoBetConfig = {
  userName: string;
  defaultMaxAmount: number;
  executeOffsetMinutes: number;
};

type ConditionalBetRule = {
  optionId: string;
  optionLabel: string;
  priority: number;
  minOdds: number;
  maxAmount: number;
};

type ConditionalBetStrategy = {
  type: "conditional" | string;
  executeOffsetMinutes?: number;
  rules?: ConditionalBetRule[];
};

type AutoBetReservationResult = {
  type?: string;
  reason?: string;
  optionId?: string;
  optionLabel?: string;
  amount?: number;
  recommendations?: AutoBetReservationResult[];
  rules?: Array<
    ConditionalBetRule & {
      beforeOdds?: number | null;
      amount?: number;
      afterOdds?: number | null;
      skipped?: boolean;
      reason?: string;
    }
  >;
  votes?: VoteRecord[];
};

type AutoBetReservation = {
  id: string;
  matchId: string;
  matchTitle: string;
  userName: string;
  executeAt: string;
  maxAmount: number;
  status: "pending" | "processing" | "executed" | "skipped" | "failed" | "cancelled" | string;
  strategy?: ConditionalBetStrategy;
  recommendation?: AutoBetReservationResult;
  analysis?: unknown;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  executedAt?: string | null;
};

type AutoBetReservationView = "upcoming" | "history";

type VoteDraft = {
  name: string;
  amount: string;
  optionId: string;
};

type PendingVote = {
  matchId: string;
  optionId: string;
  optionLabel: string;
  userName: string;
  amount: number;
};

type PendingVoteDelete = {
  vote: VoteRecord;
  match: MatchRecord;
};

type PendingVoteImpact = {
  beforeOdds: number | null;
  afterOdds: number;
  totalBefore: number;
  totalAfter: number;
  optionBefore: number;
  optionAfter: number;
  estimatedGross: number;
  estimatedNet: number;
  userTotalAfter: number;
  userOptionRows: Array<{
    optionId: string;
    label: string;
    amount: number;
    gross: number;
    net: number;
    currentSelection: boolean;
  }>;
};

type ScoreDraft = {
  home: string;
  away: string;
};

type ScoreDecision = {
  homeOption: MatchOption;
  awayOption: MatchOption;
  drawOption?: MatchOption;
  homeScore: number;
  awayScore: number;
  adjustedHomeScore: number;
  adjustedAwayScore: number;
  resultOptionId: string;
  resultLabel: string;
  handicap: ReturnType<typeof getMatchHandicap>;
};

type MatchDraft = {
  title: string;
  startsAt: string;
  closesAt: string;
  optionsText: string;
  notice: string;
  handicapOptionId: string;
  handicapPoints: number;
};

type PointAdjustmentDraft = {
  title: string;
  reason: string;
  entries: Array<{ userName: string; amount: string }>;
};

type MotivationItem = {
  id: string;
  name: string;
  iconSrc: string | null;
  value: string;
  meta: string;
  metaTone: "positive" | "negative" | "neutral";
  tone: "positive" | "neutral";
};

type PersonTrendRow = {
  name: string;
  net: number;
  pending: number;
  points: Array<{ label: string; value: number }>;
};

type CsvMatchRow = {
  title?: string;
  startsAt?: string;
  closesAt?: string;
  options?: string;
  notice?: string;
  注意事項?: string;
};

type ApiErrorBody = {
  error?: string;
  method?: string;
  path?: string;
  details?: Record<string, string | number | boolean | null | undefined>;
};

const STORAGE_KEY = "wc2026-prediction-pool:data:v3";
const LAST_NAME_KEY = "wc2026-prediction-pool:last-name";
const ADMIN_TOKEN_KEY = "wc2026-prediction-pool:admin-token";
const SETTINGS_PASSWORD_KEY = "wc2026-prediction-pool:settings-password";
const MIN_VOTE_AMOUNT = 100;
const VOTE_AMOUNT_STEP = 100;
const VOTE_CANCEL_WINDOW_MS = 5 * 60 * 1000;
const VOTE_CANCEL_CLOCK_SKEW_MS = 10 * 1000;
const HANDICAP_VALUES = Array.from({ length: 11 }, (_, index) => index * 0.5);
const hiddenUserNames = new Set(["いつき"]);
const personIconFileNames = new Set([
  "あずみ",
  "あづみ",
  "あらい",
  "いまい",
  "おうくら",
  "おおたに",
  "キング",
  "しおん",
  "たいら",
  "ひらき",
  "ひろた",
  "ふるたにくん",
  "みやなか",
  "もえか",
  "刃霧要",
]);
const personIconAliases: Record<string, string> = {};

function getStoredAdminToken() {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  return token;
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers, ...requestOptions } = options ?? {};
  const response = await fetch(path, {
    ...requestOptions,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    const details = body?.details
      ? Object.entries(body.details)
          .filter(([, value]) => value !== undefined && value !== null && value !== "")
          .map(([key, value]) => `${key}: ${String(value)}`)
      : [];
    throw new Error(
      [
        body?.error ?? `Request failed: ${response.status}`,
        `HTTP ${response.status}`,
        body?.method && body?.path ? `request: ${body.method} ${body.path}` : "",
        ...details,
      ].filter(Boolean).join("\n"),
    );
  }

  return response.json() as Promise<T>;
}

async function fetchAppState() {
  return apiRequest<AppData>("/api/state");
}

async function fetchLatestYoutubeVideo(forceRefresh = false) {
  return apiRequest<{ video: YoutubeVideo | null; refreshMinutes: number }>(
    `/api/youtube/latest${forceRefresh ? "?refresh=1" : ""}`,
  );
}

async function fetchScheduledMatches() {
  return apiRequest<{ matches: ScheduledMatchCandidate[] }>("/api/scheduled-matches");
}

async function createScheduledMatchWithHandicap(
  matchId: string,
  handicap: { handicapOptionIndex: number; handicapPoints: number },
) {
  return apiRequest<{
    state: AppData;
    matches: ScheduledMatchCandidate[];
  }>(`/api/scheduled-matches/${matchId}`, {
    method: "POST",
    body: JSON.stringify(handicap),
  });
}

async function postState(path: string, body?: unknown, method = "POST", adminToken = "") {
  const result = await apiRequest<{ state: AppData }>(path, {
    method,
    headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return result.state;
}

async function requestAdminToken(password: string) {
  return apiRequest<{ token: string; expiresAt: string }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

async function requestBackups(adminToken: string) {
  return apiRequest<{
    backups: BackupRecord[];
    schedule: { timezone: string; hour: number; afterSettlementDelaySeconds: number };
    externalStorage: BackupStorageStatus;
  }>("/api/admin/backups", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}

async function createBackup(adminToken: string) {
  return apiRequest<{ backup: BackupRecord; backups: BackupRecord[] }>("/api/admin/backups", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}

async function syncBackupExternally(adminToken: string, backupId: string) {
  return apiRequest<{
    externalResult: { status: string; error?: string };
    backups: BackupRecord[];
  }>(`/api/admin/backups/${backupId}/external-sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}

function settingsHeaders(adminToken: string, settingsPassword: string) {
  return {
    Authorization: `Bearer ${adminToken}`,
    "X-Settings-Password": settingsPassword,
  };
}

async function requestAutoBetSettings(adminToken: string, settingsPassword: string) {
  return apiRequest<{
    config: AutoBetConfig;
    reservations: AutoBetReservation[];
  }>("/api/admin/auto-bet", {
    headers: settingsHeaders(adminToken, settingsPassword),
  });
}

async function createAutoBetReservation(
  adminToken: string,
  settingsPassword: string,
  reservation: {
    matchId: string;
    executeAt: string;
    rules: Array<{ optionId: string; priority: number; minOdds: number; maxAmount: number }>;
  },
) {
  return apiRequest<{ reservations: AutoBetReservation[] }>("/api/admin/auto-bet/reservations", {
    method: "POST",
    headers: settingsHeaders(adminToken, settingsPassword),
    body: JSON.stringify(reservation),
  });
}

async function cancelAutoBetReservation(
  adminToken: string,
  settingsPassword: string,
  reservationId: string,
) {
  return apiRequest<{ reservations: AutoBetReservation[] }>(
    `/api/admin/auto-bet/reservations/${reservationId}`,
    {
      method: "DELETE",
      headers: settingsHeaders(adminToken, settingsPassword),
    },
  );
}

const worldCupWinnerLabels = [
  "フランス",
  "スペイン",
  "アルゼンチン",
  "イングランド",
  "ポルトガル",
  "ブラジル",
  "オランダ",
  "モロッコ",
  "ベルギー",
  "ドイツ",
  "クロアチア",
  "コロンビア",
  "セネガル",
  "メキシコ",
  "アメリカ",
  "ウルグアイ",
  "日本",
  "スイス",
  "イラン",
  "トルコ",
  "エクアドル",
  "オーストリア",
  "韓国",
  "オーストラリア",
  "アルジェリア",
  "エジプト",
  "カナダ",
  "ノルウェー",
  "パナマ",
  "コートジボワール",
  "スウェーデン",
  "パラグアイ",
  "チェコ",
  "スコットランド",
  "チュニジア",
  "コンゴ民主共和国",
  "ウズベキスタン",
  "カタール",
  "イラク",
  "南アフリカ",
  "サウジアラビア",
  "ヨルダン",
  "ボスニア・ヘルツェゴビナ",
  "カーボベルデ",
  "ガーナ",
  "キュラソー",
  "ハイチ",
  "ニュージーランド",
];

const defaultMatches: MatchRecord[] = [
  {
    id: "world-cup-winner-2026",
    title: "ワールドカップ優勝国",
    stage: "",
    venue: "",
    startsAt: "2026-06-12T04:00",
    closesAt: "2026-06-12T04:00",
    question: "",
    options: worldCupWinnerLabels.map((label, index) => ({
      id: `winner-${String(index + 1).padStart(2, "0")}`,
      label,
    })),
  },
];

const emptyMatchDraft: MatchDraft = {
  title: "",
  startsAt: "2026-06-12T04:00",
  closesAt: "2026-06-12T04:00",
  optionsText: worldCupWinnerLabels.join("\n"),
  notice: "",
  handicapOptionId: "",
  handicapPoints: 0,
};

const emptyPointAdjustmentDraft: PointAdjustmentDraft = {
  title: "",
  reason: "",
  entries: [
    { userName: "", amount: "" },
    { userName: "", amount: "" },
  ],
};

const csvTemplate = `title,startsAt,closesAt,options,注意事項
ワールドカップ優勝国,2026-06-12T04:00,2026-06-12T04:00,${worldCupWinnerLabels.join("|")},`;

const pointsFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 0,
});

function createId(prefix: string) {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

function loadData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { matches: defaultMatches, votes: [], knownUsers: [], userPointSnapshots: [], pointAdjustments: [] };
  }

  try {
    const parsed = JSON.parse(raw) as AppData;
    return {
      matches: parsed.matches?.length ? parsed.matches : defaultMatches,
      votes: parsed.votes ?? [],
      knownUsers: parsed.knownUsers ?? [],
      userPointSnapshots: parsed.userPointSnapshots ?? [],
      pointAdjustments: parsed.pointAdjustments ?? [],
    };
  } catch {
    return { matches: defaultMatches, votes: [], knownUsers: [], userPointSnapshots: [], pointAdjustments: [] };
  }
}

function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function formatDateTime(value: string) {
  if (!value) return "未設定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTokyoDateTime(value: string) {
  if (!value) return "未設定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toDateTimeLocalValue(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatStartsIn(value: string, now: Date) {
  const startsAt = new Date(value).getTime();
  if (Number.isNaN(startsAt)) return "開始予定";

  const diffMinutes = Math.max(0, Math.ceil((startsAt - now.getTime()) / 60_000));
  if (diffMinutes <= 0) return "開始予定日を迎えました";

  const days = Math.floor(diffMinutes / 1440);
  const hours = Math.floor((diffMinutes % 1440) / 60);
  const minutes = diffMinutes % 60;

  if (days > 0) return `開始まで ${days}日 ${hours}時間`;
  if (hours > 0) return `開始まで ${hours}時間 ${minutes}分`;
  return `開始まで ${minutes}分`;
}

function formatPoints(value: number) {
  return `${pointsFormatter.format(Math.round(value))} pt`;
}

function compactDisplayName(value: string) {
  const chars = Array.from(value);
  return chars.length > 4 ? `${chars.slice(0, 4).join("")}...` : value;
}

function getPersonIconSrc(name: string) {
  const normalized = normalizeName(name);
  const fileName = personIconAliases[normalized] ?? normalized;
  if (!personIconFileNames.has(fileName)) return null;
  return `/people-icons-small/${encodeURIComponent(fileName)}.png`;
}

function formatPercent(value: number) {
  return `${pointsFormatter.format(Math.round(value))}%`;
}

function formatHandicapPoints(value: number) {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function hasHalfPointHandicap(value: number) {
  return Math.abs(value % 1) === 0.5;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatExternalBackupStatus(backup: BackupRecord) {
  if (backup.externalStatus === "uploaded") {
    return backup.externalUploadedAt
      ? `外部保存済み ${formatDateTime(backup.externalUploadedAt)}`
      : "外部保存済み";
  }
  if (backup.externalStatus === "failed") return "外部保存失敗";
  return "外部保存未設定";
}

function minutesRemaining(closesAt: string, now: Date) {
  const diff = new Date(closesAt).getTime() - now.getTime();
  if (diff <= 0) return "締切済み";
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `残り ${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return `残り ${hours}時間${restMinutes ? ` ${restMinutes}分` : ""}`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return `残り ${days}日${restHours ? ` ${restHours}時間` : ""}`;
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function isHiddenUserName(name: string) {
  return hiddenUserNames.has(normalizeName(name));
}

function shortenName(name: string, maxLength: number) {
  const characters = Array.from(name);
  if (characters.length <= maxLength) return name;
  return `${characters.slice(0, maxLength).join("")}...`;
}

function splitOptions(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function makeOptions(labels: string[]) {
  return labels.map((label, index) => ({
    id: createId(`option-${index + 1}`),
    label,
  }));
}

function getMatchHandicap(match: MatchRecord | undefined) {
  const points = Number(match?.handicapPoints ?? 0);
  if (!match?.handicapOptionId || points <= 0) return null;
  const option = match.options.find((item) => item.id === match.handicapOptionId);
  if (!option) return null;
  return { option, points };
}

function optionDisplayLabel(match: MatchRecord | undefined, option: MatchOption | undefined) {
  if (!option) return "未設定";
  const handicap = getMatchHandicap(match);
  if (!handicap || handicap.option.id !== option.id) return option.label;
  return `${option.label}（＋${formatHandicapPoints(handicap.points)}）`;
}

function optionLabel(match: MatchRecord | undefined, optionId: string) {
  const option = match?.options.find((item) => item.id === optionId);
  return optionDisplayLabel(match, option);
}

function isDrawOption(option: MatchOption | undefined) {
  const label = option?.label ?? "";
  return label.includes("引き分け") || label.toLowerCase() === "draw";
}

function getTeamOptions(match: MatchRecord) {
  return match.options.filter((option) => !isDrawOption(option)).slice(0, 2);
}

function getDrawOption(match: MatchRecord) {
  return match.options.find((option) => isDrawOption(option));
}

function usesScoreSettlement(match: MatchRecord) {
  const hasVersusTitle = /(?:VS|ＶＳ|\bvs\b|対)/i.test(match.title);
  return hasVersusTitle && getTeamOptions(match).length >= 2;
}

function parseScoreInput(value: string | number | undefined) {
  if (value === undefined || value === "") return null;
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || !Number.isInteger(score)) return null;
  return score;
}

function formatScoreValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function evaluateScoreSettlement(
  match: MatchRecord,
  homeScoreInput: string | number | undefined,
  awayScoreInput: string | number | undefined,
): { ok: true; decision: ScoreDecision } | { ok: false; error: string } {
  const [homeOption, awayOption] = getTeamOptions(match);
  const drawOption = getDrawOption(match);
  const homeScore = parseScoreInput(homeScoreInput);
  const awayScore = parseScoreInput(awayScoreInput);

  if (!homeOption || !awayOption) {
    return { ok: false, error: "国別の選択肢を2つ以上設定してください。" };
  }
  if (homeScore === null || awayScore === null) {
    return { ok: false, error: "得点は0以上の整数で入力してください。" };
  }

  const handicap = getMatchHandicap(match);
  const adjustedHomeScore =
    handicap?.option.id === homeOption.id ? homeScore + handicap.points : homeScore;
  const adjustedAwayScore =
    handicap?.option.id === awayOption.id ? awayScore + handicap.points : awayScore;
  let resultOption: MatchOption | undefined;

  if (adjustedHomeScore > adjustedAwayScore) {
    resultOption = homeOption;
  } else if (adjustedAwayScore > adjustedHomeScore) {
    resultOption = awayOption;
  } else {
    resultOption = drawOption;
  }

  if (!resultOption) {
    return {
      ok: false,
      error: "ハンデ反映後に同点ですが、引き分けの選択肢がありません。",
    };
  }

  return {
    ok: true,
    decision: {
      homeOption,
      awayOption,
      drawOption,
      homeScore,
      awayScore,
      adjustedHomeScore,
      adjustedAwayScore,
      resultOptionId: resultOption.id,
      resultLabel: optionDisplayLabel(match, resultOption),
      handicap,
    },
  };
}

function getScoreDecisionFromMatch(match: MatchRecord) {
  if (match.homeScore === undefined || match.awayScore === undefined) return null;
  const result = evaluateScoreSettlement(match, match.homeScore, match.awayScore);
  return result.ok ? result.decision : null;
}

function cleanCountryLabel(label: string) {
  return label
    .replace(/[（(]\s*[＋+]?\d+(?:\.\d+)?\s*[)）]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/＜[^＞]+＞/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function getCountryFlag(label: string | undefined) {
  if (!label) return null;
  const cleaned = cleanCountryLabel(label);
  const exactCode = COUNTRY_FLAG_CODES[cleaned];
  if (exactCode) return { code: exactCode, name: cleaned };

  const matchedName = Object.keys(COUNTRY_FLAG_CODES)
    .sort((a, b) => b.length - a.length)
    .find((name) => cleaned.includes(name));
  if (!matchedName) return null;
  return { code: COUNTRY_FLAG_CODES[matchedName], name: matchedName };
}

function splitMatchTitle(title: string) {
  const parts = title.split(/\s+(?:VS|vs|Vs|ＶＳ|ｖｓ)\s+/);
  if (parts.length !== 2) return null;
  return { left: parts[0], right: parts[1] };
}

function CountryFlag({
  label,
}: {
  label: string | undefined;
}) {
  const flag = getCountryFlag(label);
  if (!flag) return null;
  return (
    <img
      alt={`${flag.name}の国旗`}
      className="country-flag"
      decoding="async"
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
      src={`/flags/${flag.code}.png`}
    />
  );
}

function MatchTitleWithFlags({
  title,
}: {
  title: string;
}) {
  const splitTitle = splitMatchTitle(title);
  if (!splitTitle) return <>{title}</>;
  return (
    <span className="match-title-flags">
      <span className="match-title-side">
        <CountryFlag label={splitTitle.left} />
        <span>{splitTitle.left}</span>
      </span>
      <span className="match-title-vs">VS</span>
      <span className="match-title-side right">
        <span>{splitTitle.right}</span>
        <CountryFlag label={splitTitle.right} />
      </span>
    </span>
  );
}

function OptionLabelWithFlag({
  label,
}: {
  label: string;
}) {
  return (
    <span className="option-label-flag">
      <CountryFlag label={label} />
      <span>{label}</span>
    </span>
  );
}

function normalizeExternalOddsLabel(value: string) {
  return value
    .normalize("NFKC")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[+＋\d.\-−\s]/g, "")
    .toLowerCase()
    .trim();
}

function getExternalOddsForOption(match: MatchRecord, option: MatchOption) {
  const externalOdds = match.externalOdds;
  if (!externalOdds) return undefined;
  if (isDrawOption(option)) return externalOdds.drawOdds;

  const label = normalizeExternalOddsLabel(option.label);
  if (label && label === normalizeExternalOddsLabel(externalOdds.homeLabel)) return externalOdds.homeOdds;
  if (label && label === normalizeExternalOddsLabel(externalOdds.awayLabel)) return externalOdds.awayOdds;
  return undefined;
}

function formatExternalOdds(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}x` : "-";
}

function isMatchOpen(match: MatchRecord, now: Date) {
  return !match.resultOptionId && new Date(match.closesAt).getTime() > now.getTime();
}

function canCancelVote(vote: VoteRecord, match: MatchRecord | undefined, votes: VoteRecord[], now: Date) {
  const referenceTime = Math.max(now.getTime(), Date.now());
  if (!match || !isMatchOpen(match, new Date(referenceTime))) return false;
  const createdAt = new Date(vote.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  const hasLaterVote = votes.some((item) => {
    if (item.matchId !== vote.matchId || item.id === vote.id) return false;
    return new Date(item.createdAt).getTime() > createdAt;
  });
  if (hasLaterVote) return false;
  const age = referenceTime - createdAt;
  return age >= -VOTE_CANCEL_CLOCK_SKEW_MS && age <= VOTE_CANCEL_WINDOW_MS;
}

function getStatusLabel(match: MatchRecord, now: Date) {
  if (match.resultOptionId) return "確定済み";
  if (isMatchOpen(match, now)) return "受付中";
  return "受付終了";
}

function getMatchVotes(match: MatchRecord, votes: VoteRecord[]) {
  return votes.filter((vote) => vote.matchId === match.id);
}

function getOptionTotal(match: MatchRecord, votes: VoteRecord[], optionId: string) {
  return getMatchVotes(match, votes)
    .filter((vote) => vote.optionId === optionId)
    .reduce((sum, vote) => sum + vote.amount, 0);
}

function getMatchTotal(match: MatchRecord, votes: VoteRecord[]) {
  return getMatchVotes(match, votes).reduce((sum, vote) => sum + vote.amount, 0);
}

function calculateVotePayout(vote: VoteRecord, match: MatchRecord, allVotes: VoteRecord[]) {
  if (!match.resultOptionId) return { gross: 0, net: 0, won: false, settled: false };

  const matchVotes = getMatchVotes(match, allVotes);
  const totalPool = matchVotes.reduce((sum, item) => sum + item.amount, 0);
  const winningPool = matchVotes
    .filter((item) => item.optionId === match.resultOptionId)
    .reduce((sum, item) => sum + item.amount, 0);
  const won = vote.optionId === match.resultOptionId;
  const gross = won && winningPool > 0 ? (totalPool * vote.amount) / winningPool : 0;

  return {
    gross,
    net: gross - vote.amount,
    won,
    settled: true,
  };
}

function getVotePayout(
  vote: VoteRecord,
  match: MatchRecord | undefined,
  allVotes: VoteRecord[],
) {
  return match
    ? calculateVotePayout(vote, match, allVotes)
    : { gross: 0, net: 0, won: false, settled: false };
}

function getVoteOutcomeText(payout: ReturnType<typeof calculateVotePayout>) {
  if (!payout.settled) return "未確定";
  return payout.won ? "○ 的中" : "× 不的中";
}

function sortByDateAsc(a: MatchRecord, b: MatchRecord) {
  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
}

function sortByCloseDateAsc(a: MatchRecord, b: MatchRecord) {
  return new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime();
}

function sortByCloseDateDesc(a: MatchRecord, b: MatchRecord) {
  return new Date(b.closesAt).getTime() - new Date(a.closesAt).getTime();
}

function parseCsvMatches(text: string) {
  const parsed = Papa.parse<CsvMatchRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const matches = parsed.data
    .map((row): MatchRecord | null => {
      const title = row.title?.trim() ?? "";
      const startsAt = row.startsAt?.trim() ?? "";
      const notice = (row.notice ?? row.注意事項 ?? "").trim();
      const labels = (row.options ?? "")
        .split("|")
        .map((label) => label.trim())
        .filter(Boolean);

      if (!title || !startsAt || labels.length < 2) {
        return null;
      }

      return {
        id: createId("match"),
        title,
        stage: "",
        venue: "",
        startsAt,
        closesAt: row.closesAt?.trim() || startsAt,
        question: "",
        notice,
        options: makeOptions(labels),
      } satisfies MatchRecord;
    })
    .filter((match): match is MatchRecord => Boolean(match));

  return { matches, errors: parsed.errors };
}

function YoutubeHero({ video }: { video: YoutubeVideo | null }) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  useEffect(() => {
    setThumbnailFailed(false);
  }, [video?.id]);

  const showVideoCard = Boolean(video && !thumbnailFailed);

  return (
    <header className={`topbar ${showVideoCard ? "youtube-topbar" : ""}`}>
      {showVideoCard && video ? (
        <a
          className="youtube-hero-card"
          href={video.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${video.title}をYouTubeで開く`}
        >
          <img
            src={video.thumbnailUrl}
            alt=""
            width="480"
            height="360"
            loading="eager"
            decoding="async"
            onError={() => {
              if (!thumbnailFailed) {
                setThumbnailFailed(true);
              }
            }}
          />
          <span className="youtube-hero-overlay" aria-hidden />
          <span className="youtube-hero-copy">
            <span>DAZN最新動画</span>
            <strong>{video.title}</strong>
          </span>
        </a>
      ) : (
        <img
          src="/hero-japan-2026.jpg"
          alt="2026 日本代表サッカー予想"
          width="1100"
          height="550"
          loading="eager"
          decoding="async"
        />
      )}
      {showVideoCard && video && (
        <a
          className="youtube-open-link"
          href={video.url}
          target="_blank"
          rel="noreferrer"
          aria-label="YouTubeで視聴"
        >
          <Play size={15} fill="currentColor" aria-hidden />
        </a>
      )}
    </header>
  );
}

function ReferenceMenu({ onAddClick }: { onAddClick: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const links = [
    { type: "link" as const, label: "順位表", url: FIFA_STANDINGS_URL, tone: "default" as const },
    { type: "link" as const, label: "速報", url: WORLD_CUP_NEWS_URL, tone: "default" as const },
    { type: "link" as const, label: "FIFA\nランキング", url: FIFA_RANKING_URL, tone: "default" as const },
    { type: "link" as const, label: "お金を借りる", url: "https://www.acom.co.jp/first/zero/", tone: "warm" as const },
    { type: "link" as const, label: "モノを売る", url: "https://www.treasure-f.com/sell/trip/guide/", tone: "warm" as const },
    { type: "action" as const, label: "追加", tone: "add" as const },
  ];

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setTimeout(() => {
      setIsOpen(false);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return (
    <div className={`reference-links ${isOpen ? "open" : ""}`} aria-label="参考リンク">
      {isOpen && (
        <div className="reference-menu" role="menu" aria-label="参考リンク一覧">
          {links.map((link) =>
            link.type === "link" ? (
              <a
                key={link.url}
                className={`reference-menu-link ${link.tone === "warm" ? "warm-link" : ""}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
              >
                <span className="reference-menu-spacer" aria-hidden />
                <span className="reference-menu-label">{link.label}</span>
                <ExternalLink size={13} aria-hidden />
              </a>
            ) : (
              <button
                key={link.label}
                className="reference-menu-link add-link"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onAddClick();
                }}
              >
                <span className="reference-menu-spacer" aria-hidden />
                <span className="reference-menu-label">{link.label}</span>
                <ListPlus size={14} aria-hidden />
              </button>
            ),
          )}
        </div>
      )}
      <button
        className="reference-menu-trigger"
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-label={isOpen ? "参考リンクを閉じる" : "参考リンクを開く"}
        aria-expanded={isOpen}
      >
        {isOpen ? <X size={20} aria-hidden /> : <Menu size={22} aria-hidden />}
      </button>
    </div>
  );
}

function App() {
  const now = useNow();
  const [view, setView] = useState<View>("open");
  const [peopleSort, setPeopleSort] = useState<{
    key: "net" | "return" | "win";
    direction: "desc" | "asc";
  }>({ key: "net", direction: "desc" });
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedPersonName, setSelectedPersonName] = useState("");
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [pullStart, setPullStart] = useState<{ x: number; y: number } | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [data, setData] = useState<AppData>(() => loadData());
  const [apiError, setApiError] = useState("");
  const [isSyncing, setIsSyncing] = useState(true);
  const [hasRemoteState, setHasRemoteState] = useState(false);
  const [adminToken, setAdminToken] = useState(
    () => getStoredAdminToken(),
  );
  const [adminPassword, setAdminPassword] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [settingsPassword, setSettingsPassword] = useState(
    () => sessionStorage.getItem(SETTINGS_PASSWORD_KEY) ?? "",
  );
  const [settingsPasswordInput, setSettingsPasswordInput] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [autoBetConfig, setAutoBetConfig] = useState<AutoBetConfig | null>(null);
  const [autoBetReservations, setAutoBetReservations] = useState<AutoBetReservation[]>([]);
  const [autoBetReservationView, setAutoBetReservationView] = useState<AutoBetReservationView>("upcoming");
  const [autoBetActionMatchId, setAutoBetActionMatchId] = useState("");
  const [autoBetReservationDrafts, setAutoBetReservationDrafts] = useState<
    Record<string, Record<string, { enabled: boolean; priority: string; minOdds: string; maxAmount: string }>>
  >({});
  const [autoBetExecuteDrafts, setAutoBetExecuteDrafts] = useState<Record<string, string>>({});
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [backupStorage, setBackupStorage] = useState<BackupStorageStatus | null>(null);
  const [backupMessage, setBackupMessage] = useState("");
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [matchDraft, setMatchDraft] = useState<MatchDraft>(emptyMatchDraft);
  const [editMatchId, setEditMatchId] = useState("");
  const [editMatchDraft, setEditMatchDraft] = useState<MatchDraft>(emptyMatchDraft);
  const [pointAdjustmentDraft, setPointAdjustmentDraft] = useState<PointAdjustmentDraft>(emptyPointAdjustmentDraft);
  const [pointAdjustmentMessage, setPointAdjustmentMessage] = useState("");
  const [csvText, setCsvText] = useState(csvTemplate);
  const [importMessage, setImportMessage] = useState("");
  const [voteDrafts, setVoteDrafts] = useState<Record<string, VoteDraft>>({});
  const [pendingVote, setPendingVote] = useState<PendingVote | null>(null);
  const [pendingVoteDelete, setPendingVoteDelete] = useState<PendingVoteDelete | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [resultDrafts, setResultDrafts] = useState<Record<string, string>>({});
  const [showScheduledPicker, setShowScheduledPicker] = useState(false);
  const [scheduledMatches, setScheduledMatches] = useState<ScheduledMatchCandidate[]>([]);
  const [isScheduledLoading, setIsScheduledLoading] = useState(false);
  const [scheduledMessage, setScheduledMessage] = useState("");
  const [latestYoutubeVideo, setLatestYoutubeVideo] = useState<YoutubeVideo | null>(null);

  useEffect(() => {
    let active = true;

    fetchAppState()
      .then((state) => {
        if (!active) return;
        setData(state);
        setHasRemoteState(true);
        setApiError("");
      })
      .catch((error: Error) => {
        if (!active) return;
        setHasRemoteState(false);
        setApiError(`DB同期に失敗しました: ${error.message}`);
      })
      .finally(() => {
        if (active) setIsSyncing(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetchLatestYoutubeVideo()
      .then(({ video }) => {
        if (active) setLatestYoutubeVideo(video);
      })
      .catch(() => {
        if (active) setLatestYoutubeVideo(null);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!showScheduledPicker) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showScheduledPicker]);

  useEffect(() => {
    if (!adminToken) {
      setBackups([]);
      return;
    }

    refreshBackups(adminToken);
  }, [adminToken]);

  useEffect(() => {
    if (view !== "settings" || !adminToken || !settingsPassword) return;
    refreshAutoBetSettings(settingsPassword);
  }, [adminToken, settingsPassword, view]);

  async function syncState(action: () => Promise<AppData>) {
    setIsSyncing(true);
    setApiError("");
    try {
      const state = await action();
      setData(state);
      setHasRemoteState(true);
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setApiError(`DB更新に失敗しました: ${message}`);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }

  async function loginAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminMessage("");
    try {
      const result = await requestAdminToken(adminPassword);
      sessionStorage.setItem(ADMIN_TOKEN_KEY, result.token);
      setAdminToken(result.token);
      setAdminPassword("");
      setAdminMessage(`管理者認証済み。有効期限: ${formatDateTime(result.expiresAt)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setAdminMessage(
        [
          "管理者認証に失敗しました。",
          message,
          "",
          "設定済みの管理パスワードと完全一致しているか確認してください。",
        ].join("\n"),
      );
    }
  }

  function logoutAdmin() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(SETTINGS_PASSWORD_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken("");
    setSettingsPassword("");
    setSettingsPasswordInput("");
    setBackups([]);
    setBackupStorage(null);
    setAutoBetConfig(null);
    setAutoBetReservations([]);
    setAdminMessage("管理者認証を解除しました。");
  }

  async function refreshBackups(token = adminToken) {
    if (!token) return;
    setIsBackupLoading(true);
    setBackupMessage("");
    try {
      const result = await requestBackups(token);
      setBackups(result.backups);
      setBackupStorage(result.externalStorage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setBackupMessage(`バックアップ一覧を取得できませんでした: ${message}`);
    } finally {
      setIsBackupLoading(false);
    }
  }

  async function refreshAutoBetSettings(password = settingsPassword) {
    if (!adminToken || !password) return;
    setSettingsMessage("");
    try {
      const result = await requestAutoBetSettings(adminToken, password);
      setAutoBetConfig(result.config);
      setAutoBetReservations(result.reservations);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setSettingsMessage(`設定情報を取得できませんでした: ${message}`);
    }
  }

  async function unlockSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminToken) {
      setSettingsMessage("先に管理画面で認証してください。");
      return;
    }
    const password = settingsPasswordInput.trim();
    setSettingsMessage("");
    try {
      const result = await requestAutoBetSettings(adminToken, password);
      sessionStorage.setItem(SETTINGS_PASSWORD_KEY, password);
      setSettingsPassword(password);
      setSettingsPasswordInput("");
      setAutoBetConfig(result.config);
      setAutoBetReservations(result.reservations);
      setSettingsMessage("設定画面を開きました。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setSettingsMessage(`設定パスワードを確認できませんでした: ${message}`);
    }
  }

  function getReservationDraft(match: MatchRecord) {
    const existing = autoBetReservationDrafts[match.id];
    if (existing) return existing;
    return createEmptyReservationDraft(match);
  }

  function createEmptyReservationDraft(match: MatchRecord) {
    return Object.fromEntries(
      match.options.map((option, index) => [
        option.id,
        {
          enabled: false,
          priority: String(index + 1),
          minOdds: "",
          maxAmount: "",
        },
      ]),
    );
  }

  function getDefaultReservationExecuteAt(match: MatchRecord) {
    const offsetMinutes = autoBetConfig?.executeOffsetMinutes ?? 10;
    const executeDate = new Date(new Date(match.closesAt).getTime() - offsetMinutes * 60 * 1000);
    return Number.isNaN(executeDate.getTime()) ? "" : executeDate.toISOString();
  }

  function getReservationExecuteInput(match: MatchRecord) {
    return autoBetExecuteDrafts[match.id] ?? toDateTimeLocalValue(getDefaultReservationExecuteAt(match));
  }

  function getReservationExecuteIso(match: MatchRecord) {
    return fromDateTimeLocalValue(getReservationExecuteInput(match));
  }

  function updateReservationExecuteAt(match: MatchRecord, value: string) {
    setAutoBetExecuteDrafts((current) => ({
      ...current,
      [match.id]: value,
    }));
  }

  function updateReservationDraft(
    match: MatchRecord,
    optionId: string,
    patch: Partial<{ enabled: boolean; priority: string; minOdds: string; maxAmount: string }>,
  ) {
    setAutoBetReservationDrafts((current) => ({
      ...current,
      [match.id]: {
        ...(current[match.id] ?? createEmptyReservationDraft(match)),
        [optionId]: {
          ...(current[match.id] ?? createEmptyReservationDraft(match))[optionId],
          ...patch,
        },
      },
    }));
  }

  function getReservationRules(match: MatchRecord) {
    const draft = getReservationDraft(match);
    return match.options
      .map((option, index) => {
        const row = draft[option.id];
        return {
          optionId: option.id,
          optionLabel: optionDisplayLabel(match, option),
          priority: Math.max(1, Math.floor(Number(row?.priority) || index + 1)),
          minOdds: Number(row?.minOdds),
          maxAmount: Math.floor(Number(row?.maxAmount) / 100) * 100,
          enabled: Boolean(row?.enabled),
        };
      })
      .filter(
        (rule) =>
          rule.enabled &&
          Number.isFinite(rule.minOdds) &&
          rule.minOdds > 1 &&
          Number.isInteger(rule.maxAmount) &&
          rule.maxAmount >= 100,
      )
      .sort((a, b) => a.priority - b.priority);
  }

  function getConditionalBetPreview(match: MatchRecord, votes: VoteRecord[]) {
    const rules = getReservationRules(match);
    let totalPool = getMatchTotal(match, votes);
    const optionPools = new Map(match.options.map((option) => [option.id, getOptionTotal(match, votes, option.id)]));
    return rules.map((rule) => {
      const optionPool = optionPools.get(rule.optionId) ?? 0;
      const beforeOdds = optionPool > 0 && totalPool > 0 ? totalPool / optionPool : null;
      const numerator = totalPool - rule.minOdds * optionPool;
      const maxByOdds =
        rule.minOdds > 1 ? Math.floor((numerator / (rule.minOdds - 1)) / 100) * 100 : 0;
      const amount = Math.max(0, Math.min(rule.maxAmount, maxByOdds));
      const safeAmount = Math.floor(amount / 100) * 100;
      const afterOdds =
        optionPool + safeAmount > 0 ? (totalPool + safeAmount) / (optionPool + safeAmount) : null;
      totalPool += safeAmount;
      optionPools.set(rule.optionId, optionPool + safeAmount);
      return {
        ...rule,
        beforeOdds,
        amount: safeAmount,
        afterOdds,
      };
    });
  }

  async function reserveAutoBet(match: MatchRecord) {
    const rules = getReservationRules(match);
    const executeAt = getReservationExecuteIso(match);
    if (!rules.length) {
      setSettingsMessage("有効な投票条件を1件以上入力してください。");
      return;
    }
    if (!executeAt) {
      setSettingsMessage("実行時刻を入力してください。");
      return;
    }

    setAutoBetActionMatchId(match.id);
    setSettingsMessage("");
    try {
      const result = await createAutoBetReservation(adminToken, settingsPassword, {
        matchId: match.id,
        executeAt,
        rules: rules.map(({ optionId, priority, minOdds, maxAmount }) => ({
          optionId,
          priority,
          minOdds,
          maxAmount,
        })),
      });
      setAutoBetReservations(result.reservations);
      setSettingsMessage("条件付き予約投票を登録しました。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setSettingsMessage(`予約を登録できませんでした: ${message}`);
    } finally {
      setAutoBetActionMatchId("");
    }
  }

  async function cancelReservation(reservation: AutoBetReservation) {
    setSettingsMessage("");
    try {
      const result = await cancelAutoBetReservation(adminToken, settingsPassword, reservation.id);
      setAutoBetReservations(result.reservations);
      setSettingsMessage("予約をキャンセルしました。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setSettingsMessage(`予約をキャンセルできませんでした: ${message}`);
    }
  }

  async function loadScheduledMatches() {
    setIsScheduledLoading(true);
    setScheduledMessage("");
    try {
      const result = await fetchScheduledMatches();
      setScheduledMatches(result.matches);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setScheduledMessage(`追加候補を取得できませんでした: ${message}`);
    } finally {
      setIsScheduledLoading(false);
    }
  }

  async function openScheduledPicker() {
    setShowScheduledPicker(true);
    await loadScheduledMatches();
  }

  async function addScheduledMatch(
    candidate: ScheduledMatchCandidate,
    handicap: { handicapOptionIndex: number; handicapPoints: number },
  ) {
    const visibleOptions = hasHalfPointHandicap(handicap.handicapPoints)
      ? candidate.options.slice(0, 2)
      : candidate.options;
    const optionLabels = visibleOptions.map((label, index) =>
      handicap.handicapPoints > 0 && handicap.handicapOptionIndex === index
        ? `${label}（＋${formatHandicapPoints(handicap.handicapPoints)}）`
        : label,
    );
    const handicapLabel =
      handicap.handicapPoints > 0 && handicap.handicapOptionIndex >= 0
        ? `${candidate.options[handicap.handicapOptionIndex]}に＋${formatHandicapPoints(handicap.handicapPoints)}`
        : "なし";
    const confirmed = window.confirm(
      [
        "この試合を追加しますか？",
        "",
        candidate.title,
        `${formatDateTime(candidate.startsAt)} 開始`,
        `投票先: ${optionLabels.join(" / ")}`,
        `ハンデ: ${handicapLabel}`,
      ].join("\n"),
    );
    if (!confirmed) return;

    setIsSyncing(true);
    setScheduledMessage("");
    try {
      const result = await createScheduledMatchWithHandicap(candidate.id, handicap);
      setData(result.state);
      setScheduledMatches(result.matches);
      setHasRemoteState(true);
      setApiError("");
      setToastMessage("試合を追加しました。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setScheduledMessage(`試合を追加できませんでした: ${message}`);
      setApiError(`DB更新に失敗しました: ${message}`);
    } finally {
      setIsSyncing(false);
    }
  }

  async function createManualBackup() {
    if (!adminToken) return;
    setIsBackupLoading(true);
    setBackupMessage("");
    try {
      const result = await createBackup(adminToken);
      setBackups(result.backups);
      setBackupMessage(`バックアップを作成しました: ${formatDateTime(result.backup.createdAt)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setBackupMessage(`バックアップを作成できませんでした: ${message}`);
    } finally {
      setIsBackupLoading(false);
    }
  }

  async function syncExternalBackup(backup: BackupRecord) {
    if (!adminToken) return;
    setIsBackupLoading(true);
    setBackupMessage("");
    try {
      const result = await syncBackupExternally(adminToken, backup.id);
      setBackups(result.backups);
      setBackupMessage(
        result.externalResult.status === "uploaded"
          ? "外部ストレージへ保存しました。"
          : `外部保存を完了できませんでした: ${result.externalResult.error ?? result.externalResult.status}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setBackupMessage(`外部保存を再試行できませんでした: ${message}`);
    } finally {
      setIsBackupLoading(false);
    }
  }

  async function downloadBackup(backup: BackupRecord) {
    if (!adminToken) return;
    setBackupMessage("");
    try {
      const response = await fetch(`/api/admin/backups/${backup.id}/download`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `wc2026-prediction-backup-${backup.createdAt.slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setBackupMessage(`バックアップをダウンロードできませんでした: ${message}`);
    }
  }

  const sortedMatches = useMemo(
    () => [...data.matches].sort(sortByDateAsc),
    [data.matches],
  );

  const openMatches = useMemo(
    () => data.matches.filter((match) => isMatchOpen(match, now)).sort(sortByCloseDateAsc),
    [data.matches, now],
  );

  const closedMatches = useMemo(
    () => data.matches.filter((match) => !isMatchOpen(match, now)).sort(sortByCloseDateDesc),
    [data.matches, now],
  );

  const visibleKnownUsers = useMemo(
    () => data.knownUsers.filter((name) => !isHiddenUserName(name)),
    [data.knownUsers],
  );

  const visibleVotes = useMemo(
    () => data.votes.filter((vote) => !isHiddenUserName(vote.userName)),
    [data.votes],
  );

  const settleCandidateMatches = useMemo(
    () =>
      data.matches
        .filter((match) => !isMatchOpen(match, now) && !match.resultOptionId)
        .sort((a, b) => {
          const aTime = new Date(a.closesAt).getTime();
          const bTime = new Date(b.closesAt).getTime();
          return bTime - aTime;
        }),
    [data.matches, now],
  );

  const settledMatches = useMemo(
    () =>
      data.matches
        .filter((match) => Boolean(match.resultOptionId))
        .sort((a, b) => {
          const aTime = new Date(a.settledAt ?? a.closesAt).getTime();
          const bTime = new Date(b.settledAt ?? b.closesAt).getTime();
          return bTime - aTime;
        }),
    [data.matches],
  );

  const editableMatches = useMemo(
    () => [...data.matches].sort(sortByDateAsc),
    [data.matches],
  );

  const selectedMatch = useMemo(() => {
    return data.matches.find((match) => match.id === selectedMatchId) ?? sortedMatches[0];
  }, [data.matches, selectedMatchId, sortedMatches]);

  const pendingMatch = useMemo(() => {
    if (!pendingVote) return undefined;
    return data.matches.find((match) => match.id === pendingVote.matchId);
  }, [data.matches, pendingVote]);

  const pendingVoteImpact = useMemo<PendingVoteImpact | null>(() => {
    if (!pendingVote || !pendingMatch) return null;

    const totalBefore = getMatchTotal(pendingMatch, data.votes);
    const optionBefore = getOptionTotal(pendingMatch, data.votes, pendingVote.optionId);
    const totalAfter = totalBefore + pendingVote.amount;
    const optionAfter = optionBefore + pendingVote.amount;
    const afterOdds = optionAfter > 0 ? totalAfter / optionAfter : 0;
    const estimatedGross = afterOdds * pendingVote.amount;
    const userOptionTotals = new Map<string, number>();

    data.votes
      .filter((vote) => vote.matchId === pendingMatch.id && vote.userName === pendingVote.userName)
      .forEach((vote) => {
        userOptionTotals.set(vote.optionId, (userOptionTotals.get(vote.optionId) ?? 0) + vote.amount);
      });
    userOptionTotals.set(
      pendingVote.optionId,
      (userOptionTotals.get(pendingVote.optionId) ?? 0) + pendingVote.amount,
    );

    const userTotalAfter = [...userOptionTotals.values()].reduce((sum, amount) => sum + amount, 0);
    const userOptionRows = [...userOptionTotals.entries()]
      .map(([optionId, amount]) => {
        const optionTotalAfter =
          getOptionTotal(pendingMatch, data.votes, optionId) +
          (optionId === pendingVote.optionId ? pendingVote.amount : 0);
        const gross = optionTotalAfter > 0 ? (totalAfter * amount) / optionTotalAfter : 0;
        return {
          optionId,
          label: optionLabel(pendingMatch, optionId),
          amount,
          gross,
          net: gross - userTotalAfter,
          currentSelection: optionId === pendingVote.optionId,
        };
      })
      .sort((a, b) => {
        if (a.currentSelection !== b.currentSelection) return a.currentSelection ? -1 : 1;
        return b.amount - a.amount || a.label.localeCompare(b.label, "ja");
      });
    const selectedUserOption = userOptionRows.find((row) => row.currentSelection);

    return {
      beforeOdds: optionBefore > 0 ? totalBefore / optionBefore : null,
      afterOdds,
      totalBefore,
      totalAfter,
      optionBefore,
      optionAfter,
      estimatedGross: selectedUserOption?.gross ?? estimatedGross,
      estimatedNet: selectedUserOption?.net ?? estimatedGross - pendingVote.amount,
      userTotalAfter,
      userOptionRows,
    };
  }, [data.votes, pendingMatch, pendingVote]);

  const adjustmentTotalsByUser = useMemo(() => {
    return (data.pointAdjustments ?? []).reduce((map, adjustment) => {
      map.set(adjustment.userName, (map.get(adjustment.userName) ?? 0) + adjustment.amount);
      return map;
    }, new Map<string, number>());
  }, [data.pointAdjustments]);

  const userRows = useMemo(() => {
    const snapshotByUser = new Map(
      (data.userPointSnapshots ?? []).map((snapshot) => [snapshot.userName, snapshot]),
    );

    return visibleKnownUsers
      .map((name) => {
        const votes = visibleVotes.filter((vote) => vote.userName === name);
        const totals = votes.reduce(
          (acc, vote) => {
            const match = data.matches.find((item) => item.id === vote.matchId);
            if (!match) return acc;
            const payout = calculateVotePayout(vote, match, data.votes);
            acc.staked += vote.amount;
            acc.gross += payout.gross;
            acc.net += payout.settled ? payout.net : 0;
            acc.pending += payout.settled ? 0 : vote.amount;
            acc.settledVotes += payout.settled ? 1 : 0;
            acc.wonVotes += payout.settled && payout.won ? 1 : 0;
            return acc;
          },
          { staked: 0, gross: 0, net: 0, pending: 0, settledVotes: 0, wonVotes: 0 },
        );
        const adjustmentNet = adjustmentTotalsByUser.get(name) ?? 0;
        const net = totals.net + adjustmentNet;
        const gross = totals.gross + adjustmentNet;
        const settledStake = Math.max(0, totals.staked - totals.pending);
        const returnRate = settledStake > 0 ? ((gross / settledStake) - 1) * 100 : null;
        const winRate = totals.settledVotes > 0 ? (totals.wonVotes / totals.settledVotes) * 100 : null;

        return {
          name,
          votes: votes.length,
          adjustmentNet,
          returnRate,
          winRate,
          ...totals,
          gross,
          net,
          yesterdayDelta: net - (snapshotByUser.get(name)?.settledNet ?? 0),
        };
      })
      .sort((a, b) => b.net - a.net || b.pending - a.pending || a.name.localeCompare(b.name, "ja"));
  }, [adjustmentTotalsByUser, data.matches, data.votes, data.userPointSnapshots, visibleKnownUsers, visibleVotes]);

  const sortedUserRows = useMemo(() => {
    function valueFor(row: (typeof userRows)[number]) {
      if (peopleSort.key === "return") return row.returnRate;
      if (peopleSort.key === "win") return row.winRate;
      return row.net;
    }

    return [...userRows].sort((a, b) => {
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      if (aValue === null && bValue === null) return a.name.localeCompare(b.name, "ja");
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      const diff = peopleSort.direction === "desc" ? bValue - aValue : aValue - bValue;
      return diff || b.pending - a.pending || a.name.localeCompare(b.name, "ja");
    });
  }, [peopleSort.direction, peopleSort.key, userRows]);

  function updatePeopleSort(key: "net" | "return" | "win") {
    setPeopleSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  }

  const motivationItems = useMemo<MotivationItem[]>(() => {
    const rankedRows = userRows.filter((row) => row.votes > 0 || row.adjustmentNet !== 0);
    if (!rankedRows.length) return [];

    return rankedRows.map((row, index) => {
      const yesterdayDelta = row.yesterdayDelta;
      const displayYesterdayDelta = Math.round(yesterdayDelta);
      return {
        id: `net-rank-${row.name}-${index + 1}`,
        name: row.name,
        iconSrc: getPersonIconSrc(row.name),
        value: `${row.net >= 0 ? "+" : ""}${formatPoints(row.net)}`,
        meta: displayYesterdayDelta === 0
          ? "昨日対比 ー"
          : `昨日対比 ${displayYesterdayDelta >= 0 ? "+" : ""}${formatPoints(displayYesterdayDelta)}`,
        metaTone:
          displayYesterdayDelta > 0
            ? "positive"
            : displayYesterdayDelta < 0
              ? "negative"
              : row.net >= 0
                ? "positive"
                : "neutral",
        tone: row.net >= 0 ? "positive" : "neutral",
      };
    });
  }, [userRows]);

  const personTrendRows = useMemo<PersonTrendRow[]>(() => {
    const settledVoteEvents = visibleVotes
      .map((vote) => {
        const match = data.matches.find((item) => item.id === vote.matchId);
        const payout = match ? calculateVotePayout(vote, match, data.votes) : undefined;
        if (!match || !payout?.settled) return undefined;
        return {
          date: match.settledAt ?? match.closesAt,
          label: formatDateTime(match.settledAt ?? match.closesAt),
          net: payout.net,
          userName: vote.userName,
        };
      })
      .filter((row): row is { date: string; label: string; net: number; userName: string } =>
        Boolean(row),
      );
    const adjustmentEvents = (data.pointAdjustments ?? [])
      .filter((adjustment) => !isHiddenUserName(adjustment.userName))
      .map((adjustment) => ({
        date: adjustment.createdAt,
        label: `調整: ${adjustment.title}`,
        net: adjustment.amount,
        userName: adjustment.userName,
      }));
    const settledEvents = [...settledVoteEvents, ...adjustmentEvents]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (!settledEvents.length) return [];

    const trendNames = userRows
      .filter((row) => settledEvents.some((event) => event.userName === row.name))
      .map((row) => row.name);

    return trendNames.map((name) => {
      let runningNet = 0;
      const points = settledEvents.map((event) => {
        if (event.userName === name) {
          runningNet += event.net;
        }
        return {
          label: event.label,
          value: runningNet,
        };
      });
      const summary = userRows.find((row) => row.name === name);

      return {
        name,
        net: summary?.net ?? runningNet,
        pending: summary?.pending ?? 0,
        points,
      };
    });
  }, [data.matches, data.pointAdjustments, data.votes, userRows, visibleVotes]);

  const selectedPersonVotes = useMemo(() => {
    const normalized = normalizeName(selectedPersonName);
    if (isHiddenUserName(normalized)) return [];
    return visibleVotes.filter((vote) => vote.userName === normalized);
  }, [selectedPersonName, visibleVotes]);

  const selectedPersonAdjustments = useMemo(() => {
    const normalized = normalizeName(selectedPersonName);
    if (isHiddenUserName(normalized)) return [];
    return (data.pointAdjustments ?? []).filter((adjustment) => adjustment.userName === normalized);
  }, [data.pointAdjustments, selectedPersonName]);

  const selectedPersonSummary = useMemo(() => {
    const voteSummary = selectedPersonVotes.reduce(
      (acc, vote) => {
        const match = data.matches.find((item) => item.id === vote.matchId);
        if (!match) return acc;
        const payout = calculateVotePayout(vote, match, data.votes);
        acc.totalStake += vote.amount;
        acc.pendingStake += payout.settled ? 0 : vote.amount;
        acc.grossPayout += payout.gross;
        acc.net += payout.settled ? payout.net : 0;
        acc.settledVotes += payout.settled ? 1 : 0;
        acc.wonVotes += payout.settled && payout.won ? 1 : 0;
        return acc;
      },
      { totalStake: 0, pendingStake: 0, grossPayout: 0, net: 0, settledVotes: 0, wonVotes: 0 },
    );
    const adjustmentNet = selectedPersonAdjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
    voteSummary.grossPayout += adjustmentNet;
    voteSummary.net += adjustmentNet;
    return voteSummary;
  }, [data.matches, data.votes, selectedPersonAdjustments, selectedPersonVotes]);
  const selectedPersonSettledStake = Math.max(
    0,
    selectedPersonSummary.totalStake - selectedPersonSummary.pendingStake,
  );
  const selectedPersonReturnRate =
    selectedPersonSettledStake > 0
      ? ((selectedPersonSummary.grossPayout / selectedPersonSettledStake) - 1) * 100
      : null;
  const selectedPersonWinRate =
    selectedPersonSummary.settledVotes > 0
      ? (selectedPersonSummary.wonVotes / selectedPersonSummary.settledVotes) * 100
      : null;

  const selectedBalanceRows = useMemo(() => {
    const settledVoteRows = selectedPersonVotes
      .map((vote) => {
        const match = data.matches.find((item) => item.id === vote.matchId);
        const payout = match
          ? calculateVotePayout(vote, match, data.votes)
          : { gross: 0, net: 0, won: false, settled: false };
        return {
          id: vote.id,
          type: "vote" as const,
          date: match?.settledAt ?? vote.createdAt,
          vote,
          match,
          payout,
          amount: payout.net,
        };
      })
      .filter((row) => row.payout.settled);
    const adjustmentRows = selectedPersonAdjustments.map((adjustment) => ({
      id: adjustment.id,
      type: "adjustment" as const,
      date: adjustment.createdAt,
      adjustment,
      amount: adjustment.amount,
    }));
    const settledRows = [...settledVoteRows, ...adjustmentRows]
      .sort((a, b) => {
        const aTime = new Date(a.date).getTime();
        const bTime = new Date(b.date).getTime();
        return aTime - bTime;
      });

    let balance = 0;
    return settledRows
      .map((row) => {
        balance += row.amount;
        return { ...row, balance };
      })
      .reverse();
  }, [data.matches, data.votes, selectedPersonAdjustments, selectedPersonVotes]);

  function getDraft(match: MatchRecord): VoteDraft {
    return (
      voteDrafts[match.id] ?? {
        name: localStorage.getItem(LAST_NAME_KEY) ?? "",
        amount: String(MIN_VOTE_AMOUNT),
        optionId: match.options[0]?.id ?? "",
      }
    );
  }

  function updateVoteDraft(matchId: string, patch: Partial<VoteDraft>) {
    setVoteDrafts((current) => ({
      ...current,
      [matchId]: {
        name: current[matchId]?.name ?? localStorage.getItem(LAST_NAME_KEY) ?? "",
        amount: current[matchId]?.amount ?? String(MIN_VOTE_AMOUNT),
        optionId: current[matchId]?.optionId ?? "",
        ...patch,
      },
    }));
  }

  async function handleVote(match: MatchRecord, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = getDraft(match);
    const name = normalizeName(draft.name);
    const amount = Number(draft.amount);

    if (!hasRemoteState) {
      window.alert("本番DBとの同期が終わってから投票してください。画面を更新してもう一度お試しください。");
      return;
    }

    if (!isMatchOpen(match, now)) {
      window.alert("この試合は投票締切を過ぎています。");
      return;
    }

    if (!name) {
      window.alert("名前を入力してください。");
      return;
    }

    if (!draft.optionId) {
      window.alert("選択肢を選んでください。");
      return;
    }

    if (!Number.isFinite(amount) || amount < MIN_VOTE_AMOUNT) {
      window.alert(`投票ポイントは${MIN_VOTE_AMOUNT}ポイント以上で入力してください。`);
      return;
    }

    const selectedOption = match.options.find((option) => option.id === draft.optionId);
    setPendingVote({
      matchId: match.id,
      optionId: draft.optionId,
      optionLabel: optionDisplayLabel(match, selectedOption),
      userName: name,
      amount,
    });
  }

  async function submitConfirmedVote() {
    if (!pendingVote) return;
    const match = data.matches.find((item) => item.id === pendingVote.matchId);
    if (!match) {
      window.alert("この予想テーマは見つかりません。画面を更新してください。");
      setPendingVote(null);
      return;
    }

    try {
      await syncState(async () => {
        const latestState = await fetchAppState();
        const latestMatch = latestState.matches.find((item) => item.id === pendingVote.matchId);
        const latestOption = latestMatch?.options.find((option) => option.id === pendingVote.optionId);

        if (!latestMatch) {
          setData(latestState);
          throw new Error("この予想テーマは本番DB上に見つかりません。画面を更新してください。");
        }

        if (!latestOption) {
          setData(latestState);
          throw new Error("この選択肢は本番DB上に見つかりません。画面を更新してください。");
        }

        if (!isMatchOpen(latestMatch, new Date())) {
          setData(latestState);
          throw new Error("この試合は投票締切を過ぎています。");
        }

        return postState("/api/votes", {
          matchId: pendingVote.matchId,
          optionId: pendingVote.optionId,
          userName: pendingVote.userName,
          amount: pendingVote.amount,
        });
      });
      localStorage.setItem(LAST_NAME_KEY, pendingVote.userName);
      updateVoteDraft(pendingVote.matchId, {
        name: pendingVote.userName,
        amount: String(MIN_VOTE_AMOUNT),
      });
      setPendingVote(null);
      setToastMessage("投票しました。投票状況をご覧ください。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      window.alert(
        [
          "投票を保存できませんでした。",
          message,
          "",
          "送信内容",
          `matchId: ${pendingVote.matchId}`,
          `optionId: ${pendingVote.optionId}`,
          `userName: ${pendingVote.userName}`,
          `amount: ${pendingVote.amount}`,
        ].join("\n"),
      );
    }
  }

  async function cancelRecentVote() {
    if (!pendingVoteDelete) return;

    const { match, vote } = pendingVoteDelete;
    if (!canCancelVote(vote, match, data.votes, new Date())) {
      setPendingVoteDelete(null);
      window.alert("投票から5分経過したか、締切後、またはこの後に別の投票が入ったため削除できません。");
      return;
    }

    try {
      await syncState(() => postState(`/api/votes/${vote.id}/cancel`, undefined, "DELETE"));
      setPendingVoteDelete(null);
      setToastMessage("投票を削除しました。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setPendingVoteDelete(null);
      window.alert(`投票を削除できませんでした。\n${message}`);
    }
  }

  async function addMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const labels = splitOptions(matchDraft.optionsText);

    if (!matchDraft.title.trim() || !matchDraft.startsAt) {
      window.alert("タイトルと開始時刻を入力してください。");
      return;
    }

    if (labels.length < 2) {
      window.alert("選択肢は2つ以上必要です。");
      return;
    }

    const options = makeOptions(labels);
    const handicapOption = options.find((option) => option.label === matchDraft.handicapOptionId);
    const match: MatchRecord = {
      id: createId("match"),
      title: matchDraft.title.trim(),
      stage: "",
      venue: "",
      startsAt: matchDraft.startsAt,
      closesAt: matchDraft.closesAt || matchDraft.startsAt,
      question: "",
      notice: matchDraft.notice.trim(),
      options,
      handicapOptionId: matchDraft.handicapPoints > 0 ? handicapOption?.id : undefined,
      handicapPoints: handicapOption && matchDraft.handicapPoints > 0 ? matchDraft.handicapPoints : 0,
    };

    try {
      await syncState(() => postState("/api/matches", match, "POST", adminToken));
      setMatchDraft(emptyMatchDraft);
    } catch {
      window.alert("試合を登録できませんでした。入力内容を確認してください。");
    }
  }

  function updatePointAdjustmentEntry(
    index: number,
    patch: Partial<PointAdjustmentDraft["entries"][number]>,
  ) {
    setPointAdjustmentDraft((current) => ({
      ...current,
      entries: current.entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    }));
  }

  function addPointAdjustmentEntry() {
    setPointAdjustmentDraft((current) => ({
      ...current,
      entries: [...current.entries, { userName: "", amount: "" }],
    }));
  }

  function removePointAdjustmentEntry(index: number) {
    setPointAdjustmentDraft((current) => ({
      ...current,
      entries: current.entries.filter((_, entryIndex) => entryIndex !== index),
    }));
  }

  async function submitPointAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPointAdjustmentMessage("");

    if (!adminToken) {
      setPointAdjustmentMessage("先に管理者認証をしてください。");
      return;
    }

    const entries = pointAdjustmentDraft.entries
      .map((entry) => ({
        userName: normalizeName(entry.userName),
        amount: Number(entry.amount),
      }))
      .filter((entry) => entry.userName || entry.amount);

    if (!pointAdjustmentDraft.title.trim() || !pointAdjustmentDraft.reason.trim()) {
      setPointAdjustmentMessage("タイトルと修正理由を入力してください。");
      return;
    }

    if (entries.length < 2) {
      setPointAdjustmentMessage("最低2人以上のユーザーと増減額が必要です。");
      return;
    }

    if (entries.some((entry) => !entry.userName || !Number.isInteger(entry.amount) || entry.amount === 0)) {
      setPointAdjustmentMessage("各行にユーザー名と0以外の整数ポイントを入力してください。");
      return;
    }

    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    if (total !== 0) {
      setPointAdjustmentMessage(`増減額の合計を0にしてください。現在: ${total >= 0 ? "+" : ""}${formatPoints(total)}`);
      return;
    }

    try {
      await syncState(() =>
        postState(
          "/api/admin/point-adjustments",
          {
            title: pointAdjustmentDraft.title.trim(),
            reason: pointAdjustmentDraft.reason.trim(),
            entries,
          },
          "POST",
          adminToken,
        ),
      );
      setPointAdjustmentDraft(emptyPointAdjustmentDraft);
      setPointAdjustmentMessage("ポイント調整を登録しました。個人別の収支履歴に反映済みです。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setPointAdjustmentMessage(`ポイント調整を登録できませんでした: ${message}`);
    }
  }

  function handleCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function importCsv() {
    const { matches, errors } = parseCsvMatches(csvText);
    if (!matches.length) {
      setImportMessage("取り込める行がありませんでした。必須列と選択肢を確認してください。");
      return;
    }

    try {
      await syncState(() => postState("/api/matches/import", { matches }, "POST", adminToken));
      setImportMessage(
        `${matches.length}件を登録しました${
          errors.length ? `。CSV警告 ${errors.length}件` : ""
        }。`,
      );
    } catch {
      setImportMessage("CSVを登録できませんでした。内容を確認してください。");
    }
  }

  async function settleMatch(
    match: MatchRecord,
    settlement: { scoreDraft?: ScoreDraft; optionId?: string },
  ) {
    if (!adminToken) {
      window.alert("先に管理者認証をしてください。");
      return;
    }
    if (isMatchOpen(match, now)) {
      window.alert("受付中の予想テーマは確定できません。締切後に確定してください。");
      return;
    }

    if (!usesScoreSettlement(match)) {
      const optionId = settlement.optionId ?? "";
      const resultLabel = optionLabel(match, optionId);
      if (!optionId || resultLabel === "-") {
        window.alert("確定する結果を選択してください。");
        return;
      }

      const judgementOk = window.confirm(
        `「${match.title}」の結果を以下で確定します。\n\n確定結果: ${resultLabel}\n\nこの判定で問題ありませんか？`,
      );
      if (!judgementOk) return;

      const finalOk = window.confirm(
        `「${match.title}」を「${resultLabel}」で最終確定します。\n\n確定後、個人別の収支と還元ポイントに反映されます。本当に確定しますか？`,
      );
      if (!finalOk) return;

      await syncState(() =>
        postState(
          `/api/matches/${match.id}/settle`,
          { optionId },
          "POST",
          adminToken,
        ),
      );
      setResultDrafts((current) => ({ ...current, [match.id]: optionId }));
      return;
    }

    const scoreDraft = settlement.scoreDraft ?? { home: "", away: "" };
    const evaluation = evaluateScoreSettlement(match, scoreDraft.home, scoreDraft.away);
    if (!evaluation.ok) {
      window.alert(evaluation.error);
      return;
    }

    const { decision } = evaluation;
    const rawScoreLine = `${decision.homeOption.label} ${decision.homeScore} - ${decision.awayScore} ${decision.awayOption.label}`;
    const handicapLine = decision.handicap
      ? `ハンデ反映後: ${decision.homeOption.label} ${formatScoreValue(decision.adjustedHomeScore)} - ${formatScoreValue(decision.adjustedAwayScore)} ${decision.awayOption.label}`
      : "ハンデなし";
    const judgementOk = window.confirm(
      `入力スコアから以下のように判定しました。\n\n${rawScoreLine}\n${handicapLine}\n\n確定結果: ${decision.resultLabel}\n\nこの判定で問題ありませんか？`,
    );
    if (!judgementOk) return;

    const finalOk = window.confirm(
      `「${match.title}」を「${decision.resultLabel}」で最終確定します。\n\n確定後、個人別の収支と還元ポイントに反映されます。本当に確定しますか？`,
    );
    if (!finalOk) return;

    await syncState(() =>
      postState(
        `/api/matches/${match.id}/settle`,
        {
          homeScore: decision.homeScore,
          awayScore: decision.awayScore,
        },
        "POST",
        adminToken,
      ),
    );
    setScoreDrafts((current) => ({
      ...current,
      [match.id]: { home: String(decision.homeScore), away: String(decision.awayScore) },
    }));
  }

  async function reopenMatch(match: MatchRecord) {
    if (!adminToken) {
      window.alert("先に管理者認証をしてください。");
      return;
    }
    const ok = window.confirm(
      `「${match.title}」の確定結果を解除します。\n\n個人別の収支と還元ポイントも未確定に戻ります。本当に解除しますか？`,
    );
    if (!ok) return;

    await syncState(() => postState(`/api/matches/${match.id}/reopen`, undefined, "POST", adminToken));
    setScoreDrafts((current) => ({ ...current, [match.id]: { home: "", away: "" } }));
    setResultDrafts((current) => ({ ...current, [match.id]: "" }));
  }

  async function deleteMatch(matchId: string) {
    if (!adminToken) {
      window.alert("先に管理者認証をしてください。");
      return;
    }
    const match = data.matches.find((item) => item.id === matchId);
    const ok = window.confirm(
      `「${match?.title ?? "この試合"}」を削除しますか？\n\n投票が1件でもある試合は削除できません。`,
    );
    if (!ok) return;
    try {
      await syncState(() => postState(`/api/matches/${matchId}`, undefined, "DELETE", adminToken));
      if (editMatchId === matchId) {
        setEditMatchId("");
        setEditMatchDraft(emptyMatchDraft);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      window.alert(`試合を削除できませんでした。\n${message}`);
    }
  }

  async function deleteVote(vote: VoteRecord) {
    if (!adminToken) {
      window.alert("先に管理者認証をしてください。");
      return;
    }

    const match = data.matches.find((item) => item.id === vote.matchId);
    const ok = window.confirm(
      [
        "この投票を削除しますか？",
        "",
        `名前: ${vote.userName}`,
        `試合: ${match?.title ?? "削除済み"}`,
        `選択: ${optionLabel(match, vote.optionId)}`,
        `ポイント: ${formatPoints(vote.amount)}`,
        "",
        "削除後、総プール・オッズ・個人別収支は再計算されます。",
      ].join("\n"),
    );
    if (!ok) return;

    await syncState(() => postState(`/api/votes/${vote.id}`, undefined, "DELETE", adminToken));
  }

  function startEditMatch(match: MatchRecord) {
    setEditMatchId(match.id);
    setEditMatchDraft({
      title: match.title,
      startsAt: match.startsAt,
      closesAt: match.closesAt,
      optionsText: match.options.map((option) => option.label).join("\n"),
      notice: match.notice ?? "",
      handicapOptionId: match.handicapOptionId ?? "",
      handicapPoints: Number(match.handicapPoints ?? 0),
    });
  }

  async function saveMatchEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editMatchId) return;
    if (!adminToken) {
      window.alert("先に管理者認証をしてください。");
      return;
    }

    const labels = splitOptions(editMatchDraft.optionsText);
    if (!editMatchDraft.title.trim() || !editMatchDraft.startsAt) {
      window.alert("タイトルと開始時刻を入力してください。");
      return;
    }
    if (labels.length < 2) {
      window.alert("選択肢は2つ以上必要です。");
      return;
    }

    const existingMatch = data.matches.find((item) => item.id === editMatchId);
    const nextOptions = labels.map((label, index) => {
      const existingOption = existingMatch?.options.find((option) => option.label === label);
      return {
        id: existingOption?.id ?? createId(`option-${index + 1}`),
        label,
      };
    });
    const nextHandicapOption = nextOptions.find(
      (option) => option.id === editMatchDraft.handicapOptionId || option.label === editMatchDraft.handicapOptionId,
    );
    const match: MatchRecord = {
      id: editMatchId,
      title: editMatchDraft.title.trim(),
      stage: "",
      venue: "",
      startsAt: editMatchDraft.startsAt,
      closesAt: editMatchDraft.closesAt || editMatchDraft.startsAt,
      question: "",
      notice: editMatchDraft.notice.trim(),
      options: nextOptions,
      handicapOptionId: editMatchDraft.handicapPoints > 0 ? nextHandicapOption?.id : undefined,
      handicapPoints: nextHandicapOption && editMatchDraft.handicapPoints > 0 ? editMatchDraft.handicapPoints : 0,
    };

    try {
      await syncState(() => postState(`/api/matches/${editMatchId}`, match, "PUT", adminToken));
      setEditMatchId("");
      setEditMatchDraft(emptyMatchDraft);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      window.alert(`試合を更新できませんでした。\n${message}`);
    }
  }

  async function refreshState() {
    const [, youtubeResult] = await Promise.all([
      syncState(() => fetchAppState()),
      fetchLatestYoutubeVideo(true).catch(() => null),
    ]);
    if (youtubeResult) {
      setLatestYoutubeVideo(youtubeResult.video);
    }
  }

  function handlePullStart(event: TouchEvent<HTMLDivElement>) {
    if (window.scrollY > 0 || isSyncing) return;
    const touch = event.touches[0];
    setPullStart({ x: touch.clientX, y: touch.clientY });
  }

  function handlePullMove(event: TouchEvent<HTMLDivElement>) {
    if (!pullStart || window.scrollY > 0 || isSyncing) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - pullStart.x;
    const deltaY = touch.clientY - pullStart.y;
    if (deltaY <= 0 || Math.abs(deltaX) > deltaY) return;
    setPullDistance(Math.min(72, deltaY * 0.45));
  }

  async function handlePullEnd() {
    if (!pullStart) return;
    const shouldRefresh = pullDistance >= 48;
    setPullStart(null);

    if (!shouldRefresh) {
      setPullDistance(0);
      return;
    }

    setIsPullRefreshing(true);
    try {
      await refreshState();
    } finally {
      window.setTimeout(() => {
        setIsPullRefreshing(false);
        setPullDistance(0);
      }, 260);
    }
  }

  function openMatchDetail(matchId: string) {
    setSelectedMatchId(matchId);
    setView("matchDetail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openPersonDetail(name: string) {
    setSelectedPersonName(name);
    setView("personDetail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBackFromDetail() {
    if (view === "matchDetail") {
      setView(selectedMatch && isMatchOpen(selectedMatch, now) ? "open" : "closed");
    }
    if (view === "personDetail") {
      setView("people");
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    setTouchStart(null);

    if (Math.abs(deltaX) > 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      goBackFromDetail();
    }
  }

  const showReferenceOdds =
    view === "open" || (view === "matchDetail" && selectedMatch && isMatchOpen(selectedMatch, now));
  const isMatchDetailView = view === "matchDetail";

  return (
    <div
      className={`app-shell ${view === "admin" || view === "settings" ? "admin-shell" : ""}`}
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
    >
      {(pullDistance > 8 || isPullRefreshing) && (
        <div
          className={`pull-refresh-indicator ${isPullRefreshing ? "spinning" : ""}`}
          style={{ transform: `translate(-50%, ${Math.max(0, pullDistance - 24)}px)` }}
          aria-label="更新中"
          role="status"
        >
          <span aria-hidden />
        </div>
      )}
      {!isMatchDetailView && (
        <YoutubeHero
          video={latestYoutubeVideo}
        />
      )}

      <nav className="tabs" aria-label="メインナビゲーション">
        <button
          className={view === "open" || (view === "matchDetail" && selectedMatch && isMatchOpen(selectedMatch, now)) ? "active open-tab" : "open-tab"}
          onClick={() => setView("open")}
          type="button"
        >
          <CalendarClock size={18} aria-hidden />
          受付中
        </button>
        <button
          className={view === "closed" || (view === "matchDetail" && selectedMatch && !isMatchOpen(selectedMatch, now)) ? "active closed-tab" : "closed-tab"}
          onClick={() => setView("closed")}
          type="button"
        >
          <CheckCircle2 size={18} aria-hidden />
          締切済み
        </button>
        <button
          className={view === "people" || view === "personDetail" ? "active" : ""}
          onClick={() => setView("people")}
          type="button"
        >
          <UserRound size={18} aria-hidden />
          個人別
        </button>
      </nav>

      <datalist id="known-users">
        {visibleKnownUsers.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {view === "open" && motivationItems.length > 0 && (
        <MotivationTicker items={motivationItems} onOpenPerson={openPersonDetail} />
      )}

      <main>
        {apiError && <div className="sync-banner error">{apiError}</div>}
        {!apiError && isSyncing && (
          <div className="sync-loader" aria-label="データ更新中" role="status">
            <span aria-hidden />
          </div>
        )}

        {view === "open" && (
          <section className="view-stack">
            <div className="summary-list">
              {openMatches.length ? (
                <>
                  {openMatches.map((match) => (
                    <MatchSummaryCard
                      key={match.id}
                      match={match}
                      now={now}
                      votes={visibleVotes}
                      onOpen={() => openMatchDetail(match.id)}
                    />
                  ))}
                  <StageNoticeList now={now} />
                </>
              ) : (
                <>
                  <EmptyState title="受付中の予想テーマはありません" />
                  <StageNoticeList now={now} />
                </>
              )}
            </div>
          </section>
        )}

        {view === "closed" && (
          <section className="view-stack">
            <div className="summary-list">
              {closedMatches.length ? (
                closedMatches.map((match) => (
                  <MatchSummaryCard
                    key={match.id}
                    match={match}
                    now={now}
                    votes={visibleVotes}
                    onOpen={() => openMatchDetail(match.id)}
                  />
                ))
              ) : (
                <EmptyState title="締切済みの予想テーマはありません" />
              )}
            </div>
          </section>
        )}

        {view === "matchDetail" && selectedMatch && (
          <section className="view-stack" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <article className="match-card detail-card">
              <MatchHeader match={selectedMatch} now={now} votes={visibleVotes} showStatus={false} />

              {selectedMatch.resultOptionId && (
                <div className="result-panel">
                  <div>
                    <CheckCircle2 size={18} aria-hidden />
                    確定結果: <OptionLabelWithFlag label={optionLabel(selectedMatch, selectedMatch.resultOptionId)} />
                  </div>
                  <ScoreOutcome match={selectedMatch} />
                </div>
              )}

              <VoteForm
                draft={getDraft(selectedMatch)}
                hasRemoteState={hasRemoteState}
                isSaving={isSyncing}
                match={selectedMatch}
                now={now}
                votes={visibleVotes}
                onChange={(patch) => updateVoteDraft(selectedMatch.id, patch)}
                onSubmit={(event) => handleVote(selectedMatch, event)}
              />

              <BettorList
                match={selectedMatch}
                now={now}
                votes={visibleVotes}
                onRequestCancel={(vote) => setPendingVoteDelete({ match: selectedMatch, vote })}
              />
            </article>
          </section>
        )}

        {view === "people" && (
          <section className="view-stack">
            <PrizeTrendChart rows={personTrendRows} />
            <div className="people-sort-control" aria-label="個人別一覧の並び替え">
              {[
                { key: "net" as const, label: "確定収支" },
                { key: "return" as const, label: "リターン" },
                { key: "win" as const, label: "勝率" },
              ].map((item) => (
                <button
                  className={peopleSort.key === item.key ? "active" : ""}
                  key={item.key}
                  type="button"
                  onClick={() => updatePeopleSort(item.key)}
                >
                  <span className={peopleSort.key === item.key && peopleSort.direction === "desc" ? "active" : ""}>
                    ▲
                  </span>
                  <b>{item.label}</b>
                  <span className={peopleSort.key === item.key && peopleSort.direction === "asc" ? "active" : ""}>
                    ▼
                  </span>
                </button>
              ))}
            </div>
            <div className="people-list">
              {userRows.length ? (
                sortedUserRows.map((row) => {
                  const metrics = [
                    {
                      key: "net" as const,
                      label: "確定収支",
                      value: `${row.net >= 0 ? "+" : ""}${formatPoints(row.net)}`,
                      className: row.net >= 0 ? "positive" : "negative",
                    },
                    {
                      key: "return" as const,
                      label: "リターン率",
                      value: row.returnRate === null
                        ? "-"
                        : `${row.returnRate > 0 ? "+" : ""}${formatPercent(row.returnRate)}`,
                      className: row.returnRate === null ? "" : row.returnRate >= 0 ? "positive" : "negative",
                    },
                    {
                      key: "win" as const,
                      label: "勝率",
                      value: row.winRate === null ? "-" : formatPercent(row.winRate),
                      className: row.winRate === null ? "" : row.winRate >= 50 ? "positive" : "negative",
                    },
                  ].sort((a, b) => {
                    if (a.key === peopleSort.key) return -1;
                    if (b.key === peopleSort.key) return 1;
                    return 0;
                  });
                  const [primaryMetric, ...secondaryMetrics] = metrics;
                  const personIconSrc = getPersonIconSrc(row.name);

                  return (
                    <button
                      className="person-row"
                      key={row.name}
                      type="button"
                      onClick={() => openPersonDetail(row.name)}
                    >
                      <span className="person-row-person">
                        <strong>{row.name}</strong>
                        <span className="person-row-icon-slot">
                          {personIconSrc && (
                            <img
                              alt=""
                              className="person-row-icon"
                              decoding="async"
                              loading="lazy"
                              src={personIconSrc}
                            />
                          )}
                        </span>
                      </span>
                      <span className="person-row-metrics">
                        <b className={primaryMetric.className}>
                          {primaryMetric.label} {primaryMetric.value}
                        </b>
                        {secondaryMetrics.map((metric) => (
                          <small className={metric.className} key={metric.key}>
                            {metric.label} {metric.value}
                          </small>
                        ))}
                        <small>投票中 {formatPoints(row.pending)}</small>
                      </span>
                    </button>
                  );
                })
              ) : (
                <EmptyState title="投票者はまだ登録されていません" />
              )}
            </div>
          </section>
        )}

        {view === "personDetail" && (
          <section className="view-stack" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <button className="back-action" type="button" onClick={goBackFromDetail}>
              個人別一覧へ戻る
            </button>
            <div className="section-heading">
              <div>
                <h2>{selectedPersonName || "未選択"}</h2>
              </div>
            </div>

            <div className="stats-row">
              <StatCard
                label="投票ポイント"
                value={formatPoints(selectedPersonSettledStake)}
                icon={<WalletCards size={17} aria-hidden />}
              />
              <StatCard
                label="獲得ポイント"
                value={formatPoints(selectedPersonSummary.grossPayout)}
                icon={<Trophy size={17} aria-hidden />}
              />
              <StatCard
                label="リターン率"
                value={
                  selectedPersonReturnRate === null
                    ? "-"
                    : `${selectedPersonReturnRate > 0 ? "+" : ""}${formatPercent(selectedPersonReturnRate)}`
                }
                tone={
                  selectedPersonReturnRate === null
                    ? undefined
                    : selectedPersonReturnRate >= 0
                      ? "positive"
                      : "negative"
                }
                icon={<RotateCcw size={17} aria-hidden />}
              />
              <StatCard
                label="確定収支"
                value={`${selectedPersonSummary.net >= 0 ? "+" : ""}${formatPoints(
                  selectedPersonSummary.net,
                )}`}
                tone={selectedPersonSummary.net >= 0 ? "positive" : "negative"}
                icon={<History size={17} aria-hidden />}
                variant="net"
              />
              <StatCard
                label="投票中ポイント"
                value={formatPoints(selectedPersonSummary.pendingStake)}
                icon={<Clock3 size={17} aria-hidden />}
                variant="pending"
              />
              <StatCard
                label="勝率"
                value={
                  selectedPersonWinRate === null
                    ? "-"
                    : `${formatPercent(selectedPersonWinRate)}`
                }
                icon={<CheckCircle2 size={17} aria-hidden />}
              />
            </div>

            <div className="data-panel">
              <div className="panel-title">
                <History size={18} aria-hidden />
                収支履歴
              </div>
              {selectedBalanceRows.length ? (
                <PersonBalanceHistory rows={selectedBalanceRows} onOpenMatch={openMatchDetail} />
              ) : (
                <EmptyState title="確定済みの収支履歴はまだありません" />
              )}
            </div>

            <PersonVoteList
              votes={selectedPersonVotes}
              matches={data.matches}
              allVotes={data.votes}
              onOpenMatch={openMatchDetail}
            />
          </section>
        )}

        {view === "settings" && (
          <section className="settings-page">
            <button className="back-action" type="button" onClick={() => setView("admin")}>
              管理画面へ戻る
            </button>

            <div className="section-heading">
              <div>
                <h2>設定</h2>
              </div>
            </div>

            {!settingsPassword ? (
              <form className="data-panel form-panel settings-auth-panel" onSubmit={unlockSettings}>
                <div className="panel-title">
                  <Settings size={18} aria-hidden />
                  設定パスワード
                </div>
                <label>
                  <span>パスワード</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={settingsPasswordInput}
                    onChange={(event) => setSettingsPasswordInput(event.target.value)}
                    placeholder="••••"
                  />
                </label>
                <button className="primary-action" disabled={!adminToken} type="submit">
                  <Settings size={18} aria-hidden />
                  設定画面を開く
                </button>
                {!adminToken && <p className="inline-message">先に管理者認証を行ってください。</p>}
                {settingsMessage && <p className="inline-message">{settingsMessage}</p>}
              </form>
            ) : (
              <>
                <div className="data-panel settings-status-panel">
                  <div className="panel-title">
                    <Bot size={18} aria-hidden />
                    自動投票設定
                  </div>
                  <div className="settings-status-grid">
                    <span>
                      <small>対象ユーザー</small>
                      <b>{autoBetConfig?.userName ?? "ひろた"}</b>
                    </span>
                    <span>
                      <small>実行タイミング</small>
                      <b>締切 {autoBetConfig?.executeOffsetMinutes ?? 10}分前</b>
                    </span>
                  </div>
                  <div className="button-row">
                    <button className="ghost-action" type="button" onClick={() => refreshAutoBetSettings()}>
                      <RotateCcw size={18} aria-hidden />
                      更新
                    </button>
                    <button
                      className="ghost-action danger"
                      type="button"
                      onClick={() => {
                        sessionStorage.removeItem(SETTINGS_PASSWORD_KEY);
                        setSettingsPassword("");
                        setAutoBetConfig(null);
                        setAutoBetReservations([]);
                      }}
                    >
                      <X size={18} aria-hidden />
                      設定を閉じる
                    </button>
                  </div>
                  {settingsMessage && <p className="inline-message">{settingsMessage}</p>}
                </div>

                <div className="auto-bet-view-switch" role="group" aria-label="自動投票予約の表示切替">
                  <button
                    className={autoBetReservationView === "upcoming" ? "active" : ""}
                    type="button"
                    onClick={() => setAutoBetReservationView("upcoming")}
                  >
                    これから予約
                  </button>
                  <button
                    className={autoBetReservationView === "history" ? "active" : ""}
                    type="button"
                    onClick={() => setAutoBetReservationView("history")}
                  >
                    実行後
                  </button>
                </div>

                {autoBetReservationView === "upcoming" ? (
                  <div className="settings-match-list">
                    {openMatches.length ? (
                      openMatches.map((match) => {
                      const matchVotes = getMatchVotes(match, visibleVotes);
                      const totalPool = getMatchTotal(match, visibleVotes);
                      const draft = getReservationDraft(match);
                      const previewRows = getConditionalBetPreview(match, visibleVotes);
                      const pendingReservation = autoBetReservations.find(
                        (reservation) => reservation.matchId === match.id && reservation.status === "pending",
                      );
                      const executeAt = getReservationExecuteIso(match);

                      return (
                        <article className="data-panel auto-bet-card" key={match.id}>
                          <div className="auto-bet-card-head">
                            <span>
                              <strong><MatchTitleWithFlags title={match.title} /></strong>
                              <small>
                                締切 {formatDateTime(match.closesAt)} / 総プール {formatPoints(totalPool)}
                              </small>
                            </span>
                            <label className="auto-bet-execute-control">
                              <small>実行時刻</small>
                              <input
                                type="datetime-local"
                                value={getReservationExecuteInput(match)}
                                onChange={(event) => updateReservationExecuteAt(match, event.target.value)}
                              />
                            </label>
                          </div>

                          <div className="auto-bet-current-label">
                            <span>予約条件</span>
                            <small>
                              {executeAt ? `${formatDateTime(executeAt)} の最新プールで再計算します` : "実行時刻を入力してください"}
                            </small>
                          </div>

                          <div className="auto-bet-options">
                            {match.options.map((option) => {
                              const optionTotal = getOptionTotal(match, visibleVotes, option.id);
                              const odds = optionTotal > 0 && totalPool > 0 ? totalPool / optionTotal : null;
                              const hirotaTotal = matchVotes
                                .filter((vote) => normalizeName(vote.userName) === "ひろた" && vote.optionId === option.id)
                                .reduce((sum, vote) => sum + vote.amount, 0);
                              const row = draft[option.id];
                              const preview = previewRows.find((item) => item.optionId === option.id);
                              return (
                                <div className="auto-bet-option-row conditional-rule-row" key={option.id}>
                                  <label className="conditional-rule-toggle">
                                    <input
                                      checked={Boolean(row?.enabled)}
                                      type="checkbox"
                                      onChange={(event) =>
                                        updateReservationDraft(match, option.id, { enabled: event.target.checked })
                                      }
                                    />
                                    <span>
                                      <b><OptionLabelWithFlag label={optionDisplayLabel(match, option)} /></b>
                                      <small>
                                        現在 {odds ? `${odds.toFixed(2)}x` : "-"} / プール {formatPoints(optionTotal)}
                                        {hirotaTotal > 0 ? ` / ひろた ${formatPoints(hirotaTotal)}` : ""}
                                      </small>
                                    </span>
                                  </label>
                                  <div className="conditional-rule-fields">
                                    <label>
                                      <span>優先</span>
                                      <input
                                        min={1}
                                        step={1}
                                        type="number"
                                        value={row?.priority ?? ""}
                                        onChange={(event) =>
                                          updateReservationDraft(match, option.id, { priority: event.target.value })
                                        }
                                      />
                                    </label>
                                    <label>
                                      <span>最低オッズ</span>
                                      <input
                                        min={1.01}
                                        step={0.01}
                                        type="number"
                                        value={row?.minOdds ?? ""}
                                        onChange={(event) =>
                                          updateReservationDraft(match, option.id, { minOdds: event.target.value })
                                        }
                                      />
                                    </label>
                                    <label>
                                      <span>最大pt</span>
                                      <input
                                        min={100}
                                        step={100}
                                        type="number"
                                        value={row?.maxAmount ?? ""}
                                        onChange={(event) =>
                                          updateReservationDraft(match, option.id, { maxAmount: event.target.value })
                                        }
                                      />
                                    </label>
                                  </div>
                                  {row?.enabled && (
                                    <small className={preview?.amount ? "conditional-rule-preview positive" : "conditional-rule-preview negative"}>
                                      現時点試算: {preview?.amount ? formatPoints(preview.amount) : "投票なし"}
                                      {preview?.afterOdds ? ` / 投票後 ${preview.afterOdds.toFixed(2)}x` : ""}
                                    </small>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <button
                            className="primary-action compact"
                            disabled={autoBetActionMatchId === match.id || Boolean(pendingReservation)}
                            type="button"
                            onClick={() => reserveAutoBet(match)}
                          >
                            <CalendarClock size={18} aria-hidden />
                            {pendingReservation ? "予約済み" : "この条件で予約する"}
                          </button>
                        </article>
                      );
                      })
                    ) : (
                      <EmptyState title="受付中の試合はありません" />
                    )}
                  </div>
                ) : null}

                <div className="data-panel auto-bet-reservations-panel">
                  <div className="panel-title">
                    <CalendarClock size={18} aria-hidden />
                    {autoBetReservationView === "upcoming" ? "予約中" : "実行後の記録"}
                  </div>
                  {autoBetReservations.filter((reservation) =>
                    autoBetReservationView === "upcoming"
                      ? reservation.status === "pending" || reservation.status === "processing"
                      : reservation.status !== "pending" && reservation.status !== "processing",
                  ).length ? (
                    <div className="auto-bet-reservation-list">
                      {autoBetReservations
                        .filter((reservation) =>
                          autoBetReservationView === "upcoming"
                            ? reservation.status === "pending" || reservation.status === "processing"
                            : reservation.status !== "pending" && reservation.status !== "processing",
                        )
                        .map((reservation) => (
                        <div className="auto-bet-reservation-row" key={reservation.id}>
                          <span>
                            <strong>{reservation.matchTitle}</strong>
                            <small>
                              {formatDateTime(reservation.executeAt)} / 上限 {formatPoints(reservation.maxAmount)} / {reservation.status}
                            </small>
                            {reservation.strategy?.rules?.map((rule) => (
                              <small key={`${reservation.id}-${rule.optionId}`}>
                                優先{rule.priority} {rule.optionLabel} / 最低{rule.minOdds.toFixed(2)}x / 最大{formatPoints(rule.maxAmount)}
                              </small>
                            ))}
                            {reservation.recommendation?.rules?.map((rule) => (
                              <small key={`${reservation.id}-result-${rule.optionId}`}>
                                結果 {rule.optionLabel} {rule.amount ? formatPoints(rule.amount) : "見送り"}
                                {rule.beforeOdds ? ` / 実行前 ${rule.beforeOdds.toFixed(2)}x` : ""}
                                {rule.afterOdds ? ` / 投票後 ${rule.afterOdds.toFixed(2)}x` : ""}
                                {rule.reason ? ` / ${rule.reason}` : ""}
                              </small>
                            ))}
                            {reservation.recommendation?.reason && (
                              <small className="auto-bet-execution-note">{reservation.recommendation.reason}</small>
                            )}
                            {reservation.recommendation?.optionLabel &&
                              !reservation.recommendation?.recommendations?.length &&
                              !reservation.recommendation?.rules?.length && (
                              <small>
                                {reservation.recommendation.optionLabel} {formatPoints(reservation.recommendation.amount ?? 0)}
                              </small>
                            )}
                            {reservation.recommendation?.recommendations?.map((recommendation) => (
                              <small key={recommendation.optionId}>
                                {recommendation.optionLabel} {formatPoints(recommendation.amount ?? 0)}
                              </small>
                            ))}
                            {reservation.error && <small className="negative">{reservation.error}</small>}
                          </span>
                          {reservation.status === "pending" && (
                            <button className="ghost-action danger" type="button" onClick={() => cancelReservation(reservation)}>
                              取消
                            </button>
                          )}
                        </div>
                        ))}
                    </div>
                  ) : (
                    <EmptyState title={autoBetReservationView === "upcoming" ? "予約中の自動投票はありません" : "実行後の記録はありません"} />
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {view === "admin" && (
          <section className="admin-layout">
            <div className="data-panel admin-auth-panel">
              <div className="panel-title">
                <ShieldCheck size={18} aria-hidden />
                管理者認証
              </div>
              {adminToken ? (
                <div className="admin-auth-row">
                  <p className="inline-message">管理者として操作できます。</p>
                  <button className="ghost-action" type="button" onClick={logoutAdmin}>
                    <X size={18} aria-hidden />
                    解除
                  </button>
                </div>
              ) : (
                <form className="admin-auth-row" onSubmit={loginAdmin}>
                  <label>
                    <span>管理パスワード</span>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(event) => setAdminPassword(event.target.value)}
                      placeholder="管理パスワードを入力"
                      autoComplete="current-password"
                    />
                  </label>
                  <button className="primary-action" type="submit">
                    <ShieldCheck size={18} aria-hidden />
                    認証
                  </button>
                </form>
              )}
              {adminMessage && <p className="inline-message">{adminMessage}</p>}
            </div>
            {adminToken && (
              <>
            <details className="data-panel admin-backup-panel admin-disclosure">
              <summary className="panel-title admin-disclosure-title">
                <Database size={18} aria-hidden />
                DBバックアップ
                <span>開く</span>
              </summary>
              <p className="admin-help">
                毎日04:00以降に1回、試合・選択肢・投票・ユーザー別収支をCSVで保存します。
                結果確定後にも少し時間を置いて自動保存します。既存の投票データは変更しません。
              </p>
              <div className="backup-storage-status">
                <strong>外部CSV保存</strong>
                <span>
                  {backupStorage?.configured
                    ? `有効: ${backupStorage.bucket ?? "設定済み"}`
                    : "未設定: Render環境変数を追加するとCloudflare R2/S3へ保存します"}
                </span>
              </div>
              <div className="button-row">
                <button
                  className="primary-action"
                  disabled={isBackupLoading}
                  onClick={createManualBackup}
                  type="button"
                >
                  <Database size={18} aria-hidden />
                  今すぐ作成
                </button>
                <button
                  className="ghost-action"
                  disabled={isBackupLoading}
                  onClick={() => refreshBackups()}
                  type="button"
                >
                  <RotateCcw size={18} aria-hidden />
                  一覧更新
                </button>
              </div>
              {backupMessage && <p className="inline-message">{backupMessage}</p>}
              {backups.length ? (
                <div className="backup-list">
                  {backups.map((backup) => (
                    <div className="backup-row" key={backup.id}>
                      <span>
                        <strong>{formatDateTime(backup.createdAt)}</strong>
                        <small>
                          {backup.reason === "daily" ? "自動" : "手動"} / 試合 {backup.matchCount}件 /
                          投票 {backup.voteCount}件 / ユーザー {backup.userCount}件 / {formatBytes(backup.byteSize)}
                        </small>
                        <small
                          className={backup.externalStatus === "failed" ? "backup-external-error" : ""}
                        >
                          {formatExternalBackupStatus(backup)}
                          {backup.externalError ? `: ${backup.externalError}` : ""}
                        </small>
                      </span>
                      <div className="backup-actions">
                        {backupStorage?.configured && backup.externalStatus !== "uploaded" && (
                          <button
                            className="ghost-action"
                            disabled={isBackupLoading}
                            onClick={() => syncExternalBackup(backup)}
                            type="button"
                          >
                            外部保存
                          </button>
                        )}
                        <button
                          className="ghost-action"
                          disabled={isBackupLoading}
                          onClick={() => downloadBackup(backup)}
                          type="button"
                        >
                          CSV
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title={isBackupLoading ? "バックアップを確認中です" : "バックアップはまだありません"} />
              )}
            </details>

            <div className="admin-column">
              <form className="data-panel form-panel" onSubmit={addMatch}>
                <div className="panel-title">
                  <ListPlus size={18} aria-hidden />
                  試合登録
                </div>
                <div className="form-grid">
                  <label>
                    <span>タイトル</span>
                    <input
                      value={matchDraft.title}
                      onChange={(event) =>
                        setMatchDraft((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="日本 vs カメルーン"
                    />
                  </label>
                  <label>
                    <span>開始時刻</span>
                    <input
                      type="datetime-local"
                      value={matchDraft.startsAt}
                      onChange={(event) =>
                        setMatchDraft((current) => ({
                          ...current,
                          startsAt: event.target.value,
                          closesAt: current.closesAt || event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>投票締切</span>
                    <input
                      type="datetime-local"
                      value={matchDraft.closesAt}
                      onChange={(event) =>
                        setMatchDraft((current) => ({ ...current, closesAt: event.target.value }))
                      }
                    />
                  </label>
                  <label className="wide">
                    <span>選択肢</span>
                    <textarea
                      value={matchDraft.optionsText}
                      onChange={(event) =>
                        setMatchDraft((current) => ({
                          ...current,
                          optionsText: event.target.value,
                        }))
                      }
                      rows={4}
                    />
                  </label>
                  <label className="wide">
                    <span>注意事項</span>
                    <textarea
                      value={matchDraft.notice}
                      onChange={(event) =>
                        setMatchDraft((current) => ({
                          ...current,
                          notice: event.target.value,
                        }))
                      }
                      placeholder="必要な場合のみ入力"
                      rows={3}
                    />
                  </label>
                  <div className="wide">
                    <HandicapPicker
                      optionId={matchDraft.handicapOptionId}
                      options={splitOptions(matchDraft.optionsText).slice(0, 2).map((label) => ({
                        id: label,
                        label,
                      }))}
                      points={matchDraft.handicapPoints}
                      onChange={(next) =>
                        setMatchDraft((current) => ({
                          ...current,
                          handicapOptionId: next.optionId,
                          handicapPoints: next.points,
                        }))
                      }
                    />
                  </div>
                </div>
                <button className="primary-action" type="submit">
                  <ListPlus size={18} aria-hidden />
                  登録
                </button>
              </form>

              <div className="data-panel form-panel">
                <div className="panel-title">
                  <Upload size={18} aria-hidden />
                  CSV一括登録
                </div>
                <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
                <textarea
                  className="csv-box"
                  value={csvText}
                  onChange={(event) => setCsvText(event.target.value)}
                  rows={8}
                  spellCheck={false}
                />
                <div className="button-row">
                  <button className="primary-action" type="button" onClick={importCsv}>
                    <Upload size={18} aria-hidden />
                    取り込む
                  </button>
                  <button className="ghost-action" type="button" onClick={() => setCsvText(csvTemplate)}>
                    <RotateCcw size={18} aria-hidden />
                    テンプレート
                  </button>
                </div>
                {importMessage && <p className="inline-message">{importMessage}</p>}
              </div>
            </div>

            <div className="admin-column wide-column">
              <details className="data-panel admin-disclosure">
                <summary className="panel-title admin-disclosure-title">
                  <Database size={18} aria-hidden />
                  結果確定
                  <span>開く</span>
                </summary>
                <p className="admin-help">
                  締切済みの予想テーマだけを表示しています。VS形式は得点から自動判定し、それ以外は結果を選んで確定します。
                </p>
                {settleCandidateMatches.length ? (
                  <div className="admin-settle-list">
                    {settleCandidateMatches.map((match) => {
                      const scoreMode = usesScoreSettlement(match);
                      const scoreDraft = scoreDrafts[match.id] ?? {
                        home: match.homeScore === undefined ? "" : String(match.homeScore),
                        away: match.awayScore === undefined ? "" : String(match.awayScore),
                      };
                      const selectedOptionId =
                        resultDrafts[match.id] ?? match.resultOptionId ?? "";

                      return (
                        <details className="admin-item-disclosure" key={match.id}>
                          <summary>
                            <span>
                              <strong><MatchTitleWithFlags title={match.title} /></strong>
                              <small>{formatDateTime(match.closesAt)} 締切 / {getMatchVotes(match, visibleVotes).length}件</small>
                            </span>
                            <b>{scoreMode ? "得点を入力" : "結果を選ぶ"}</b>
                          </summary>
                          <AdminSettleCard
                            adminToken={adminToken}
                            match={match}
                            now={now}
                            onDelete={() => deleteMatch(match.id)}
                            onReopen={() => reopenMatch(match)}
                            onSelect={(optionId) =>
                              setResultDrafts((current) => ({ ...current, [match.id]: optionId }))
                            }
                            onScoreChange={(nextDraft) =>
                              setScoreDrafts((current) => ({ ...current, [match.id]: nextDraft }))
                            }
                            onSettle={() =>
                              settleMatch(
                                match,
                                scoreMode ? { scoreDraft } : { optionId: selectedOptionId },
                              )
                            }
                            scoreDraft={scoreDraft}
                            scoreMode={scoreMode}
                            selectedOptionId={selectedOptionId}
                            votes={visibleVotes}
                          />
                        </details>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState title="確定できる締切済みテーマはありません" />
                )}
                {settledMatches.length > 0 && (
                  <div className="settled-summary-list">
                    <div className="small-heading">確定済み</div>
                    {settledMatches.map((match) => (
                      <div className="settled-summary-row" key={match.id}>
                        <span>
                          <strong><MatchTitleWithFlags title={match.title} /></strong>
                          <small>{formatDateTime(match.settledAt ?? match.closesAt)}</small>
                        </span>
                        <b>{optionLabel(match, match.resultOptionId ?? "")}</b>
                        <ScoreOutcome match={match} compact />
                      </div>
                    ))}
                  </div>
                )}
              </details>

              <details className="data-panel form-panel admin-disclosure">
                <summary className="panel-title admin-disclosure-title">
                  <WalletCards size={18} aria-hidden />
                  ポイント調整
                  <span>開く</span>
                </summary>
                <p className="admin-help">
                  例外対応用です。最低2人以上を同時に入力し、増減額の合計が必ず0になるようにしてください。
                </p>
                <form className="point-adjustment-form" onSubmit={submitPointAdjustment}>
                  <label>
                    <span>調整タイトル</span>
                    <input
                      value={pointAdjustmentDraft.title}
                      onChange={(event) =>
                        setPointAdjustmentDraft((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="例: 入力ミス補正"
                    />
                  </label>
                  <label>
                    <span>修正理由</span>
                    <textarea
                      value={pointAdjustmentDraft.reason}
                      onChange={(event) =>
                        setPointAdjustmentDraft((current) => ({ ...current, reason: event.target.value }))
                      }
                      placeholder="なぜ通常の結果確定とは別に調整するのか"
                      rows={3}
                    />
                  </label>
                  <div className="point-adjustment-entries">
                    {pointAdjustmentDraft.entries.map((entry, index) => (
                      <div className="point-adjustment-entry" key={index}>
                        <label>
                          <span>ユーザー名</span>
                          <input
                            list="known-users"
                            value={entry.userName}
                            onChange={(event) => updatePointAdjustmentEntry(index, { userName: event.target.value })}
                            placeholder="ユーザー名"
                          />
                        </label>
                        <label>
                          <span>増減pt</span>
                          <input
                            type="number"
                            step="1"
                            value={entry.amount}
                            onChange={(event) => updatePointAdjustmentEntry(index, { amount: event.target.value })}
                            placeholder="+100 / -100"
                          />
                        </label>
                        <button
                          className="ghost-action danger point-adjustment-remove"
                          disabled={pointAdjustmentDraft.entries.length <= 2}
                          onClick={() => removePointAdjustmentEntry(index)}
                          type="button"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="point-adjustment-total">
                    <span>合計</span>
                    {(() => {
                      const total = pointAdjustmentDraft.entries.reduce(
                        (sum, entry) => sum + (Number(entry.amount) || 0),
                        0,
                      );
                      return (
                        <b className={total === 0 ? "positive" : "negative"}>
                          {total >= 0 ? "+" : ""}
                          {formatPoints(total)}
                        </b>
                      );
                    })()}
                  </div>
                  <div className="button-row">
                    <button className="ghost-action" type="button" onClick={addPointAdjustmentEntry}>
                      行を追加
                    </button>
                    <button className="primary-action" disabled={!adminToken || isSyncing} type="submit">
                      <WalletCards size={18} aria-hidden />
                      調整を登録
                    </button>
                  </div>
                  {pointAdjustmentMessage && <p className="inline-message">{pointAdjustmentMessage}</p>}
                </form>
              </details>

              <details className="data-panel admin-disclosure">
                <summary className="panel-title admin-disclosure-title">
                  <UserRound size={18} aria-hidden />
                  ユーザーDB
                  <span>開く</span>
                </summary>
                {userRows.length ? (
                  <div className="responsive-table">
                    <table>
                      <thead>
                        <tr>
                          <th>名前</th>
                          <th>投票数</th>
                          <th>総投票pt</th>
                          <th>未確定pt</th>
                          <th>獲得pt</th>
                          <th>調整pt</th>
                          <th>確定収支</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userRows.map((row) => (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{row.votes}</td>
                            <td>{formatPoints(row.staked)}</td>
                            <td>{formatPoints(row.pending)}</td>
                            <td>{formatPoints(row.gross)}</td>
                            <td className={row.adjustmentNet >= 0 ? "positive" : "negative"}>
                              {row.adjustmentNet >= 0 ? "+" : ""}
                              {formatPoints(row.adjustmentNet)}
                            </td>
                            <td className={row.net >= 0 ? "positive" : "negative"}>
                              {row.net >= 0 ? "+" : ""}
                              {formatPoints(row.net)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState title="ユーザーはまだ登録されていません" />
                )}
              </details>

              <details className="data-panel admin-disclosure">
                <summary className="panel-title admin-disclosure-title">
                  <History size={18} aria-hidden />
                  投票DB
                  <span>開く</span>
                </summary>
                {visibleVotes.length ? (
                  <div className="responsive-table admin-votes-table">
                    <table>
                      <thead>
                        <tr>
                          <th>操作</th>
                          <th>日時</th>
                          <th>名前</th>
                          <th>試合</th>
                          <th>選択</th>
                          <th>ポイント</th>
                          <th>結果</th>
                          <th>リターン</th>
                          <th>収支</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleVotes.map((vote) => {
                          const match = data.matches.find((item) => item.id === vote.matchId);
                          const payout = getVotePayout(vote, match, data.votes);
                          return (
                            <tr key={vote.id}>
                              <td>
                                {payout.settled ? (
                                  <span className="locked-action">確定済み</span>
                                ) : (
                                  <button
                                    className="table-delete"
                                    disabled={!adminToken}
                                    onClick={() => deleteVote(vote)}
                                    type="button"
                                  >
                                    削除
                                  </button>
                                )}
                              </td>
                              <td>{formatDateTime(vote.createdAt)}</td>
                              <td>{vote.userName}</td>
                              <td>{match?.title ?? "削除済み"}</td>
                              <td>{optionLabel(match, vote.optionId)}</td>
                              <td>{formatPoints(vote.amount)}</td>
                              <td>{getVoteOutcomeText(payout)}</td>
                              <td>{payout.settled ? formatPoints(payout.gross) : "-"}</td>
                              <td className={payout.net >= 0 ? "positive" : "negative"}>
                                {payout.settled
                                  ? `${payout.net >= 0 ? "+" : ""}${formatPoints(payout.net)}`
                                  : "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState title="投票はまだありません" />
                )}
                <button className="ghost-action reset-action" type="button" onClick={refreshState}>
                  <RotateCcw size={18} aria-hidden />
                  DB再同期
                </button>
              </details>

              <details className="data-panel form-panel admin-disclosure">
                <summary className="panel-title admin-disclosure-title">
                  <ListPlus size={18} aria-hidden />
                  試合編集
                  <span>開く</span>
                </summary>
                <p className="admin-help">
                  投票済みでもタイトル・開始時刻・締切時刻は編集できます。投票済みの選択肢は削除や名称変更ができません。
                </p>
                {editableMatches.length ? (
                  <div className="admin-match-list">
                    {editableMatches.map((match) => (
                      <button
                        className={editMatchId === match.id ? "admin-match-row selected" : "admin-match-row"}
                        key={match.id}
                        onClick={() => startEditMatch(match)}
                        type="button"
                      >
                        <div>
                          <strong><MatchTitleWithFlags title={match.title} /></strong>
                          <span>{formatDateTime(match.startsAt)} 開始 / {match.options.length}選択肢</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="編集できる試合はありません" />
                )}

                {editMatchId && (
                  <form className="edit-match-form" onSubmit={saveMatchEdit}>
                    <label>
                      <span>タイトル</span>
                      <input
                        value={editMatchDraft.title}
                        onChange={(event) =>
                          setEditMatchDraft((current) => ({ ...current, title: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span>開始時刻</span>
                      <input
                        type="datetime-local"
                        value={editMatchDraft.startsAt}
                        onChange={(event) =>
                          setEditMatchDraft((current) => ({
                            ...current,
                            startsAt: event.target.value,
                            closesAt: current.closesAt || event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>投票締切</span>
                      <input
                        type="datetime-local"
                        value={editMatchDraft.closesAt}
                        onChange={(event) =>
                          setEditMatchDraft((current) => ({ ...current, closesAt: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span>選択肢</span>
                      <textarea
                        value={editMatchDraft.optionsText}
                        onChange={(event) =>
                          setEditMatchDraft((current) => ({
                            ...current,
                            optionsText: event.target.value,
                          }))
                        }
                        rows={5}
                      />
                    </label>
                    <label>
                      <span>注意事項</span>
                      <textarea
                        value={editMatchDraft.notice}
                        onChange={(event) =>
                          setEditMatchDraft((current) => ({
                            ...current,
                            notice: event.target.value,
                          }))
                        }
                        placeholder="必要な場合のみ入力"
                        rows={3}
                      />
                    </label>
                    <HandicapPicker
                      optionId={editMatchDraft.handicapOptionId}
                      options={splitOptions(editMatchDraft.optionsText).slice(0, 2).map((label) => {
                        const existingOption = data.matches
                          .find((item) => item.id === editMatchId)
                          ?.options.find((option) => option.label === label);
                        return {
                          id: existingOption?.id ?? label,
                          label,
                        };
                      })}
                      points={editMatchDraft.handicapPoints}
                      onChange={(next) =>
                        setEditMatchDraft((current) => ({
                          ...current,
                          handicapOptionId: next.optionId,
                          handicapPoints: next.points,
                        }))
                      }
                    />
                    <div className="button-row">
                      <button className="primary-action" disabled={!adminToken} type="submit">
                        保存
                      </button>
                      <button
                        className="ghost-action"
                        onClick={() => {
                          setEditMatchId("");
                          setEditMatchDraft(emptyMatchDraft);
                        }}
                        type="button"
                      >
                        取り消す
                      </button>
                    </div>
                    <button
                      className="ghost-action danger"
                      disabled={!adminToken}
                      onClick={() => deleteMatch(editMatchId)}
                      type="button"
                    >
                      削除
                    </button>
                  </form>
                )}
              </details>

              <div className="data-panel settings-entry-panel">
                <div className="panel-title">
                  <Settings size={18} aria-hidden />
                  設定
                </div>
                <button className="ghost-action" type="button" onClick={() => setView("settings")}>
                  <Settings size={18} aria-hidden />
                  設定画面を開く
                </button>
              </div>
            </div>
              </>
            )}
          </section>
        )}
      </main>
      {view !== "admin" && view !== "settings" && (
        <button className="admin-link-bottom" type="button" onClick={() => setView("admin")}>
          管理画面
        </button>
      )}

      {showScheduledPicker && (
        <ScheduledMatchPicker
          matches={scheduledMatches}
          isLoading={isScheduledLoading}
          message={scheduledMessage}
          onAdd={addScheduledMatch}
          onClose={() => setShowScheduledPicker(false)}
          onRefresh={loadScheduledMatches}
        />
      )}

      {showReferenceOdds && <ReferenceMenu onAddClick={openScheduledPicker} />}
      {toastMessage && (
        <div className="toast-message" role="status">
          {toastMessage}
        </div>
      )}
      {pendingVote && (
        <div className="confirm-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label="投票内容の確認">
            <dl>
              <div>
                <dt>予想テーマ</dt>
                <dd>{pendingMatch?.title ?? "選択中のテーマ"}</dd>
              </div>
              <div>
                <dt>選択</dt>
                <dd>{pendingVote.optionLabel}</dd>
              </div>
              <div>
                <dt>名前</dt>
                <dd>{pendingVote.userName}</dd>
              </div>
              <div>
                <dt>投票pt</dt>
                <dd>{formatPoints(pendingVote.amount)}</dd>
              </div>
            </dl>
            {pendingVoteImpact && (
              <section className="confirm-impact" aria-label="投票後のオッズ変動">
                <div className="impact-heading">
                  <span>投票後のオッズ変動</span>
                  <b>
                    {pendingVoteImpact.beforeOdds
                      ? `${pendingVoteImpact.beforeOdds.toFixed(2)}x`
                      : "-"}
                    {" -> "}
                    {pendingVoteImpact.afterOdds.toFixed(2)}x
                  </b>
                </div>
                <div className="impact-grid">
                  <div>
                    <span>総プール</span>
                    <b>{formatPoints(pendingVoteImpact.totalAfter)}</b>
                    <small>+{formatPoints(pendingVote.amount)}</small>
                  </div>
                  <div>
                    <span>{pendingVote.optionLabel}</span>
                    <b>{formatPoints(pendingVoteImpact.optionAfter)}</b>
                    <small>+{formatPoints(pendingVote.amount)}</small>
                  </div>
                </div>
                <p className="impact-return">
                  今回の選択が的中した場合
                  <strong>
                    {pendingVoteImpact.estimatedNet >= 0 ? "+" : ""}
                    {formatPoints(pendingVoteImpact.estimatedNet)}
                  </strong>
                </p>
                <div className="impact-personal-summary">
                  <div className="impact-subheading">
                    <span>投票後の個人別見込み</span>
                    <b>投票合計 {formatPoints(pendingVoteImpact.userTotalAfter)}</b>
                  </div>
                  <div className="impact-personal-rows">
                    {pendingVoteImpact.userOptionRows.map((row) => (
                      <div className={row.currentSelection ? "current" : ""} key={row.optionId}>
                        <span>{row.label}</span>
                        <b>{formatPoints(row.amount)}</b>
                        <small>
                          的中時リターン {formatPoints(row.gross)} / 個人最終収支{" "}
                          <strong className={row.net >= 0 ? "positive" : "negative"}>
                            {row.net >= 0 ? "+" : ""}
                            {formatPoints(row.net)}
                          </strong>
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
            <p className="confirm-note">投票後は取り消せません。</p>
            <div className="confirm-actions">
              <button className="ghost-action" type="button" onClick={() => setPendingVote(null)}>
                取り消す
              </button>
              <button className="primary-action" type="button" onClick={submitConfirmedVote} disabled={isSyncing}>
                <WalletCards size={18} aria-hidden />
                投票する
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingVoteDelete && (
        <div className="confirm-backdrop" role="presentation">
          <div className="confirm-dialog cancel-dialog" role="dialog" aria-modal="true" aria-label="投票削除の確認">
            <dl>
              <div>
                <dt>予想テーマ</dt>
                <dd>{pendingVoteDelete.match.title}</dd>
              </div>
              <div>
                <dt>名前</dt>
                <dd>{pendingVoteDelete.vote.userName}</dd>
              </div>
              <div>
                <dt>投票先</dt>
                <dd>{optionLabel(pendingVoteDelete.match, pendingVoteDelete.vote.optionId)}</dd>
              </div>
              <div>
                <dt>投票pt</dt>
                <dd>{formatPoints(pendingVoteDelete.vote.amount)}</dd>
              </div>
            </dl>
            <p className="confirm-note">
              名前を間違えて他人の投票を削除しないようにご注意ください。
            </p>
            <p className="cancel-limit-note">
              削除できるのは投票から5分以内、締切前、かつその試合で最新の投票のみです。確認中に別の投票が入った場合も削除できません。
            </p>
            <div className="confirm-actions">
              <button className="ghost-action" type="button" onClick={() => setPendingVoteDelete(null)}>
                戻る
              </button>
              <button className="primary-action danger-action" type="button" onClick={cancelRecentVote} disabled={isSyncing}>
                <Trash2 size={18} aria-hidden />
                本当に削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MotivationTicker({
  items,
  onOpenPerson,
}: {
  items: MotivationItem[];
  onOpenPerson: (name: string) => void;
}) {
  const stripRef = useRef<HTMLElement | null>(null);
  const visibleItems = items.length > 1 ? [...items, ...items, ...items] : items;

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || items.length <= 1) return;

    const segmentWidth = strip.scrollWidth / 3;
    strip.scrollLeft = segmentWidth;
  }, [items]);

  function keepRankingLoop() {
    const strip = stripRef.current;
    if (!strip || items.length <= 1) return;

    const segmentWidth = strip.scrollWidth / 3;
    if (segmentWidth <= 0) return;
    if (strip.scrollLeft < segmentWidth * 0.35) {
      strip.scrollLeft += segmentWidth;
    } else if (strip.scrollLeft > segmentWidth * 1.65) {
      strip.scrollLeft -= segmentWidth;
    }
  }

  function renderPointValue(value: string) {
    const pointValue = value.replace(/\s*pt$/, "");
    return (
      <>
        <span>{pointValue}</span>
        <small>pt</small>
      </>
    );
  }

  return (
    <aside
      className="motivation-strip"
      onScroll={keepRankingLoop}
      ref={stripRef}
      aria-label="確定後の速報ランキング"
    >
      <div className="motivation-track">
        {visibleItems.map((item, index) => (
          <button
            className={`motivation-chip ${item.tone}`}
            key={`${item.id}-${index}`}
            onClick={() => onOpenPerson(item.name)}
            type="button"
          >
            <span>
              <b>{compactDisplayName(item.name)}</b>
              <span className="motivation-chip-body">
                {item.iconSrc && (
                  <img
                    alt=""
                    className="motivation-chip-icon"
                    decoding="async"
                    loading="lazy"
                    src={item.iconSrc}
                  />
                )}
                <span>
                  <strong>{renderPointValue(item.value)}</strong>
                  <em className={`delta-${item.metaTone}`}>{item.meta}</em>
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function PrizeTrendChart({ rows }: { rows: PersonTrendRow[] }) {
  if (!rows.length) {
    return (
      <section className="trend-card trend-card-empty" aria-label="確定収支推移">
        <div className="trend-heading">
          <span>
            <Trophy size={17} aria-hidden />
            賞金レース推移
          </span>
          <small>結果確定後に表示</small>
        </div>
        <p>確定した試合が出ると、全員の収支推移をここに表示します。</p>
      </section>
    );
  }

  const width = 360;
  const height = 260;
  const paddingLeft = 20;
  const paddingRight = 102;
  const paddingY = 24;
  const plotRight = width - paddingRight;
  const allValues = rows.flatMap((row) => row.points.map((point) => point.value));
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(0, ...allValues);
  const range = Math.max(1, maxValue - minValue);
  const colors = [
    "#ffe45e",
    "#5ee7ff",
    "#7cff9d",
    "#ff8db6",
    "#bba1ff",
    "#ffb15e",
    "#8df4d2",
    "#ff6d6d",
  ];

  function xFor(index: number, count: number) {
    if (count <= 1) return width / 2;
    return paddingLeft + (index / (count - 1)) * (plotRight - paddingLeft);
  }

  function yFor(value: number) {
    return height - paddingY - ((value - minValue) / range) * (height - paddingY * 2);
  }

  function makeSmoothPath(points: Array<{ x: number; y: number }>) {
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

    const segments = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];

    for (let index = 0; index < points.length - 1; index += 1) {
      const currentPoint = points[index];
      const nextPoint = points[index + 1];
      const deltaX = nextPoint.x - currentPoint.x;
      const control1 = {
        x: currentPoint.x + deltaX * 0.42,
        y: currentPoint.y,
      };
      const control2 = {
        x: currentPoint.x + deltaX * 0.58,
        y: nextPoint.y,
      };

      segments.push(
        `C ${control1.x.toFixed(1)} ${control1.y.toFixed(1)} ${control2.x.toFixed(1)} ${control2.y.toFixed(1)} ${nextPoint.x.toFixed(1)} ${nextPoint.y.toFixed(1)}`,
      );
    }

    return segments.join(" ");
  }

  const labelTargetIndexes = new Set<number>();
  rows.forEach((_, index) => {
    if (index < 3 || index >= Math.max(0, rows.length - 3)) {
      labelTargetIndexes.add(index);
    }
  });
  const lastPlaceName = rows[rows.length - 1]?.name;

  const labelRows = [...labelTargetIndexes]
    .map((rowIndex) => {
      const row = rows[rowIndex];
      const lastPoint = row.points[row.points.length - 1];
      return {
        row,
        rowIndex,
        lineY: yFor(lastPoint.value),
        labelY: yFor(lastPoint.value),
      };
    })
    .sort((a, b) => a.labelY - b.labelY);

  const minLabelGap = 23;
  labelRows.forEach((label, index) => {
    if (index === 0) {
      label.labelY = Math.max(paddingY, label.labelY);
      return;
    }
    label.labelY = Math.max(labelRows[index - 1].labelY + minLabelGap, label.labelY);
  });
  for (let index = labelRows.length - 1; index >= 0; index -= 1) {
    labelRows[index].labelY = Math.min(height - paddingY, labelRows[index].labelY);
    if (index < labelRows.length - 1) {
      labelRows[index].labelY = Math.min(labelRows[index + 1].labelY - minLabelGap, labelRows[index].labelY);
    }
  }

  return (
    <section className="trend-card" aria-label="個人別の確定収支推移">
      <div className="trend-heading">
        <span>
          <Trophy size={17} aria-hidden />
          賞金レース推移
        </span>
        <small>全員 {rows.length}人</small>
      </div>
      <div className="trend-chart-wrap">
        <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="全員の確定収支推移">
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              className="trend-grid-line"
              key={ratio}
              x1={paddingLeft}
              x2={plotRight}
              y1={paddingY + ratio * (height - paddingY * 2)}
              y2={paddingY + ratio * (height - paddingY * 2)}
            />
          ))}
          <line
            className="trend-zero-line"
            x1={paddingLeft}
            x2={plotRight}
            y1={yFor(0)}
            y2={yFor(0)}
          />
          <text className="trend-zero-label" x={paddingLeft - 5} y={yFor(0) - 4}>
            0
          </text>
          {rows.map((row, rowIndex) => {
            const chartPoints = row.points.map((point, pointIndex) => ({
              x: xFor(pointIndex, row.points.length),
              y: yFor(point.value),
            }));
            const path = makeSmoothPath(chartPoints);
            const lastPoint = row.points[row.points.length - 1];
            const lastX = xFor(row.points.length - 1, row.points.length);
            const lastY = yFor(lastPoint.value);

            return (
              <g key={row.name}>
                <path
                  className="trend-line"
                  d={path}
                  style={{ stroke: colors[rowIndex % colors.length] }}
                />
                <circle
                  className="trend-dot"
                  cx={lastX}
                  cy={lastY}
                  r="3.8"
                  style={{ fill: colors[rowIndex % colors.length] }}
                />
              </g>
            );
          })}
          {labelRows.map(({ row, rowIndex, lineY, labelY }) => {
            const color = colors[rowIndex % colors.length];
            const isLastPlace = row.name === lastPlaceName;
            const mascotWidth = 54;
            const mascotHeight = 68;
            const mascotX = plotRight + 20;
            const mascotY = Math.min(
              Math.max(paddingY + 10, labelY - 56),
              height - mascotHeight - 26,
            );
            const mascotTextX = mascotX + mascotWidth / 2;
            const mascotTextY = mascotY + mascotHeight + 8;
            return (
              <g key={`label-${row.name}`}>
                <line
                  className="trend-label-guide"
                  x1={plotRight + 4}
                  x2={plotRight + 9}
                  y1={lineY}
                  y2={labelY}
                  style={{ stroke: color }}
                />
                {isLastPlace ? (
                  <>
                    <image
                      className="trend-last-place-mascot"
                      href="/mascots/last-place.png"
                      x={mascotX}
                      y={mascotY}
                      width={mascotWidth}
                      height={mascotHeight}
                      preserveAspectRatio="xMidYMid meet"
                    />
                    <text
                      className="trend-name-label trend-last-place-label"
                      x={mascotTextX}
                      y={mascotTextY}
                      textAnchor="middle"
                      style={{ fill: color }}
                    >
                      <tspan x={mascotTextX}>{shortenName(row.name, 5)}</tspan>
                      <tspan className="trend-points-label" x={mascotTextX} dy="10">
                        {row.net >= 0 ? "+" : ""}
                        {formatPoints(row.net)}
                      </tspan>
                    </text>
                  </>
                ) : (
                  <text
                    className="trend-name-label"
                    x={plotRight + 11}
                    y={labelY - 3}
                    style={{ fill: color }}
                  >
                    <tspan x={plotRight + 11}>{shortenName(row.name, 5)}</tspan>
                    <tspan className="trend-points-label" x={plotRight + 11} dy="11">
                      {row.net >= 0 ? "+" : ""}
                      {formatPoints(row.net)}
                    </tspan>
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="trend-legend">
        {rows.map((row, index) => (
          <span key={row.name}>
            <i style={{ background: colors[index % colors.length] }} />
            <b>{shortenName(row.name, 6)}</b>
            <strong className={row.net >= 0 ? "positive" : "negative"}>
              {row.net >= 0 ? "+" : ""}
              {formatPoints(row.net)}
            </strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function getOddsTickerItems(match: MatchRecord, votes: VoteRecord[]) {
  const total = getMatchTotal(match, votes);
  const rows = match.options
    .map((option) => {
      const amount = getOptionTotal(match, votes, option.id);
      return {
        option,
        amount,
        odds: amount > 0 ? total / amount : 0,
      };
    })
    .filter((row) => row.amount > 0);

  if (!rows.length) {
    return [{ id: "empty", label: "投票後にオッズ表示", oddsText: "-" }];
  }

  return rows
    .sort((a, b) => a.odds - b.odds || b.amount - a.amount || a.option.label.localeCompare(b.option.label, "ja"))
    .map((row) => ({
      id: row.option.id,
      label: optionDisplayLabel(match, row.option),
      oddsText: `${row.odds.toFixed(2)}x`,
    }));
}

function getRecentVoteTotal(matchId: string, votes: VoteRecord[], now: Date) {
  const since = now.getTime() - 60 * 60 * 1000;
  return votes
    .filter((vote) => vote.matchId === matchId && new Date(vote.createdAt).getTime() >= since)
    .reduce((sum, vote) => sum + vote.amount, 0);
}

function ScheduledMatchPicker({
  matches,
  isLoading,
  message,
  onAdd,
  onClose,
  onRefresh,
}: {
  matches: ScheduledMatchCandidate[];
  isLoading: boolean;
  message: string;
  onAdd: (
    match: ScheduledMatchCandidate,
    handicap: { handicapOptionIndex: number; handicapPoints: number },
  ) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [handicapByMatch, setHandicapByMatch] = useState<
    Record<string, { optionIndex: number; points: number }>
  >({});

  function getHandicap(match: ScheduledMatchCandidate) {
    return handicapByMatch[match.id] ?? { optionIndex: -1, points: 0 };
  }

  return (
    <div className="schedule-modal-backdrop" role="presentation">
      <section className="schedule-modal" role="dialog" aria-modal="true" aria-label="試合を追加">
        <div className="schedule-modal-head">
          <div>
            <h3>試合を追加</h3>
          </div>
          <button className="icon-action" type="button" onClick={onClose} aria-label="閉じる">
            <X size={18} aria-hidden />
          </button>
        </div>
        {message && <div className="inline-alert">{message}</div>}
        <div className="schedule-modal-actions">
          <button className="ghost-action compact" disabled={isLoading} type="button" onClick={onRefresh}>
            <RotateCcw size={15} aria-hidden />
            更新
          </button>
        </div>
        <div className="schedule-list">
          {isLoading ? (
            <div className="schedule-loading" aria-label="読み込み中" role="status">
              <span aria-hidden />
            </div>
          ) : matches.length ? (
            matches.map((match) => {
              const handicap = getHandicap(match);
              const visibleOptions = hasHalfPointHandicap(handicap.points)
                ? match.options.slice(0, 2)
                : match.options;
              const optionObjects = match.options.slice(0, 2).map((label, index) => ({
                id: String(index),
                label,
              }));

              return (
                <article className="schedule-row-card" key={match.id}>
                  <div className="schedule-row-head">
                    <div>
                      <strong><MatchTitleWithFlags title={match.title} /></strong>
                      <span>{visibleOptions.join(" / ")}</span>
                    </div>
                    <time>{formatDateTime(match.startsAt)} 開始</time>
                  </div>
                  <HandicapPicker
                    optionId={handicap.optionIndex >= 0 ? String(handicap.optionIndex) : ""}
                    options={optionObjects}
                    points={handicap.points}
                    onChange={(next) =>
                      setHandicapByMatch((current) => ({
                        ...current,
                        [match.id]: {
                          optionIndex: next.optionId ? Number(next.optionId) : -1,
                          points: next.points,
                        },
                      }))
                    }
                  />
                  <button
                    className="schedule-add-action"
                    type="button"
                    onClick={() =>
                      onAdd(match, {
                        handicapOptionIndex: handicap.optionIndex,
                        handicapPoints: handicap.points,
                      })
                    }
                  >
                    追加する
                  </button>
                </article>
              );
            })
          ) : (
            <EmptyState title="追加できる試合はありません" />
          )}
        </div>
      </section>
    </div>
  );
}

function MatchSummaryCard({
  match,
  now,
  votes,
  onOpen,
}: {
  match: MatchRecord;
  now: Date;
  votes: VoteRecord[];
  onOpen: () => void;
}) {
  const total = getMatchTotal(match, votes);
  const oddsItems = getOddsTickerItems(match, votes);
  const open = isMatchOpen(match, now);
  const settled = Boolean(match.resultOptionId);
  const recentVoteTotal = getRecentVoteTotal(match.id, votes, now);

  return (
    <button className="summary-card" type="button" onClick={onOpen}>
      {!open && (
        <span className="summary-status-line">
          <span className={`summary-status-pill ${settled ? "settled" : "closed"}`}>
            {settled ? "確定済み" : "締切済み"}
          </span>
          {settled && (
            <b>
              確定結果: {optionLabel(match, match.resultOptionId ?? "")}
            </b>
          )}
        </span>
      )}
      {settled && <ScoreOutcome match={match} compact />}
      <span className="summary-title-row">
        <strong><MatchTitleWithFlags title={match.title} /></strong>
      </span>
      <div className="summary-time">
        <div className="summary-live">
          <span className="summary-countdown">
            <Clock3 size={16} aria-hidden />
            {minutesRemaining(match.closesAt, now)}
          </span>
          {recentVoteTotal > 0 && (
            <span className="summary-recent-votes">
              <Flame size={14} aria-hidden />
              1時間以内に +{formatPoints(recentVoteTotal)} 投票
            </span>
          )}
        </div>
        <div className="summary-side" aria-label="開始時刻と総プール">
          <span>{formatDateTime(match.startsAt)} 開始</span>
          <span>総プール {formatPoints(total)}</span>
        </div>
      </div>
      <OddsTicker items={oddsItems} />
    </button>
  );
}

function OddsTicker({
  items,
}: {
  items: Array<{ id: string; label: string; oddsText: string }>;
}) {
  const tickerItems = items.length > 1 ? [...items, ...items] : items;

  return (
    <div className="summary-odds" aria-label="オッズ一覧">
      <div className={items.length > 1 ? "odds-track animated" : "odds-track"}>
        {tickerItems.map((item, index) => (
          <span className="odds-chip" key={`${item.id}-${index}`}>
            <b><OptionLabelWithFlag label={item.label} /></b>
            <strong>{item.oddsText}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function HandicapPicker({
  optionId,
  options,
  points,
  onChange,
}: {
  optionId: string;
  options: Array<{ id: string; label: string }>;
  points: number;
  onChange: (next: { optionId: string; points: number }) => void;
}) {
  const active = points > 0 && optionId;

  return (
    <div className="handicap-picker">
      <div className="handicap-picker-head">
        <span>ハンデ設定</span>
        <b>{active ? `${options.find((option) => option.id === optionId)?.label ?? ""} ＋${formatHandicapPoints(points)}` : "なし"}</b>
      </div>
      <div className="handicap-option-buttons" aria-label="ハンデ対象">
        <button
          className={!active ? "selected" : ""}
          onClick={() => onChange({ optionId: "", points: 0 })}
          type="button"
        >
          なし
        </button>
        {options.map((option) => (
          <button
            className={active && optionId === option.id ? "selected" : ""}
            key={option.id}
            onClick={() => onChange({ optionId: option.id, points: points || 0.5 })}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="handicap-value-buttons" aria-label="ハンデ点">
        {HANDICAP_VALUES.map((value) => (
          <button
            className={points === value ? "selected" : ""}
            disabled={value > 0 && !optionId}
            key={value}
            onClick={() => onChange({ optionId: value === 0 ? "" : optionId, points: value })}
            type="button"
          >
            {value === 0 ? "0" : `＋${formatHandicapPoints(value)}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function StageNoticeList({ now }: { now: Date }) {
  return (
    <div className="stage-notice-list" aria-label="今後の予想テーマ予定">
      {STAGE_NOTICE_CARDS.map((notice) => (
        <StageNoticeCard key={notice.id} notice={notice} now={now} />
      ))}
    </div>
  );
}

function StageNoticeCard({
  notice,
  now,
}: {
  notice: (typeof STAGE_NOTICE_CARDS)[number];
  now: Date;
}) {
  return (
    <article className="stage-notice-card">
      <div className="stage-notice-main">
        <strong>{notice.title}</strong>
        <span className="stage-notice-countdown">
          <Clock3 size={15} aria-hidden />
          {formatStartsIn(notice.startsAt, now)}
        </span>
      </div>
      <div className="stage-notice-side">
        <span>{formatTokyoDateTime(notice.startsAt)} 開催予定</span>
      </div>
      <div className="stage-notice-wait">
        <CalendarClock size={15} aria-hidden />
        組み合わせ待ち
      </div>
    </article>
  );
}

function ExternalOddsPanel({
  match,
}: {
  match: MatchRecord;
}) {
  const externalOdds = match.externalOdds;
  if (!externalOdds) return null;

  const items = match.options
    .map((option) => ({
      id: option.id,
      label: optionDisplayLabel(match, option),
      odds: getExternalOddsForOption(match, option),
      isDraw: isDrawOption(option),
    }))
    .filter((item) => item.odds !== undefined);
  const teamItems = items.filter((item) => !item.isDraw);
  const optionDrawItems = items.filter((item) => item.isDraw);
  const drawItems = optionDrawItems.length > 0
    ? optionDrawItems
    : typeof externalOdds.drawOdds === "number"
      ? [{
          id: `${match.id}-external-draw`,
          label: "引き分け",
          odds: externalOdds.drawOdds,
          isDraw: true,
        }]
      : [];
  if (!teamItems.length && !drawItems.length) return null;

  return (
    <div className="external-odds-panel">
      <div className="external-odds-heading">
        <span>参考オッズ</span>
        <a
          href={externalOdds.sourceUrl || BET_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          BET CHANNEL
        </a>
        <time>{formatDateTime(externalOdds.fetchedAt)}取得</time>
      </div>
      <div className="external-odds-rows" aria-label="BET CHANNELの参考オッズ">
        <div className="external-odds-strip external-odds-strip-teams">
          {teamItems.map((item) => (
            <span className="external-odds-item" key={item.id}>
              <OptionLabelWithFlag label={item.label} />
              <b>{formatExternalOdds(item.odds)}</b>
            </span>
          ))}
        </div>
        {drawItems.length > 0 && (
          <div className="external-odds-strip external-odds-strip-draw">
            {drawItems.map((item) => (
              <span className="external-odds-item draw" key={item.id}>
                <OptionLabelWithFlag label={item.label} />
                <b>{formatExternalOdds(item.odds)}</b>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchHeader({
  match,
  now,
  votes,
  showStatus = true,
}: {
  match: MatchRecord;
  now: Date;
  votes: VoteRecord[];
  showStatus?: boolean;
}) {
  const total = getMatchTotal(match, votes);
  const status = getStatusLabel(match, now);
  const statusClass = isMatchOpen(match, now) ? "open" : match.resultOptionId ? "settled" : "closed";
  const handicap = getMatchHandicap(match);
  const notice = match.notice?.trim();

  return (
    <div className="match-header">
      {showStatus && (
        <div className="match-meta">
          <span className={`status-pill ${statusClass}`}>{status}</span>
        </div>
      )}
      <h3><MatchTitleWithFlags title={match.title} /></h3>
      <div className="match-timebar">
        <div className="match-time-row">
          <span className="deadline">
            <Clock3 size={16} aria-hidden />
            {minutesRemaining(match.closesAt, now)}
          </span>
          <span>
            <CalendarClock size={16} aria-hidden />
            開始 {formatDateTime(match.startsAt)}
          </span>
        </div>
        <span>
          <WalletCards size={16} aria-hidden />
          総プール {formatPoints(total)}
        </span>
      </div>
      <ExternalOddsPanel match={match} />
      {notice && <div className="match-notice">{notice}</div>}
      {handicap && (
        <div className="handicap-notice">
          <span>
            {handicap.option.label}に＋{formatHandicapPoints(handicap.points)}点のハンデ
            <br />
            <em>（※参考オッズはハンデを考慮していません）</em>
            <br />
            ハンデ込の参考オッズは
            <a
              href="https://www.pinnacle.com/ja/soccer/fifa-world-cup/matchups/#all"
              target="_blank"
              rel="noopener noreferrer"
            >
              こちら
            </a>
          </span>
        </div>
      )}
    </div>
  );
}

function ScoreOutcome({
  match,
  compact = false,
}: {
  match: MatchRecord;
  compact?: boolean;
}) {
  const decision = getScoreDecisionFromMatch(match);
  if (!decision) return null;

  const rawScore = `${decision.homeOption.label} ${decision.homeScore} - ${decision.awayScore} ${decision.awayOption.label}`;
  const adjustedScore = `${decision.homeOption.label} ${formatScoreValue(decision.adjustedHomeScore)} - ${formatScoreValue(decision.adjustedAwayScore)} ${decision.awayOption.label}`;

  return (
    <div className={`score-outcome ${compact ? "compact" : ""}`}>
      <span>
        <b>得点</b>
        {rawScore}
      </span>
      {decision.handicap && (
        <span>
          <b>ハンデ反映</b>
          {adjustedScore}
        </span>
      )}
      <span className="score-outcome-result">
        <b>最終結果</b>
        {decision.resultLabel}
      </span>
    </div>
  );
}

function PersonVoteList({
  votes,
  matches,
  allVotes,
  onOpenMatch,
}: {
  votes: VoteRecord[];
  matches: MatchRecord[];
  allVotes: VoteRecord[];
  onOpenMatch: (matchId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "settled">("all");
  const filteredVotes = votes.filter((vote) => {
    const match = matches.find((item) => item.id === vote.matchId);
    const settled = Boolean(match?.resultOptionId);
    if (filter === "pending") return !settled;
    if (filter === "settled") return settled;
    return true;
  });
  const visibleVotes = expanded ? filteredVotes : filteredVotes.slice(0, 4);
  const canExpand = filteredVotes.length > 4;

  useEffect(() => {
    setExpanded(false);
  }, [filter]);

  return (
    <div className="data-panel">
      <div className="panel-title">
        <span className="panel-title-label">
          <History size={18} aria-hidden />
          投票詳細
        </span>
        <div className="detail-filter" aria-label="投票詳細の表示切り替え">
          <button className={filter === "all" ? "active" : ""} type="button" onClick={() => setFilter("all")}>
            一覧
          </button>
          <button className={filter === "pending" ? "active" : ""} type="button" onClick={() => setFilter("pending")}>
            未確定
          </button>
          <button className={filter === "settled" ? "active" : ""} type="button" onClick={() => setFilter("settled")}>
            確定済み
          </button>
        </div>
      </div>
      {filteredVotes.length ? (
        <>
          <div className="person-vote-list">
            {visibleVotes.map((vote) => {
              const match = matches.find((item) => item.id === vote.matchId);
              const payout = getVotePayout(vote, match, allVotes);
              const status = getVoteOutcomeText(payout);
              const outcomeClass = payout.settled ? (payout.won ? "won" : "lost") : "pending";
              const canOpenMatch = Boolean(match);

              return (
                <button
                  className={`person-vote-card ${outcomeClass}`}
                  disabled={!canOpenMatch}
                  id={`vote-detail-${vote.id}`}
                  key={vote.id}
                  onClick={() => {
                    if (match) onOpenMatch(match.id);
                  }}
                  type="button"
                >
                  <div>
                    <strong>{match?.title ?? "削除済み"}</strong>
                    <span>{formatDateTime(vote.createdAt)}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>選択</dt>
                      <dd><OptionLabelWithFlag label={optionLabel(match, vote.optionId)} /></dd>
                    </div>
                    <div>
                      <dt>投票pt</dt>
                      <dd>{formatPoints(vote.amount)}</dd>
                    </div>
                    <div>
                      <dt>結果</dt>
                      <dd>
                        <span className={`vote-result-label ${outcomeClass}`}>{status}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>還元</dt>
                      <dd>{payout.settled ? formatPoints(payout.gross) : "-"}</dd>
                    </div>
                    <div>
                      <dt>収支</dt>
                      <dd className={payout.net >= 0 ? "positive" : "negative"}>
                        {payout.settled
                          ? `${payout.net >= 0 ? "+" : ""}${formatPoints(payout.net)}`
                          : "-"}
                      </dd>
                    </div>
                  </dl>
                </button>
              );
            })}
          </div>
          {canExpand && (
            <button className="list-expand-button" type="button" onClick={() => setExpanded((current) => !current)}>
              {expanded ? "4件表示に戻す" : `すべて表示（${filteredVotes.length}件）`}
            </button>
          )}
        </>
      ) : (
        <EmptyState title={votes.length ? "該当する投票はありません" : "この人の投票はまだありません"} />
      )}
    </div>
  );
}

function AdminSettleCard({
  adminToken,
  match,
  now,
  onDelete,
  onReopen,
  onSelect,
  onScoreChange,
  onSettle,
  scoreDraft,
  scoreMode,
  selectedOptionId,
  votes,
}: {
  adminToken: string;
  match: MatchRecord;
  now: Date;
  onDelete: () => void;
  onReopen: () => void;
  onSelect: (optionId: string) => void;
  onScoreChange: (draft: ScoreDraft) => void;
  onSettle: () => void;
  scoreDraft: ScoreDraft;
  scoreMode: boolean;
  selectedOptionId: string;
  votes: VoteRecord[];
}) {
  const total = getMatchTotal(match, votes);
  const matchVotes = getMatchVotes(match, votes);
  const settled = Boolean(match.resultOptionId);
  const [homeOption, awayOption] = getTeamOptions(match);
  const scoreEvaluation = scoreMode
    ? evaluateScoreSettlement(match, scoreDraft.home, scoreDraft.away)
    : null;
  const previewResultId = scoreMode
    ? (scoreEvaluation?.ok ? scoreEvaluation.decision.resultOptionId : match.resultOptionId)
    : (selectedOptionId || match.resultOptionId);
  const selectedResultLabel = optionLabel(match, selectedOptionId);

  return (
    <article className="admin-settle-card">
      <MatchHeader match={match} now={now} votes={votes} />
      <div className="admin-settle-stats">
        <span>{matchVotes.length}件の投票</span>
        <span>総プール {formatPoints(total)}</span>
      </div>

      {scoreMode ? (
        <div className="score-input-panel">
          <div className="score-input-grid">
            <label>
              <span>{homeOption?.label ?? "左側チーム"}</span>
              <input
                inputMode="numeric"
                min={0}
                onChange={(event) => onScoreChange({ ...scoreDraft, home: event.target.value })}
                pattern="[0-9]*"
                placeholder="0"
                type="number"
                value={scoreDraft.home}
              />
            </label>
            <b>-</b>
            <label>
              <span>{awayOption?.label ?? "右側チーム"}</span>
              <input
                inputMode="numeric"
                min={0}
                onChange={(event) => onScoreChange({ ...scoreDraft, away: event.target.value })}
                pattern="[0-9]*"
                placeholder="0"
                type="number"
                value={scoreDraft.away}
              />
            </label>
          </div>
          <div className={`score-preview ${scoreEvaluation?.ok ? "ready" : ""}`}>
            {scoreEvaluation?.ok ? (
              <>
                <span>判定プレビュー</span>
                <b>{scoreEvaluation.decision.resultLabel}</b>
                {scoreEvaluation.decision.handicap && (
                  <small>
                    ハンデ反映後 {formatScoreValue(scoreEvaluation.decision.adjustedHomeScore)} - {formatScoreValue(scoreEvaluation.decision.adjustedAwayScore)}
                  </small>
                )}
              </>
            ) : (
              <span>{scoreEvaluation?.error}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="score-preview manual-result-preview">
          <span>結果選択モード</span>
          <b>{selectedOptionId ? selectedResultLabel : "下の選択肢から結果を選択"}</b>
        </div>
      )}

      <div
        className={`option-board admin-options ${scoreMode ? "" : "selectable"}`}
        aria-label={`${match.title}の判定候補`}
      >
        {match.options.map((option) => {
          const optionTotal = getOptionTotal(match, votes, option.id);
          const percentage = total ? Math.round((optionTotal / total) * 100) : 0;
          const odds = optionTotal > 0 ? total / optionTotal : 0;
          const selected = previewResultId === option.id;
          const result = match.resultOptionId === option.id;

          return (
            <button
              className={[
                "option-row",
                selected ? "selected" : "",
                result ? "result" : "",
              ].filter(Boolean).join(" ")}
              disabled={scoreMode || settled}
              key={option.id}
              onClick={() => onSelect(option.id)}
              type="button"
            >
              <div>
                <strong><OptionLabelWithFlag label={optionDisplayLabel(match, option)} /></strong>
                <span>{formatPoints(optionTotal)} / {percentage}%</span>
              </div>
              <div className="meter" aria-hidden>
                <span style={{ width: `${percentage}%` }} />
              </div>
              <b>{result ? "確定結果" : odds ? `${odds.toFixed(2)}x` : "-"}</b>
            </button>
          );
        })}
      </div>

      <div className="admin-settle-actions">
        <button
          className="primary-action"
          disabled={!adminToken || settled || (scoreMode ? !scoreEvaluation?.ok : !selectedOptionId)}
          onClick={onSettle}
          type="button"
        >
          <CheckCircle2 size={18} aria-hidden />
          {scoreMode ? "得点から確定" : "この結果で確定"}
        </button>
        {settled && (
          <button className="ghost-action" disabled={!adminToken} onClick={onReopen} type="button">
            <RotateCcw size={18} aria-hidden />
            確定解除
          </button>
        )}
        <button className="ghost-action danger" disabled={!adminToken} onClick={onDelete} type="button">
          <X size={18} aria-hidden />
          削除
        </button>
      </div>
    </article>
  );
}

function PersonBalanceHistory({
  rows,
  onOpenMatch,
}: {
  rows: Array<
    | {
        id: string;
        type: "vote";
        date: string;
        vote: VoteRecord;
        match: MatchRecord | undefined;
        payout: { gross: number; net: number; won: boolean; settled: boolean };
        amount: number;
        balance: number;
      }
    | {
        id: string;
        type: "adjustment";
        date: string;
        adjustment: PointAdjustmentRecord;
        amount: number;
        balance: number;
      }
  >;
  onOpenMatch: (matchId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, 4);
  const canExpand = rows.length > 4;

  return (
    <>
      <div className="balance-history-list">
        {visibleRows.map((row) => {
          if (row.type === "adjustment") {
            return (
              <div className="balance-history-card adjustment-history-card" key={row.id}>
                <div>
                  <strong>{row.adjustment.title}</strong>
                  <span>{formatDateTime(row.adjustment.createdAt)}</span>
                  <em>{row.adjustment.reason}</em>
                </div>
                <span>ポイント調整</span>
                <div>
                  <b className={row.amount >= 0 ? "positive" : "negative"}>
                    {row.amount >= 0 ? "+" : ""}
                    {formatPoints(row.amount)}
                  </b>
                  <small>
                    確定収支
                    <strong className={row.balance >= 0 ? "positive" : "negative"}>
                      {" "}
                      {row.balance >= 0 ? "+" : ""}
                      {formatPoints(row.balance)}
                    </strong>
                  </small>
                </div>
              </div>
            );
          }

          const { vote, match, payout, balance } = row;
          return (
            <button
              className="balance-history-card"
              disabled={!match}
              key={vote.id}
              onClick={() => {
                if (match) onOpenMatch(match.id);
              }}
              type="button"
            >
              <div>
                <strong>{match?.title ?? "削除済み"}</strong>
                <span>{formatDateTime(match?.settledAt ?? vote.createdAt)}</span>
              </div>
              <span><OptionLabelWithFlag label={optionLabel(match, vote.optionId)} /></span>
              <div>
                <b className={payout.net >= 0 ? "positive" : "negative"}>
                  {payout.net >= 0 ? "+" : ""}
                  {formatPoints(payout.net)}
                </b>
                <small>
                  確定収支
                  <strong className={balance >= 0 ? "positive" : "negative"}>
                    {" "}
                    {balance >= 0 ? "+" : ""}
                    {formatPoints(balance)}
                  </strong>
                </small>
              </div>
            </button>
          );
        })}
      </div>
      {canExpand && (
        <button className="list-expand-button" type="button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "4件表示に戻す" : `すべて表示（${rows.length}件）`}
        </button>
      )}
    </>
  );
}

function VoteForm({
  draft,
  hasRemoteState,
  isSaving,
  match,
  now,
  votes,
  onChange,
  onSubmit,
}: {
  draft: VoteDraft;
  hasRemoteState: boolean;
  isSaving: boolean;
  match: MatchRecord;
  now: Date;
  votes: VoteRecord[];
  onChange: (patch: Partial<VoteDraft>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const open = isMatchOpen(match, now);
  const canSubmit = open && hasRemoteState && !isSaving;
  const total = getMatchTotal(match, votes);
  const currentAmount = Number(draft.amount) || MIN_VOTE_AMOUNT;

  function adjustAmount(delta: number) {
    const nextAmount = Math.max(MIN_VOTE_AMOUNT, currentAmount + delta);
    onChange({ amount: String(nextAmount) });
  }

  useEffect(() => {
    if (!draft.optionId && match.options[0]?.id) {
      onChange({ optionId: match.options[0].id });
    }
  }, [draft.optionId, match.options, onChange]);

  return (
    <form className="vote-form" onSubmit={onSubmit}>
      <div className="option-board selectable vote-options" role="radiogroup" aria-label={`${match.title}の選択肢`}>
        {match.options.map((option) => {
          const optionTotal = getOptionTotal(match, votes, option.id);
          const percentage = total ? Math.round((optionTotal / total) * 100) : 0;
          const odds = optionTotal > 0 ? total / optionTotal : 0;
          const selected = draft.optionId === option.id;

          return (
            <button
              aria-checked={selected}
              className={selected ? "option-row selected" : "option-row"}
              disabled={!open || !hasRemoteState || isSaving}
              key={option.id}
              onClick={() => onChange({ optionId: option.id })}
              role="radio"
              type="button"
            >
              <div>
                <strong><OptionLabelWithFlag label={optionDisplayLabel(match, option)} /></strong>
                <b>{odds ? `${odds.toFixed(2)}x` : "-"}</b>
              </div>
              <div className="meter" aria-hidden>
                <span style={{ width: `${percentage}%` }} />
              </div>
              <span className="option-subtle">{formatPoints(optionTotal)} / {percentage}%</span>
            </button>
          );
        })}
      </div>

      <div className="vote-fields">
        <label>
          <span>名前</span>
          <input
            list="known-users"
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="初回は名前を入力"
            disabled={!open || !hasRemoteState || isSaving}
          />
        </label>
        <label>
          <span>投票pt（最低100ポイント）</span>
          <div className="amount-control">
            <input
              type="number"
              min={MIN_VOTE_AMOUNT}
              step="1"
              value={draft.amount}
              onChange={(event) => onChange({ amount: event.target.value })}
              disabled={!open || !hasRemoteState || isSaving}
            />
            <button
              aria-label={`${VOTE_AMOUNT_STEP}ポイント減らす`}
              disabled={!open || !hasRemoteState || isSaving || currentAmount <= MIN_VOTE_AMOUNT}
              onClick={() => adjustAmount(-VOTE_AMOUNT_STEP)}
              type="button"
            >
              -
            </button>
            <button
              aria-label={`${VOTE_AMOUNT_STEP}ポイント増やす`}
              disabled={!open || !hasRemoteState || isSaving}
              onClick={() => adjustAmount(VOTE_AMOUNT_STEP)}
              type="button"
            >
              +
            </button>
          </div>
        </label>
        <button className="primary-action" type="submit" disabled={!canSubmit}>
          <WalletCards size={18} aria-hidden />
          {isSaving ? "同期中" : "投票する"}
        </button>
      </div>
    </form>
  );
}

function BettorList({
  match,
  votes,
  now,
  onRequestCancel,
}: {
  match: MatchRecord;
  votes: VoteRecord[];
  now: Date;
  onRequestCancel: (vote: VoteRecord) => void;
}) {
  const matchVotes = getMatchVotes(match, votes);
  const [sortMode, setSortMode] = useState<"person" | "newest" | "oldest">("person");
  const sortedVotes = [...matchVotes].sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortMode === "oldest" ? diff : -diff;
  });
  const total = getMatchTotal(match, votes);
  const personRows = [...matchVotes.reduce((map, vote) => {
    const current = map.get(vote.userName) ?? {
      userName: vote.userName,
      totalStake: 0,
      latestAt: vote.createdAt,
      votes: [] as VoteRecord[],
      optionTotals: new Map<string, number>(),
    };
    current.totalStake += vote.amount;
    current.votes.push(vote);
    current.latestAt =
      new Date(vote.createdAt).getTime() > new Date(current.latestAt).getTime()
        ? vote.createdAt
        : current.latestAt;
    current.optionTotals.set(vote.optionId, (current.optionTotals.get(vote.optionId) ?? 0) + vote.amount);
    map.set(vote.userName, current);
    return map;
  }, new Map<string, {
    userName: string;
    totalStake: number;
    latestAt: string;
    votes: VoteRecord[];
    optionTotals: Map<string, number>;
  }>()).values()]
    .map((row) => ({
      ...row,
      optionRows: [...row.optionTotals.entries()]
        .map(([optionId, amount]) => {
          const optionTotal = getOptionTotal(match, votes, optionId);
          const odds = optionTotal > 0 ? total / optionTotal : 0;
          const gross = amount * odds;
          return {
            optionId,
            amount,
            gross,
            net: gross - row.totalStake,
          };
        })
        .sort((a, b) => b.amount - a.amount || optionLabel(match, a.optionId).localeCompare(optionLabel(match, b.optionId), "ja")),
    }))
    .sort((a, b) => b.totalStake - a.totalStake || a.userName.localeCompare(b.userName, "ja"));

  return (
    <div className="bettor-list">
      <div className="bettor-heading">
        <div className="small-heading">投票状況</div>
        {matchVotes.length > 0 && (
          <div className="sort-control" aria-label="投票状況の並び替え">
            <button
              className={sortMode === "person" ? "active" : ""}
              onClick={() => setSortMode("person")}
              type="button"
            >
              個人別
            </button>
            <button
              className={sortMode === "newest" ? "active" : ""}
              onClick={() => setSortMode("newest")}
              type="button"
            >
              新しい順
            </button>
            <button
              className={sortMode === "oldest" ? "active" : ""}
              onClick={() => setSortMode("oldest")}
              type="button"
            >
              古い順
            </button>
          </div>
        )}
      </div>
      {matchVotes.length ? (
        sortMode === "person" ? (
          <div className="bettor-person-grid">
            {personRows.map((row) => (
              <details className="bettor-person-card" key={row.userName}>
                <summary>
                  <div className="bettor-person-top">
                    <span>
                      <strong>{row.userName}</strong>
                      <small>{row.votes.length}件 / 最終 {formatDateTime(row.latestAt)}</small>
                    </span>
                    <b>合計 {formatPoints(row.totalStake)}</b>
                  </div>
                  <div className="bettor-person-preview">
                    {row.optionRows.map((optionRow) => (
                      <span key={optionRow.optionId}>
                        <i><OptionLabelWithFlag label={optionLabel(match, optionRow.optionId)} /></i>
                        <b>{formatPoints(optionRow.amount)}</b>
                        <small className={optionRow.net >= 0 ? "positive" : "negative"}>
                          的中時 リターン {formatPoints(Math.round(optionRow.gross))} / 個人最終収支{" "}
                          {optionRow.net >= 0 ? "+" : ""}
                          {formatPoints(Math.round(optionRow.net))}
                        </small>
                      </span>
                    ))}
                  </div>
                </summary>
                <div className="bettor-person-details">
                  <small>投票明細</small>
                  {[...row.votes]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((vote) => (
                      <BettorChip
                        key={vote.id}
                        match={match}
                        now={now}
                        vote={vote}
                        votes={votes}
                        onRequestCancel={onRequestCancel}
                      />
                    ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="bettor-grid">
            {sortedVotes.map((vote) => (
              <BettorChip
                key={vote.id}
                match={match}
                now={now}
                vote={vote}
                votes={votes}
                onRequestCancel={onRequestCancel}
              />
            ))}
          </div>
        )
      ) : (
        <p className="muted-line">まだ投票はありません。</p>
      )}
    </div>
  );
}

function BettorChip({
  match,
  now,
  vote,
  votes,
  onRequestCancel,
}: {
  match: MatchRecord;
  now: Date;
  vote: VoteRecord;
  votes: VoteRecord[];
  onRequestCancel: (vote: VoteRecord) => void;
}) {
  const payout = getVotePayout(vote, match, votes);
  const cancellable = canCancelVote(vote, match, votes, now);

  return (
    <div className="bettor-chip">
      <span>{vote.userName}</span>
      <b>{formatPoints(vote.amount)}</b>
      <small>
        {optionLabel(match, vote.optionId)} / {formatDateTime(vote.createdAt)}
      </small>
      {payout.settled && (
        <small className={payout.won ? "positive" : "negative"}>
          {getVoteOutcomeText(payout)} / リターン {formatPoints(payout.gross)} / 収支{" "}
          {payout.net >= 0 ? "+" : ""}
          {formatPoints(payout.net)}
        </small>
      )}
      {cancellable && (
        <button className="vote-cancel-button" type="button" onClick={() => onRequestCancel(vote)}>
          削除
        </button>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  variant,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "positive" | "negative";
  variant?: "net" | "pending";
}) {
  return (
    <div className={`stat-card${variant ? ` stat-card-${variant}` : ""}`}>
      <div className="stat-icon">{icon}</div>
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="empty-state">
      <Database size={22} aria-hidden />
      <span>{title}</span>
    </div>
  );
}

export default App;
