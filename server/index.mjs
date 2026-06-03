import express from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const launchSeedKey = "seed:world-cup-winner-2026-06-12-v1";
const publicLaunchClearKey = "reset:public-launch-clear-2026-06-01-v1";
const worldCupWinnerOptions = [
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

const launchMatches = [
  {
    id: "world-cup-winner-2026",
    title: "ワールドカップ優勝国",
    stage: "",
    venue: "",
    startsAt: "2026-06-12T04:00",
    closesAt: "2026-06-12T04:00",
    question: "",
    options: worldCupWinnerOptions.map((label, index) => ({
      id: `winner-${String(index + 1).padStart(2, "0")}`,
      label,
    })),
  },
];

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
    })
  : null;

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
  const options = Array.isArray(input.options) ? input.options : [];

  if (!title || !startsAt || !closesAt || options.length < 2 || options.length > 80) {
    const error = new Error("Invalid match payload");
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
    options: options.map((option, index) => ({
      id: String(option.id ?? createId(`option-${index + 1}`)),
      label: clampText(option.label, 80),
    })).filter((option) => option.label),
  };
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
  `);

  await seedLaunchDataOnce();
  await clearLaunchDataOnce();
}

async function clearLaunchDataOnce() {
  const marker = await query("select value from app_settings where key = $1", [publicLaunchClearKey]);
  if (marker.rowCount) return;

  await withTransaction(async (client) => {
    await client.query("delete from votes");
    await client.query("delete from users");
    await client.query("delete from matches");
    await client.query(
      `
        insert into app_settings (key, value, updated_at)
        values ($1, $2, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `,
      [publicLaunchClearKey, "done"],
    );
  });
}

async function seedLaunchDataOnce() {
  const marker = await query("select value from app_settings where key = $1", [launchSeedKey]);
  if (marker.rowCount) return;

  await withTransaction(async (client) => {
    await client.query("delete from votes");
    await client.query("delete from users");
    await client.query("delete from matches");

    for (const match of launchMatches) {
      await insertMatch(match, client);
    }

    await client.query(
      `
        insert into app_settings (key, value, updated_at)
        values ($1, $2, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `,
      [launchSeedKey, "done"],
    );
  });
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

async function insertMatch(input, client = pool) {
  const match = validateMatch(input);
  await client.query(
    `
      insert into matches (
        id, title, stage, venue, starts_at, closes_at, question, result_option_id, settled_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      on conflict (id) do update set
        title = excluded.title,
        stage = excluded.stage,
        venue = excluded.venue,
        starts_at = excluded.starts_at,
        closes_at = excluded.closes_at,
        question = excluded.question
    `,
    [
      match.id,
      match.title,
      match.stage,
      match.venue,
      match.startsAt,
      match.closesAt,
      match.question,
      input.resultOptionId ?? null,
      input.settledAt ?? null,
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

async function getState() {
  const [matchesResult, optionsResult, votesResult, usersResult] = await Promise.all([
    query(`
      select
        id,
        title,
        stage,
        venue,
        starts_at as "startsAt",
        closes_at as "closesAt",
        question,
        result_option_id as "resultOptionId",
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
  ]);

  const optionsByMatch = new Map();
  for (const option of optionsResult.rows.filter(Boolean)) {
    if (!option.matchId) continue;
    const list = optionsByMatch.get(option.matchId) ?? [];
    list.push({ id: option.id, label: option.label });
    optionsByMatch.set(option.matchId, list);
  }

  return {
    matches: matchesResult.rows.filter(Boolean).map((match) => ({
      ...match,
      startsAt: toIsoLike(match.startsAt),
      closesAt: toIsoLike(match.closesAt),
      settledAt: match.settledAt ? new Date(match.settledAt).toISOString() : undefined,
      resultOptionId: match.resultOptionId ?? undefined,
      options: optionsByMatch.get(match.id) ?? [],
    })),
    votes: votesResult.rows.filter(Boolean).map((vote) => ({
      ...vote,
      createdAt: new Date(vote.createdAt).toISOString(),
    })),
    knownUsers: usersResult.rows.filter(Boolean).map((user) => user.name),
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
              question = $7
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
    const optionId = String(request.body.optionId ?? "");
    if (!optionId) {
      response.status(400).json({ error: "optionId is required" });
      return;
    }

    const result = await query(
      `
        update matches
        set result_option_id = $2, settled_at = now()
        where id = $1
          and exists (select 1 from match_options where id = $2 and match_id = $1)
      `,
      [matchId, optionId],
    );
    if (!result.rowCount) {
      response.status(404).json({ error: "Match or option not found" });
      return;
    }
    await writeAuditLog("match.settle", matchId, { optionId });

    response.json({ state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/matches/:id/reopen", requireAdmin, async (request, response, next) => {
  try {
    await query(
      "update matches set result_option_id = null, settled_at = null where id = $1",
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
