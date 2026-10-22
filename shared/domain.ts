/** Regras de negócio usadas pelo servidor e pelo navegador. Valores em centavos. */

export const SERVICE_TYPES = ["retirada", "assistencia", "instalacao"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  retirada: "Retirada",
  assistencia: "Assistência",
  instalacao: "Instalação",
};

export const STATUSES = ["agendada", "concluida"] as const;
export type OrderStatus = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<OrderStatus, string> = { agendada: "Agendada", concluida: "Concluída" };

export type Order = {
  id: number;
  /** AAAA-MM-DD */
  date: string;
  /** HH:MM (opcional) */
  time: string | null;
  vehicle: string;
  plate: string;
  serviceType: ServiceType;
  /** Valor do serviço em centavos. */
  serviceValue: number;
  /** Km rodados cobrados (ida e volta). */
  km: number;
  /** Valor do km em centavos, gravado na OS (mudar o preço depois não altera OS antigas). */
  kmRate: number;
  city: string | null;
  /** Número da OS / chamado da Localiza (opcional). */
  reference: string | null;
  notes: string | null;
  status: OrderStatus;
};

export type OrderInput = Omit<Order, "id">;

export type Settings = {
  prices: Record<ServiceType, number>;
  kmRate: number;
  company: {
    name: string;
    document: string;
    phone: string;
    email: string;
    city: string;
    client: string;
    pix: string;
  };
};

export const DEFAULT_SETTINGS: Settings = {
  prices: { retirada: 4000, assistencia: 8000, instalacao: 0 },
  kmRate: 200,
  company: { name: "R&B Serviços", document: "", phone: "", email: "", city: "Pelotas/RS", client: "Localiza", pix: "" },
};

export type User = { id: number; name: string; email: string };

export class ValidationError extends Error {}

export const kmValue = (order: Pick<Order, "km" | "kmRate">) => Math.round(order.km * order.kmRate);
export const orderTotal = (order: Pick<Order, "serviceValue" | "km" | "kmRate">) => order.serviceValue + kmValue(order);

export type MonthSummary = {
  byService: Array<{ type: ServiceType; label: string; count: number; total: number }>;
  count: number;
  km: number;
  kmTotal: number;
  servicesTotal: number;
  total: number;
  pending: number;
};

/** Fechamento: soma só as OS concluídas. */
export function summarize(orders: Order[]): MonthSummary {
  const done = orders.filter(o => o.status === "concluida");
  const byService = SERVICE_TYPES.map(type => {
    const list = done.filter(o => o.serviceType === type);
    return { type, label: SERVICE_LABELS[type], count: list.length, total: list.reduce((s, o) => s + o.serviceValue, 0) };
  });
  const km = done.reduce((s, o) => s + o.km, 0);
  const kmTotal = done.reduce((s, o) => s + kmValue(o), 0);
  const servicesTotal = byService.reduce((s, r) => s + r.total, 0);
  return { byService, count: done.length, km, kmTotal, servicesTotal, total: servicesTotal + kmTotal, pending: orders.length - done.length };
}

// ------------------------------------------------------------------ formatação

export const formatMoney = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const formatKm = (km: number) => `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;

/** "1.234,56" / "40" / "40,5" → centavos. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[R$\s]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

export const centsToInput = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23), sem traço e em maiúsculas. */
export const normalizePlate = (plate: string) => plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isValidPlate = (plate: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate);
export const formatPlate = (plate: string) => /^[A-Z]{3}[0-9]{4}$/.test(plate) ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
/** "2026-10" → "Outubro/2026" */
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]}/${month.slice(0, 4)}`;
/** "2026-10-22" → "22/10/2026" */
export const formatDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const weekday = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];

/** Hoje no fuso de São Paulo (AAAA-MM-DD), independente do relógio do servidor. */
export function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export const shiftMonth = (month: string, delta: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// ------------------------------------------------------------------ validação

const text = (value: unknown, max: number) => {
  const s = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return s.slice(0, max);
};
const optional = (value: unknown, max: number) => text(value, max) || null;

export function validateOrder(body: Record<string, unknown>): OrderInput {
  const date = text(body.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError("Informe a data do atendimento.");
  const time = optional(body.time, 5);
  if (time && !/^\d{2}:\d{2}$/.test(time)) throw new ValidationError("Horário inválido.");
  const vehicle = text(body.vehicle, 80);
  if (!vehicle) throw new ValidationError("Informe o veículo.");
  const plate = normalizePlate(text(body.plate, 10));
  if (!isValidPlate(plate)) throw new ValidationError("Placa inválida. Use o formato ABC1234 ou ABC1D23.");
  const serviceType = body.serviceType as ServiceType;
  if (!SERVICE_TYPES.includes(serviceType)) throw new ValidationError("Escolha o tipo de serviço.");
  const status = (STATUSES.includes(body.status as OrderStatus) ? body.status : "agendada") as OrderStatus;
  const serviceValue = Number(body.serviceValue);
  if (!Number.isInteger(serviceValue) || serviceValue < 0 || serviceValue > 10_000_000) throw new ValidationError("Valor do serviço inválido.");
  const km = Math.round(Number(body.km ?? 0) * 10) / 10;
  if (!Number.isFinite(km) || km < 0 || km > 5000) throw new ValidationError("Km inválido.");
  const kmRate = Number(body.kmRate);
  if (!Number.isInteger(kmRate) || kmRate < 0 || kmRate > 100_000) throw new ValidationError("Valor do km inválido.");
  return { date, time, vehicle, plate, serviceType, serviceValue, km, kmRate, city: optional(body.city, 60), reference: optional(body.reference, 40), notes: optional(body.notes, 500), status };
}

export function validateSettings(body: Record<string, unknown>): Settings {
  const prices = (body.prices ?? {}) as Record<string, unknown>;
  const money = (v: unknown) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 10_000_000) throw new ValidationError("Valor inválido.");
    return n;
  };
  const company = (body.company ?? {}) as Record<string, unknown>;
  return {
    prices: { retirada: money(prices.retirada), assistencia: money(prices.assistencia), instalacao: money(prices.instalacao) },
    kmRate: money(body.kmRate),
    company: {
      name: text(company.name, 80) || DEFAULT_SETTINGS.company.name,
      document: text(company.document, 30),
      phone: text(company.phone, 30),
      email: text(company.email, 80),
      city: text(company.city, 60),
      client: text(company.client, 80) || DEFAULT_SETTINGS.company.client,
      pix: text(company.pix, 80),
    },
  };
}
