import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode, TouchEvent } from "react";
import Papa from "papaparse";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  History,
  ListPlus,
  RotateCcw,
  ShieldCheck,
  Trophy,
  Upload,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

type View = "open" | "closed" | "matchDetail" | "people" | "personDetail" | "admin";

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
  options: MatchOption[];
  resultOptionId?: string;
  settledAt?: string;
};

type VoteRecord = {
  id: string;
  matchId: string;
  optionId: string;
  userName: string;
  amount: number;
  createdAt: string;
};

type AppData = {
  matches: MatchRecord[];
  votes: VoteRecord[];
  knownUsers: string[];
};

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

type MatchDraft = {
  title: string;
  startsAt: string;
  closesAt: string;
  optionsText: string;
};

type CsvMatchRow = {
  title?: string;
  startsAt?: string;
  closesAt?: string;
  options?: string;
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
const MIN_VOTE_AMOUNT = 100;
const VOTE_AMOUNT_STEP = 100;

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
};

const csvTemplate = `title,startsAt,closesAt,options
ワールドカップ優勝国,2026-06-12T04:00,2026-06-12T04:00,${worldCupWinnerLabels.join("|")}`;

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
    return { matches: defaultMatches, votes: [], knownUsers: [] };
  }

  try {
    const parsed = JSON.parse(raw) as AppData;
    return {
      matches: parsed.matches?.length ? parsed.matches : defaultMatches,
      votes: parsed.votes ?? [],
      knownUsers: parsed.knownUsers ?? [],
    };
  } catch {
    return { matches: defaultMatches, votes: [], knownUsers: [] };
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

function formatPoints(value: number) {
  return `${pointsFormatter.format(Math.round(value))} pt`;
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

function optionLabel(match: MatchRecord | undefined, optionId: string) {
  return match?.options.find((option) => option.id === optionId)?.label ?? "未設定";
}

function isMatchOpen(match: MatchRecord, now: Date) {
  return !match.resultOptionId && new Date(match.closesAt).getTime() > now.getTime();
}

function getStatusLabel(match: MatchRecord, now: Date) {
  if (match.resultOptionId) return "結果確定";
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
    .map((row) => {
      const title = row.title?.trim() ?? "";
      const startsAt = row.startsAt?.trim() ?? "";
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
        options: makeOptions(labels),
      } satisfies MatchRecord;
    })
    .filter((match): match is MatchRecord => Boolean(match));

  return { matches, errors: parsed.errors };
}

function App() {
  const now = useNow();
  const [view, setView] = useState<View>("open");
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedPersonName, setSelectedPersonName] = useState("");
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [data, setData] = useState<AppData>(() => loadData());
  const [apiError, setApiError] = useState("");
  const [isSyncing, setIsSyncing] = useState(true);
  const [hasRemoteState, setHasRemoteState] = useState(false);
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem(ADMIN_TOKEN_KEY) ?? "",
  );
  const [adminPassword, setAdminPassword] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [matchDraft, setMatchDraft] = useState<MatchDraft>(emptyMatchDraft);
  const [csvText, setCsvText] = useState(csvTemplate);
  const [importMessage, setImportMessage] = useState("");
  const [voteDrafts, setVoteDrafts] = useState<Record<string, VoteDraft>>({});
  const [pendingVote, setPendingVote] = useState<PendingVote | null>(null);
  const [resultDrafts, setResultDrafts] = useState<Record<string, string>>({});

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

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
      localStorage.setItem(ADMIN_TOKEN_KEY, result.token);
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
          "RenderのEnvironmentに設定したADMIN_PASSWORDと完全一致しているか確認してください。",
        ].join("\n"),
      );
    }
  }

  function logoutAdmin() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken("");
    setAdminMessage("管理者認証を解除しました。");
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

  const settleCandidateMatches = useMemo(
    () =>
      data.matches
        .filter((match) => !isMatchOpen(match, now))
        .sort((a, b) => {
          const aSettled = Boolean(a.resultOptionId);
          const bSettled = Boolean(b.resultOptionId);
          if (aSettled !== bSettled) return aSettled ? -1 : 1;
          const aTime = new Date(a.settledAt ?? a.closesAt).getTime();
          const bTime = new Date(b.settledAt ?? b.closesAt).getTime();
          return bTime - aTime;
        }),
    [data.matches, now],
  );

  const selectedMatch = useMemo(() => {
    return data.matches.find((match) => match.id === selectedMatchId) ?? sortedMatches[0];
  }, [data.matches, selectedMatchId, sortedMatches]);

  const pendingMatch = useMemo(() => {
    if (!pendingVote) return undefined;
    return data.matches.find((match) => match.id === pendingVote.matchId);
  }, [data.matches, pendingVote]);

  const userRows = useMemo(() => {
    return data.knownUsers
      .map((name) => {
        const votes = data.votes.filter((vote) => vote.userName === name);
        const totals = votes.reduce(
          (acc, vote) => {
            const match = data.matches.find((item) => item.id === vote.matchId);
            if (!match) return acc;
            const payout = calculateVotePayout(vote, match, data.votes);
            acc.staked += vote.amount;
            acc.gross += payout.gross;
            acc.net += payout.settled ? payout.net : 0;
            acc.pending += payout.settled ? 0 : vote.amount;
            return acc;
          },
          { staked: 0, gross: 0, net: 0, pending: 0 },
        );

        return {
          name,
          votes: votes.length,
          ...totals,
        };
      })
      .sort((a, b) => b.net - a.net || b.pending - a.pending || a.name.localeCompare(b.name, "ja"));
  }, [data.matches, data.votes, data.knownUsers]);

  const selectedPersonVotes = useMemo(() => {
    const normalized = normalizeName(selectedPersonName);
    return data.votes.filter((vote) => vote.userName === normalized);
  }, [data.votes, selectedPersonName]);

  const selectedPersonSummary = useMemo(() => {
    return selectedPersonVotes.reduce(
      (acc, vote) => {
        const match = data.matches.find((item) => item.id === vote.matchId);
        if (!match) return acc;
        const payout = calculateVotePayout(vote, match, data.votes);
        acc.totalStake += vote.amount;
        acc.pendingStake += payout.settled ? 0 : vote.amount;
        acc.grossPayout += payout.gross;
        acc.net += payout.settled ? payout.net : 0;
        return acc;
      },
      { totalStake: 0, pendingStake: 0, grossPayout: 0, net: 0 },
    );
  }, [data.matches, data.votes, selectedPersonVotes]);

  const selectedBalanceRows = useMemo(() => {
    const settledRows = selectedPersonVotes
      .map((vote) => {
        const match = data.matches.find((item) => item.id === vote.matchId);
        const payout = match
          ? calculateVotePayout(vote, match, data.votes)
          : { gross: 0, net: 0, won: false, settled: false };
        return { vote, match, payout };
      })
      .filter((row) => row.payout.settled)
      .sort((a, b) => {
        const aTime = new Date(a.match?.settledAt ?? a.vote.createdAt).getTime();
        const bTime = new Date(b.match?.settledAt ?? b.vote.createdAt).getTime();
        return aTime - bTime;
      });

    let balance = 0;
    return settledRows
      .map((row) => {
        balance += row.payout.net;
        return { ...row, balance };
      })
      .reverse();
  }, [data.matches, data.votes, selectedPersonVotes]);

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
      optionLabel: selectedOption?.label ?? "未選択",
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

    const match: MatchRecord = {
      id: createId("match"),
      title: matchDraft.title.trim(),
      stage: "",
      venue: "",
      startsAt: matchDraft.startsAt,
      closesAt: matchDraft.closesAt || matchDraft.startsAt,
      question: "",
      options: makeOptions(labels),
    };

    try {
      await syncState(() => postState("/api/matches", match, "POST", adminToken));
      setMatchDraft(emptyMatchDraft);
    } catch {
      window.alert("試合を登録できませんでした。入力内容を確認してください。");
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

  async function settleMatch(match: MatchRecord, optionId: string) {
    if (!optionId) return;
    if (!adminToken) {
      window.alert("先に管理者認証をしてください。");
      return;
    }
    if (isMatchOpen(match, now)) {
      window.alert("受付中の予想テーマは確定できません。締切後に確定してください。");
      return;
    }
    const label = optionLabel(match, optionId);
    const ok = window.confirm(
      `「${match.title}」の結果を「${label}」で確定します。\n\n確定後、個人別の収支と還元ポイントに反映されます。本当に確定してもいいですか？`,
    );
    if (!ok) return;

    await syncState(() =>
      postState(`/api/matches/${match.id}/settle`, { optionId }, "POST", adminToken),
    );
    setResultDrafts((current) => ({ ...current, [match.id]: optionId }));
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
    setResultDrafts((current) => ({ ...current, [match.id]: "" }));
  }

  async function deleteMatch(matchId: string) {
    const ok = window.confirm("この試合と関連する投票を削除しますか？");
    if (!ok) return;
    await syncState(() => postState(`/api/matches/${matchId}`, undefined, "DELETE", adminToken));
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

  async function refreshState() {
    await syncState(() => fetchAppState());
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="confetti-dot c1" aria-hidden />
        <span className="confetti-dot c2" aria-hidden />
        <span className="confetti-dot c3" aria-hidden />
        <div className="brand-block">
          <div>
            <p className="eyebrow">WC 2026 Prediction Pool</p>
            <h1>ワールドカップ予想プール</h1>
          </div>
        </div>
        <div className="hero-ball" aria-hidden>⚽</div>
      </header>

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
          受付済み
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
        {data.knownUsers.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <main>
        {(apiError || isSyncing) && (
          <div className={apiError ? "sync-banner error" : "sync-banner"}>
            {apiError || "DBと同期中..."}
          </div>
        )}

        {view === "open" && (
          <section className="view-stack">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Open markets</p>
                <h2>受付中の予想テーマ</h2>
              </div>
            </div>

            <div className="summary-list">
              {openMatches.length ? (
                openMatches.map((match) => (
                  <MatchSummaryCard
                    key={match.id}
                    match={match}
                    now={now}
                    votes={data.votes}
                    onOpen={() => openMatchDetail(match.id)}
                  />
                ))
              ) : (
                <EmptyState title="受付中の予想テーマはありません" />
              )}
            </div>
          </section>
        )}

        {view === "closed" && (
          <section className="view-stack">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Closed markets</p>
                <h2>受付済みの予想テーマ</h2>
              </div>
            </div>

            <div className="summary-list">
              {closedMatches.length ? (
                closedMatches.map((match) => (
                  <MatchSummaryCard
                    key={match.id}
                    match={match}
                    now={now}
                    votes={data.votes}
                    onOpen={() => openMatchDetail(match.id)}
                  />
                ))
              ) : (
                <EmptyState title="受付済みの予想テーマはありません" />
              )}
            </div>
          </section>
        )}

        {view === "matchDetail" && selectedMatch && (
          <section className="view-stack" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <button className="back-action" type="button" onClick={goBackFromDetail}>
              予想テーマ一覧へ戻る
            </button>
            <article className="match-card detail-card">
              <MatchHeader match={selectedMatch} now={now} votes={data.votes} />

              {selectedMatch.resultOptionId && (
                <div className="result-panel">
                  <CheckCircle2 size={18} aria-hidden />
                  確定結果: {optionLabel(selectedMatch, selectedMatch.resultOptionId)}
                </div>
              )}

              <VoteForm
                draft={getDraft(selectedMatch)}
                hasRemoteState={hasRemoteState}
                isSaving={isSyncing}
                match={selectedMatch}
                now={now}
                votes={data.votes}
                onChange={(patch) => updateVoteDraft(selectedMatch.id, patch)}
                onSubmit={(event) => handleVote(selectedMatch, event)}
              />

              <BettorList match={selectedMatch} votes={data.votes} />
            </article>
          </section>
        )}

        {view === "people" && (
          <section className="view-stack">
            <div className="section-heading">
              <div>
                <p className="eyebrow">People</p>
                <h2>個人別の投票状況</h2>
              </div>
            </div>

            <div className="people-list">
              {userRows.length ? (
                userRows.map((row) => (
                  <button
                    className="person-row"
                    key={row.name}
                    type="button"
                    onClick={() => openPersonDetail(row.name)}
                  >
                    <span>
                      <strong>{row.name}</strong>
                      <small>{row.votes}件の投票</small>
                    </span>
                    <span>
                      <b className={row.net >= 0 ? "positive" : "negative"}>
                        確定収支 {row.net >= 0 ? "+" : ""}
                        {formatPoints(row.net)}
                      </b>
                      <small>投票中 {formatPoints(row.pending)}</small>
                    </span>
                  </button>
                ))
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
                <p className="eyebrow">Person detail</p>
                <h2>{selectedPersonName || "未選択"}</h2>
              </div>
            </div>

            <div className="stats-row">
              <StatCard
                label="総投票ポイント"
                value={formatPoints(selectedPersonSummary.totalStake)}
                icon={<WalletCards size={20} aria-hidden />}
              />
              <StatCard
                label="未確定ポイント"
                value={formatPoints(selectedPersonSummary.pendingStake)}
                icon={<Clock3 size={20} aria-hidden />}
              />
              <StatCard
                label="獲得ポイント"
                value={formatPoints(selectedPersonSummary.grossPayout)}
                icon={<Trophy size={20} aria-hidden />}
              />
              <StatCard
                label="確定収支"
                value={`${selectedPersonSummary.net >= 0 ? "+" : ""}${formatPoints(
                  selectedPersonSummary.net,
                )}`}
                tone={selectedPersonSummary.net >= 0 ? "positive" : "negative"}
                icon={<History size={20} aria-hidden />}
              />
            </div>

            <div className="data-panel">
              <div className="panel-title">
                <History size={18} aria-hidden />
                収支履歴
              </div>
              {selectedBalanceRows.length ? (
                <PersonBalanceHistory rows={selectedBalanceRows} />
              ) : (
                <EmptyState title="確定済みの収支履歴はまだありません" />
              )}
            </div>

            <PersonVoteList
              votes={selectedPersonVotes}
              matches={data.matches}
              allVotes={data.votes}
            />
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
                      placeholder="RenderのADMIN_PASSWORD"
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
              <div className="data-panel">
                <div className="panel-title">
                  <Database size={18} aria-hidden />
                  結果確定
                </div>
                <p className="admin-help">
                  締切済みの予想テーマだけを表示しています。結果を選んでから確定してください。
                </p>
                {settleCandidateMatches.length ? (
                  <div className="admin-settle-list">
                    {settleCandidateMatches.map((match) => (
                      <AdminSettleCard
                        adminToken={adminToken}
                        key={match.id}
                        match={match}
                        now={now}
                        onDelete={() => deleteMatch(match.id)}
                        onReopen={() => reopenMatch(match)}
                        onSelect={(optionId) =>
                          setResultDrafts((current) => ({ ...current, [match.id]: optionId }))
                        }
                        onSettle={() =>
                          settleMatch(match, resultDrafts[match.id] || match.resultOptionId || "")
                        }
                        selectedOptionId={resultDrafts[match.id] || match.resultOptionId || ""}
                        votes={data.votes}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="確定できる締切済みテーマはありません" />
                )}
              </div>

              <div className="data-panel">
                <div className="panel-title">
                  <UserRound size={18} aria-hidden />
                  ユーザーDB
                </div>
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
              </div>

              <div className="data-panel">
                <div className="panel-title">
                  <History size={18} aria-hidden />
                  投票DB
                </div>
                {data.votes.length ? (
                  <div className="responsive-table">
                    <table>
                      <thead>
                        <tr>
                          <th>日時</th>
                          <th>名前</th>
                          <th>試合</th>
                          <th>選択</th>
                          <th>ポイント</th>
                          <th>結果</th>
                          <th>リターン</th>
                          <th>収支</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.votes.map((vote) => {
                          const match = data.matches.find((item) => item.id === vote.matchId);
                          const payout = getVotePayout(vote, match, data.votes);
                          return (
                            <tr key={vote.id}>
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
              </div>
            </div>
          </section>
        )}
      </main>
      {view !== "admin" && (
        <button className="admin-link-bottom" type="button" onClick={() => setView("admin")}>
          管理画面
        </button>
      )}
      {pendingVote && (
        <div className="confirm-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="vote-confirm-title">
            <p className="eyebrow" id="vote-confirm-title">Confirm vote</p>
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
    </div>
  );
}

function getOddsHighlights(match: MatchRecord, votes: VoteRecord[]) {
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
    return {
      popular: "-",
      longshot: "-",
    };
  }

  const popular = [...rows].sort((a, b) => b.amount - a.amount)[0];
  const longshot = [...rows].sort((a, b) => b.odds - a.odds)[0];

  return {
    popular: `${popular.option.label} ${popular.odds.toFixed(2)}x`,
    longshot: `${longshot.option.label} ${longshot.odds.toFixed(2)}x`,
  };
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
  const odds = getOddsHighlights(match, votes);
  const status = getStatusLabel(match, now);
  const statusClass = isMatchOpen(match, now) ? "open" : match.resultOptionId ? "settled" : "closed";

  return (
    <button className="summary-card" type="button" onClick={onOpen}>
      <div className="match-meta">
        <span className={`status-pill ${statusClass}`}>{status}</span>
      </div>
      <strong>{match.title}</strong>
      <div className="summary-time">
        <span>
          <Clock3 size={16} aria-hidden />
          {minutesRemaining(match.closesAt, now)}
        </span>
        <span>{formatDateTime(match.startsAt)} 開始</span>
      </div>
      <div className="summary-odds">
        <span>
          人気
          <b>{odds.popular}</b>
        </span>
        <span>
          大穴
          <b>{odds.longshot}</b>
        </span>
      </div>
      <div className="summary-footer">
        <span>総プール {formatPoints(total)}</span>
        <b>詳細へ</b>
      </div>
    </button>
  );
}

function MatchHeader({
  match,
  now,
  votes,
}: {
  match: MatchRecord;
  now: Date;
  votes: VoteRecord[];
}) {
  const total = getMatchTotal(match, votes);
  const status = getStatusLabel(match, now);
  const statusClass = isMatchOpen(match, now) ? "open" : match.resultOptionId ? "settled" : "closed";

  return (
    <div className="match-header">
      <div className="match-meta">
        <span className={`status-pill ${statusClass}`}>{status}</span>
      </div>
      <h3>{match.title}</h3>
      <div className="match-timebar">
        <span>
          <CalendarClock size={16} aria-hidden />
          開始 {formatDateTime(match.startsAt)}
        </span>
        <span className="deadline">
          <Clock3 size={16} aria-hidden />
          {minutesRemaining(match.closesAt, now)}
        </span>
        <span>
          <WalletCards size={16} aria-hidden />
          総プール {formatPoints(total)}
        </span>
      </div>
    </div>
  );
}

function PersonVoteList({
  votes,
  matches,
  allVotes,
}: {
  votes: VoteRecord[];
  matches: MatchRecord[];
  allVotes: VoteRecord[];
}) {
  return (
    <div className="data-panel">
      <div className="panel-title">
        <History size={18} aria-hidden />
        投票詳細
      </div>
      {votes.length ? (
        <div className="person-vote-list">
          {votes.map((vote) => {
            const match = matches.find((item) => item.id === vote.matchId);
            const payout = getVotePayout(vote, match, allVotes);
            const status = getVoteOutcomeText(payout);

            return (
              <article className="person-vote-card" id={`vote-detail-${vote.id}`} key={vote.id}>
                <div>
                  <strong>{match?.title ?? "削除済み"}</strong>
                  <span>{formatDateTime(vote.createdAt)}</span>
                </div>
                <dl>
                  <div>
                    <dt>選択</dt>
                    <dd>{optionLabel(match, vote.optionId)}</dd>
                  </div>
                  <div>
                    <dt>投票pt</dt>
                    <dd>{formatPoints(vote.amount)}</dd>
                  </div>
                  <div>
                    <dt>結果</dt>
                    <dd>{status}</dd>
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
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="この人の投票はまだありません" />
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
  onSettle,
  selectedOptionId,
  votes,
}: {
  adminToken: string;
  match: MatchRecord;
  now: Date;
  onDelete: () => void;
  onReopen: () => void;
  onSelect: (optionId: string) => void;
  onSettle: () => void;
  selectedOptionId: string;
  votes: VoteRecord[];
}) {
  const total = getMatchTotal(match, votes);
  const matchVotes = getMatchVotes(match, votes);
  const settled = Boolean(match.resultOptionId);

  return (
    <article className="admin-settle-card">
      <MatchHeader match={match} now={now} votes={votes} />
      <div className="admin-settle-stats">
        <span>{matchVotes.length}件の投票</span>
        <span>総プール {formatPoints(total)}</span>
      </div>

      <div className="option-board selectable admin-options" role="radiogroup" aria-label={`${match.title}の確定結果`}>
        {match.options.map((option) => {
          const optionTotal = getOptionTotal(match, votes, option.id);
          const percentage = total ? Math.round((optionTotal / total) * 100) : 0;
          const odds = optionTotal > 0 ? total / optionTotal : 0;
          const selected = selectedOptionId === option.id;
          const result = match.resultOptionId === option.id;

          return (
            <button
              aria-checked={selected}
              className={[
                "option-row",
                selected ? "selected" : "",
                result ? "result" : "",
              ].filter(Boolean).join(" ")}
              key={option.id}
              onClick={() => onSelect(option.id)}
              role="radio"
              type="button"
            >
              <div>
                <strong>{option.label}</strong>
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
          disabled={!adminToken || !selectedOptionId || settled}
          onClick={onSettle}
          type="button"
        >
          <CheckCircle2 size={18} aria-hidden />
          この結果で確定
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
}: {
  rows: Array<{
    vote: VoteRecord;
    match: MatchRecord | undefined;
    payout: { gross: number; net: number; won: boolean; settled: boolean };
    balance: number;
  }>;
}) {
  function scrollToVote(voteId: string) {
    document.getElementById(`vote-detail-${voteId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="balance-history-list">
      {rows.map(({ vote, match, payout, balance }) => (
        <button
          className="balance-history-card"
          key={vote.id}
          onClick={() => scrollToVote(vote.id)}
          type="button"
        >
          <div>
            <strong>{match?.title ?? "削除済み"}</strong>
            <span>{formatDateTime(match?.settledAt ?? vote.createdAt)}</span>
          </div>
          <span>{optionLabel(match, vote.optionId)}</span>
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
      ))}
    </div>
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
      <div className="option-board selectable" role="radiogroup" aria-label={`${match.title}の選択肢`}>
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
                <strong>{option.label}</strong>
                <span>{formatPoints(optionTotal)} / {percentage}%</span>
              </div>
              <div className="meter" aria-hidden>
                <span style={{ width: `${percentage}%` }} />
              </div>
              <b>{odds ? `${odds.toFixed(2)}x` : "-"}</b>
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
              step={VOTE_AMOUNT_STEP}
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

function BettorList({ match, votes }: { match: MatchRecord; votes: VoteRecord[] }) {
  const matchVotes = getMatchVotes(match, votes);

  return (
    <div className="bettor-list">
      <div className="small-heading">投票状況</div>
      {matchVotes.length ? (
        <div className="bettor-grid">
          {matchVotes.slice(0, 8).map((vote) => (
            <BettorChip key={vote.id} match={match} vote={vote} votes={votes} />
          ))}
        </div>
      ) : (
        <p className="muted-line">まだ投票はありません。</p>
      )}
    </div>
  );
}

function BettorChip({
  match,
  vote,
  votes,
}: {
  match: MatchRecord;
  vote: VoteRecord;
  votes: VoteRecord[];
}) {
  const payout = getVotePayout(vote, match, votes);

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
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="stat-card">
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
