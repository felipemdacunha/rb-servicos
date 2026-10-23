import type { Cell, Sheet } from "@shared/import";

/** Lê .xlsx (todas as abas) ou .csv no próprio navegador: o arquivo não é enviado inteiro ao servidor. */
export async function readSpreadsheet(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return [{ name: file.name, rows: parseCsv(await readText(file)) }];
  if (name.endsWith(".xls")) throw new Error("Arquivo .xls (Excel antigo). Abra no Excel e use Salvar como → Pasta de Trabalho do Excel (.xlsx).");
  if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm")) throw new Error("Use uma planilha .xlsx ou .csv.");

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("Não foi possível abrir a planilha. Confira se o arquivo não está corrompido ou protegido por senha.");
  }
  return workbook.worksheets.filter(ws => ws.state === "visible").map(ws => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = toCell(cell.value); });
      rows[rowNumber - 1] = cells;
    });
    return { name: ws.name, rows: Array.from(rows, r => r ?? []) };
  });
}

/** Fórmulas, links e textos formatados viram o valor que aparece na célula. */
function toCell(value: unknown): Cell {
  if (value == null) return null;
  if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    const v = value as { result?: unknown; text?: unknown; richText?: Array<{ text: string }>; error?: unknown };
    if ("result" in v) return toCell(v.result);
    if (v.richText) return v.richText.map(part => part.text).join("");
    if (v.text !== undefined) return toCell(v.text);
    if (v.error) return null;
  }
  return String(value);
}

/** Planilhas brasileiras salvas em CSV costumam vir em Windows-1252 e separadas por ";". */
async function readText(file: File) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

export function parseCsv(text: string): Cell[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const separator = [";", ",", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]!;
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === separator) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map(r => r.map(c => (typeof c === "string" ? c.replace(/^﻿/, "").trim() || null : c)));
}
