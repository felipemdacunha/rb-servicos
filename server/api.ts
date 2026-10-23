import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { DEFAULT_SETTINGS, ValidationError, validateOrder, validateSettings, type Order, type Settings, type User } from "@shared/domain";
import type { Db, Row } from "./db";

const COOKIE = "rb_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias: é um app de uso pessoal no celular

// ------------------------------------------------------------------ senha e sessão

function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  return timingSafeEqual(expected, scryptSync(password, Buffer.from(salt, "hex"), expected.length));
}
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** Limite simples de tentativas de login por IP (10 a cada 15 min). */
const attempts = new Map<string, { count: number; until: number }>();
function tooManyAttempts(ip: string) {
  const entry = attempts.get(ip);
  return Boolean(entry && entry.until > Date.now() && entry.count >= 10);
}
function failedAttempt(ip: string) {
  const entry = attempts.get(ip);
  if (!entry || entry.until < Date.now()) attempts.set(ip, { count: 1, until: Date.now() + 15 * 60_000 });
  else entry.count++;
}

// ------------------------------------------------------------------ mapeamento

const mapOrder = (r: Row): Order => ({
  id: Number(r.id),
  date: String(r.date),
  time: r.time == null ? null : String(r.time),
  vehicle: String(r.vehicle),
  plate: String(r.plate),
  serviceType: r.serviceType as Order["serviceType"],
  serviceValue: Number(r.serviceValue),
  km: Number(r.km),
  kmRate: Number(r.kmRate),
  city: r.city == null ? null : String(r.city),
  reference: r.reference == null ? null : String(r.reference),
  notes: r.notes == null ? null : String(r.notes),
  status: r.status as Order["status"],
});

async function loadSettings(db: Db): Promise<Settings> {
  const row = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'app'");
  if (!row) return DEFAULT_SETTINGS;
  try {
    const saved = JSON.parse(row.value) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved, prices: { ...DEFAULT_SETTINGS.prices, ...saved.prices }, company: { ...DEFAULT_SETTINGS.company, ...saved.company } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ------------------------------------------------------------------ rotas

type AuthedRequest = Request & { user?: User };

export function createApi(db: Db, options: { secureCookies: boolean }) {
  const api = express.Router();
  api.use(express.json({ limit: "3mb" })); // importação de planilha manda até alguns milhares de OS
  // Gravações só com JSON: um formulário de outro site não consegue enviar (proteção contra CSRF).
  // DELETE não tem corpo e um formulário de outro site não consegue fazer DELETE.
  api.use((req, res, next) => {
    if ((req.method === "POST" || req.method === "PUT") && !req.is("application/json")) return res.status(415).json({ error: "Envie os dados em JSON." });
    next();
  });

  const setSession = async (res: Response, userId: number) => {
    const token = randomBytes(32).toString("base64url");
    await db.run("DELETE FROM sessions WHERE expiresAt < ?", Date.now());
    await db.run("INSERT INTO sessions (tokenHash, userId, expiresAt) VALUES (?, ?, ?)", sha256(token), userId, Date.now() + SESSION_TTL_MS);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: options.secureCookies, maxAge: SESSION_TTL_MS, path: "/" });
  };

  const currentUser = async (req: Request): Promise<User | null> => {
    const token = readCookie(req, COOKIE);
    if (!token) return null;
    const row = await db.get("SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.userId WHERE s.tokenHash = ? AND s.expiresAt > ?", sha256(token), Date.now());
    return row ? { id: Number(row.id), name: String(row.name), email: String(row.email) } : null;
  };

  const wrap = (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

  api.get("/health", (_req, res) => res.json({ ok: true }));

  api.get("/auth/me", wrap(async (req, res) => {
    const user = await currentUser(req);
    const count = Number((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users"))?.n ?? 0);
    res.json({ user, needsSetup: count === 0 });
  }));

  // Primeiro acesso: cria o único usuário (o consultor).
  api.post("/auth/setup", wrap(async (req, res) => {
    const count = Number((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users"))?.n ?? 0);
    if (count > 0) return res.status(409).json({ error: "O acesso já foi criado. Entre com seu e-mail e senha." });
    const name = String(req.body.name ?? "").trim();
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Informe nome e um e-mail válido." });
    if (password.length < 6) return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres." });
    const result = await db.run("INSERT INTO users (name, email, passwordHash, createdAt) VALUES (?, ?, ?, ?)", name, email, hashPassword(password), Date.now());
    await setSession(res, result.lastInsertRowid);
    res.json({ ok: true });
  }));

  api.post("/auth/login", wrap(async (req, res) => {
    const ip = req.ip ?? "?";
    if (tooManyAttempts(ip)) return res.status(429).json({ error: "Muitas tentativas. Aguarde 15 minutos." });
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const row = await db.get("SELECT id, passwordHash FROM users WHERE email = ?", email);
    if (!row || !verifyPassword(String(req.body.password ?? ""), String(row.passwordHash))) {
      failedAttempt(ip);
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    }
    await setSession(res, Number(row.id));
    res.json({ ok: true });
  }));

  api.post("/auth/logout", wrap(async (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) await db.run("DELETE FROM sessions WHERE tokenHash = ?", sha256(token));
    res.clearCookie(COOKIE, { path: "/" });
    res.json({ ok: true });
  }));

  // Daqui para baixo, só com login.
  api.use((req: AuthedRequest, res, next) => {
    currentUser(req).then(user => {
      if (!user) return res.status(401).json({ error: "Sessão expirada. Entre novamente." });
      req.user = user;
      next();
    }, next);
  });

  api.put("/auth/password", wrap(async (req, res) => {
    const row = await db.get("SELECT passwordHash FROM users WHERE id = ?", req.user!.id);
    if (!row || !verifyPassword(String(req.body.current ?? ""), String(row.passwordHash))) return res.status(400).json({ error: "Senha atual incorreta." });
    const password = String(req.body.password ?? "");
    if (password.length < 6) return res.status(400).json({ error: "A nova senha precisa ter pelo menos 6 caracteres." });
    await db.run("UPDATE users SET passwordHash = ? WHERE id = ?", hashPassword(password), req.user!.id);
    res.json({ ok: true });
  }));

  api.get("/settings", wrap(async (_req, res) => res.json(await loadSettings(db))));
  api.put("/settings", wrap(async (req, res) => {
    const settings = validateSettings(req.body);
    await db.run("INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(settings));
    res.json(settings);
  }));

  api.get("/orders", wrap(async (req, res) => {
    const month = String(req.query.month ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Mês inválido." });
    const rows = await db.all("SELECT * FROM orders WHERE date LIKE ? ORDER BY date, COALESCE(time, '99:99'), id", `${month}-%`);
    res.json(rows.map(mapOrder));
  }));

  /** Cidades já atendidas e o último km cobrado para cada uma (preenche o km sozinho). */
  api.get("/cities", wrap(async (_req, res) => {
    const rows = await db.all<{ city: string; km: number }>(
      `SELECT city, km FROM orders o WHERE city IS NOT NULL AND km > 0 AND id = (
         SELECT id FROM orders WHERE city = o.city COLLATE NOCASE AND km > 0 ORDER BY date DESC, id DESC LIMIT 1)
       ORDER BY city`);
    res.json(rows.map(r => ({ city: String(r.city), km: Number(r.km) })));
  }));

  api.post("/orders", wrap(async (req, res) => {
    const o = validateOrder(req.body);
    const now = Date.now();
    const result = await db.run(
      `INSERT INTO orders (date, time, vehicle, plate, serviceType, serviceValue, km, kmRate, city, reference, notes, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      o.date, o.time, o.vehicle, o.plate, o.serviceType, o.serviceValue, o.km, o.kmRate, o.city, o.reference, o.notes, o.status, now, now);
    res.json(mapOrder((await db.get("SELECT * FROM orders WHERE id = ?", result.lastInsertRowid))!));
  }));

  /**
   * Importação de planilha. Pula OS que já existem (mesma data, placa e tipo), inclusive repetidas na própria planilha:
   * importar o mesmo arquivo duas vezes não duplica nada.
   */
  api.post("/orders/import", wrap(async (req, res) => {
    const list = Array.isArray(req.body.orders) ? req.body.orders as Record<string, unknown>[] : [];
    if (!list.length) return res.status(400).json({ error: "Nenhuma OS para importar." });
    if (list.length > 5000) return res.status(400).json({ error: "Planilha grande demais: importe no máximo 5.000 OS por vez." });
    const orders = list.map((item, i) => {
      try {
        return validateOrder(item);
      } catch (error) {
        throw new ValidationError(`OS ${i + 1}: ${error instanceof Error ? error.message : "inválida"}`);
      }
    });
    const dates = orders.map(o => o.date).sort();
    const existing = await db.all<{ date: string; plate: string; serviceType: string }>(
      "SELECT date, plate, serviceType FROM orders WHERE date BETWEEN ? AND ?", dates[0]!, dates[dates.length - 1]!);
    const seen = new Set(existing.map(o => `${o.date}|${o.plate}|${o.serviceType}`));
    const now = Date.now();
    const statements = [];
    for (const o of orders) {
      const key = `${o.date}|${o.plate}|${o.serviceType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      statements.push({
        sql: `INSERT INTO orders (date, time, vehicle, plate, serviceType, serviceValue, km, kmRate, city, reference, notes, status, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [o.date, o.time, o.vehicle, o.plate, o.serviceType, o.serviceValue, o.km, o.kmRate, o.city, o.reference, o.notes, o.status, now, now],
      });
    }
    await db.batch(statements);
    res.json({ inserted: statements.length, skipped: orders.length - statements.length });
  }));

  api.put("/orders/:id", wrap(async (req, res) => {
    const o = validateOrder(req.body);
    const result = await db.run(
      `UPDATE orders SET date = ?, time = ?, vehicle = ?, plate = ?, serviceType = ?, serviceValue = ?, km = ?, kmRate = ?, city = ?, reference = ?, notes = ?, status = ?, updatedAt = ?
       WHERE id = ?`,
      o.date, o.time, o.vehicle, o.plate, o.serviceType, o.serviceValue, o.km, o.kmRate, o.city, o.reference, o.notes, o.status, Date.now(), Number(req.params.id));
    if (!result.changes) return res.status(404).json({ error: "Ordem de serviço não encontrada." });
    res.json(mapOrder((await db.get("SELECT * FROM orders WHERE id = ?", Number(req.params.id)))!));
  }));

  api.delete("/orders/:id", wrap(async (req, res) => {
    await db.run("DELETE FROM orders WHERE id = ?", Number(req.params.id));
    res.json({ ok: true });
  }));

  api.use((_req: Request, res: Response) => res.status(404).json({ error: "Rota não encontrada." }));
  api.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: "Erro interno. Tente de novo." });
  });
  return api;
}
