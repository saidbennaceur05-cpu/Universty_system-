import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { ROLE_LABEL } from "../types";
import { Button, Icon, IconName } from "./ui";
import { navigate } from "../router";
import { useQuery } from "../api/useQuery";
import * as api from "../api";

export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  /** Also highlight for these path prefixes (e.g. the "new" and "edit" forms of a list). */
  match?: string[];
  badge?: "pendingCertificates";
}

export function UniversityMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-mark"><span>U</span></span>
      {!compact && <span><strong>UniAbsence</strong><small>Gestion des absences</small></span>}
    </div>
  );
}

function PendingBadge() {
  const { data } = useQuery(() => api.listCertificates({ status: "pending", pageSize: 1 }), []);
  if (!data || data.total === 0) return null;
  return <span className="nav-count">{data.total}</span>;
}

export function Shell({ items, path, title, eyebrow, children }: { items: NavItem[]; path: string; title: string; eyebrow: string; children: ReactNode }) {
  const { session, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);
  if (!session) return null;
  const { user } = session;
  const isActive = (item: NavItem) => path === item.path || (item.match ?? []).some((m) => path.startsWith(m));
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-head"><UniversityMark /><button type="button" className="icon-btn close-menu" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu"><Icon name="close" /></button></div>
        <nav className="nav" aria-label="Navigation principale">
          <span className="nav-label">MENU PRINCIPAL</span>
          {items.map((item) => (
            <button key={item.path} type="button" className={`nav-item ${isActive(item) ? "active" : ""}`} onClick={() => navigate(item.path)}>
              <Icon name={item.icon} /><span>{item.label}</span>{item.badge === "pendingCertificates" && <PendingBadge />}
            </button>
          ))}
          <span className="nav-label nav-label-secondary">COMPTE</span>
          <button type="button" className={`nav-item ${path.startsWith("/account") ? "active" : ""}`} onClick={() => navigate("/account")}><Icon name="lock" /><span>Mon compte</span></button>
        </nav>
        <div className="sidebar-foot"><div className="avatar">{initials}</div><div><strong>{user.firstName} {user.lastName}</strong><span>{user.email}</span></div></div>
      </aside>
      {menuOpen && <button type="button" className="scrim" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu" />}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="icon-btn mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu"><Icon name="menu" /></button>
            <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>
          </div>
          <div className="topbar-user">
            <div className="avatar avatar-light">{initials}</div>
            <div className="user-copy"><strong>{user.email}</strong><span>{ROLE_LABEL[user.role]}</span></div>
            <Button variant="ghost" icon="logout" onClick={() => logout().then(() => navigate("/login", true))}>Déconnexion</Button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
