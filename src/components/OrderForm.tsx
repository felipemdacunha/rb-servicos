import { Check, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  centsToInput, formatKm, formatMoney, normalizePlate, orderTotal, parseMoney, SERVICE_LABELS, SERVICE_TYPES, today,
  type Order, type OrderInput, type OrderStatus, type ServiceType,
} from "@shared/domain";
import { api, useAction, useCities, useSettings } from "../api";
import { Button, cx, Field, Input, Sheet, Textarea } from "./ui";

/** Formulário de nova OS / edição. `initial` com id = edição. */
export function OrderForm({ initial, defaultDate, onClose }: { initial?: Order; defaultDate?: string; onClose: () => void }) {
  const settings = useSettings();
  const cities = useCities();
  const editing = Boolean(initial);
  const [form, setForm] = useState(() => ({
    date: initial?.date ?? defaultDate ?? today(),
    time: initial?.time ?? "",
    vehicle: initial?.vehicle ?? "",
    plate: initial?.plate ?? "",
    serviceType: (initial?.serviceType ?? "retirada") as ServiceType,
    serviceValue: initial ? centsToInput(initial.serviceValue) : centsToInput(settings.prices.retirada),
    km: initial?.km ? String(initial.km).replace(".", ",") : "",
    city: initial?.city ?? "",
    reference: initial?.reference ?? "",
    notes: initial?.notes ?? "",
    status: (initial?.status ?? "agendada") as OrderStatus,
  }));
  const kmRate = initial?.kmRate ?? settings.kmRate;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(f => ({ ...f, [key]: value }));

  const km = Number(form.km.replace(",", ".")) || 0;
  const serviceValue = parseMoney(form.serviceValue);
  const total = orderTotal({ serviceValue: serviceValue ?? 0, km, kmRate });

  function chooseService(type: ServiceType) {
    // Troca o valor pelo preço da tabela (instalação fica em branco: valor a combinar).
    setForm(f => ({ ...f, serviceType: type, serviceValue: settings.prices[type] ? centsToInput(settings.prices[type]) : "" }));
  }
  function chooseCity(city: string) {
    const known = cities.find(c => c.city.toLowerCase() === city.trim().toLowerCase());
    setForm(f => ({ ...f, city, km: known && !f.km ? String(known.km).replace(".", ",") : f.km }));
  }

  const save = useAction((input: OrderInput) => editing ? api("PUT", `/orders/${initial!.id}`, input) : api("POST", "/orders", input), editing ? "OS atualizada." : "OS cadastrada.");
  const remove = useAction(() => api("DELETE", `/orders/${initial!.id}`), "OS excluída.");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (serviceValue == null) return void document.getElementById("valor-servico")?.focus();
    save.mutate({
      date: form.date, time: form.time || null, vehicle: form.vehicle, plate: form.plate, serviceType: form.serviceType,
      serviceValue, km, kmRate, city: form.city || null, reference: form.reference || null, notes: form.notes || null, status: form.status,
    }, { onSuccess: onClose });
  }

  return <Sheet title={editing ? "Editar ordem de serviço" : "Nova ordem de serviço"} onClose={onClose} footer={
    <div className="flex items-center gap-3">
      <div className="mr-auto leading-tight">
        <p className="text-xs font-bold text-muted uppercase">Total da OS</p>
        <p className="tabular text-xl font-extrabold">{formatMoney(total)}</p>
      </div>
      {editing && <Button variant="danger" icon={Trash2} aria-label="Excluir" loading={remove.isPending}
        onClick={() => { if (confirm("Excluir esta ordem de serviço?")) remove.mutate(undefined, { onSuccess: onClose }); }} />}
      <Button type="submit" form="order-form" loading={save.isPending}>Salvar</Button>
    </div>}>
    <form id="order-form" onSubmit={submit} className="space-y-4">
      <div>
        <p className="mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Tipo de serviço</p>
        <div className="grid grid-cols-3 gap-2">
          {SERVICE_TYPES.map(type => <button key={type} type="button" onClick={() => chooseService(type)} className={cx(
            "rounded-xl border px-2 py-2.5 text-left",
            form.serviceType === type ? "border-brand bg-brand-tint ring-2 ring-brand/20" : "border-line bg-surface hover:bg-canvas")}>
            <span className="block text-sm font-extrabold">{SERVICE_LABELS[type]}</span>
            <span className="tabular block text-xs text-muted">{settings.prices[type] ? formatMoney(settings.prices[type]) : "a combinar"}</span>
          </button>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">{id => <Input id={id} type="date" value={form.date} onChange={e => set("date", e.target.value)} required />}</Field>
        <Field label="Horário">{id => <Input id={id} type="time" value={form.time} onChange={e => set("time", e.target.value)} />}</Field>
      </div>

      <div className="grid grid-cols-[1fr_9rem] gap-3">
        <Field label="Veículo">{id => <Input id={id} value={form.vehicle} onChange={e => set("vehicle", e.target.value)} placeholder="Ex.: Onix Plus" required />}</Field>
        <Field label="Placa">{id => <Input id={id} value={form.plate} onChange={e => set("plate", normalizePlate(e.target.value).slice(0, 7))} placeholder="ABC1D23" className="font-bold tracking-wider uppercase" required />}</Field>
      </div>

      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field label="Cidade" hint="Fora de Pelotas? Informe o km rodado (ida e volta).">{id => <>
          <Input id={id} list="cidades" value={form.city} onChange={e => chooseCity(e.target.value)} placeholder="Pelotas" />
          <datalist id="cidades">{cities.map(c => <option key={c.city} value={c.city}>{formatKm(c.km)}</option>)}</datalist>
        </>}</Field>
        <Field label="Km">{id => <Input id={id} inputMode="decimal" value={form.km} onChange={e => set("km", e.target.value.replace(/[^\d,.]/g, ""))} placeholder="0" />}</Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor do serviço" hint={form.serviceType === "instalacao" ? "Instalação: valor conforme a demanda." : undefined}>
          {() => <Input id="valor-servico" inputMode="decimal" value={form.serviceValue} onChange={e => set("serviceValue", e.target.value.replace(/[^\d,.]/g, ""))} placeholder="0,00" required />}
        </Field>
        <Field label="Deslocamento">{() => <div className="flex h-11 items-center rounded-xl bg-canvas px-3 text-sm">
          <span className="tabular font-bold">{formatMoney(Math.round(km * kmRate))}</span>
          <span className="ml-1 text-xs text-muted">({formatMoney(kmRate)}/km)</span>
        </div>}</Field>
      </div>

      <Field label="Nº da OS / chamado Localiza (opcional)">{id => <Input id={id} value={form.reference} onChange={e => set("reference", e.target.value)} />}</Field>
      <Field label="Observações (opcional)">{id => <Textarea id={id} value={form.notes} onChange={e => set("notes", e.target.value)} />}</Field>

      <button type="button" onClick={() => set("status", form.status === "concluida" ? "agendada" : "concluida")} className={cx(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left",
        form.status === "concluida" ? "border-ok bg-ok-tint" : "border-line")}>
        <span className={cx("grid h-6 w-6 place-items-center rounded-md border-2", form.status === "concluida" ? "border-ok bg-ok text-white" : "border-line")}>
          {form.status === "concluida" && <Check className="h-4 w-4" />}
        </span>
        <span><span className="block text-sm font-bold">Serviço concluído</span><span className="block text-xs text-muted">Só OS concluídas entram no fechamento do mês.</span></span>
      </button>
    </form>
  </Sheet>;
}
