import { KeyRound, LogOut, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { centsToInput, parseMoney, SERVICE_LABELS, SERVICE_TYPES, type Settings, type User } from "@shared/domain";
import { api, logout, useAction, useSettings } from "../api";
import { InstallCard } from "../components/InstallCard";
import { Button, Card, Field, Input } from "../components/ui";

export function SettingsPage({ user }: { user: User }) {
  const settings = useSettings();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [kmRate, setKmRate] = useState("");
  const [company, setCompany] = useState(settings.company);
  useEffect(() => {
    setPrices(Object.fromEntries(SERVICE_TYPES.map(t => [t, centsToInput(settings.prices[t])])));
    setKmRate(centsToInput(settings.kmRate));
    setCompany(settings.company);
  }, [settings]);

  const save = useAction((s: Settings) => api("PUT", "/settings", s), "Ajustes salvos.");
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      prices: { retirada: parseMoney(prices.retirada ?? "") ?? 0, assistencia: parseMoney(prices.assistencia ?? "") ?? 0, instalacao: parseMoney(prices.instalacao ?? "") ?? 0 },
      kmRate: parseMoney(kmRate) ?? 0,
      company,
    });
  }
  const money = (value: string, onChange: (v: string) => void) => (id: string) =>
    <Input id={id} inputMode="decimal" value={value} onChange={e => onChange(e.target.value.replace(/[^\d,.]/g, ""))} />;
  const companyField = (key: keyof Settings["company"]) => (id: string) =>
    <Input id={id} value={company[key]} onChange={e => setCompany({ ...company, [key]: e.target.value })} />;

  // Computador: valores e dados do PDF à esquerda; instalação, senha e conta à direita.
  return <div className="grid items-start gap-5 lg:grid-cols-[1fr_24rem] lg:gap-6 xl:grid-cols-[1fr_28rem]">
    <form onSubmit={submit} className="space-y-5">
      <Card className="p-5">
        <h2 className="text-base font-extrabold">Tabela de valores</h2>
        <p className="mb-4 text-sm text-muted">Preços preenchidos automaticamente nas novas OS. Mudar aqui não altera OS já cadastradas.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SERVICE_TYPES.map(t => <Field key={t} label={`${SERVICE_LABELS[t]} (R$)`} hint={t === "instalacao" ? "0 = a combinar" : undefined}>{money(prices[t] ?? "", v => setPrices({ ...prices, [t]: v }))}</Field>)}
          <Field label="Km rodado (R$)">{money(kmRate, setKmRate)}</Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-extrabold">Dados no PDF</h2>
        <p className="mb-4 text-sm text-muted">Aparecem no cabeçalho e no rodapé do fechamento mensal.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Empresa">{companyField("name")}</Field>
          <Field label="CNPJ / CPF">{companyField("document")}</Field>
          <Field label="Telefone">{companyField("phone")}</Field>
          <Field label="E-mail">{companyField("email")}</Field>
          <Field label="Cidade">{companyField("city")}</Field>
          <Field label="Cliente (tomador)">{companyField("client")}</Field>
          <Field label="Chave PIX (opcional)" className="sm:col-span-2">{companyField("pix")}</Field>
        </div>
      </Card>
      <Button type="submit" icon={Save} loading={save.isPending} className="w-full sm:w-auto">Salvar ajustes</Button>
    </form>

    <div className="space-y-5 lg:sticky lg:top-24">
      <InstallCard />
      <PasswordCard />
      <Card className="flex items-center justify-between gap-3 p-5">
        <div className="min-w-0"><p className="font-bold">{user.name}</p><p className="truncate text-sm text-muted">{user.email}</p></div>
        <Button variant="outline" icon={LogOut} onClick={() => void logout()}>Sair</Button>
      </Card>
    </div>
  </div>;
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const change = useAction(() => api("PUT", "/auth/password", { current, password }), "Senha alterada.");
  return <Card className="p-5">
    <h2 className="mb-4 text-base font-extrabold">Trocar senha</h2>
    <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end lg:grid-cols-1" onSubmit={e => { e.preventDefault(); change.mutate(undefined, { onSuccess: () => { setCurrent(""); setPassword(""); } }); }}>
      <Field label="Senha atual">{id => <Input id={id} type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required />}</Field>
      <Field label="Nova senha">{id => <Input id={id} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required />}</Field>
      <Button type="submit" variant="dark" icon={KeyRound} loading={change.isPending}>Trocar</Button>
    </form>
  </Card>;
}
