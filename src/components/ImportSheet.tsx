import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { formatDate, formatKm, formatMoney, formatPlate, monthLabel, orderTotal, SERVICE_LABELS, SERVICE_TYPES, type OrderStatus, type ServiceType } from "@shared/domain";
import { analyzeSheets, buildOrders, cellText, FIELD_LABELS, IMPORT_FIELDS, REQUIRED_FIELDS, type ImportField, type Mapping, type Sheet as SheetData } from "@shared/import";
import { api, useAction, useSettings } from "../api";
import { readSpreadsheet } from "../lib/spreadsheet";
import { Button, cx, Sheet } from "./ui";

type Analyzed = ReturnType<typeof analyzeSheets>[number];
const columnLetter = (i: number): string => (i >= 26 ? columnLetter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
const selectClass = "h-10 w-full appearance-none rounded-lg border border-line bg-surface px-2.5 text-base sm:text-sm focus:border-brand focus:outline-none";

/** Importar planilha: escolhe o arquivo, confere as colunas encontradas e a prévia, e grava. */
export function ImportSheet({ onClose, onImported }: { onClose: () => void; onImported: (month: string) => void }) {
  const settings = useSettings();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Analyzed[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [defaultType, setDefaultType] = useState<ServiceType | "">("");
  const [valueIncludesKm, setValueIncludesKm] = useState(false);
  const [status, setStatus] = useState<OrderStatus>("concluida");
  const [view, setView] = useState<"ok" | "erro">("ok");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [dragging, setDragging] = useState(false);

  function chooseSheet(list: Analyzed[], index: number) {
    const sheet = list[index]!;
    setSheetIndex(index);
    setHeaderRow(Math.max(0, sheet.headerRow));
    setMapping(sheet.mapping);
  }

  async function openFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setReadError("");
    try {
      const raw: SheetData[] = await readSpreadsheet(file);
      const analyzed = analyzeSheets(raw).filter(s => s.rows.length);
      if (!analyzed.length) throw new Error("A planilha está vazia.");
      setFileName(file.name);
      setSheets(analyzed);
      chooseSheet(analyzed, 0);
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    } finally {
      setReading(false);
    }
  }

  const sheet = sheets[sheetIndex];
  const header = sheet?.rows[headerRow] ?? [];
  const columnCount = Math.max(header.length, ...(sheet?.rows.slice(headerRow, headerRow + 30).map(r => r.length) ?? [0]));
  const rows = useMemo(() => sheet ? buildOrders(sheet.rows, headerRow, mapping, { defaultType: defaultType || null, valueIncludesKm, status }, settings) : [],
    [sheet, headerRow, mapping, defaultType, valueIncludesKm, status, settings]);
  const ready = rows.filter(r => r.order);
  const problems = rows.filter(r => r.error);
  const total = ready.reduce((sum, r) => sum + orderTotal(r.order!), 0);
  const months = [...new Set(ready.map(r => r.order!.date.slice(0, 7)))].sort();
  const missing = REQUIRED_FIELDS.filter(f => mapping[f] === undefined);
  const needsDefaultType = mapping.serviceType === undefined && !defaultType;

  const save = useAction(() => api<{ inserted: number; skipped: number }>("POST", "/orders/import", { orders: ready.map(r => r.order) }));
  function confirm() {
    save.mutate(undefined, {
      onSuccess: result => {
        toast.success(`${result.inserted} OS importada(s).${result.skipped ? ` ${result.skipped} já existiam e foram puladas.` : ""}`, { duration: 8000 });
        onImported(months[months.length - 1] ?? "");
        onClose();
      },
    });
  }

  function setField(field: ImportField, value: string) {
    setMapping(current => {
      const next = { ...current };
      // Uma coluna serve um campo só: tira de onde estava.
      if (value !== "") for (const f of IMPORT_FIELDS) if (next[f] === Number(value)) delete next[f];
      if (value === "") delete next[field]; else next[field] = Number(value);
      return next;
    });
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void openFile(e.dataTransfer.files[0]);
  };

  return <Sheet wide title="Importar planilha" onClose={onClose} footer={sheet && <div className="flex items-center gap-3">
    <div className="mr-auto min-w-0 leading-tight">
      <p className="text-xs font-bold text-muted uppercase">{ready.length} OS prontas</p>
      <p className="tabular truncate text-lg font-extrabold">{formatMoney(total)}</p>
    </div>
    <div className="hidden sm:block"><Button variant="outline" onClick={() => { setSheets([]); setFileName(""); }}>Trocar arquivo</Button></div>
    <Button icon={Upload} loading={save.isPending} disabled={!ready.length || missing.length > 0} onClick={confirm}>Importar {ready.length}</Button>
  </div>}>
    {!sheet ? <div className="space-y-4">
      <label onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
        className={cx("flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center", dragging ? "border-brand bg-brand-tint" : "border-line hover:bg-canvas")}>
        {reading ? <Loader2 className="h-10 w-10 animate-spin text-brand" /> : <FileSpreadsheet className="h-10 w-10 text-brand" />}
        <span className="text-base font-extrabold">{reading ? "Lendo a planilha…" : "Escolher planilha"}</span>
        <span className="text-sm text-muted">Excel (.xlsx) ou .csv · pode ter outras colunas e abas, o app procura só o que precisa</span>
        <input ref={input} type="file" accept=".xlsx,.xlsm,.csv,.xls,.txt" className="sr-only" onChange={e => { void openFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {readError && <p className="flex items-start gap-2 rounded-xl bg-brand-tint p-3 text-sm font-semibold text-brand-dark"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{readError}</p>}
      <div className="rounded-xl bg-canvas p-4 text-sm text-muted">
        <p className="font-bold text-ink">O que o app procura</p>
        <p className="mt-1"><b>Obrigatórios:</b> data e placa. <b>Opcionais:</b> veículo, tipo de serviço, km rodado, cidade, valor, nº da OS, horário e observações.</p>
        <p className="mt-1">Sem coluna de valor, usa a tabela de preços. OS que já existem (mesma data, placa e serviço) não são duplicadas.</p>
      </div>
    </div> : <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 font-bold"><FileSpreadsheet className="h-4 w-4 shrink-0 text-ok" /><span className="truncate">{fileName}</span>
          <button className="text-xs font-bold text-brand-dark underline sm:hidden" onClick={() => { setSheets([]); setFileName(""); }}>trocar</button></span>
        {sheets.length > 1 && <label className="flex items-center gap-2">
          <span className="text-muted">Aba</span>
          <select className={cx(selectClass, "w-auto")} value={sheetIndex} onChange={e => chooseSheet(sheets, Number(e.target.value))}>
            {sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
          </select>
        </label>}
        <label className="flex items-center gap-2">
          <span className="text-muted">Títulos na linha</span>
          <select className={cx(selectClass, "w-auto")} value={headerRow} onChange={e => { const row = Number(e.target.value); setHeaderRow(row); }}>
            {sheet.rows.slice(0, 20).map((r, i) => <option key={i} value={i}>{i + 1}{r.some(c => cellText(c)) ? ` · ${r.map(cellText).filter(Boolean).slice(0, 3).join(", ").slice(0, 40)}` : " (vazia)"}</option>)}
          </select>
        </label>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-extrabold">Colunas encontradas <span className="font-normal text-muted">· confira e ajuste se precisar</span></h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {IMPORT_FIELDS.map(field => {
            const mapped = mapping[field] !== undefined;
            const required = REQUIRED_FIELDS.includes(field);
            return <label key={field} className={cx("min-w-0 rounded-xl border p-2.5", mapped ? "border-ok/40 bg-ok-tint/50" : required ? "border-brand bg-brand-tint" : "border-line")}>
              <span className="mb-1 flex items-center gap-1 text-xs font-bold text-muted uppercase">
                {mapped && <Check className="h-3.5 w-3.5 text-ok" />}{FIELD_LABELS[field]}{required && " *"}
              </span>
              <select className={selectClass} value={mapping[field] ?? ""} onChange={e => setField(field, e.target.value)}>
                <option value="">— não tem —</option>
                {Array.from({ length: columnCount }, (_, i) => <option key={i} value={i}>{columnLetter(i)} · {cellText(header[i] ?? null).slice(0, 30) || "(sem título)"}</option>)}
              </select>
            </label>;
          })}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <label className={cx("rounded-xl border p-3", needsDefaultType ? "border-brand bg-brand-tint" : "border-line")}>
          <span className="mb-1 block text-xs font-bold text-muted uppercase">Tipo quando a linha não diz</span>
          <select className={selectClass} value={defaultType} onChange={e => setDefaultType(e.target.value as ServiceType | "")}>
            <option value="">— escolher —</option>
            {SERVICE_TYPES.map(t => <option key={t} value={t}>{SERVICE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="rounded-xl border border-line p-3">
          <span className="mb-1 block text-xs font-bold text-muted uppercase">Situação das OS</span>
          <select className={selectClass} value={status} onChange={e => setStatus(e.target.value as OrderStatus)}>
            <option value="concluida">Concluídas (entram no fechamento)</option>
            <option value="agendada">Agendadas</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-brand)]" checked={valueIncludesKm} onChange={e => setValueIncludesKm(e.target.checked)} />
          <span><span className="block text-sm font-bold">O valor já inclui o km</span><span className="block text-xs text-muted">Marque se a coluna de valor é o total (serviço + deslocamento).</span></span>
        </label>
      </section>

      {missing.length > 0 && <p className="flex items-start gap-2 rounded-xl bg-brand-tint p-3 text-sm font-semibold text-brand-dark">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Não achei a coluna de {missing.map(f => FIELD_LABELS[f].toLowerCase()).join(" e ")}. Escolha acima qual coluna é.
      </p>}

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-black/5 p-1">
            <button onClick={() => setView("ok")} className={cx("h-9 rounded-lg px-3 text-sm font-bold", view === "ok" ? "bg-surface shadow-sm" : "text-muted")}>Prontas ({ready.length})</button>
            <button onClick={() => setView("erro")} className={cx("h-9 rounded-lg px-3 text-sm font-bold", view === "erro" ? "bg-surface shadow-sm" : "text-muted", problems.length > 0 && "text-brand-dark")}>Com problema ({problems.length})</button>
          </div>
          {months.length > 0 && <span className="text-xs text-muted">Meses: {months.map(monthLabel).join(", ")}</span>}
        </div>

        {view === "ok" ? <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas text-left text-xs text-muted uppercase">
              <tr><th className="px-3 py-2">Linha</th><th className="px-3 py-2">Data</th><th className="px-3 py-2">Placa</th><th className="px-3 py-2">Veículo</th><th className="px-3 py-2">Serviço</th><th className="px-3 py-2">Cidade · km</th><th className="px-3 py-2 text-right">Total</th></tr>
            </thead>
            <tbody className="tabular divide-y divide-line">
              {ready.slice(0, 200).map(({ line, order: o }) => <tr key={line}>
                <td className="px-3 py-2 text-muted">{line}</td>
                <td className="px-3 py-2">{formatDate(o!.date)}{o!.time && <span className="text-muted"> {o!.time}</span>}</td>
                <td className="px-3 py-2 font-bold">{formatPlate(o!.plate)}</td>
                <td className="max-w-40 truncate px-3 py-2">{o!.vehicle}</td>
                <td className="px-3 py-2">{SERVICE_LABELS[o!.serviceType]}</td>
                <td className="px-3 py-2 text-muted">{[o!.city, o!.km ? formatKm(o!.km) : null].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-3 py-2 text-right font-bold">{formatMoney(orderTotal(o!))}</td>
              </tr>)}
              {!ready.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">Nenhuma linha pronta ainda. Confira as colunas acima.</td></tr>}
            </tbody>
          </table>
          {ready.length > 200 && <p className="border-t border-line px-3 py-2 text-xs text-muted">Mostrando 200 de {ready.length}. Todas serão importadas.</p>}
        </div> : <div className="overflow-hidden rounded-xl border border-line">
          {problems.length ? <ul className="divide-y divide-line text-sm">
            {problems.slice(0, 200).map(p => <li key={p.line} className="flex gap-3 px-3 py-2">
              <span className="w-14 shrink-0 text-muted">Linha {p.line}</span>
              <span className="font-semibold text-brand-dark">{p.error}</span>
            </li>)}
          </ul> : <p className="px-3 py-8 text-center text-sm text-muted">Nenhum problema. 👍</p>}
          {problems.length > 0 && <p className="border-t border-line bg-canvas px-3 py-2 text-xs text-muted">Essas linhas ficam de fora. Dá para corrigir na planilha e importar de novo: as que já entraram não duplicam.</p>}
        </div>}
      </section>
    </div>}
  </Sheet>;
}
