import { ChevronLeft, ChevronRight, Loader2, X, type LucideIcon } from "lucide-react";
import { forwardRef, useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { monthLabel, shiftMonth, type OrderStatus, type ServiceType } from "@shared/domain";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

type Variant = "primary" | "dark" | "outline" | "ghost" | "danger" | "success";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  dark: "bg-night text-white hover:bg-black",
  outline: "border border-line bg-surface text-ink hover:bg-canvas",
  ghost: "text-muted hover:bg-black/5 hover:text-ink",
  danger: "text-brand-dark hover:bg-brand-tint",
  success: "bg-ok text-white hover:bg-green-800",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: LucideIcon; loading?: boolean }>(
  function Button({ variant = "primary", size = "md", icon: Icon, loading, className, children, disabled, type = "button", ...props }, ref) {
    return <button ref={ref} type={type} disabled={disabled || loading} className={cx(
      "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-bold whitespace-nowrap disabled:opacity-50",
      size === "sm" && "h-9 px-3 text-xs",
      size === "md" && "h-11 px-4 text-sm",
      size === "lg" && "h-13 px-5 text-base",
      variants[variant], className)} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>;
  });

const fieldBase = "w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return <div className={className}>
    <label htmlFor={id} className="mb-1.5 block text-xs font-bold tracking-wide text-muted uppercase">{label}</label>
    {children(id)}
    {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
  </div>;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(fieldBase, "h-11", className)} {...props} />;
});
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldBase, "min-h-20 py-2.5", className)} {...props} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-line bg-surface", className)}>{children}</div>;
}

/** Folha que sobe de baixo no celular e vira janela central no computador. */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="modal-panel flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-canvas"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>, document.body);
}

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
    <button aria-label="Mês anterior" onClick={() => onChange(shiftMonth(month, -1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-canvas"><ChevronLeft className="h-5 w-5" /></button>
    <span className="min-w-36 text-center text-sm font-extrabold">{monthLabel(month)}</span>
    <button aria-label="Próximo mês" onClick={() => onChange(shiftMonth(month, 1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-canvas"><ChevronRight className="h-5 w-5" /></button>
  </div>;
}

const serviceColors: Record<ServiceType, string> = {
  retirada: "bg-night text-white",
  assistencia: "bg-brand text-white",
  instalacao: "bg-white text-ink ring-1 ring-ink/30",
};
export function ServiceBadge({ type, label }: { type: ServiceType; label: string }) {
  return <span className={cx("rounded-md px-2 py-0.5 text-[11px] font-extrabold tracking-wide uppercase", serviceColors[type])}>{label}</span>;
}
export function StatusBadge({ status }: { status: OrderStatus }) {
  return status === "concluida"
    ? <span className="rounded-md bg-ok-tint px-2 py-0.5 text-[11px] font-bold text-ok">Concluída</span>
    : <span className="rounded-md bg-wait-tint px-2 py-0.5 text-[11px] font-bold text-wait">Agendada</span>;
}

export function Logo({ className }: { className?: string }) {
  return <img src="/logo.svg" alt="R&B Serviços" className={className} />;
}
