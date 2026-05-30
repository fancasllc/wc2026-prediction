import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import Papa from "papaparse";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  Gift,
  History,
  LayoutDashboard,
  ListPlus,
  Medal,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Upload,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

type View = "matches" | "matchDetail" | "people" | "personDetail" | "admin";

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

type MatchDraft = {
  title: string;
  stage: string;
  venue: string;
  startsAt: string;
  closesAt: string;
  question: string;
  optionsText: string;
};

type CsvMatchRow = {
  title?: string;
  stage?: string;
  venue?: string;
  startsAt?: string;
  closesAt?: string;
  question?: string;
  options?: string;
};

type ApiErrorBody = {
  error?: string;
  method?: string;
  path?: string;
  details?: Record<string, string | number | boolean | null | undefined>;
};

const STORAGE_KEY = "wc2026-prediction-pool:data:v2";
const LAST_NAME_KEY = "wc2026-prediction-pool:last-name";
const ADMIN_TOKEN_KEY = "wc2026-prediction-pool:admin-token";

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
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

const defaultMatches: MatchRecord[] = [
  {
    id: "sample-jpn-cmr",
    title: "日本 vs カメルーン",
    stage: "グループステージ",
    venue: "バンクーバー",
    startsAt: "2026-06-14T10:00",
    closesAt: "2026-06-14T10:00",
    question: "90分終了時の勝敗",
    options: [
      { id: "jpn-win", label: "日本勝利" },
      { id: "draw", label: "引き分け" },
      { id: "cmr-win", label: "カメルーン勝利" },
    ],
  },
  {
    id: "sample-topscorer",
    title: "大会得点王予想",
    stage: "大会通算",
    venue: "全会場",
    startsAt: "2026-06-12T09:00",
    closesAt: "2026-06-12T09:00",
    question: "大会終了時の得点王",
    options: [
      { id: "mbappe", label: "エムバペ" },
      { id: "haaland", label: "ハーランド" },
      { id: "other", label: "その他の選手" },
    ],
  },
  {
    id: "sample-scoreline",
    title: "決勝スコアレンジ",
    stage: "決勝",
    venue: "ニューヨーク・ニュージャージー",
    startsAt: "2026-07-20T04:00",
    closesAt: "2026-07-20T04:00",
    question: "決勝の合計得点数",
    options: [
      { id: "under-2", label: "2点以下" },
      { id: "three-four", label: "3〜4点" },
      { id: "over-5", label: "5点以上" },
    ],
  },
];

const emptyMatchDraft: MatchDraft = {
  title: "",
  stage: "グループステージ",
  venue: "",
  startsAt: "2026-06-12T09:00",
  closesAt: "2026-06-12T09:00",
  question: "",
  optionsText: "日本勝利\n引き分け\n相手勝利",
};

const csvTemplate = `title,stage,venue,startsAt,closesAt,question,options
日本 vs カメルーン,グループステージ,バンクーバー,2026-06-14T10:00,2026-06-14T10:00,90分終了時の勝敗,日本勝利|引き分け|カメルーン勝利
大会得点王予想,大会通算,全会場,2026-06-12T09:00,2026-06-12T09:00,大会終了時の得点王,エムバペ|ハーランド|その他の選手`;

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
  if (match.resultOptionId) return "確定済み";
  if (isMatchOpen(match, now)) return "受付中";
  return "締切済み";
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

function sortByDateAsc(a: MatchRecord, b: MatchRecord) {
  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
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
      const question = row.question?.trim() ?? "";
      const labels = (row.options ?? "")
        .split("|")
        .map((label) => label.trim())
        .filter(Boolean);

      if (!title || !startsAt || !question || labels.length < 2) {
        return null;
      }

      return {
        id: createId("match"),
        title,
        stage: row.stage?.trim() || "未設定",
        venue: row.venue?.trim() || "未設定",
        startsAt,
        closesAt: row.closesAt?.trim() || startsAt,
        question,
        options: makeOptions(labels),
      } satisfies MatchRecord;
    })
    .filter((match): match is MatchRecord => Boolean(match));

  return { matches, errors: parsed.errors };
}

function App() {
  const now = useNow();
  const [view, setView] = useState<View>("matches");
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedPersonName, setSelectedPersonName] = useState("");
  const [matchSearch, setMatchSearch] = useState("");
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
      setAdminMessage(`管理者認証に失敗しました: ${message}`);
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

  const filteredMatches = useMemo(() => {
    const keyword = matchSearch.trim().toLowerCase();
    if (!keyword) return sortedMatches;
    return sortedMatches.filter((match) =>
      [match.title, match.stage, match.venue, match.question]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [matchSearch, sortedMatches]);

  const selectedMatch = useMemo(() => {
    return data.matches.find((match) => match.id === selectedMatchId) ?? sortedMatches[0];
  }, [data.matches, selectedMatchId, sortedMatches]);

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
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
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

  const selectedAwardRows = useMemo(() => {
    return selectedPersonVotes
      .map((vote) => {
        const match = data.matches.find((item) => item.id === vote.matchId);
        const payout = match
          ? calculateVotePayout(vote, match, data.votes)
          : { gross: 0, net: 0, won: false, settled: false };
        return { vote, match, payout };
      })
      .filter((row) => row.payout.settled && row.payout.won);
  }, [data.matches, data.votes, selectedPersonVotes]);

  function getDraft(match: MatchRecord): VoteDraft {
    return (
      voteDrafts[match.id] ?? {
        name: localStorage.getItem(LAST_NAME_KEY) ?? "",
        amount: "1000",
        optionId: match.options[0]?.id ?? "",
      }
    );
  }

  function updateVoteDraft(matchId: string, patch: Partial<VoteDraft>) {
    setVoteDrafts((current) => ({
      ...current,
      [matchId]: {
        name: current[matchId]?.name ?? localStorage.getItem(LAST_NAME_KEY) ?? "",
        amount: current[matchId]?.amount ?? "1000",
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

    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("投票ポイントは1以上で入力してください。");
      return;
    }

    try {
      await syncState(async () => {
        const latestState = await fetchAppState();
        const latestMatch = latestState.matches.find((item) => item.id === match.id);
        const latestOption = latestMatch?.options.find((option) => option.id === draft.optionId);

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
          matchId: match.id,
          optionId: draft.optionId,
          userName: name,
          amount,
        });
      });
      localStorage.setItem(LAST_NAME_KEY, name);
      updateVoteDraft(match.id, { name, amount: "1000" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      window.alert(
        [
          "投票を保存できませんでした。",
          message,
          "",
          "送信内容",
          `matchId: ${match.id}`,
          `optionId: ${draft.optionId}`,
          `userName: ${name}`,
          `amount: ${amount}`,
        ].join("\n"),
      );
    }
  }

  async function addMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const labels = splitOptions(matchDraft.optionsText);

    if (!matchDraft.title.trim() || !matchDraft.startsAt || !matchDraft.question.trim()) {
      window.alert("タイトル、開始時刻、予想テーマを入力してください。");
      return;
    }

    if (labels.length < 2) {
      window.alert("選択肢は2つ以上必要です。");
      return;
    }

    const match: MatchRecord = {
      id: createId("match"),
      title: matchDraft.title.trim(),
      stage: matchDraft.stage.trim() || "未設定",
      venue: matchDraft.venue.trim() || "未設定",
      startsAt: matchDraft.startsAt,
      closesAt: matchDraft.closesAt || matchDraft.startsAt,
      question: matchDraft.question.trim(),
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

  async function settleMatch(matchId: string, optionId: string) {
    if (!optionId) return;
    await syncState(() =>
      postState(`/api/matches/${matchId}/settle`, { optionId }, "POST", adminToken),
    );
  }

  async function reopenMatch(matchId: string) {
    await syncState(() => postState(`/api/matches/${matchId}/reopen`, undefined, "POST", adminToken));
  }

  async function deleteMatch(matchId: string) {
    const ok = window.confirm("この試合と関連する投票を削除しますか？");
    if (!ok) return;
    await syncState(() => postState(`/api/matches/${matchId}`, undefined, "DELETE", adminToken));
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="confetti-dot c1" aria-hidden />
        <span className="confetti-dot c2" aria-hidden />
        <span className="confetti-dot c3" aria-hidden />
        <div className="brand-block">
          <div className="brand-mark">
            <Trophy aria-hidden size={24} />
          </div>
          <div>
            <p className="eyebrow">WC 2026 Prediction Pool</p>
            <h1>ワールドカップ予想プール</h1>
            <p className="hero-lead">注目カードを選んで、無料で予想に参加しよう</p>
          </div>
        </div>
        <div className="hero-ball" aria-hidden>⚽</div>
        <div className="compliance-strip">
          <ShieldCheck aria-hidden size={18} />
          <span>無料・架空ポイント / 換金不可 / 実เงินจริงなし</span>
        </div>
      </header>

      <nav className="tabs" aria-label="メインナビゲーション">
        <button
          className={view === "matches" ? "active" : ""}
          onClick={() => setView("matches")}
          type="button"
        >
          <CalendarClock size={18} aria-hidden />
          投票サイト
        </button>
        <button
          className={view === "people" || view === "personDetail" ? "active" : ""}
          onClick={() => setView("people")}
          type="button"
        >
          <UserRound size={18} aria-hidden />
          個人別
        </button>
        <button
          className={view === "admin" ? "active" : ""}
          onClick={() => setView("admin")}
          type="button"
        >
          <LayoutDashboard size={18} aria-hidden />
          管理画面
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

        {view === "matches" && (
          <section className="view-stack">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Open markets</p>
                <h2>開催中の予想テーマ</h2>
              </div>
              <div className="live-summary">
                <Clock3 size={18} aria-hidden />
                {filteredMatches.filter((match) => isMatchOpen(match, now)).length}件受付中
              </div>
            </div>

            <label className="match-search">
              <span>試合を探す</span>
              <input
                value={matchSearch}
                onChange={(event) => setMatchSearch(event.target.value)}
                placeholder="試合名、会場、ステージで検索"
              />
            </label>

            <div className="summary-list">
              {filteredMatches.map((match) => (
                <MatchSummaryCard
                  key={match.id}
                  match={match}
                  now={now}
                  votes={data.votes}
                  onOpen={() => openMatchDetail(match.id)}
                />
              ))}
            </div>

            <GamePerks />
          </section>
        )}

        {view === "matchDetail" && selectedMatch && (
          <section className="view-stack">
            <button className="back-action" type="button" onClick={() => setView("matches")}>
              予想テーマ一覧へ戻る
            </button>
            <article className="match-card detail-card">
              <MatchHeader match={selectedMatch} now={now} votes={data.votes} />

              <div className="option-board" aria-label={`${selectedMatch.title}の選択肢`}>
                {selectedMatch.options.map((option) => {
                  const total = getMatchTotal(selectedMatch, data.votes);
                  const optionTotal = getOptionTotal(selectedMatch, data.votes, option.id);
                  const percentage = total ? Math.round((optionTotal / total) * 100) : 0;
                  const odds = optionTotal > 0 ? total / optionTotal : 0;

                  return (
                    <div className="option-row" key={option.id}>
                      <div>
                        <strong>{option.label}</strong>
                        <span>{formatPoints(optionTotal)} / {percentage}%</span>
                      </div>
                      <div className="meter" aria-hidden>
                        <span style={{ width: `${percentage}%` }} />
                      </div>
                      <b>{odds ? `${odds.toFixed(2)}x` : "未形成"}</b>
                    </div>
                  );
                })}
              </div>

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
                      <b>{formatPoints(row.staked)}</b>
                      <small className={row.net >= 0 ? "positive" : "negative"}>
                        確定収支 {row.net >= 0 ? "+" : ""}
                        {formatPoints(row.net)}
                      </small>
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
          <section className="view-stack">
            <button className="back-action" type="button" onClick={() => setView("people")}>
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

            <PersonVoteList
              votes={selectedPersonVotes}
              matches={data.matches}
              allVotes={data.votes}
            />

            <div className="data-panel">
              <div className="panel-title">
                <Trophy size={18} aria-hidden />
                ポイント獲得履歴
              </div>
              {selectedAwardRows.length ? (
                <PersonAwardList rows={selectedAwardRows} />
              ) : (
                <EmptyState title="獲得履歴はまだありません" />
              )}
            </div>
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
                    <span>ステージ</span>
                    <input
                      value={matchDraft.stage}
                      onChange={(event) =>
                        setMatchDraft((current) => ({ ...current, stage: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>会場</span>
                    <input
                      value={matchDraft.venue}
                      onChange={(event) =>
                        setMatchDraft((current) => ({ ...current, venue: event.target.value }))
                      }
                      placeholder="バンクーバー"
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
                    <span>予想テーマ</span>
                    <input
                      value={matchDraft.question}
                      onChange={(event) =>
                        setMatchDraft((current) => ({ ...current, question: event.target.value }))
                      }
                      placeholder="90分終了時の勝敗"
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
                  試合DB
                </div>
                <div className="admin-match-list">
                  {sortedMatches.map((match) => {
                    const selectedResult = match.resultOptionId ?? "";
                    return (
                      <div className="admin-match-row" key={match.id}>
                        <div>
                          <strong>{match.title}</strong>
                          <span>
                            {match.stage} / {formatDateTime(match.startsAt)} /{" "}
                            {getStatusLabel(match, now)}
                          </span>
                        </div>
                        <select
                          aria-label={`${match.title}の結果`}
                          value={selectedResult}
                          onChange={(event) => settleMatch(match.id, event.target.value)}
                        >
                          <option value="">結果を選択</option>
                          {match.options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          className="icon-action"
                          type="button"
                          onClick={() => reopenMatch(match.id)}
                          title="結果を解除"
                        >
                          <RotateCcw size={18} aria-hidden />
                        </button>
                        <button
                          className="icon-action danger"
                          type="button"
                          onClick={() => deleteMatch(match.id)}
                          title="削除"
                        >
                          <X size={18} aria-hidden />
                        </button>
                      </div>
                    );
                  })}
                </div>
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
                        </tr>
                      </thead>
                      <tbody>
                        {data.votes.map((vote) => {
                          const match = data.matches.find((item) => item.id === vote.matchId);
                          return (
                            <tr key={vote.id}>
                              <td>{formatDateTime(vote.createdAt)}</td>
                              <td>{vote.userName}</td>
                              <td>{match?.title ?? "削除済み"}</td>
                              <td>{optionLabel(match, vote.optionId)}</td>
                              <td>{formatPoints(vote.amount)}</td>
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
      popular: "未形成",
      longshot: "未形成",
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

  return (
    <button className="summary-card" type="button" onClick={onOpen}>
      <div className="match-meta">
        <span className={`status-pill ${status === "受付中" ? "open" : ""}`}>{status}</span>
        <span>{match.stage}</span>
        <span>{match.venue}</span>
      </div>
      <strong>{match.title}</strong>
      <span className="summary-question">{match.question}</span>
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
          穴
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

  return (
    <div className="match-header">
      <div className="match-meta">
        <span className={`status-pill ${status === "受付中" ? "open" : ""}`}>{status}</span>
        <span>{match.stage}</span>
        <span>{match.venue}</span>
      </div>
      <h3>{match.title}</h3>
      <p>{match.question}</p>
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
            const payout = match
              ? calculateVotePayout(vote, match, allVotes)
              : { gross: 0, net: 0, won: false, settled: false };
            const status = payout.settled ? (payout.won ? "的中" : "不的中") : "未確定";

            return (
              <article className="person-vote-card" key={vote.id}>
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

function PersonAwardList({
  rows,
}: {
  rows: Array<{
    vote: VoteRecord;
    match: MatchRecord | undefined;
    payout: { gross: number; net: number; won: boolean; settled: boolean };
  }>;
}) {
  return (
    <div className="person-vote-list">
      {rows.map(({ vote, match, payout }) => (
        <article className="person-vote-card" key={vote.id}>
          <div>
            <strong>{match?.title ?? "削除済み"}</strong>
            <span>{formatDateTime(match?.settledAt ?? vote.createdAt)}</span>
          </div>
          <dl>
            <div>
              <dt>的中選択</dt>
              <dd>{optionLabel(match, vote.optionId)}</dd>
            </div>
            <div>
              <dt>投票pt</dt>
              <dd>{formatPoints(vote.amount)}</dd>
            </div>
            <div>
              <dt>獲得pt</dt>
              <dd>{formatPoints(payout.gross)}</dd>
            </div>
            <div>
              <dt>収支</dt>
              <dd className={payout.net >= 0 ? "positive" : "negative"}>
                {payout.net >= 0 ? "+" : ""}
                {formatPoints(payout.net)}
              </dd>
            </div>
          </dl>
        </article>
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
  onChange,
  onSubmit,
}: {
  draft: VoteDraft;
  hasRemoteState: boolean;
  isSaving: boolean;
  match: MatchRecord;
  now: Date;
  onChange: (patch: Partial<VoteDraft>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const open = isMatchOpen(match, now);
  const canSubmit = open && hasRemoteState && !isSaving;

  useEffect(() => {
    if (!draft.optionId && match.options[0]?.id) {
      onChange({ optionId: match.options[0].id });
    }
  }, [draft.optionId, match.options, onChange]);

  return (
    <form className="vote-form" onSubmit={onSubmit}>
      <div className="choice-list" role="radiogroup" aria-label="選択肢">
        {match.options.map((option) => (
          <label className={draft.optionId === option.id ? "choice selected" : "choice"} key={option.id}>
            <input
              type="radio"
              name={`option-${match.id}`}
              value={option.id}
              checked={draft.optionId === option.id}
              onChange={() => onChange({ optionId: option.id })}
              disabled={!open || !hasRemoteState || isSaving}
            />
            <span>{option.label}</span>
          </label>
        ))}
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
          <span>投票pt</span>
          <input
            type="number"
            min="1"
            step="1"
            value={draft.amount}
            onChange={(event) => onChange({ amount: event.target.value })}
            disabled={!open || !hasRemoteState || isSaving}
          />
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
            <div className="bettor-chip" key={vote.id}>
              <span>{vote.userName}</span>
              <b>{formatPoints(vote.amount)}</b>
              <small>{optionLabel(match, vote.optionId)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted-line">まだ投票はありません。</p>
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

function GamePerks() {
  return (
    <section className="game-perks" aria-label="予想ゲームの特徴">
      <div className="perk-card">
        <div className="perk-icon teal">
          <WalletCards size={26} aria-hidden />
        </div>
        <strong>完全無料で参加</strong>
        <span>架空ポイントで楽しめます</span>
      </div>
      <div className="perk-card">
        <div className="perk-icon green">
          <Medal size={26} aria-hidden />
        </div>
        <strong>的中でポイント獲得</strong>
        <span>プールをみんなで分配</span>
      </div>
      <div className="perk-card">
        <div className="perk-icon blue">
          <Gift size={26} aria-hidden />
        </div>
        <strong>ランキング上位へ</strong>
        <span>個人別で収支を確認</span>
      </div>
      <div className="big-cta">
        <Sparkles size={22} aria-hidden />
        まずは1試合、無料で予想してみよう
      </div>
    </section>
  );
}

export default App;
