import { Check, Clock, FileSpreadsheet, Loader2, MapPin, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate, formatKm, formatMoney, formatPlate, normalizePlate, orderTotal, SERVICE_LABELS, summarize, today, weekday, type Order } from "@shared/domain";
import { api, useAction, useOrders } from "../api";
import { ImportSheet } from "../components/ImportSheet";
import { InstallCard } from "../components/InstallCard";
import { OrderForm } from "../components/OrderForm";
import { Button, Card, cx, MonthPicker, ServiceBadge, StatusBadge } from "../components/ui";

type Filter = "todas" | "agendada" | "concluida";

export function AgendaPage({ month, setMonth, openNew }: { month: string; setMonth: (m: string) => void; openNew?: boolean }) {
  const orders = useOrders(month);
  const [filter, setFilter] = useState<Filter>("todas");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Order | "new" | null>(openNew ? "new" : null);
  const [importing, setImporting] = useState(false);
  const list = orders.data ?? [];
  const summary = summarize(list);
  const todayDate = today();

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const plateQ = normalizePlate(q);
    return list.filter(o => (filter === "todas" || o.status === filter)
      && (!q || o.vehicle.toLowerCase().includes(q) || (plateQ && o.plate.includes(plateQ)) || (o.city ?? "").toLowerCase().includes(q) || (o.reference ?? "").toLowerCase().includes(q)));
  }, [list, filter, search]);

  const byDay = useMemo(() => {
    const groups = new Map<string, Order[]>();
    for (const o of visible) groups.set(o.date, [...(groups.get(o.date) ?? []), o]);
    return [...groups.entries()];
  }, [visible]);

  const complete = useAction((o: Order) => api("PUT", `/orders/${o.id}`, { ...o, status: "concluida" }), "Serviço concluído.");

  return <div className="space-y-5">
    <InstallCard compact />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <MonthPicker month={month} onChange={setMonth} />
      <div className="flex gap-2">
        <Button variant="outline" icon={FileSpreadsheet} onClick={() => setImporting(true)}><span className="hidden sm:inline">Importar planilha</span><span className="sm:hidden">Importar</span></Button>
        <div className="hidden sm:block"><Button icon={Plus} onClick={() => setEditing("new")}>Nova OS</Button></div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
      <Stat label="A receber" value={formatMoney(summary.total)} strong />
      <Stat label="Concluídas" value={String(summary.count)} />
      <Stat label="Agendadas" value={String(summary.pending)} />
      <Stat label="Km rodados" value={formatKm(summary.km)} />
    </div>

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex gap-1 rounded-xl bg-black/5 p-1">
        {(["todas", "agendada", "concluida"] as Filter[]).map(f => <button key={f} onClick={() => setFilter(f)} className={cx("h-9 flex-1 rounded-lg px-4 text-sm font-bold sm:flex-none", filter === f ? "bg-surface shadow-sm" : "text-muted")}>
          {f === "todas" ? "Todas" : f === "agendada" ? "Agendadas" : "Concluídas"}
        </button>)}
      </div>
      <label className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar placa, veículo, cidade…" type="search" enterKeyHint="search" className="h-11 w-full appearance-none rounded-xl border border-line bg-surface pr-3 pl-9 text-base focus:border-brand focus:outline-none" />
      </label>
    </div>

    {orders.isPending ? <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
      : !byDay.length ? <Card className="px-6 py-14 text-center">
        <p className="font-extrabold">Nenhuma OS {list.length ? "com esse filtro" : "neste mês"}.</p>
        <p className="mt-1 text-sm text-muted">Toque em “Nova OS” para cadastrar um atendimento.</p>
      </Card>
      : <div className="space-y-5">
        {byDay.map(([date, items]) => <section key={date} className="reveal">
          <h3 className="mb-2 flex items-baseline gap-2 px-1">
            <span className="text-sm font-extrabold">{formatDate(date)}</span>
            <span className="text-xs font-semibold text-muted">{weekday(date)}</span>
            {date === todayDate && <span className="rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-extrabold text-white uppercase">Hoje</span>}
          </h3>
          <div className="grid gap-2 lg:grid-cols-2 lg:gap-3 2xl:grid-cols-3">
            {items.map(o => <OrderCard key={o.id} order={o} onOpen={() => setEditing(o)} onComplete={() => complete.mutate(o)} busy={complete.isPending && complete.variables?.id === o.id} />)}
          </div>
        </section>)}
      </div>}

    {/* Botão flutuante no celular. */}
    <button onClick={() => setEditing("new")} aria-label="Nova OS" className="above-nav no-select fixed right-4 z-20 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white shadow-xl shadow-brand/30 sm:hidden">
      <Plus className="h-7 w-7" />
    </button>

    {importing && <ImportSheet onClose={() => setImporting(false)} onImported={m => { if (m) setMonth(m); }} />}
    {editing && <OrderForm initial={editing === "new" ? undefined : editing} defaultDate={month === todayDate.slice(0, 7) ? todayDate : `${month}-01`} onClose={() => setEditing(null)} />}
  </div>;
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={cx("rounded-2xl p-4", strong ? "bg-night text-white" : "border border-line bg-surface")}>
    <p className={cx("text-xs font-bold uppercase", strong ? "text-white/60" : "text-muted")}>{label}</p>
    <p className={cx("tabular mt-1 text-xl font-extrabold", strong && "text-white")}>{value}</p>
    {strong && <div className="mt-2 h-1 w-10 rounded-full bg-brand" />}
  </div>;
}

function OrderCard({ order: o, onOpen, onComplete, busy }: { order: Order; onOpen: () => void; onComplete: () => void; busy: boolean }) {
  return <Card className="flex items-stretch overflow-hidden">
    <button onClick={onOpen} className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5 text-left hover:bg-canvas">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border-2 border-ink px-1.5 font-mono text-sm font-extrabold tracking-wider">{formatPlate(o.plate)}</span>
        <ServiceBadge type={o.serviceType} label={SERVICE_LABELS[o.serviceType]} />
        <StatusBadge status={o.status} />
      </div>
      <p className="truncate text-[15px] font-bold">{o.vehicle}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {o.time && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{o.time}</span>}
        {o.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{o.city}</span>}
        {o.km > 0 && <span>{formatKm(o.km)}</span>}
        {o.reference && <span>OS {o.reference}</span>}
      </p>
    </button>
    <div className="flex flex-col items-end justify-between border-l border-line p-3">
      <span className="tabular text-base font-extrabold">{formatMoney(orderTotal(o))}</span>
      {o.status === "agendada" && <Button size="sm" variant="success" icon={Check} loading={busy} onClick={onComplete}>Concluir</Button>}
    </div>
  </Card>;
}
