import { CalendarDays, Loader2, Receipt, Settings as SettingsIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { today } from "@shared/domain";
import { api, ApiError, useSession } from "./api";
import { Button, cx, Field, Input, Logo } from "./components/ui";
import { AgendaPage } from "./pages/Agenda";
import { ClosingPage } from "./pages/Closing";
import { SettingsPage } from "./pages/Settings";

type Tab = "agenda" | "fechamento" | "ajustes";
const TABS: Array<{ id: Tab; label: string; icon: typeof CalendarDays }> = [
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "fechamento", label: "Fechamento", icon: Receipt },
  { id: "ajustes", label: "Ajustes", icon: SettingsIcon },
];

export function App() {
  const session = useSession();
  const [tab, setTab] = useState<Tab>("agenda");
  const [month, setMonth] = useState(() => today().slice(0, 7));

  if (session.isPending) return <div className="grid min-h-dvh place-items-center bg-night"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>;
  if (session.isError) return <div className="grid min-h-dvh place-items-center p-6 text-center"><div><p className="font-bold">Não foi possível conectar.</p><Button className="mt-4" onClick={() => void session.refetch()}>Tentar novamente</Button></div></div>;
  if (!session.data.user) return <LoginPage setup={session.data.needsSetup} />;

  return <div className="min-h-dvh pb-24 sm:pb-10">
    <header className="safe-top sticky top-0 z-30 bg-night text-white shadow-lg shadow-black/10">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
        <Logo className="h-12 w-auto" />
        <div className="leading-tight">
          <p className="text-sm font-extrabold">Ordens de serviço</p>
          <p className="text-xs text-white/60">Rastreadores · Localiza</p>
        </div>
        <nav className="ml-auto hidden gap-1 sm:flex">
          {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={cx("flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold", tab === t.id ? "bg-brand text-white" : "text-white/70 hover:bg-white/10 hover:text-white")}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>)}
        </nav>
      </div>
      <div className="h-1 bg-brand" />
    </header>

    <main className="mx-auto max-w-5xl px-4 py-5">
      {tab === "agenda" && <AgendaPage month={month} setMonth={setMonth} />}
      {tab === "fechamento" && <ClosingPage month={month} setMonth={setMonth} />}
      {tab === "ajustes" && <SettingsPage user={session.data.user} />}
    </main>

    {/* Celular: abas embaixo, ao alcance do polegar. */}
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-night sm:hidden">
      <div className="grid grid-cols-3">
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={cx("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold", tab === t.id ? "text-white" : "text-white/50")}>
          <span className={cx("grid h-8 w-12 place-items-center rounded-full", tab === t.id && "bg-brand")}><t.icon className="h-5 w-5" /></span>
          {t.label}
        </button>)}
      </div>
    </nav>
  </div>;
}

function LoginPage({ setup }: { setup: boolean }) {
  const client = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("POST", setup ? "/auth/setup" : "/auth/login", form);
      await client.invalidateQueries({ queryKey: ["session"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao entrar.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex min-h-dvh flex-col items-center justify-center bg-night px-5 py-10">
    <Logo className="w-64 max-w-[75vw]" />
    <form onSubmit={submit} className="reveal mt-8 w-full max-w-sm space-y-4 rounded-3xl bg-surface p-6 shadow-2xl">
      <div>
        <h1 className="text-xl font-extrabold">{setup ? "Criar seu acesso" : "Entrar"}</h1>
        <p className="text-sm text-muted">{setup ? "Primeiro acesso: defina seu e-mail e senha." : "Agenda e fechamento de serviços."}</p>
      </div>
      {setup && <Field label="Seu nome">{id => <Input id={id} value={form.name} onChange={set("name")} autoComplete="name" required />}</Field>}
      <Field label="E-mail">{id => <Input id={id} type="email" value={form.email} onChange={set("email")} autoComplete="email" required />}</Field>
      <Field label="Senha" hint={setup ? "Mínimo de 6 caracteres." : undefined}>{id => <Input id={id} type="password" value={form.password} onChange={set("password")} autoComplete={setup ? "new-password" : "current-password"} required />}</Field>
      {error && <p className="rounded-xl bg-brand-tint px-3 py-2 text-sm font-semibold text-brand-dark">{error}</p>}
      <Button type="submit" className="w-full" size="lg" loading={busy}>{setup ? "Criar acesso" : "Entrar"}</Button>
    </form>
  </div>;
}
