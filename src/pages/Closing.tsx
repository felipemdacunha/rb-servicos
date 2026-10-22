import { AlertTriangle, FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatDate, formatKm, formatMoney, formatPlate, kmValue, monthLabel, orderTotal, SERVICE_LABELS, summarize } from "@shared/domain";
import { useOrders, useSettings } from "../api";
import { Button, Card, MonthPicker } from "../components/ui";

export function ClosingPage({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const orders = useOrders(month);
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const list = orders.data ?? [];
  const done = list.filter(o => o.status === "concluida");
  const summary = summarize(list);

  async function generate() {
    setBusy(true);
    try {
      const { downloadClosingPdf } = await import("../lib/pdf");
      await downloadClosingPdf({ month, orders: done, settings });
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <MonthPicker month={month} onChange={setMonth} />
      <div className="hidden sm:block"><Button icon={FileDown} loading={busy} disabled={!done.length} onClick={() => void generate()}>Gerar PDF</Button></div>
    </div>

    <div className="relative overflow-hidden rounded-3xl bg-night p-6 text-white">
      <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-brand/25 blur-2xl" />
      <p className="text-xs font-bold tracking-wide text-white/60 uppercase">Total a receber · {monthLabel(month)}</p>
      <p className="tabular mt-1 text-4xl font-extrabold">{formatMoney(summary.total)}</p>
      <p className="mt-2 text-sm text-white/70">{summary.count} serviço(s) concluído(s) para {settings.company.client}</p>
      <div className="mt-4 h-1 w-14 rounded-full bg-brand" />
    </div>

    {summary.pending > 0 && <div className="flex items-start gap-3 rounded-2xl border border-wait/30 bg-wait-tint p-4 text-sm text-wait">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <p><b>{summary.pending} OS ainda agendada(s)</b> neste mês. Elas só entram no fechamento depois de marcadas como concluídas.</p>
    </div>}

    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-canvas text-left text-xs text-muted uppercase">
          <tr><th className="px-4 py-3">Serviço</th><th className="px-2 py-3 text-right">Qtd.</th><th className="px-4 py-3 text-right">Total</th></tr>
        </thead>
        <tbody className="tabular divide-y divide-line">
          {summary.byService.map(row => <tr key={row.type}>
            <td className="px-4 py-3 font-semibold">{row.label}</td>
            <td className="px-2 py-3 text-right">{row.count}</td>
            <td className="px-4 py-3 text-right font-bold">{formatMoney(row.total)}</td>
          </tr>)}
          <tr>
            <td className="px-4 py-3 font-semibold">Deslocamento <span className="text-xs font-normal text-muted">({formatKm(summary.km)})</span></td>
            <td className="px-2 py-3 text-right">—</td>
            <td className="px-4 py-3 text-right font-bold">{formatMoney(summary.kmTotal)}</td>
          </tr>
          <tr className="bg-night text-white">
            <td className="px-4 py-3.5 font-extrabold" colSpan={2}>TOTAL A RECEBER</td>
            <td className="px-4 py-3.5 text-right text-base font-extrabold">{formatMoney(summary.total)}</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <section>
      <h3 className="mb-2 px-1 text-sm font-extrabold">Serviços concluídos</h3>
      {orders.isPending ? <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
        : !done.length ? <Card className="px-6 py-10 text-center text-sm text-muted">Nenhum serviço concluído neste mês.</Card>
        : <Card className="divide-y divide-line">
          {done.map(o => <div key={o.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="w-11 text-xs font-bold text-muted">{formatDate(o.date).slice(0, 5)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{formatPlate(o.plate)} · {o.vehicle}</p>
              <p className="text-xs text-muted">{SERVICE_LABELS[o.serviceType]}{o.km > 0 && ` · ${formatKm(o.km)} (${formatMoney(kmValue(o))})`}{o.city && ` · ${o.city}`}</p>
            </div>
            <span className="tabular font-extrabold">{formatMoney(orderTotal(o))}</span>
          </div>)}
        </Card>}
    </section>

    <div className="h-16 sm:hidden" />
    <div className="safe-bottom fixed inset-x-0 bottom-16 z-20 px-4 pb-3 sm:hidden">
      <Button size="lg" className="w-full shadow-xl shadow-brand/30" icon={FileDown} loading={busy} disabled={!done.length} onClick={() => void generate()}>Gerar PDF do mês</Button>
    </div>
  </div>;
}
