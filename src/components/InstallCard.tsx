import { Download, Share, SquarePlus, X } from "lucide-react";
import { useState } from "react";
import { useInstall } from "../pwa";
import { Button, Card } from "./ui";

const DISMISS_KEY = "rb-install-dismissed";
const dismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } };

/** Convite para instalar o app na tela inicial. `compact`: faixa na Agenda (pode fechar); senão, cartão em Ajustes. */
export function InstallCard({ compact }: { compact?: boolean }) {
  const { state, install } = useInstall();
  const [hidden, setHidden] = useState(dismissed);
  const [showIos, setShowIos] = useState(false);
  if (state === "instalado" || state === "indisponivel" || (compact && hidden)) return null;

  const close = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* sem armazenamento */ }
    setHidden(true);
  };

  return <Card className={compact ? "reveal flex items-center gap-3 border-brand/30 bg-brand-tint p-3" : "p-5"}>
    <img src="/icons/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
    <div className={compact ? "min-w-0 flex-1" : "mt-3"}>
      <p className="font-extrabold">Instalar o app no celular</p>
      <p className="text-sm text-muted">Abre direto da tela inicial, em tela cheia, e funciona até sem internet para consulta.</p>
      {showIos && <ol className="mt-3 space-y-2 rounded-xl bg-surface p-3 text-sm">
        <li className="flex items-center gap-2"><span className="font-bold">1.</span> Toque em <Share className="h-4 w-4 text-[#007aff]" /> <b>Compartilhar</b> (barra do Safari)</li>
        <li className="flex items-center gap-2"><span className="font-bold">2.</span> Escolha <SquarePlus className="h-4 w-4" /> <b>Adicionar à Tela de Início</b></li>
        <li className="flex items-center gap-2"><span className="font-bold">3.</span> Toque em <b>Adicionar</b></li>
      </ol>}
      {!compact && <Button className="mt-3" icon={Download} onClick={() => state === "pronto" ? void install() : setShowIos(true)}>Instalar app</Button>}
    </div>
    {compact && <>
      <Button size="sm" onClick={() => state === "pronto" ? void install() : setShowIos(s => !s)}>Instalar</Button>
      <button onClick={close} aria-label="Dispensar" className="grid h-9 w-9 shrink-0 place-items-center self-start rounded-full text-muted hover:bg-black/5"><X className="h-4 w-4" /></button>
    </>}
  </Card>;
}
