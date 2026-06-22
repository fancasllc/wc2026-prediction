import express from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT ?? 4173);
const appVersion = process.env.RENDER_GIT_COMMIT ?? process.env.COMMIT_SHA ?? "local";
const adminPassword = process.env.ADMIN_PASSWORD ?? "";
const adminSessionSecret =
  process.env.ADMIN_SESSION_SECRET ?? process.env.SESSION_SECRET ?? "";
const requiresAdminAuth = Boolean(process.env.RENDER || adminPassword);
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);
const exposeErrorDetails = process.env.DEBUG_ERRORS === "true";
const rateLimitStore = new Map();
const backupCheckIntervalMs = 15 * 60 * 1000;
const backupHourJst = Number(process.env.DB_BACKUP_HOUR_JST ?? 4);
const settlementBackupDelayMs = Math.max(
  0,
  Number(process.env.DB_BACKUP_AFTER_SETTLEMENT_DELAY_SECONDS ?? 300) * 1000,
);
const externalOddsRefreshIntervalMs = Math.max(
  5 * 60 * 1000,
  Number(process.env.EXTERNAL_ODDS_REFRESH_MINUTES ?? 30) * 60 * 1000,
);
const youtubeRefreshIntervalMs = Math.max(
  5 * 60 * 1000,
  Number(process.env.YOUTUBE_REFRESH_MINUTES ?? 30) * 60 * 1000,
);
const betChannelMatchesUrl = "https://bet-channel.com/matches?ct=10037";
const betChannelApiUrl = "https://bet-channel.com/matches/api/matchlist?ct=10037&limit=300";
const daznJapanChannelId = process.env.YOUTUBE_CHANNEL_ID ?? "UCoFLB_Gw_AoxUuuzKjXrc_Q";
const daznJapanVideosUrl = "https://www.youtube.com/@DAZNJapan/videos";
const youtubeFeedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(daznJapanChannelId)}`;
const heroFallbackImageUrl = "/hero-japan-2026.jpg";
const youtubeThumbnailQualities = new Map([
  ["maxresdefault", "maxresdefault.jpg"],
  ["sddefault", "sddefault.jpg"],
  ["hqdefault", "hqdefault.jpg"],
]);
const backupStorageBucket = process.env.DB_BACKUP_S3_BUCKET ?? "";
const backupStoragePrefix = (process.env.DB_BACKUP_S3_PREFIX ?? "wc2026-prediction-db-backups")
  .replace(/^\/+|\/+$/g, "");
const backupStorageEndpoint = process.env.DB_BACKUP_S3_ENDPOINT ?? "";
const backupStorageRegion = process.env.DB_BACKUP_S3_REGION ?? "auto";
const backupStorageAccessKeyId =
  process.env.DB_BACKUP_S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? "";
const backupStorageSecretAccessKey =
  process.env.DB_BACKUP_S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? "";
const backupStoragePublicBaseUrl = (process.env.DB_BACKUP_S3_PUBLIC_BASE_URL ?? "").replace(
  /\/+$/g,
  "",
);
const isExternalBackupStorageConfigured = Boolean(
  backupStorageBucket && backupStorageAccessKeyId && backupStorageSecretAccessKey,
);
let backupTimer = null;
let backupInProgress = false;
let backupStorageClient = null;
const settlementBackupTimers = new Map();
let externalOddsTimer = null;
let externalOddsInProgress = false;
let youtubeLatestVideoCache = null;
let youtubeLatestVideoFetchedAt = 0;
let youtubeLatestVideoTimer = null;
let youtubeLatestVideoInProgress = false;
let userPointSnapshotTimer = null;
let userPointSnapshotInProgress = false;

const englishCountryToJapanese = new Map(
  Object.entries({
    "algeria": "アルジェリア",
    "argentina": "アルゼンチン",
    "australia": "オーストラリア",
    "austria": "オーストリア",
    "belgium": "ベルギー",
    "bosnia and herzegovina": "ボスニア・ヘルツェゴビナ",
    "bosnia-herzegovina": "ボスニア・ヘルツェゴビナ",
    "brazil": "ブラジル",
    "cameroon": "カメルーン",
    "canada": "カナダ",
    "cabo verde": "カーボベルデ",
    "cape verde": "カーボベルデ",
    "colombia": "コロンビア",
    "costa rica": "コスタリカ",
    "cote d'ivoire": "コートジボワール",
    "côte d'ivoire": "コートジボワール",
    "croatia": "クロアチア",
    "curacao": "キュラソー",
    "curaçao": "キュラソー",
    "czech republic": "チェコ",
    "czechia": "チェコ",
    "denmark": "デンマーク",
    "dr congo": "コンゴ民主共和国",
    "ecuador": "エクアドル",
    "egypt": "エジプト",
    "england": "イングランド",
    "france": "フランス",
    "germany": "ドイツ",
    "ghana": "ガーナ",
    "haiti": "ハイチ",
    "iran": "イラン",
    "iraq": "イラク",
    "ivory coast": "コートジボワール",
    "japan": "日本",
    "jordan": "ヨルダン",
    "korea republic": "韓国",
    "mexico": "メキシコ",
    "morocco": "モロッコ",
    "netherlands": "オランダ",
    "new zealand": "ニュージーランド",
    "norway": "ノルウェー",
    "panama": "パナマ",
    "paraguay": "パラグアイ",
    "portugal": "ポルトガル",
    "qatar": "カタール",
    "saudi arabia": "サウジアラビア",
    "scotland": "スコットランド",
    "senegal": "セネガル",
    "south africa": "南アフリカ",
    "south korea": "韓国",
    "spain": "スペイン",
    "sweden": "スウェーデン",
    "switzerland": "スイス",
    "tunisia": "チュニジア",
    "turkey": "トルコ",
    "turkiye": "トルコ",
    "türkiye": "トルコ",
    "united states": "アメリカ",
    "united states of america": "アメリカ",
    "usa": "アメリカ",
    "uruguay": "ウルグアイ",
    "uzbekistan": "ウズベキスタン",
  }),
);

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
    })
  : null;

function getBackupStorageClient() {
  if (!isExternalBackupStorageConfigured) return null;
  if (!backupStorageClient) {
    backupStorageClient = new S3Client({
      region: backupStorageRegion,
      endpoint: backupStorageEndpoint || undefined,
      credentials: {
        accessKeyId: backupStorageAccessKeyId,
        secretAccessKey: backupStorageSecretAccessKey,
      },
      forcePathStyle: Boolean(backupStorageEndpoint),
    });
  }
  return backupStorageClient;
}

function toIsoLike(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 16);
}

function createId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function clampText(value, maxLength) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeName(name) {
  return clampText(name, 40);
}

function validateMatch(input) {
  const title = clampText(input.title, 120);
  const stage = clampText(input.stage, 80);
  const venue = clampText(input.venue, 80);
  const startsAt = String(input.startsAt ?? "").trim();
  const closesAt = String(input.closesAt ?? startsAt).trim();
  const question = clampText(input.question, 180);
  const notice = String(input.notice ?? input.注意事項 ?? "").trim().slice(0, 800);
  const options = Array.isArray(input.options) ? input.options : [];
  const handicapOptionId = String(input.handicapOptionId ?? "").trim();
  const rawHandicapPoints = Number(input.handicapPoints ?? 0);
  const handicapPoints = Number.isFinite(rawHandicapPoints) ? rawHandicapPoints : 0;

  if (!title || !startsAt || !closesAt || options.length < 2 || options.length > 80) {
    const error = new Error("Invalid match payload");
    error.status = 400;
    throw error;
  }

  if (
    handicapPoints < 0 ||
    handicapPoints > 5 ||
    Math.round(handicapPoints * 2) !== handicapPoints * 2 ||
    (handicapPoints > 0 && !handicapOptionId)
  ) {
    const error = new Error("Invalid handicap payload");
    error.status = 400;
    throw error;
  }

  const normalizedOptions = options.map((option, index) => ({
    id: String(option.id ?? createId(`option-${index + 1}`)),
    label: clampText(option.label, 80),
  })).filter((option) => option.label);

  if (handicapPoints > 0 && !normalizedOptions.some((option) => option.id === handicapOptionId)) {
    const error = new Error("Invalid handicap option");
    error.status = 400;
    throw error;
  }

  return {
    id: String(input.id ?? createId("match")),
    title,
    stage,
    venue,
    startsAt,
    closesAt,
    question,
    notice,
    options: normalizedOptions,
    handicapOptionId: handicapPoints > 0 ? handicapOptionId : "",
    handicapPoints: handicapPoints > 0 ? handicapPoints : 0,
  };
}

function isDrawOptionLabel(label) {
  const value = String(label ?? "").trim();
  return value.includes("引き分け") || value.toLowerCase() === "draw";
}

function parseScoreValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || !Number.isInteger(score)) return null;
  return score;
}

function deriveResultFromScores(match, options, homeScoreInput, awayScoreInput) {
  const teamOptions = options.filter((option) => !isDrawOptionLabel(option.label)).slice(0, 2);
  const [homeOption, awayOption] = teamOptions;
  const drawOption = options.find((option) => isDrawOptionLabel(option.label));
  const homeScore = parseScoreValue(homeScoreInput);
  const awayScore = parseScoreValue(awayScoreInput);

  if (!homeOption || !awayOption) {
    const error = new Error("Two team options are required to settle by score");
    error.status = 400;
    throw error;
  }
  if (homeScore === null || awayScore === null) {
    const error = new Error("Scores must be non-negative integers");
    error.status = 400;
    throw error;
  }

  const handicapPoints = Number(match.handicap_points ?? match.handicapPoints ?? 0);
  const handicapOptionId = match.handicap_option_id ?? match.handicapOptionId ?? "";
  const adjustedHomeScore =
    handicapOptionId === homeOption.id ? homeScore + handicapPoints : homeScore;
  const adjustedAwayScore =
    handicapOptionId === awayOption.id ? awayScore + handicapPoints : awayScore;
  let resultOption = null;

  if (adjustedHomeScore > adjustedAwayScore) {
    resultOption = homeOption;
  } else if (adjustedAwayScore > adjustedHomeScore) {
    resultOption = awayOption;
  } else {
    resultOption = drawOption;
  }

  if (!resultOption) {
    const error = new Error("Score result is draw but no draw option exists");
    error.status = 400;
    throw error;
  }

  return {
    resultOptionId: resultOption.id,
    homeScore,
    awayScore,
    adjustedHomeScore,
    adjustedAwayScore,
  };
}

const scheduledGroupMatches = [
  { id: "wc26-mexico-south-africa", title: "メキシコ VS 南アフリカ", startsAt: "2026-06-12T04:00", options: ["メキシコ", "南アフリカ", "引き分け"] },
  { id: "wc26-south-korea-czechia", title: "韓国 VS チェコ", startsAt: "2026-06-12T11:00", options: ["韓国", "チェコ", "引き分け"] },
  { id: "wc26-canada-bosnia", title: "カナダ VS ボスニア", startsAt: "2026-06-13T04:00", options: ["カナダ", "ボスニア", "引き分け"] },
  { id: "wc26-usa-paraguay", title: "アメリカ VS パラグアイ", startsAt: "2026-06-13T10:00", options: ["アメリカ", "パラグアイ", "引き分け"] },
  { id: "wc26-qatar-switzerland", title: "カタール VS スイス", startsAt: "2026-06-14T04:00", options: ["カタール", "スイス", "引き分け"] },
  { id: "wc26-brazil-morocco", title: "ブラジル VS モロッコ", startsAt: "2026-06-14T07:00", options: ["ブラジル", "モロッコ", "引き分け"] },
  { id: "wc26-haiti-scotland", title: "ハイチ VS スコットランド", startsAt: "2026-06-14T10:00", options: ["ハイチ", "スコットランド", "引き分け"] },
  { id: "wc26-australia-turkiye", title: "オーストラリア VS トルコ", startsAt: "2026-06-14T13:00", options: ["オーストラリア", "トルコ", "引き分け"] },
  { id: "wc26-germany-curacao", title: "ドイツ VS キュラソー", startsAt: "2026-06-15T02:00", options: ["ドイツ", "キュラソー", "引き分け"] },
  { id: "wc26-netherlands-japan", title: "オランダ VS 日本", startsAt: "2026-06-15T05:00", options: ["オランダ", "日本", "引き分け"] },
  { id: "wc26-ivory-coast-ecuador", title: "コートジボワール VS エクアドル", startsAt: "2026-06-15T08:00", options: ["コートジボワール", "エクアドル", "引き分け"] },
  { id: "wc26-sweden-tunisia", title: "スウェーデン VS チュニジア", startsAt: "2026-06-15T11:00", options: ["スウェーデン", "チュニジア", "引き分け"] },
  { id: "wc26-spain-cape-verde", title: "スペイン VS カーボベルデ", startsAt: "2026-06-16T01:00", options: ["スペイン", "カーボベルデ", "引き分け"] },
  { id: "wc26-belgium-egypt", title: "ベルギー VS エジプト", startsAt: "2026-06-16T04:00", options: ["ベルギー", "エジプト", "引き分け"] },
  { id: "wc26-saudi-arabia-uruguay", title: "サウジアラビア VS ウルグアイ", startsAt: "2026-06-16T07:00", options: ["サウジアラビア", "ウルグアイ", "引き分け"] },
  { id: "wc26-iran-new-zealand", title: "イラン VS ニュージーランド", startsAt: "2026-06-16T10:00", options: ["イラン", "ニュージーランド", "引き分け"] },
  { id: "wc26-france-senegal", title: "フランス VS セネガル", startsAt: "2026-06-17T04:00", options: ["フランス", "セネガル", "引き分け"] },
  { id: "wc26-iraq-norway", title: "イラク VS ノルウェー", startsAt: "2026-06-17T07:00", options: ["イラク", "ノルウェー", "引き分け"] },
  { id: "wc26-argentina-algeria", title: "アルゼンチン VS アルジェリア", startsAt: "2026-06-17T10:00", options: ["アルゼンチン", "アルジェリア", "引き分け"] },
  { id: "wc26-austria-jordan", title: "オーストリア VS ヨルダン", startsAt: "2026-06-17T13:00", options: ["オーストリア", "ヨルダン", "引き分け"] },
  { id: "wc26-portugal-drc", title: "ポルトガル VS コンゴ民主共和国", startsAt: "2026-06-18T02:00", options: ["ポルトガル", "コンゴ民主共和国", "引き分け"] },
  { id: "wc26-england-croatia", title: "イングランド VS クロアチア", startsAt: "2026-06-18T05:00", options: ["イングランド", "クロアチア", "引き分け"] },
  { id: "wc26-ghana-panama", title: "ガーナ VS パナマ", startsAt: "2026-06-18T08:00", options: ["ガーナ", "パナマ", "引き分け"] },
  { id: "wc26-uzbekistan-colombia", title: "ウズベキスタン VS コロンビア", startsAt: "2026-06-18T11:00", options: ["ウズベキスタン", "コロンビア", "引き分け"] },
  { id: "wc26-czechia-south-africa", title: "チェコ VS 南アフリカ", startsAt: "2026-06-19T01:00", options: ["チェコ", "南アフリカ", "引き分け"] },
  { id: "wc26-switzerland-bosnia", title: "スイス VS ボスニア", startsAt: "2026-06-19T04:00", options: ["スイス", "ボスニア", "引き分け"] },
  { id: "wc26-canada-qatar", title: "カナダ VS カタール", startsAt: "2026-06-19T07:00", options: ["カナダ", "カタール", "引き分け"] },
  { id: "wc26-mexico-south-korea", title: "メキシコ VS 韓国", startsAt: "2026-06-19T10:00", options: ["メキシコ", "韓国", "引き分け"] },
  { id: "wc26-usa-australia", title: "アメリカ VS オーストラリア", startsAt: "2026-06-20T04:00", options: ["アメリカ", "オーストラリア", "引き分け"] },
  { id: "wc26-scotland-morocco", title: "スコットランド VS モロッコ", startsAt: "2026-06-20T07:00", options: ["スコットランド", "モロッコ", "引き分け"] },
  { id: "wc26-brazil-haiti", title: "ブラジル VS ハイチ", startsAt: "2026-06-20T09:30", options: ["ブラジル", "ハイチ", "引き分け"] },
  { id: "wc26-turkiye-paraguay", title: "トルコ VS パラグアイ", startsAt: "2026-06-20T12:00", options: ["トルコ", "パラグアイ", "引き分け"] },
  { id: "wc26-netherlands-sweden", title: "オランダ VS スウェーデン", startsAt: "2026-06-21T02:00", options: ["オランダ", "スウェーデン", "引き分け"] },
  { id: "wc26-germany-ivory-coast", title: "ドイツ VS コートジボワール", startsAt: "2026-06-21T05:00", options: ["ドイツ", "コートジボワール", "引き分け"] },
  { id: "wc26-ecuador-curacao", title: "エクアドル VS キュラソー", startsAt: "2026-06-21T12:00", options: ["エクアドル", "キュラソー", "引き分け"] },
  { id: "wc26-tunisia-japan", title: "チュニジア VS 日本", startsAt: "2026-06-21T13:00", options: ["チュニジア", "日本", "引き分け"] },
  { id: "wc26-spain-saudi-arabia", title: "スペイン VS サウジアラビア", startsAt: "2026-06-22T01:00", options: ["スペイン", "サウジアラビア", "引き分け"] },
  { id: "wc26-belgium-iran", title: "ベルギー VS イラン", startsAt: "2026-06-22T04:00", options: ["ベルギー", "イラン", "引き分け"] },
  { id: "wc26-uruguay-cape-verde", title: "ウルグアイ VS カーボベルデ", startsAt: "2026-06-22T07:00", options: ["ウルグアイ", "カーボベルデ", "引き分け"] },
  { id: "wc26-new-zealand-egypt", title: "ニュージーランド VS エジプト", startsAt: "2026-06-22T10:00", options: ["ニュージーランド", "エジプト", "引き分け"] },
  { id: "wc26-argentina-austria", title: "アルゼンチン VS オーストリア", startsAt: "2026-06-23T02:00", options: ["アルゼンチン", "オーストリア", "引き分け"] },
  { id: "wc26-france-iraq", title: "フランス VS イラク", startsAt: "2026-06-23T06:00", options: ["フランス", "イラク", "引き分け"] },
  { id: "wc26-norway-senegal", title: "ノルウェー VS セネガル", startsAt: "2026-06-23T09:00", options: ["ノルウェー", "セネガル", "引き分け"] },
  { id: "wc26-jordan-algeria", title: "ヨルダン VS アルジェリア", startsAt: "2026-06-23T12:00", options: ["ヨルダン", "アルジェリア", "引き分け"] },
  { id: "wc26-portugal-uzbekistan", title: "ポルトガル VS ウズベキスタン", startsAt: "2026-06-24T02:00", options: ["ポルトガル", "ウズベキスタン", "引き分け"] },
  { id: "wc26-england-ghana", title: "イングランド VS ガーナ", startsAt: "2026-06-24T05:00", options: ["イングランド", "ガーナ", "引き分け"] },
  { id: "wc26-panama-croatia", title: "パナマ VS クロアチア", startsAt: "2026-06-24T08:00", options: ["パナマ", "クロアチア", "引き分け"] },
  { id: "wc26-colombia-drc", title: "コロンビア VS コンゴ民主共和国", startsAt: "2026-06-24T11:00", options: ["コロンビア", "コンゴ民主共和国", "引き分け"] },
  { id: "wc26-switzerland-canada", title: "スイス VS カナダ", startsAt: "2026-06-25T04:00", options: ["スイス", "カナダ", "引き分け"] },
  { id: "wc26-bosnia-qatar", title: "ボスニア VS カタール", startsAt: "2026-06-25T04:00", options: ["ボスニア", "カタール", "引き分け"] },
  { id: "wc26-scotland-brazil", title: "スコットランド VS ブラジル", startsAt: "2026-06-25T07:00", options: ["スコットランド", "ブラジル", "引き分け"] },
  { id: "wc26-morocco-haiti", title: "モロッコ VS ハイチ", startsAt: "2026-06-25T07:00", options: ["モロッコ", "ハイチ", "引き分け"] },
  { id: "wc26-czechia-mexico", title: "チェコ VS メキシコ", startsAt: "2026-06-25T10:00", options: ["チェコ", "メキシコ", "引き分け"] },
  { id: "wc26-south-africa-south-korea", title: "南アフリカ VS 韓国", startsAt: "2026-06-25T10:00", options: ["南アフリカ", "韓国", "引き分け"] },
  { id: "wc26-ecuador-germany", title: "エクアドル VS ドイツ", startsAt: "2026-06-26T05:00", options: ["エクアドル", "ドイツ", "引き分け"] },
  { id: "wc26-curacao-ivory-coast", title: "キュラソー VS コートジボワール", startsAt: "2026-06-26T05:00", options: ["キュラソー", "コートジボワール", "引き分け"] },
  { id: "wc26-japan-sweden", title: "日本 VS スウェーデン", startsAt: "2026-06-26T08:00", options: ["日本", "スウェーデン", "引き分け"] },
  { id: "wc26-tunisia-netherlands", title: "チュニジア VS オランダ", startsAt: "2026-06-26T08:00", options: ["チュニジア", "オランダ", "引き分け"] },
  { id: "wc26-turkiye-usa", title: "トルコ VS アメリカ", startsAt: "2026-06-26T11:00", options: ["トルコ", "アメリカ", "引き分け"] },
  { id: "wc26-paraguay-australia", title: "パラグアイ VS オーストラリア", startsAt: "2026-06-26T11:00", options: ["パラグアイ", "オーストラリア", "引き分け"] },
  { id: "wc26-norway-france", title: "ノルウェー VS フランス", startsAt: "2026-06-27T04:00", options: ["ノルウェー", "フランス", "引き分け"] },
  { id: "wc26-senegal-iraq", title: "セネガル VS イラク", startsAt: "2026-06-27T04:00", options: ["セネガル", "イラク", "引き分け"] },
  { id: "wc26-cape-verde-saudi-arabia", title: "カーボベルデ VS サウジアラビア", startsAt: "2026-06-27T09:00", options: ["カーボベルデ", "サウジアラビア", "引き分け"] },
  { id: "wc26-uruguay-spain", title: "ウルグアイ VS スペイン", startsAt: "2026-06-27T09:00", options: ["ウルグアイ", "スペイン", "引き分け"] },
  { id: "wc26-egypt-iran", title: "エジプト VS イラン", startsAt: "2026-06-27T12:00", options: ["エジプト", "イラン", "引き分け"] },
  { id: "wc26-new-zealand-belgium", title: "ニュージーランド VS ベルギー", startsAt: "2026-06-27T12:00", options: ["ニュージーランド", "ベルギー", "引き分け"] },
  { id: "wc26-panama-england", title: "パナマ VS イングランド", startsAt: "2026-06-28T06:00", options: ["パナマ", "イングランド", "引き分け"] },
  { id: "wc26-croatia-ghana", title: "クロアチア VS ガーナ", startsAt: "2026-06-28T06:00", options: ["クロアチア", "ガーナ", "引き分け"] },
  { id: "wc26-colombia-portugal", title: "コロンビア VS ポルトガル", startsAt: "2026-06-28T08:30", options: ["コロンビア", "ポルトガル", "引き分け"] },
  { id: "wc26-drc-uzbekistan", title: "コンゴ民主共和国 VS ウズベキスタン", startsAt: "2026-06-28T08:30", options: ["コンゴ民主共和国", "ウズベキスタン", "引き分け"] },
  { id: "wc26-algeria-austria", title: "アルジェリア VS オーストリア", startsAt: "2026-06-28T11:00", options: ["アルジェリア", "オーストリア", "引き分け"] },
  { id: "wc26-jordan-argentina", title: "ヨルダン VS アルゼンチン", startsAt: "2026-06-28T11:00", options: ["ヨルダン", "アルゼンチン", "引き分け"] },
];

function normalizeFixtureText(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function normalizeFixtureTime(value) {
  return toIsoLike(value).slice(0, 16);
}

function scheduledMatchDate(scheduledMatch) {
  return new Date(`${scheduledMatch.startsAt}:00+09:00`);
}

function isScheduledMatchRegistered(scheduledMatch, existingMatch) {
  const [home, away] = scheduledMatch.options;
  const existingOptionLabels = existingMatch.options.map((option) => normalizeFixtureText(option.label));
  const hasTeams =
    existingOptionLabels.includes(normalizeFixtureText(home)) &&
    existingOptionLabels.includes(normalizeFixtureText(away));
  const titleText = normalizeFixtureText(existingMatch.title);
  const titleHasTeams =
    titleText.includes(normalizeFixtureText(home)) && titleText.includes(normalizeFixtureText(away));

  return (
    normalizeFixtureTime(existingMatch.startsAt) === scheduledMatch.startsAt &&
    (hasTeams || titleHasTeams)
  );
}

function makeScheduledMatchPayload(scheduledMatch) {
  return {
    id: scheduledMatch.id,
    title: scheduledMatch.title,
    stage: "",
    venue: "",
    startsAt: scheduledMatch.startsAt,
    closesAt: scheduledMatch.startsAt,
    question: "",
    options: scheduledMatch.options.map((label, index) => ({
      id: `${scheduledMatch.id}-option-${index + 1}`,
      label,
    })),
  };
}

function hasHalfPointHandicap(handicapPoints) {
  return Math.abs(handicapPoints % 1) === 0.5;
}

function makeScheduledMatchPayloadWithHandicap(scheduledMatch, input = {}) {
  const payload = makeScheduledMatchPayload(scheduledMatch);
  const optionIndex = Number(input.handicapOptionIndex);
  const handicapPoints = Number(input.handicapPoints ?? 0);
  const option = Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex <= 1
    ? payload.options[optionIndex]
    : null;
  const options = hasHalfPointHandicap(handicapPoints)
    ? payload.options.slice(0, 2)
    : payload.options;

  return {
    ...payload,
    options,
    handicapOptionId: option && handicapPoints > 0 ? option.id : "",
    handicapPoints,
  };
}

async function getMatchRegistrationRows(client = pool) {
  const matchesResult = await client.query(`
      select id, title, starts_at as "startsAt"
      from matches
      order by starts_at asc, created_at asc
    `);
  const optionsResult = await client.query(`
      select match_id as "matchId", label
      from match_options
      order by sort_order asc, label asc
    `);

  const optionsByMatch = new Map();
  for (const option of optionsResult.rows) {
    const rows = optionsByMatch.get(option.matchId) ?? [];
    rows.push({ label: option.label });
    optionsByMatch.set(option.matchId, rows);
  }

  return matchesResult.rows.map((match) => ({
    ...match,
    options: optionsByMatch.get(match.id) ?? [],
  }));
}

function getAvailableScheduledMatches(existingMatches, now = new Date()) {
  return scheduledGroupMatches
    .filter(
      (scheduledMatch) =>
        scheduledMatchDate(scheduledMatch) > now &&
        existingMatches.every((existingMatch) => !isScheduledMatchRegistered(scheduledMatch, existingMatch)),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

async function query(text, params = []) {
  if (!pool) {
    const error = new Error("DATABASE_URL is not configured");
    error.status = 503;
    throw error;
  }
  return pool.query(text, params);
}

async function withTransaction(callback) {
  if (!pool) {
    const error = new Error("DATABASE_URL is not configured");
    error.status = 503;
    throw error;
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function initializeDatabase() {
  if (!pool) {
    console.warn("DATABASE_URL is not set. API endpoints will return 503.");
    return;
  }

  await query(`
    create table if not exists matches (
      id text primary key,
      title text not null,
      stage text not null,
      venue text not null,
      starts_at timestamptz not null,
      closes_at timestamptz not null,
      question text not null,
      result_option_id text,
      settled_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table if not exists match_options (
      id text primary key,
      match_id text not null references matches(id) on delete cascade,
      label text not null,
      sort_order integer not null default 0
    );

    create table if not exists users (
      name text primary key,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists user_point_snapshots (
      snapshot_date date not null,
      user_name text not null references users(name) on delete cascade,
      settled_net numeric(14, 2) not null default 0,
      gross_payout numeric(14, 2) not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (snapshot_date, user_name)
    );

    create table if not exists point_adjustments (
      id text primary key,
      title text not null,
      reason text not null,
      created_at timestamptz not null default now()
    );

    create table if not exists point_adjustment_entries (
      id text primary key,
      adjustment_id text not null references point_adjustments(id) on delete cascade,
      user_name text not null references users(name) on delete restrict,
      amount numeric(14, 2) not null check (amount <> 0),
      sort_order integer not null default 0
    );

    create table if not exists votes (
      id text primary key,
      match_id text not null references matches(id) on delete cascade,
      option_id text not null references match_options(id) on delete restrict,
      user_name text not null references users(name) on delete restrict,
      amount numeric(14, 2) not null check (amount > 0),
      created_at timestamptz not null default now()
    );

    create index if not exists votes_match_id_idx on votes(match_id);
    create index if not exists votes_user_name_idx on votes(user_name);
    create index if not exists user_point_snapshots_user_date_idx
      on user_point_snapshots (user_name, snapshot_date desc);
    create index if not exists point_adjustment_entries_user_idx
      on point_adjustment_entries (user_name);

    alter table matches
      add column if not exists notice text not null default '',
      add column if not exists handicap_option_id text,
      add column if not exists handicap_points numeric(4, 1) not null default 0,
      add column if not exists home_score numeric(5, 1),
      add column if not exists away_score numeric(5, 1);

    create table if not exists admin_audit_logs (
      id text primary key,
      action text not null,
      target_id text,
      detail jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists app_settings (
      key text primary key,
      value text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists database_backups (
      id text primary key,
      reason text not null,
      csv_content text not null,
      match_count integer not null default 0,
      vote_count integer not null default 0,
      user_count integer not null default 0,
      created_at timestamptz not null default now()
    );

    alter table database_backups
      add column if not exists external_status text not null default 'not_configured',
      add column if not exists external_provider text,
      add column if not exists external_bucket text,
      add column if not exists external_object_key text,
      add column if not exists external_url text,
      add column if not exists external_error text,
      add column if not exists external_uploaded_at timestamptz;

    create table if not exists external_odds (
      id text primary key,
      match_id text not null references matches(id) on delete cascade,
      source text not null,
      source_match_id text not null,
      source_url text not null,
      home_label text not null,
      away_label text not null,
      home_odds numeric(10, 2),
      draw_odds numeric(10, 2),
      away_odds numeric(10, 2),
      fetched_at timestamptz not null default now(),
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      unique (source, source_match_id, match_id)
    );

    create index if not exists external_odds_match_source_fetched_idx
      on external_odds (match_id, source, fetched_at desc);
  `);

  await refreshTodayUserPointSnapshots();
  await ensureDailyBackup();
  startUserPointSnapshotScheduler();
  startBackupScheduler();
  startExternalOddsScheduler();
  startYoutubeLatestVideoScheduler();
}

function signAdminToken(expiresAt) {
  const payload = Buffer.from(
    JSON.stringify({ role: "admin", exp: expiresAt }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", adminSessionSecret || "dev-only-secret")
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifyAdminToken(token) {
  if (!requiresAdminAuth) return true;
  if (!adminPassword || !adminSessionSecret || !token || !token.includes(".")) return false;

  const [payload, signature] = token.split(".");
  const expected = createHmac("sha256", adminSessionSecret).update(payload).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.role === "admin" && Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(request, response, next) {
  if (!requiresAdminAuth) {
    next();
    return;
  }

  if (!adminPassword || !adminSessionSecret) {
    response.status(503).json({
      error: "Admin authentication is not configured.",
    });
    return;
  }

  const authHeader = request.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    response.status(401).json({
      error: "Admin authentication required",
    });
    return;
  }

  if (!token.includes(".")) {
    response.status(401).json({
      error: "Admin authentication required",
    });
    return;
  }

  if (!verifyAdminToken(token)) {
    response.status(401).json({
      error: "Admin authentication required",
    });
    return;
  }

  next();
}

async function writeAuditLog(action, targetId, detail = {}) {
  await query(
    `
      insert into admin_audit_logs (id, action, target_id, detail)
      values ($1, $2, $3, $4)
    `,
    [createId("audit"), action, targetId ?? null, JSON.stringify(detail)],
  );
}

function getTokyoDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
  };
}

async function refreshTodayUserPointSnapshots(db = pool) {
  if (!db || userPointSnapshotInProgress) return;

  const { dateKey } = getTokyoDateParts();
  userPointSnapshotInProgress = true;
  try {
    const snapshotResult = await db.query(
      `
        with cutoff as (
          select ($1::date::timestamp at time zone 'Asia/Tokyo') as cutoff_at
        ),
        match_pools as (
          select
            matches.id as match_id,
            sum(votes.amount) as total_pool,
            sum(votes.amount) filter (where votes.option_id = matches.result_option_id) as winning_pool
          from matches
          join votes on votes.match_id = matches.id
          group by matches.id, matches.result_option_id
        ),
        adjustment_sums as (
          select
            point_adjustment_entries.user_name,
            sum(point_adjustment_entries.amount) as adjustment_net
          from point_adjustment_entries
          join point_adjustments on point_adjustments.id = point_adjustment_entries.adjustment_id
          cross join cutoff
          where point_adjustments.created_at <= cutoff.cutoff_at
          group by point_adjustment_entries.user_name
        )
        select
          users.name as "userName",
          (coalesce(sum(
            case
              when matches.result_option_id is not null
                and coalesce(matches.settled_at, matches.closes_at) <= cutoff.cutoff_at
              then
                case
                  when votes.option_id = matches.result_option_id
                    and coalesce(match_pools.winning_pool, 0) > 0
                  then (match_pools.total_pool * votes.amount / match_pools.winning_pool) - votes.amount
                  else -votes.amount
                end
              else 0
            end
          ), 0) + coalesce(adjustment_sums.adjustment_net, 0))::float as "settledNet",
          (coalesce(sum(
            case
              when matches.result_option_id is not null
                and coalesce(matches.settled_at, matches.closes_at) <= cutoff.cutoff_at
                and votes.option_id = matches.result_option_id
                and coalesce(match_pools.winning_pool, 0) > 0
              then match_pools.total_pool * votes.amount / match_pools.winning_pool
              else 0
            end
          ), 0) + coalesce(adjustment_sums.adjustment_net, 0))::float as "grossPayout"
        from users
        cross join cutoff
        left join votes on votes.user_name = users.name
        left join matches on matches.id = votes.match_id
        left join match_pools on match_pools.match_id = matches.id
        left join adjustment_sums on adjustment_sums.user_name = users.name
        group by users.name, adjustment_sums.adjustment_net
      `,
      [dateKey],
    );

    for (const row of snapshotResult.rows) {
      await db.query(
        `
          insert into user_point_snapshots (
            snapshot_date, user_name, settled_net, gross_payout, updated_at
          ) values ($1::date, $2, $3, $4, now())
          on conflict (snapshot_date, user_name) do update set
            settled_net = excluded.settled_net,
            gross_payout = excluded.gross_payout,
            updated_at = now()
        `,
        [dateKey, row.userName, row.settledNet, row.grossPayout],
      );
    }
  } catch (error) {
    console.error("Failed to refresh user point snapshots", error);
  } finally {
    userPointSnapshotInProgress = false;
  }
}

function startUserPointSnapshotScheduler() {
  if (!pool || userPointSnapshotTimer) return;
  userPointSnapshotTimer = setInterval(() => {
    refreshTodayUserPointSnapshots();
  }, backupCheckIntervalMs);
}

function csvEscape(value) {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(rows) {
  const headers = [
    "section",
    "backup_id",
    "backup_created_at",
    "id",
    "match_id",
    "match_title",
    "stage",
    "venue",
    "starts_at",
    "closes_at",
    "result_option_id",
    "result_option_label",
    "settled_at",
    "option_id",
    "option_label",
    "option_sort_order",
    "vote_id",
    "user_name",
    "amount",
    "vote_created_at",
    "vote_result",
    "return_points",
    "net_points",
    "total_pool",
    "winning_pool",
    "user_vote_count",
    "user_total_staked",
    "user_pending_points",
    "user_gross_return",
    "user_settled_net",
    "snapshot_date",
    "snapshot_settled_net",
    "snapshot_gross_payout",
    "adjustment_id",
    "adjustment_title",
    "adjustment_reason",
    "adjustment_amount",
    "adjustment_created_at",
  ];

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function calculateBackupPayout(vote, match, votes) {
  if (!match?.result_option_id) {
    return { settled: false, won: false, gross: 0, net: 0, totalPool: 0, winningPool: 0 };
  }

  const matchVotes = votes.filter((item) => item.match_id === match.id);
  const totalPool = matchVotes.reduce((sum, item) => sum + Number(item.amount), 0);
  const winningPool = matchVotes
    .filter((item) => item.option_id === match.result_option_id)
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const won = vote.option_id === match.result_option_id;
  const gross = won && winningPool > 0 ? (totalPool * Number(vote.amount)) / winningPool : 0;

  return {
    settled: true,
    won,
    gross,
    net: gross - Number(vote.amount),
    totalPool,
    winningPool,
  };
}

async function createDatabaseBackup(reason = "manual", db = pool) {
  const backupId = createId("backup");
  const backupCreatedAt = new Date().toISOString();
  const run = (text, params = []) => db.query(text, params);

  const [
    matchesResult,
    optionsResult,
    usersResult,
    votesResult,
    snapshotsResult,
    adjustmentsResult,
  ] = await Promise.all([
    run(`
      select
        id,
        title,
        stage,
        venue,
        starts_at,
        closes_at,
        question,
        notice,
        result_option_id,
        home_score,
        away_score,
        handicap_option_id,
        handicap_points,
        settled_at,
        created_at
      from matches
      order by starts_at asc, created_at asc
    `),
    run(`
      select id, match_id, label, sort_order
      from match_options
      order by match_id asc, sort_order asc, label asc
    `),
    run(`
      select name, created_at, updated_at
      from users
      order by name asc
    `),
    run(`
      select id, match_id, option_id, user_name, amount::float as amount, created_at
      from votes
      order by created_at asc
    `),
    run(`
      select
        snapshot_date,
        user_name,
        settled_net::float as settled_net,
        gross_payout::float as gross_payout,
        created_at,
        updated_at
      from user_point_snapshots
      order by snapshot_date asc, user_name asc
    `),
    run(`
      select
        point_adjustment_entries.id,
        point_adjustments.id as adjustment_id,
        point_adjustments.title,
        point_adjustments.reason,
        point_adjustment_entries.user_name,
        point_adjustment_entries.amount::float as amount,
        point_adjustments.created_at
      from point_adjustment_entries
      join point_adjustments on point_adjustments.id = point_adjustment_entries.adjustment_id
      order by point_adjustments.created_at asc, point_adjustment_entries.sort_order asc
    `),
  ]);

  const matches = matchesResult.rows;
  const options = optionsResult.rows;
  const users = usersResult.rows;
  const votes = votesResult.rows;
  const snapshots = snapshotsResult.rows;
  const adjustments = adjustmentsResult.rows;
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const optionById = new Map(options.map((option) => [option.id, option]));

  const rows = [];
  rows.push({
    section: "backup_meta",
    backup_id: backupId,
    backup_created_at: backupCreatedAt,
    match_id: "",
    match_title: "WC2026 prediction database backup",
    user_vote_count: votes.length,
    user_total_staked: votes.reduce((sum, vote) => sum + Number(vote.amount), 0),
  });

  for (const match of matches) {
    const resultOption = match.result_option_id ? optionById.get(match.result_option_id) : null;
    rows.push({
      section: "matches",
      backup_id: backupId,
      backup_created_at: backupCreatedAt,
      id: match.id,
      match_id: match.id,
      match_title: match.title,
      stage: match.stage,
      venue: match.venue,
      starts_at: match.starts_at?.toISOString?.() ?? match.starts_at,
      closes_at: match.closes_at?.toISOString?.() ?? match.closes_at,
      notice: match.notice ?? "",
      result_option_id: match.result_option_id,
      result_option_label: resultOption?.label ?? "",
      home_score: match.home_score === null ? "" : Number(match.home_score),
      away_score: match.away_score === null ? "" : Number(match.away_score),
      settled_at: match.settled_at?.toISOString?.() ?? "",
      handicap_option_id: match.handicap_option_id ?? "",
      handicap_points: Number(match.handicap_points ?? 0),
    });
  }

  for (const option of options) {
    const match = matchById.get(option.match_id);
    rows.push({
      section: "match_options",
      backup_id: backupId,
      backup_created_at: backupCreatedAt,
      id: option.id,
      match_id: option.match_id,
      match_title: match?.title ?? "",
      option_id: option.id,
      option_label: option.label,
      option_sort_order: option.sort_order,
    });
  }

  for (const vote of votes) {
    const match = matchById.get(vote.match_id);
    const option = optionById.get(vote.option_id);
    const resultOption = match?.result_option_id ? optionById.get(match.result_option_id) : null;
    const payout = calculateBackupPayout(vote, match, votes);

    rows.push({
      section: "votes",
      backup_id: backupId,
      backup_created_at: backupCreatedAt,
      id: vote.id,
      vote_id: vote.id,
      match_id: vote.match_id,
      match_title: match?.title ?? "",
      result_option_id: match?.result_option_id ?? "",
      result_option_label: resultOption?.label ?? "",
      option_id: vote.option_id,
      option_label: option?.label ?? "",
      user_name: vote.user_name,
      amount: vote.amount,
      vote_created_at: vote.created_at?.toISOString?.() ?? vote.created_at,
      vote_result: payout.settled ? (payout.won ? "win" : "lose") : "pending",
      return_points: payout.settled ? Math.round(payout.gross) : "",
      net_points: payout.settled ? Math.round(payout.net) : "",
      total_pool: payout.settled ? Math.round(payout.totalPool) : "",
      winning_pool: payout.settled ? Math.round(payout.winningPool) : "",
    });
  }

  for (const user of users) {
    const userVotes = votes.filter((vote) => vote.user_name === user.name);
    const adjustmentNet = adjustments
      .filter((adjustment) => adjustment.user_name === user.name)
      .reduce((sum, adjustment) => sum + Number(adjustment.amount), 0);
    const summary = userVotes.reduce(
      (acc, vote) => {
        const match = matchById.get(vote.match_id);
        const payout = calculateBackupPayout(vote, match, votes);
        acc.voteCount += 1;
        acc.totalStaked += Number(vote.amount);
        acc.pendingPoints += payout.settled ? 0 : Number(vote.amount);
        acc.grossReturn += payout.settled ? payout.gross : 0;
        acc.settledNet += payout.settled ? payout.net : 0;
        return acc;
      },
      { voteCount: 0, totalStaked: 0, pendingPoints: 0, grossReturn: 0, settledNet: 0 },
    );

    rows.push({
      section: "users_summary",
      backup_id: backupId,
      backup_created_at: backupCreatedAt,
      id: user.name,
      user_name: user.name,
      user_vote_count: summary.voteCount,
      user_total_staked: Math.round(summary.totalStaked),
      user_pending_points: Math.round(summary.pendingPoints),
      user_gross_return: Math.round(summary.grossReturn + adjustmentNet),
      user_settled_net: Math.round(summary.settledNet + adjustmentNet),
    });
  }

  for (const snapshot of snapshots) {
    rows.push({
      section: "user_point_snapshots",
      backup_id: backupId,
      backup_created_at: backupCreatedAt,
      id: `${snapshot.snapshot_date}:${snapshot.user_name}`,
      user_name: snapshot.user_name,
      snapshot_date: snapshot.snapshot_date?.toISOString?.().slice(0, 10) ?? snapshot.snapshot_date,
      snapshot_settled_net: Math.round(snapshot.settled_net),
      snapshot_gross_payout: Math.round(snapshot.gross_payout),
    });
  }

  for (const adjustment of adjustments) {
    rows.push({
      section: "point_adjustments",
      backup_id: backupId,
      backup_created_at: backupCreatedAt,
      id: adjustment.id,
      user_name: adjustment.user_name,
      adjustment_id: adjustment.adjustment_id,
      adjustment_title: adjustment.title,
      adjustment_reason: adjustment.reason,
      adjustment_amount: Math.round(adjustment.amount),
      adjustment_created_at: adjustment.created_at?.toISOString?.() ?? adjustment.created_at,
    });
  }

  const csvContent = buildCsv(rows);
  await run(
    `
      insert into database_backups (
        id, reason, csv_content, match_count, vote_count, user_count
      ) values ($1, $2, $3, $4, $5, $6)
    `,
    [backupId, reason, csvContent, matches.length, votes.length, users.length],
  );

  return {
    id: backupId,
    reason,
    createdAt: backupCreatedAt,
    matchCount: matches.length,
    voteCount: votes.length,
    userCount: users.length,
    byteSize: Buffer.byteLength(csvContent, "utf8"),
  };
}

function createBackupObjectKey(backup) {
  const createdAt = new Date(backup.created_at ?? backup.createdAt ?? Date.now());
  const year = createdAt.getUTCFullYear();
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(createdAt.getUTCDate()).padStart(2, "0");
  const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
  const filename = `wc2026-prediction-backup-${stamp}-${backup.id}.csv`;
  return [backupStoragePrefix, String(year), month, day, filename].filter(Boolean).join("/");
}

function createExternalBackupUrl(objectKey) {
  if (backupStoragePublicBaseUrl) {
    return `${backupStoragePublicBaseUrl}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  }
  return `s3://${backupStorageBucket}/${objectKey}`;
}

async function markExternalBackupStatus(id, fields) {
  await query(
    `
      update database_backups
      set
        external_status = $2,
        external_provider = $3,
        external_bucket = $4,
        external_object_key = $5,
        external_url = $6,
        external_error = $7,
        external_uploaded_at = $8
      where id = $1
    `,
    [
      id,
      fields.status,
      fields.provider ?? null,
      fields.bucket ?? null,
      fields.objectKey ?? null,
      fields.url ?? null,
      fields.error ?? null,
      fields.uploadedAt ?? null,
    ],
  );
}

async function syncBackupToExternalStorage(backupId) {
  if (!isExternalBackupStorageConfigured) {
    return { status: "not_configured" };
  }

  const client = getBackupStorageClient();
  const result = await query(
    `
      select id, csv_content, created_at
      from database_backups
      where id = $1
    `,
    [backupId],
  );
  const backup = result.rows[0];
  if (!backup || !client) {
    return { status: "not_found" };
  }

  const objectKey = createBackupObjectKey(backup);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: backupStorageBucket,
        Key: objectKey,
        Body: Buffer.from(`\uFEFF${backup.csv_content}`, "utf8"),
        ContentType: "text/csv; charset=utf-8",
        Metadata: {
          "backup-id": backup.id,
          "created-by": "wc2026-prediction",
        },
      }),
    );

    const uploadedAt = new Date().toISOString();
    const url = createExternalBackupUrl(objectKey);
    await markExternalBackupStatus(backup.id, {
      status: "uploaded",
      provider: backupStorageEndpoint ? "s3-compatible" : "s3",
      bucket: backupStorageBucket,
      objectKey,
      url,
      uploadedAt,
    });
    return { status: "uploaded", objectKey, url, uploadedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markExternalBackupStatus(backup.id, {
      status: "failed",
      provider: backupStorageEndpoint ? "s3-compatible" : "s3",
      bucket: backupStorageBucket,
      objectKey,
      url: createExternalBackupUrl(objectKey),
      error: message.slice(0, 500),
    });
    console.error(`Failed to upload database backup ${backup.id} to external storage`, error);
    return { status: "failed", error: message };
  }
}

function scheduleSettlementBackup(matchId) {
  if (!pool) return;
  const existingTimer = settlementBackupTimers.get(matchId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(async () => {
    settlementBackupTimers.delete(matchId);
    try {
      const backup = await createDatabaseBackup(`settlement:${matchId}`);
      const externalResult = await syncBackupToExternalStorage(backup.id);
      await writeAuditLog("backup.settlement-auto", backup.id, {
        matchId,
        matchCount: backup.matchCount,
        voteCount: backup.voteCount,
        userCount: backup.userCount,
        externalStatus: externalResult.status,
      });
      console.log(`Created settlement database backup ${backup.id} for ${matchId}`);
    } catch (error) {
      console.error(`Failed to create settlement database backup for ${matchId}`, error);
    }
  }, settlementBackupDelayMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
  settlementBackupTimers.set(matchId, timer);
}

async function listDatabaseBackups() {
  const result = await query(`
    select
      id,
      reason,
      match_count as "matchCount",
      vote_count as "voteCount",
      user_count as "userCount",
      octet_length(csv_content) as "byteSize",
      created_at as "createdAt",
      external_status as "externalStatus",
      external_provider as "externalProvider",
      external_bucket as "externalBucket",
      external_object_key as "externalObjectKey",
      external_url as "externalUrl",
      external_error as "externalError",
      external_uploaded_at as "externalUploadedAt"
    from database_backups
    order by created_at desc
    limit 90
  `);

  return result.rows.map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    externalUploadedAt: row.externalUploadedAt
      ? new Date(row.externalUploadedAt).toISOString()
      : null,
    byteSize: Number(row.byteSize),
  }));
}

async function ensureDailyBackup() {
  if (!pool || backupInProgress) return;

  const { dateKey, hour } = getTokyoDateParts();
  if (hour < backupHourJst) return;

  backupInProgress = true;
  let createdBackup = null;
  try {
    await withTransaction(async (client) => {
      const marker = await client.query(
        "select value from app_settings where key = $1 for update",
        ["last-daily-db-backup-jst"],
      );
      if (marker.rows[0]?.value === dateKey) return;

      createdBackup = await createDatabaseBackup("daily", client);
      await client.query(
        `
          insert into app_settings (key, value, updated_at)
          values ($1, $2, now())
          on conflict (key) do update set value = excluded.value, updated_at = now()
        `,
        ["last-daily-db-backup-jst", dateKey],
      );
      console.log(`Created daily database backup ${createdBackup.id} for ${dateKey}`);
    });
    if (createdBackup) {
      await syncBackupToExternalStorage(createdBackup.id);
    }
  } catch (error) {
    console.error("Failed to create daily database backup", error);
  } finally {
    backupInProgress = false;
  }
}

function startBackupScheduler() {
  if (!pool || backupTimer) return;
  backupTimer = setInterval(() => {
    ensureDailyBackup();
  }, backupCheckIntervalMs);
}

async function insertMatch(input, client = pool) {
  const match = validateMatch(input);
  await client.query(
    `
      insert into matches (
        id, title, stage, venue, starts_at, closes_at, question, notice, result_option_id, settled_at,
        handicap_option_id, handicap_points
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict (id) do update set
        title = excluded.title,
        stage = excluded.stage,
        venue = excluded.venue,
        starts_at = excluded.starts_at,
        closes_at = excluded.closes_at,
        question = excluded.question,
        notice = excluded.notice,
        handicap_option_id = excluded.handicap_option_id,
        handicap_points = excluded.handicap_points
    `,
    [
      match.id,
      match.title,
      match.stage,
      match.venue,
      match.startsAt,
      match.closesAt,
      match.question,
      match.notice,
      input.resultOptionId ?? null,
      input.settledAt ?? null,
      match.handicapOptionId || null,
      match.handicapPoints,
    ],
  );

  for (const [index, option] of match.options.entries()) {
    await client.query(
      `
        insert into match_options (id, match_id, label, sort_order)
        values ($1, $2, $3, $4)
        on conflict (id) do update set
          label = excluded.label,
          sort_order = excluded.sort_order
      `,
      [option.id, match.id, option.label, index],
    );
  }

  return match;
}

function normalizeOddsLabel(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[()（）+＋\d.\-−\s]/g, "")
    .trim();
}

function englishToJapaneseCountry(value) {
  const normalized = String(value ?? "").normalize("NFKC").toLowerCase().trim();
  return englishCountryToJapanese.get(normalized) ?? String(value ?? "").trim();
}

function cleanFixtureLabel(value) {
  return normalizeOddsLabel(
    String(value ?? "")
      .replace(/（[^）]*）/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/ハンデ.*$/g, ""),
  );
}

function parseBetChannelKickoff(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const isoLike = text.replace(/\//g, "-").replace(" ", "T");
  const parsed = new Date(`${isoLike}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseExternalOdds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isBetChannelDrawChoice(bet) {
  const values = [
    bet?.choice_name,
    bet?.choice_short_name,
    bet?.name,
    bet?.selection_name,
  ];
  return values.some((value) => {
    const normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();
    return normalized === "draw" || normalized === "x" || normalized === "引き分け" || normalized === "ドロー";
  });
}

function getBetChannelOdds(sourceMatch) {
  const sourceMatchId = String(sourceMatch?.id ?? sourceMatch?.match_id ?? "");
  const bets = Object.values(sourceMatch?.MatchBet ?? {})
    .filter(Boolean)
    .sort((a, b) => Number(a?.disp_order ?? 0) - Number(b?.disp_order ?? 0));
  const activeBets = bets.filter((bet) => bet?.is_enabled !== false && bet?.is_cancelled !== true);
  const drawBet = activeBets.find((bet) => isBetChannelDrawChoice(bet));
  const teamBets = activeBets.filter((bet) => !isBetChannelDrawChoice(bet));
  if (!sourceMatchId || teamBets.length < 2) return null;

  const homeLabel = englishToJapaneseCountry(teamBets[0]?.choice_name);
  const awayLabel = englishToJapaneseCountry(teamBets[1]?.choice_name);
  const kickoffAt = parseBetChannelKickoff(sourceMatch?.game_start_ts);
  return {
    sourceMatchId,
    sourceUrl: betChannelMatchesUrl,
    homeLabel,
    awayLabel,
    homeOdds: parseExternalOdds(teamBets[0]?.odds),
    drawOdds: parseExternalOdds(drawBet?.odds),
    awayOdds: parseExternalOdds(teamBets[1]?.odds),
    kickoffAt,
    raw: {
      id: sourceMatchId,
      name: sourceMatch?.name,
      gameStartTs: sourceMatch?.game_start_ts,
    },
  };
}

function doesLocalMatchFitExternal(localMatch, externalMatch) {
  const home = cleanFixtureLabel(externalMatch.homeLabel);
  const away = cleanFixtureLabel(externalMatch.awayLabel);
  if (!home || !away) return false;

  const localLabels = [
    localMatch.title,
    ...(localMatch.options ?? []).map((option) => option.label),
  ].map(cleanFixtureLabel);
  const hasTeams = localLabels.some((label) => label.includes(home))
    && localLabels.some((label) => label.includes(away));
  if (!hasTeams) return false;

  if (!localMatch.startsAt || !externalMatch.kickoffAt) return true;
  const localStart = new Date(localMatch.startsAt).getTime();
  const externalStart = externalMatch.kickoffAt.getTime();
  if (Number.isNaN(localStart) || Number.isNaN(externalStart)) return true;
  return Math.abs(localStart - externalStart) <= 36 * 60 * 60 * 1000;
}

async function loadLocalMatchesForExternalOdds() {
  const [matchesResult, optionsResult] = await Promise.all([
    query(`
      select id, title, starts_at as "startsAt"
      from matches
      where result_option_id is null
      order by starts_at asc, created_at asc
    `),
    query(`
      select id, match_id as "matchId", label
      from match_options
      order by sort_order asc, label asc
    `),
  ]);

  const optionsByMatch = new Map();
  for (const option of optionsResult.rows.filter(Boolean)) {
    const list = optionsByMatch.get(option.matchId) ?? [];
    list.push({ id: option.id, label: option.label });
    optionsByMatch.set(option.matchId, list);
  }

  return matchesResult.rows.filter(Boolean).map((match) => ({
    ...match,
    startsAt: match.startsAt ? new Date(match.startsAt).toISOString() : null,
    options: optionsByMatch.get(match.id) ?? [],
  }));
}

async function refreshExternalOdds(reason = "scheduled") {
  if (!pool || externalOddsInProgress) return;

  externalOddsInProgress = true;
  try {
    const response = await fetch(betChannelApiUrl, {
      headers: {
        accept: "application/json, text/plain, */*",
        referer: betChannelMatchesUrl,
        "user-agent": "Mozilla/5.0 compatible; wc2026-prediction/1.0",
        "x-requested-with": "XMLHttpRequest",
      },
    });
    if (!response.ok) {
      throw new Error(`BET CHANNEL responded ${response.status}`);
    }

    const payload = await response.json();
    const externalMatches = Object.values(payload ?? {}).map(getBetChannelOdds).filter(Boolean);
    const localMatches = await loadLocalMatchesForExternalOdds();
    let savedCount = 0;

    for (const externalMatch of externalMatches) {
      const localMatch = localMatches.find((candidate) => doesLocalMatchFitExternal(candidate, externalMatch));
      if (!localMatch) continue;
      await query(
        `
          insert into external_odds (
            id, match_id, source, source_match_id, source_url,
            home_label, away_label, home_odds, draw_odds, away_odds, fetched_at, raw
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), $11::jsonb)
          on conflict (source, source_match_id, match_id) do update set
            source_url = excluded.source_url,
            home_label = excluded.home_label,
            away_label = excluded.away_label,
            home_odds = excluded.home_odds,
            draw_odds = excluded.draw_odds,
            away_odds = excluded.away_odds,
            fetched_at = excluded.fetched_at,
            raw = excluded.raw
        `,
        [
          `bet-channel-${externalMatch.sourceMatchId}-${localMatch.id}`,
          localMatch.id,
          "BET CHANNEL",
          externalMatch.sourceMatchId,
          externalMatch.sourceUrl,
          externalMatch.homeLabel,
          externalMatch.awayLabel,
          externalMatch.homeOdds,
          externalMatch.drawOdds,
          externalMatch.awayOdds,
          JSON.stringify(externalMatch.raw),
        ],
      );
      savedCount += 1;
    }

    console.log(`Refreshed external odds (${reason}): ${savedCount} matches saved`);
  } catch (error) {
    console.warn("Failed to refresh external odds", error);
  } finally {
    externalOddsInProgress = false;
  }
}

function startExternalOddsScheduler() {
  if (!pool || externalOddsTimer) return;
  setTimeout(() => {
    refreshExternalOdds("startup");
  }, 15 * 1000);
  externalOddsTimer = setInterval(() => {
    refreshExternalOdds("scheduled");
  }, externalOddsRefreshIntervalMs);
}

function decodeXmlEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function readXmlTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXmlEntities(match[1].trim()) : "";
}

function readXmlAttribute(xml, tagName, attributeName) {
  const tagMatch = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "i"));
  if (!tagMatch) return "";
  const attributeMatch = tagMatch[0].match(new RegExp(`${attributeName}="([^"]*)"`, "i"));
  return attributeMatch ? decodeXmlEntities(attributeMatch[1].trim()) : "";
}

function readYoutubeEntryUrl(entry, videoId) {
  const linkMatch = entry.match(/<link\s+[^>]*rel="alternate"[^>]*href="([^"]+)"/i);
  return linkMatch
    ? decodeXmlEntities(linkMatch[1].trim())
    : `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function getYoutubeThumbnailCandidates(videoId) {
  const encodedVideoId = encodeURIComponent(videoId);
  return [...youtubeThumbnailQualities.entries()].map(([quality, filename]) => ({
    quality,
    url: `https://i.ytimg.com/vi/${encodedVideoId}/${filename}`,
    proxyUrl: `/api/youtube/thumbnail/${encodedVideoId}/${quality}`,
  }));
}

async function isUsableRemoteImage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 compatible; wc2026-prediction/1.0",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    return response.ok && contentType.toLowerCase().startsWith("image/");
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function selectYoutubeThumbnailUrl(videoId) {
  for (const candidate of getYoutubeThumbnailCandidates(videoId)) {
    if (await isUsableRemoteImage(candidate.url)) {
      return candidate.proxyUrl;
    }
  }
  return null;
}

function buildYoutubeVideoPayload({ videoId, title, url, publishedAt, updatedAt, thumbnailUrl }) {
  return {
    id: videoId,
    title: title || "DAZN Japan 最新動画",
    url,
    embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&playsinline=1`,
    thumbnailUrl,
    publishedAt: publishedAt || updatedAt || null,
    channelTitle: "DAZN Japan",
    sourceUrl: daznJapanVideosUrl,
    fetchedAt: new Date().toISOString(),
  };
}

async function parseYoutubeFeed(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  let fallbackVideo = null;

  for (const entry of entries) {
    const videoId = readXmlTag(entry, "yt:videoId");
    if (!videoId) continue;

    const url = readYoutubeEntryUrl(entry, videoId);
    if (/\/shorts\//i.test(url)) continue;

    const title = readXmlTag(entry, "title");
    const publishedAt = readXmlTag(entry, "published");
    const updatedAt = readXmlTag(entry, "updated");
    const thumbnailUrl = await selectYoutubeThumbnailUrl(videoId);
    const video = buildYoutubeVideoPayload({
      videoId,
      title,
      url,
      publishedAt,
      updatedAt,
      thumbnailUrl: thumbnailUrl || heroFallbackImageUrl,
    });

    if (thumbnailUrl) {
      return video;
    }
    fallbackVideo ??= video;
  }

  return fallbackVideo;
}

async function refreshYoutubeLatestVideo(reason = "scheduled") {
  if (youtubeLatestVideoInProgress) return youtubeLatestVideoCache;

  youtubeLatestVideoInProgress = true;
  try {
    const response = await fetch(youtubeFeedUrl, {
      headers: {
        accept: "application/atom+xml, application/xml, text/xml, */*",
        "user-agent": "Mozilla/5.0 compatible; wc2026-prediction/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`YouTube feed responded ${response.status}`);
    }

    const video = await parseYoutubeFeed(await response.text());
    if (!video) {
      throw new Error("No latest YouTube video found");
    }

    youtubeLatestVideoCache = video;
    youtubeLatestVideoFetchedAt = Date.now();
    console.log(`Refreshed YouTube latest video (${reason}): ${video.id}`);
    return youtubeLatestVideoCache;
  } catch (error) {
    console.warn("Failed to refresh YouTube latest video", error);
    return youtubeLatestVideoCache;
  } finally {
    youtubeLatestVideoInProgress = false;
  }
}

async function getYoutubeLatestVideo() {
  const cacheAge = Date.now() - youtubeLatestVideoFetchedAt;
  if (youtubeLatestVideoCache && cacheAge < youtubeRefreshIntervalMs) {
    return youtubeLatestVideoCache;
  }
  return refreshYoutubeLatestVideo("request");
}

function startYoutubeLatestVideoScheduler() {
  if (youtubeLatestVideoTimer) return;
  setTimeout(() => {
    refreshYoutubeLatestVideo("startup");
  }, 8 * 1000);
  youtubeLatestVideoTimer = setInterval(() => {
    refreshYoutubeLatestVideo("scheduled");
  }, youtubeRefreshIntervalMs);
}

async function getState() {
  const { dateKey } = getTokyoDateParts();
  const [
    matchesResult,
    optionsResult,
    votesResult,
    usersResult,
    userPointSnapshotsResult,
    pointAdjustmentsResult,
    externalOddsResult,
  ] = await Promise.all([
    query(`
      select
        id,
        title,
        stage,
        venue,
        starts_at as "startsAt",
        closes_at as "closesAt",
        question,
        notice,
        result_option_id as "resultOptionId",
        home_score::float as "homeScore",
        away_score::float as "awayScore",
        handicap_option_id as "handicapOptionId",
        handicap_points::float as "handicapPoints",
        settled_at as "settledAt"
      from matches
      order by starts_at asc, created_at asc
    `),
    query(`
      select id, match_id as "matchId", label
      from match_options
      order by sort_order asc, label asc
    `),
    query(`
      select
        id,
        match_id as "matchId",
        option_id as "optionId",
        user_name as "userName",
        amount::float as amount,
        created_at as "createdAt"
      from votes
      order by created_at desc
    `),
    query("select name from users order by name asc"),
    query(`
      select
        snapshot_date::text as "snapshotDate",
        user_name as "userName",
        settled_net::float as "settledNet",
        gross_payout::float as "grossPayout",
        updated_at as "updatedAt"
      from user_point_snapshots
      where snapshot_date = $1::date
      order by user_name asc
    `, [dateKey]),
    query(`
      select
        point_adjustment_entries.id,
        point_adjustments.id as "adjustmentId",
        point_adjustments.title,
        point_adjustments.reason,
        point_adjustment_entries.user_name as "userName",
        point_adjustment_entries.amount::float as amount,
        point_adjustments.created_at as "createdAt"
      from point_adjustment_entries
      join point_adjustments on point_adjustments.id = point_adjustment_entries.adjustment_id
      order by point_adjustments.created_at desc, point_adjustment_entries.sort_order asc
    `),
    query(`
      select distinct on (match_id)
        match_id as "matchId",
        source,
        source_url as "sourceUrl",
        home_label as "homeLabel",
        away_label as "awayLabel",
        home_odds::float as "homeOdds",
        draw_odds::float as "drawOdds",
        away_odds::float as "awayOdds",
        fetched_at as "fetchedAt"
      from external_odds
      order by match_id, (draw_odds is not null) desc, fetched_at desc
    `),
  ]);

  const optionsByMatch = new Map();
  for (const option of optionsResult.rows.filter(Boolean)) {
    if (!option.matchId) continue;
    const list = optionsByMatch.get(option.matchId) ?? [];
    list.push({ id: option.id, label: option.label });
    optionsByMatch.set(option.matchId, list);
  }

  const externalOddsByMatch = new Map();
  for (const odds of externalOddsResult.rows.filter(Boolean)) {
    externalOddsByMatch.set(odds.matchId, {
      source: odds.source,
      sourceUrl: odds.sourceUrl,
      homeLabel: odds.homeLabel,
      awayLabel: odds.awayLabel,
      homeOdds: odds.homeOdds == null ? undefined : Number(odds.homeOdds),
      drawOdds: odds.drawOdds == null ? undefined : Number(odds.drawOdds),
      awayOdds: odds.awayOdds == null ? undefined : Number(odds.awayOdds),
      fetchedAt: new Date(odds.fetchedAt).toISOString(),
    });
  }

  return {
    matches: matchesResult.rows.filter(Boolean).map((match) => ({
      ...match,
      startsAt: toIsoLike(match.startsAt),
      closesAt: toIsoLike(match.closesAt),
      settledAt: match.settledAt ? new Date(match.settledAt).toISOString() : undefined,
      resultOptionId: match.resultOptionId ?? undefined,
      homeScore: match.homeScore == null ? undefined : Number(match.homeScore),
      awayScore: match.awayScore == null ? undefined : Number(match.awayScore),
      handicapOptionId: match.handicapOptionId ?? undefined,
      handicapPoints: Number(match.handicapPoints ?? 0),
      options: optionsByMatch.get(match.id) ?? [],
      externalOdds: externalOddsByMatch.get(match.id) ?? undefined,
    })),
    votes: votesResult.rows.filter(Boolean).map((vote) => ({
      ...vote,
      createdAt: new Date(vote.createdAt).toISOString(),
    })),
    knownUsers: usersResult.rows.filter(Boolean).map((user) => user.name),
    userPointSnapshots: userPointSnapshotsResult.rows.filter(Boolean).map((row) => ({
      ...row,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    })),
    pointAdjustments: pointAdjustmentsResult.rows.filter(Boolean).map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
  };
}

function securityHeaders(_request, response, next) {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    isProduction ? "upgrade-insecure-requests" : "",
  ].filter(Boolean).join("; ");

  response.setHeader("Content-Security-Policy", csp);
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Origin-Agent-Cluster", "?1");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-DNS-Prefetch-Control", "off");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  response.setHeader(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  );

  if (isProduction) {
    response.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  next();
}

function noStoreApi(_request, response, next) {
  response.setHeader("Cache-Control", "no-store");
  next();
}

function getClientKey(request) {
  const forwardedFor = request.get("x-forwarded-for") ?? "";
  return forwardedFor.split(",")[0]?.trim() || request.ip || request.socket.remoteAddress || "unknown";
}

function createRateLimiter({ keyPrefix, windowMs, max, message }) {
  return (request, response, next) => {
    const now = Date.now();
    const clientKey = getClientKey(request);
    const key = `${keyPrefix}:${clientKey}`;
    const current = rateLimitStore.get(key);
    const record = current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };

    record.count += 1;
    rateLimitStore.set(key, record);

    if (rateLimitStore.size > 5000 || Math.random() < 0.01) {
      for (const [storeKey, value] of rateLimitStore.entries()) {
        if (value.resetAt <= now) rateLimitStore.delete(storeKey);
      }
    }

    response.setHeader("RateLimit-Limit", String(max));
    response.setHeader("RateLimit-Remaining", String(Math.max(0, max - record.count)));
    response.setHeader("RateLimit-Reset", String(Math.ceil(record.resetAt / 1000)));

    if (record.count > max) {
      response.status(429).json({ error: message });
      return;
    }

    next();
  };
}

const apiRateLimit = createRateLimiter({
  keyPrefix: "api",
  windowMs: 60 * 1000,
  max: 240,
  message: "アクセスが集中しています。少し時間を置いてから再度お試しください。",
});

const adminLoginRateLimit = createRateLimiter({
  keyPrefix: "admin-login",
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "認証の試行回数が多すぎます。しばらく待ってから再度お試しください。",
});

const voteRateLimit = createRateLimiter({
  keyPrefix: "vote",
  windowMs: 60 * 1000,
  max: 30,
  message: "投票の送信回数が多すぎます。少し時間を置いてから再度お試しください。",
});

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "1mb" }));
app.use("/api", noStoreApi, apiRateLimit);

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
  });
});

app.get("/api/state", async (_request, response, next) => {
  try {
    response.json(await getState());
  } catch (error) {
    next(error);
  }
});

app.get("/api/youtube/latest", async (request, response, next) => {
  try {
    const shouldRefresh = request.query.refresh === "1" || request.query.force === "1";
    const video = shouldRefresh ? await refreshYoutubeLatestVideo("manual") : await getYoutubeLatestVideo();
    response.json({
      video,
      refreshMinutes: Math.round(youtubeRefreshIntervalMs / 60 / 1000),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/youtube/thumbnail/:videoId/:quality", async (request, response, next) => {
  try {
    const { videoId, quality } = request.params;
    const filename = youtubeThumbnailQualities.get(quality);
    if (!filename || !/^[a-zA-Z0-9_-]{6,32}$/.test(videoId)) {
      response.status(404).end();
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const thumbnailResponse = await fetch(
        `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${filename}`,
        {
          signal: controller.signal,
          headers: {
            accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "user-agent": "Mozilla/5.0 compatible; wc2026-prediction/1.0",
          },
        },
      );
      const contentType = thumbnailResponse.headers.get("content-type") ?? "";
      if (!thumbnailResponse.ok || !contentType.toLowerCase().startsWith("image/")) {
        response.status(404).end();
        return;
      }

      const imageBuffer = Buffer.from(await thumbnailResponse.arrayBuffer());
      response.setHeader("Content-Type", contentType);
      response.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
      response.setHeader("Content-Length", String(imageBuffer.byteLength));
      response.send(imageBuffer);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    next(error);
  }
});

app.get("/api/scheduled-matches", async (_request, response, next) => {
  try {
    const existingMatches = await getMatchRegistrationRows();
    response.json({ matches: getAvailableScheduledMatches(existingMatches) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/scheduled-matches/:id", async (request, response, next) => {
  try {
    const scheduledMatch = scheduledGroupMatches.find((match) => match.id === request.params.id);
    if (!scheduledMatch) {
      response.status(404).json({ error: "Scheduled match not found" });
      return;
    }
    if (scheduledMatchDate(scheduledMatch) <= new Date()) {
      response.status(409).json({ error: "この試合はすでに締め切られています。" });
      return;
    }

    let match = null;
    await withTransaction(async (client) => {
      const existingMatches = await getMatchRegistrationRows(client);
      const isRegistered = existingMatches.some((existingMatch) =>
        isScheduledMatchRegistered(scheduledMatch, existingMatch),
      );
      if (isRegistered) {
        const error = new Error("この試合はすでに登録されています。");
        error.status = 409;
        throw error;
      }

      match = await insertMatch(makeScheduledMatchPayloadWithHandicap(scheduledMatch, request.body), client);
    });

    await writeAuditLog("scheduled-match.create", scheduledMatch.id, { title: scheduledMatch.title });
    response.status(201).json({
      match,
      matches: getAvailableScheduledMatches(await getMatchRegistrationRows()),
      state: await getState(),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", adminLoginRateLimit, (request, response) => {
  if (!requiresAdminAuth) {
    response.json({
      token: signAdminToken(Date.now() + 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    return;
  }

  if (!adminPassword || !adminSessionSecret) {
    response.status(503).json({
      error: "Admin authentication is not configured.",
    });
    return;
  }

  const body = request.body ?? {};
  const password = String(body.password ?? "");
  if (!password) {
    response.status(400).json({
      error: "Admin password is required",
    });
    return;
  }

  const passwordBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(adminPassword);
  const passwordMatches =
    passwordBuffer.length === expectedBuffer.length &&
    timingSafeEqual(passwordBuffer, expectedBuffer);

  if (!passwordMatches) {
    response.status(401).json({
      error: "Invalid admin password",
    });
    return;
  }

  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  response.json({
    token: signAdminToken(expiresAt),
    expiresAt: new Date(expiresAt).toISOString(),
  });
});

app.post("/api/matches", requireAdmin, async (request, response, next) => {
  try {
    const match = await insertMatch(request.body);
    await writeAuditLog("match.create", match.id, { title: match.title });
    response.status(201).json({ match, state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.put("/api/matches/:id", requireAdmin, async (request, response, next) => {
  try {
    const matchId = request.params.id;
    const match = validateMatch({ ...request.body, id: matchId });

    await withTransaction(async (client) => {
      const existingResult = await client.query("select id from matches where id = $1 for update", [
        matchId,
      ]);
      if (!existingResult.rowCount) {
        const error = new Error("Match not found");
        error.status = 404;
        throw error;
      }

      const optionResult = await client.query(
        `
          select
            match_options.id,
            match_options.label,
            count(votes.id)::int as "voteCount"
          from match_options
          left join votes on votes.option_id = match_options.id
          where match_options.match_id = $1
          group by match_options.id, match_options.label, match_options.sort_order
          order by match_options.sort_order asc
        `,
        [matchId],
      );
      const existingOptions = optionResult.rows;
      const votedOptions = existingOptions.filter((option) => option.voteCount > 0);

      for (const option of votedOptions) {
        const nextOption = match.options.find((item) => item.id === option.id);
        if (!nextOption || nextOption.label !== option.label) {
          const error = new Error(
            `Cannot remove or rename option with votes: ${option.label}`,
          );
          error.status = 409;
          throw error;
        }
      }

      await client.query(
        `
          update matches
          set title = $2,
              stage = $3,
              venue = $4,
              starts_at = $5,
              closes_at = $6,
              question = $7,
              notice = $8,
              handicap_option_id = $9,
              handicap_points = $10
          where id = $1
        `,
        [
          match.id,
          match.title,
          match.stage,
          match.venue,
          match.startsAt,
          match.closesAt,
          match.question,
          match.notice,
          match.handicapOptionId || null,
          match.handicapPoints,
        ],
      );

      for (const [index, option] of match.options.entries()) {
        await client.query(
          `
            insert into match_options (id, match_id, label, sort_order)
            values ($1, $2, $3, $4)
            on conflict (id) do update set
              label = excluded.label,
              sort_order = excluded.sort_order
          `,
          [option.id, match.id, option.label, index],
        );
      }

      const nextOptionIds = match.options.map((option) => option.id);
      await client.query(
        `
          delete from match_options
          where match_id = $1
            and not (id = any($2::text[]))
            and not exists (select 1 from votes where option_id = match_options.id)
        `,
        [matchId, nextOptionIds],
      );
    });

    await writeAuditLog("match.update", matchId, { title: match.title });
    response.json({ state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/matches/import", requireAdmin, async (request, response, next) => {
  try {
    const matches = Array.isArray(request.body.matches) ? request.body.matches : [];
    if (!matches.length) {
      response.status(400).json({ error: "No matches to import" });
      return;
    }

    await withTransaction(async (client) => {
      for (const match of matches) {
        await insertMatch(match, client);
      }
    });
    await writeAuditLog("match.import", null, { count: matches.length });

    response.status(201).json({ imported: matches.length, state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/votes", voteRateLimit, async (request, response, next) => {
  try {
    const body = request.body ?? {};
    const matchId = String(body.matchId ?? "");
    const optionId = String(body.optionId ?? "");
    const userName = normalizeName(body.userName);
    const amount = Number(body.amount);

    if (
      !matchId ||
      !optionId ||
      !userName ||
      !Number.isInteger(amount) ||
      amount < 100 ||
      amount > 1_000_000_000
    ) {
      response.status(400).json({ error: "Invalid vote payload" });
      return;
    }

    await withTransaction(async (client) => {
      const matchResult = await client.query(
        `
          select id, closes_at, result_option_id
          from matches
          where id = $1
          for update
        `,
        [matchId],
      );

      const match = matchResult.rows[0];
      if (!match) {
        const error = new Error("Match not found");
        error.status = 404;
        throw error;
      }

      if (match.result_option_id || new Date(match.closes_at).getTime() <= Date.now()) {
        const error = new Error("Voting is closed");
        error.status = 409;
        throw error;
      }

      const optionResult = await client.query(
        "select id from match_options where id = $1 and match_id = $2",
        [optionId, matchId],
      );
      if (!optionResult.rowCount) {
        const error = new Error("Option not found");
        error.status = 404;
        throw error;
      }

      await client.query(
        `
          insert into users (name, updated_at)
          values ($1, now())
          on conflict (name) do update set updated_at = now()
        `,
        [userName],
      );

      await client.query(
        `
          insert into votes (id, match_id, option_id, user_name, amount)
          values ($1, $2, $3, $4, $5)
        `,
        [createId("vote"), matchId, optionId, userName, amount],
      );
    });

    response.status(201).json({ state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/matches/:id/settle", requireAdmin, async (request, response, next) => {
  try {
    const matchId = request.params.id;
    const homeScore = request.body?.homeScore;
    const awayScore = request.body?.awayScore;
    const optionId = request.body?.optionId ? String(request.body.optionId) : "";
    const hasScoreInput = homeScore !== undefined || awayScore !== undefined;

    const settlement = await withTransaction(async (client) => {
      const matchResult = await client.query(
        `
          select id, title, handicap_option_id, handicap_points
          from matches
          where id = $1
        `,
        [matchId],
      );
      if (!matchResult.rowCount) return null;

      const optionsResult = await client.query(
        `
          select id, label
          from match_options
          where match_id = $1
          order by sort_order asc, label asc
        `,
        [matchId],
      );
      const decision = hasScoreInput
        ? deriveResultFromScores(
            matchResult.rows[0],
            optionsResult.rows,
            homeScore,
            awayScore,
          )
        : (() => {
            if (!optionId) {
              const error = new Error("Result option is required");
              error.status = 400;
              throw error;
            }
            const option = optionsResult.rows.find((item) => item.id === optionId);
            if (!option) {
              const error = new Error("Result option not found");
              error.status = 400;
              throw error;
            }
            return {
              resultOptionId: option.id,
              homeScore: null,
              awayScore: null,
            };
          })();

      await client.query(
        `
          update matches
          set
            result_option_id = $2,
            home_score = $3,
            away_score = $4,
            settled_at = now()
          where id = $1
        `,
        [matchId, decision.resultOptionId, decision.homeScore, decision.awayScore],
      );
      return decision;
    });

    if (!settlement) {
      response.status(404).json({ error: "Match not found" });
      return;
    }
    await writeAuditLog("match.settle", matchId, settlement);
    scheduleSettlementBackup(matchId);

    response.json({ state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/matches/:id/reopen", requireAdmin, async (request, response, next) => {
  try {
    await query(
      "update matches set result_option_id = null, home_score = null, away_score = null, settled_at = null where id = $1",
      [request.params.id],
    );
    await writeAuditLog("match.reopen", request.params.id);
    response.json({ state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/matches/:id", requireAdmin, async (request, response, next) => {
  try {
    const result = await query(
      `
        delete from matches
        where id = $1
          and not exists (select 1 from votes where match_id = $1)
        returning id
      `,
      [request.params.id],
    );
    if (!result.rowCount) {
      response.status(409).json({
        error: "Match cannot be deleted after votes have been submitted",
      });
      return;
    }
    await writeAuditLog("match.delete", request.params.id);
    response.json({ state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/votes/:id/cancel", voteRateLimit, async (request, response, next) => {
  try {
    const result = await query(
      `
        delete from votes
        using matches
        where votes.id = $1
          and votes.match_id = matches.id
          and matches.result_option_id is null
          and matches.closes_at > now()
          and votes.created_at > now() - interval '5 minutes'
          and not exists (
            select 1
            from votes later_votes
            where later_votes.match_id = votes.match_id
              and later_votes.id <> votes.id
              and later_votes.created_at > votes.created_at
          )
        returning votes.match_id as "matchId", votes.user_name as "userName", votes.amount::float as amount
      `,
      [request.params.id],
    );

    if (!result.rowCount) {
      response.status(409).json({
        error: "投票から5分経過したか、締切後、またはこの後に別の投票が入ったため削除できません",
      });
      return;
    }

    await writeAuditLog("vote.user_cancel", request.params.id, result.rows[0]);
    response.json({ state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/votes/:id", requireAdmin, async (request, response, next) => {
  try {
    const result = await query(
      `
        delete from votes
        using matches
        where votes.id = $1
          and votes.match_id = matches.id
          and matches.result_option_id is null
        returning match_id as "matchId", user_name as "userName", amount::float as amount
      `,
      [request.params.id],
    );

    if (!result.rowCount) {
      response.status(409).json({
        error: "Vote cannot be deleted after the match result is settled",
      });
      return;
    }

    await writeAuditLog("vote.delete", request.params.id, result.rows[0]);
    response.json({ state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/backups", requireAdmin, async (_request, response, next) => {
  try {
    response.json({
      backups: await listDatabaseBackups(),
      schedule: {
        timezone: "Asia/Tokyo",
        hour: backupHourJst,
        afterSettlementDelaySeconds: Math.round(settlementBackupDelayMs / 1000),
      },
      externalStorage: {
        configured: isExternalBackupStorageConfigured,
        provider: backupStorageEndpoint ? "s3-compatible" : "s3",
        bucket: backupStorageBucket || null,
        prefix: backupStoragePrefix,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/backups", requireAdmin, async (_request, response, next) => {
  try {
    const backup = await createDatabaseBackup("manual");
    await syncBackupToExternalStorage(backup.id);
    await writeAuditLog("backup.create", backup.id, {
      reason: backup.reason,
      matchCount: backup.matchCount,
      voteCount: backup.voteCount,
      userCount: backup.userCount,
    });
    response.status(201).json({
      backup,
      backups: await listDatabaseBackups(),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/backups/:id/external-sync", requireAdmin, async (request, response, next) => {
  try {
    const externalResult = await syncBackupToExternalStorage(request.params.id);
    await writeAuditLog("backup.external-sync", request.params.id, externalResult);
    response.json({
      externalResult,
      backups: await listDatabaseBackups(),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/point-adjustments", requireAdmin, async (request, response, next) => {
  try {
    const title = String(request.body?.title ?? "").trim();
    const reason = String(request.body?.reason ?? "").trim();
    const rawEntries = Array.isArray(request.body?.entries) ? request.body.entries : [];
    const entries = rawEntries
      .map((entry) => ({
        userName: normalizeName(entry?.userName),
        amount: Number(entry?.amount),
      }))
      .filter((entry) => entry.userName || Number.isFinite(entry.amount));

    if (!title || !reason) {
      response.status(400).json({ error: "Title and reason are required" });
      return;
    }

    if (entries.length < 2) {
      response.status(400).json({ error: "At least two adjustment entries are required" });
      return;
    }

    if (
      entries.some(
        (entry) =>
          !entry.userName ||
          !Number.isInteger(entry.amount) ||
          entry.amount === 0 ||
          Math.abs(entry.amount) > 1_000_000_000,
      )
    ) {
      response.status(400).json({ error: "Each adjustment needs a user name and non-zero integer amount" });
      return;
    }

    const userNames = entries.map((entry) => entry.userName);
    if (new Set(userNames).size !== userNames.length) {
      response.status(400).json({ error: "Duplicate users cannot be adjusted in one entry" });
      return;
    }

    const totalAmount = entries.reduce((sum, entry) => sum + entry.amount, 0);
    if (totalAmount !== 0) {
      response.status(400).json({ error: "Adjustment amounts must sum to zero" });
      return;
    }

    const adjustmentId = createId("adjustment");
    await withTransaction(async (client) => {
      const usersResult = await client.query(
        "select name from users where name = any($1::text[])",
        [userNames],
      );
      const existingUsers = new Set(usersResult.rows.map((row) => row.name));
      const missingUsers = userNames.filter((name) => !existingUsers.has(name));
      if (missingUsers.length) {
        const error = new Error(`Unknown user: ${missingUsers.join(", ")}`);
        error.status = 400;
        throw error;
      }

      await client.query(
        `
          insert into point_adjustments (id, title, reason)
          values ($1, $2, $3)
        `,
        [adjustmentId, title, reason],
      );

      for (const [index, entry] of entries.entries()) {
        await client.query(
          `
            insert into point_adjustment_entries (
              id, adjustment_id, user_name, amount, sort_order
            ) values ($1, $2, $3, $4, $5)
          `,
          [createId("adjustment-entry"), adjustmentId, entry.userName, entry.amount, index],
        );
      }
    });

    await refreshTodayUserPointSnapshots();
    await writeAuditLog("point-adjustment.create", adjustmentId, {
      title,
      reason,
      entries,
    });
    response.status(201).json({ state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/backups/:id/download", requireAdmin, async (request, response, next) => {
  try {
    const result = await query(
      `
        select id, csv_content, created_at
        from database_backups
        where id = $1
      `,
      [request.params.id],
    );
    const backup = result.rows[0];
    if (!backup) {
      response.status(404).json({ error: "Backup not found" });
      return;
    }

    const createdAt = new Date(backup.created_at).toISOString().replace(/[:.]/g, "-");
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="wc2026-prediction-backup-${createdAt}.csv"`,
    );
    response.send(`\uFEFF${backup.csv_content}`);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(distDir));
app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(distDir, "index.html"));
});

function getErrorDetails(error) {
  if (!exposeErrorDetails) return {};

  return Object.fromEntries(
    [
      ["name", error.name],
      ["code", error.code],
      ["detail", error.detail],
      ["hint", error.hint],
      ["table", error.table],
      ["column", error.column],
      ["constraint", error.constraint],
      ["routine", error.routine],
      ["where", error.where],
      ["stack", process.env.DEBUG_ERRORS === "true" ? error.stack : undefined],
    ].filter(([, value]) => Boolean(value)),
  );
}

app.use((error, request, response, _next) => {
  const status = error.status || 500;
  console.error(error);
  const details = getErrorDetails(error);
  const publicMessage = status >= 500 && !exposeErrorDetails
    ? "Internal server error"
    : error.message || "Internal server error";

  response.status(status).json({
    error: publicMessage,
    ...(exposeErrorDetails ? { path: request.originalUrl, method: request.method } : {}),
    ...(Object.keys(details).length ? { details } : {}),
  });
});

initializeDatabase()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`WC 2026 prediction app listening on ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
