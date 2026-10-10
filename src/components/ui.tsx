import { createContext, ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { AbsenceStatus, CertificateStatus, UserStatus } from "../types";
import { ABSENCE_STATUS_LABEL, CERTIFICATE_STATUS_LABEL } from "../types";

// ---------------------------------------------------------------------------------------------
// Icons

export type IconName =
  | "grid" | "students" | "teacher" | "calendar" | "file" | "logout" | "search" | "plus" | "edit" | "trash"
  | "chevron" | "chevronLeft" | "chevronDown" | "menu" | "close" | "eye" | "eyeOff" | "upload" | "check" | "alert"
  | "more" | "book" | "clock" | "lock" | "key" | "info" | "refresh" | "user" | "list" | "warning" | "download" | "checkAll" | "ban";

const icons: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  students: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  teacher: <><path d="m3 10 9-5 9 5-9 5-9-5Z" /><path d="M7 12.5V17c3 2 7 2 10 0v-4.5M21 10v6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.3A10.5 10.5 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-2 3.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 8 10 8c1.5 0 2.8-.4 4-1" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  checkAll: <><path d="m2 12 4 4 8-8" /><path d="m12 16 8-8" /></>,
  alert: <><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16h.01" /></>,
  warning: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  refresh: <><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></>,
  ban: <><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></>,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}

// ---------------------------------------------------------------------------------------------
// Primitives

export function Button({ children, variant = "primary", loading = false, icon, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean; icon?: IconName }) {
  return (
    <button type={props.type ?? "button"} className={`btn btn-${variant} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}

export function Field({ label, error, hint, right, id, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; right?: ReactNode }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error || hint ? `${inputId}-desc` : undefined;
  return (
    <div className="field">
      <label className={`label ${props.required ? "label-required" : ""}`} htmlFor={inputId}>{label}</label>
      <span className="input-wrap">
        <input id={inputId} className={`input ${error ? "input-error" : ""}`} aria-invalid={!!error} aria-describedby={describedBy} {...props} />
        {right && <span className="input-action">{right}</span>}
      </span>
      {error ? <span id={describedBy} className="error-text"><Icon name="alert" size={14} />{error}</span> : hint ? <span id={describedBy} className="hint">{hint}</span> : null}
    </div>
  );
}

export function SelectField({ label, children, error, hint, id, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode; error?: string; hint?: string }) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const describedBy = error || hint ? `${selectId}-desc` : undefined;
  return (
    <div className="field">
      <label className={`label ${props.required ? "label-required" : ""}`} htmlFor={selectId}>{label}</label>
      <select id={selectId} className={`input select ${error ? "input-error" : ""}`} aria-invalid={!!error} aria-describedby={describedBy} {...props}>{children}</select>
      {error ? <span id={describedBy} className="error-text"><Icon name="alert" size={14} />{error}</span> : hint ? <span id={describedBy} className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextareaField({ label, error, hint, id, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const describedBy = error || hint ? `${areaId}-desc` : undefined;
  return (
    <div className="field">
      <label className={`label ${props.required ? "label-required" : ""}`} htmlFor={areaId}>{label}</label>
      <textarea id={areaId} className={`input textarea ${error ? "input-error" : ""}`} aria-invalid={!!error} aria-describedby={describedBy} {...props} />
      {error ? <span id={describedBy} className="error-text"><Icon name="alert" size={14} />{error}</span> : hint ? <span id={describedBy} className="hint">{hint}</span> : null}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "warning" | "danger" | "info" | "neutral" }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>;
}

const absenceTone: Record<AbsenceStatus, "success" | "warning" | "danger" | "neutral"> = { justified: "success", pending: "warning", unjustified: "danger", rejected: "danger" };
const certificateTone: Record<CertificateStatus, "success" | "warning" | "danger"> = { accepted: "success", pending: "warning", rejected: "danger" };

export function AbsenceBadge({ status }: { status: AbsenceStatus }) {
  return <Badge tone={absenceTone[status]}>{ABSENCE_STATUS_LABEL[status]}</Badge>;
}

export function CertificateBadge({ status }: { status: CertificateStatus }) {
  return <Badge tone={certificateTone[status]}>{CERTIFICATE_STATUS_LABEL[status]}</Badge>;
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge tone={status === "active" ? "success" : "neutral"}>{status === "active" ? "Actif" : "Désactivé"}</Badge>;
}

export function Alert({ children, tone = "success", onClose }: { children: ReactNode; tone?: "success" | "danger" | "info" | "warning"; onClose?: () => void }) {
  const icon: IconName = tone === "success" ? "check" : tone === "info" ? "info" : tone === "warning" ? "warning" : "alert";
  return (
    <div className={`alert alert-${tone}`} role="alert">
      <Icon name={icon} size={19} />
      <span className="alert-text">{children}</span>
      {onClose && <button type="button" className="icon-btn alert-close" onClick={onClose} aria-label="Fermer"><Icon name="close" size={16} /></button>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>;
}

export function Avatar({ firstName, lastName, size = "normal" }: { firstName: string; lastName: string; size?: "normal" | "large" }) {
  return <span className={`mini-avatar ${size === "large" ? "large" : ""}`}>{`${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()}</span>;
}

export function Person({ firstName, lastName, sub }: { firstName: string; lastName: string; sub?: string }) {
  return (
    <span className="person">
      <Avatar firstName={firstName} lastName={lastName} />
      <span className="person-copy"><span>{lastName} {firstName}</span>{sub && <small>{sub}</small>}</span>
    </span>
  );
}

export function EmptyState({ icon = "search", title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return <div className="empty-state"><span><Icon name={icon} size={24} /></span><h3>{title}</h3>{text && <p>{text}</p>}{action}</div>;
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner spinner-dark" />{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <EmptyState icon="alert" title="Une erreur est survenue" text={message} action={onRetry && <Button variant="secondary" icon="refresh" onClick={onRetry}>Réessayer</Button>} />;
}

export function Pagination({ page, pageCount, total, pageSize, onPage }: { page: number; pageCount: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const pages = useMemo(() => {
    const set = new Set<number>([1, pageCount, page, page - 1, page + 1]);
    return [...set].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  }, [page, pageCount]);
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <span>Affichage de {from} à {to} sur {total} résultat{total > 1 ? "s" : ""}</span>
      <div>
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</Button>
        {pages.map((p, i) => (
          <span key={p} className="page-group">
            {i > 0 && pages[i - 1] !== p - 1 && <span className="page-ellipsis">…</span>}
            <button type="button" className={`page-number ${p === page ? "active" : ""}`} onClick={() => onPage(p)} aria-current={p === page ? "page" : undefined}>{p}</button>
          </span>
        ))}
        <Button variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Suivant</Button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.value} type="button" role="tab" aria-selected={value === it.value} className={`tab ${value === it.value ? "active" : ""}`} onClick={() => onChange(it.value)}>
          {it.label}{it.count !== undefined && <span className="tab-count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Modal & confirm

export function Modal({ title, eyebrow, onClose, children, wide = false, footer }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" className="modal-scrim" onClick={onClose} aria-label="Fermer" />
      <div className={`modal ${wide ? "" : "modal-narrow"}`}>
        <div className="modal-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id="modal-title">{title}</h2></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button></div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
}

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false));

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title} onClose={() => close(false)}>
          <div className="confirm-body">{state.message}</div>
          <div className="modal-foot">
            <Button variant="secondary" onClick={() => close(false)}>Annuler</Button>
            <Button variant={state.tone === "danger" ? "danger" : "primary"} onClick={() => close(true)} autoFocus>{state.confirmLabel ?? "Confirmer"}</Button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

// ---------------------------------------------------------------------------------------------
// Toasts

interface Toast {
  id: number;
  message: string;
  tone: "success" | "danger" | "info";
}

const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, message, tone }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "danger" ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === "success" ? "check" : t.tone === "danger" ? "alert" : "info"} size={17} />
            <span>{t.message}</span>
            <button type="button" className="icon-btn" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} aria-label="Fermer"><Icon name="close" size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------------------------
// Small helpers

export function CopyButton({ value, label = "Copier" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // clipboard unavailable: the value is visible on screen anyway
    }
  };
  return <Button variant="secondary" icon={done ? "check" : "file"} onClick={copy}>{done ? "Copié" : label}</Button>;
}

export function StatCard({ label, value, detail, icon, tone = "indigo" }: { label: string; value: string | number; detail?: string; icon: IconName; tone?: "indigo" | "blue" | "orange" | "green" | "red" }) {
  return <Card className="stat-card"><div><p>{label}</p><strong>{value}</strong>{detail && <span>{detail}</span>}</div><div className={`stat-icon stat-${tone}`}><Icon name={icon} size={24} /></div></Card>;
}
