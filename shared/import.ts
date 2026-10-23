/**
 * Importação de planilha: acha as colunas úteis numa planilha qualquer (com outras informações misturadas),
 * converte cada linha numa OS e diz o que está errado em cada linha que não deu.
 */
import { normalizePlate, parseMoney, SERVICE_LABELS, validateOrder, ValidationError, type OrderInput, type OrderStatus, type ServiceType, type Settings } from "./domain";

export type Cell = string | number | boolean | Date | null;
export type Sheet = { name: string; rows: Cell[][] };

export const IMPORT_FIELDS = ["date", "plate", "vehicle", "serviceType", "km", "city", "serviceValue", "reference", "time", "notes"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type Mapping = Partial<Record<ImportField, number>>;

export const FIELD_LABELS: Record<ImportField, string> = {
  date: "Data", plate: "Placa", vehicle: "Veículo", serviceType: "Tipo de serviço", km: "Km rodado", city: "Cidade",
  serviceValue: "Valor", reference: "Nº da OS", time: "Horário", notes: "Observações",
};
export const REQUIRED_FIELDS: ImportField[] = ["date", "plate"];

/**
 * Nomes de coluna aceitos para cada campo, do mais provável ao menos provável.
 * `avoid`: colunas com estas palavras nunca são usadas para o campo (ex.: km inicial/final é hodômetro, não km rodado).
 */
const SYNONYMS: Record<ImportField, { names: string[]; avoid?: string[] }> = {
  date: { names: ["data atendimento", "data do atendimento", "data servico", "data do servico", "data execucao", "data conclusao", "data", "dia", "dt"], avoid: ["nascimento", "cadastro", "criacao", "vencimento", "pagamento", "nf", "nota", "emissao"] },
  plate: { names: ["placa", "placa veiculo", "placa do veiculo", "placas"], avoid: ["antiga"] },
  vehicle: { names: ["veiculo", "modelo", "modelo veiculo", "modelo do veiculo", "carro", "marca modelo", "marca/modelo", "automovel", "descricao veiculo"], avoid: ["placa", "ano", "cor", "chassi", "renavam"] },
  serviceType: { names: ["tipo servico", "tipo de servico", "servico", "tipo", "atividade", "tipo atendimento", "tipo de atendimento", "atendimento", "operacao", "motivo"], avoid: ["valor", "data", "km", "status", "situacao", "veiculo", "pagamento", "cliente"] },
  km: { names: ["km rodado", "km rodados", "km", "kms", "quilometragem", "quilometros", "distancia", "km total", "deslocamento km"], avoid: ["inicial", "final", "hodometro", "odometro", "valor", "r$", "preco", "veiculo"] },
  city: { names: ["cidade", "municipio", "local", "localidade", "destino", "cidade atendimento"], avoid: ["uf", "estado", "cep"] },
  serviceValue: { names: ["valor servico", "valor do servico", "valor", "valor total", "total", "preco", "valor r$", "r$", "valor cobrado"], avoid: ["km", "deslocamento", "nf", "nota", "fipe"] },
  reference: { names: ["os", "n os", "no os", "numero os", "num os", "ordem servico", "ordem de servico", "chamado", "protocolo", "ticket", "pedido", "n chamado"], avoid: ["data", "status", "tipo", "valor"] },
  time: { names: ["horario", "hora", "hora atendimento"], avoid: ["data"] },
  notes: { names: ["observacao", "observacoes", "obs", "comentario", "comentarios", "detalhes"] },
};

/** "Data do Atendimento" → "data do atendimento" (sem acento, sem pontuação, minúsculo). */
export function normalizeHeader(value: Cell) {
  return cellText(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[º°ª#.:_\-()]/g, " ").replace(/\bn\s+o\b/g, "n").replace(/\s+/g, " ").trim();
}

export function cellText(value: Cell): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function fieldScore(field: ImportField, header: string) {
  if (!header) return 0;
  const { names, avoid = [] } = SYNONYMS[field];
  if (avoid.some(word => header.includes(word))) return 0;
  let best = 0;
  names.forEach((name, index) => {
    const words = header.split(" ");
    const score = header === name ? 100 - index
      : (name.includes(" ") ? header.includes(name) : words.includes(name)) ? 60 - index
      : 0;
    best = Math.max(best, score);
  });
  return best;
}

/** Liga cada campo à melhor coluna (uma coluna serve para um campo só). */
export function guessMapping(header: Cell[]): Mapping {
  const normalized = header.map(normalizeHeader);
  const candidates: Array<{ field: ImportField; column: number; score: number }> = [];
  for (const field of IMPORT_FIELDS) normalized.forEach((h, column) => {
    const score = fieldScore(field, h);
    if (score) candidates.push({ field, column, score });
  });
  candidates.sort((a, b) => b.score - a.score);
  const mapping: Mapping = {};
  const used = new Set<number>();
  for (const c of candidates) {
    if (mapping[c.field] !== undefined || used.has(c.column)) continue;
    mapping[c.field] = c.column;
    used.add(c.column);
  }
  return mapping;
}

/** A linha de títulos nem sempre é a primeira (planilhas com título, logo, linhas em branco): procura nas 20 primeiras. */
export function findHeaderRow(rows: Cell[][]) {
  let best = { index: -1, score: 0 };
  rows.slice(0, 20).forEach((row, index) => {
    const mapping = guessMapping(row);
    const score = Object.keys(mapping).length + (mapping.date !== undefined ? 2 : 0) + (mapping.plate !== undefined ? 3 : 0);
    if (score > best.score) best = { index, score };
  });
  return best.score >= 4 ? best.index : -1;
}

/** Escolhe a aba com mais cara de lista de serviços. */
export function analyzeSheets(sheets: Sheet[]) {
  return sheets.map(sheet => {
    const headerRow = findHeaderRow(sheet.rows);
    const mapping = headerRow >= 0 ? guessMapping(sheet.rows[headerRow]!) : {};
    const dataRows = headerRow >= 0 ? sheet.rows.slice(headerRow + 1).filter(r => r.some(c => cellText(c))).length : 0;
    return { ...sheet, headerRow, mapping, dataRows, score: Object.keys(mapping).length * 1000 + dataRows };
  }).sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------------ conversão de valores

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** Datas do Excel (data, número de série) ou texto (22/10/2026, 22/10/26, 2026-10-22, 22.10.2026, com ou sem hora). */
export function parseDate(value: Cell): { date: string; time: string | null } | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const time = value.getUTCHours() || value.getUTCMinutes() ? `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}` : null;
    const date = isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    return date ? { date, time } : null;
  }
  if (typeof value === "number") {
    if (value < 20000 || value > 80000) return null; // número de série do Excel (1954–2119)
    return parseDate(new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000)));
  }
  const text = cellText(value);
  const timeMatch = text.match(/(\d{1,2})[:h](\d{2})/);
  const time = timeMatch ? `${pad(Number(timeMatch[1]))}:${timeMatch[2]}` : null;
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) { const date = isoDate(Number(m[1]), Number(m[2]), Number(m[3])); return date ? { date, time } : null; }
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const date = isoDate(year, Number(m[2]), Number(m[1]));
    return date ? { date, time } : null;
  }
  return null;
}

export function parseTime(value: Cell): string | null {
  if (value instanceof Date) return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  if (typeof value === "number" && value >= 0 && value < 1) {
    const minutes = Math.round(value * 1440);
    return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
  }
  const m = cellText(value).match(/^(\d{1,2})(?:[:h](\d{2}))?/);
  return m && Number(m[1]) < 24 ? `${pad(Number(m[1]))}:${m[2] ?? "00"}` : null;
}

/** "Retirada de rastreador", "ASSIST. TÉCNICA", "Instalação" → tipo. Vazio = null; texto desconhecido = "desconhecido". */
export function parseServiceType(value: Cell): ServiceType | null | "desconhecido" {
  const text = normalizeHeader(value);
  if (!text) return null;
  if (/retir|remoc|desinstal/.test(text)) return "retirada";
  if (/instal/.test(text)) return "instalacao";
  if (/assist|manut|suporte|revis|reparo|verific|vistoria|atendimento tecnico/.test(text)) return "assistencia";
  return "desconhecido";
}

/** Dinheiro: número da célula (40) ou texto ("R$ 40,00", "1.250,50"). Em centavos. */
export function parseMoneyCell(value: Cell): number | null {
  if (typeof value === "number") return value >= 0 ? Math.round(value * 100) : null;
  const text = cellText(value);
  if (!text) return null;
  return parseMoney(text.replace(/[^\d,.-]/g, ""));
}

export function parseKm(value: Cell): number | null {
  if (typeof value === "number") return value >= 0 ? Math.round(value * 10) / 10 : null;
  const text = cellText(value).replace(/km/i, "").trim();
  if (!text) return null;
  const number = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 10) / 10 : null;
}

// ------------------------------------------------------------------ linhas → OS

export type ImportOptions = {
  /** Tipo usado quando a linha não tem tipo (ou a planilha não tem a coluna). */
  defaultType: ServiceType | null;
  /** O valor da planilha já soma o km: tira o deslocamento para achar o valor do serviço. */
  valueIncludesKm: boolean;
  status: OrderStatus;
};

export type ImportRow = { line: number; order?: OrderInput; error?: string; raw: string[] };

export function buildOrders(rows: Cell[][], headerRow: number, mapping: Mapping, options: ImportOptions, settings: Settings): ImportRow[] {
  const get = (row: Cell[], field: ImportField) => (mapping[field] === undefined ? null : row[mapping[field]!] ?? null);
  const result: ImportRow[] = [];
  rows.slice(headerRow + 1).forEach((row, i) => {
    const line = headerRow + i + 2; // número da linha como aparece no Excel
    if (!row.some(c => cellText(c))) return; // linha em branco
    const raw = IMPORT_FIELDS.map(f => cellText(get(row, f)));
    // Linha de total/rodapé (sem data e sem placa): ignora sem acusar erro.
    if (!cellText(get(row, "date")) && !cellText(get(row, "plate"))) return;
    try {
      const parsedDate = parseDate(get(row, "date"));
      if (!parsedDate) throw new ValidationError(`Data inválida: "${cellText(get(row, "date")) || "vazia"}"`);
      const plate = normalizePlate(cellText(get(row, "plate")));
      if (!plate) throw new ValidationError("Sem placa");

      const typeValue = parseServiceType(get(row, "serviceType"));
      if (typeValue === "desconhecido") throw new ValidationError(`Tipo de serviço não reconhecido: "${cellText(get(row, "serviceType"))}"`);
      const serviceType = typeValue ?? options.defaultType;
      if (!serviceType) throw new ValidationError("Sem tipo de serviço (escolha um tipo padrão)");

      const km = parseKm(get(row, "km")) ?? 0;
      const kmRate = settings.kmRate;
      let serviceValue = mapping.serviceValue === undefined ? null : parseMoneyCell(get(row, "serviceValue"));
      if (serviceValue != null && options.valueIncludesKm) serviceValue -= Math.round(km * kmRate);
      // Sem valor na planilha: usa a tabela de preços (instalação não tem preço fixo).
      if (serviceValue == null) serviceValue = settings.prices[serviceType] || null;
      if (serviceValue == null) throw new ValidationError(`Sem valor (${SERVICE_LABELS[serviceType]} não tem preço fixo)`);
      if (serviceValue < 0) throw new ValidationError("Valor menor que o deslocamento (confira a opção \"valor inclui km\")");

      const timeCell = get(row, "time");
      const order = validateOrder({
        date: parsedDate.date,
        time: (timeCell != null && cellText(timeCell) ? parseTime(timeCell) : null) ?? parsedDate.time,
        vehicle: cellText(get(row, "vehicle")) || "Não informado",
        plate,
        serviceType,
        serviceValue,
        km,
        kmRate,
        city: cellText(get(row, "city")) || null,
        reference: cellText(get(row, "reference")) || null,
        notes: cellText(get(row, "notes")) || null,
        status: options.status,
      });
      result.push({ line, order, raw });
    } catch (error) {
      result.push({ line, raw, error: error instanceof Error ? error.message : "Linha inválida" });
    }
  });
  return result;
}
