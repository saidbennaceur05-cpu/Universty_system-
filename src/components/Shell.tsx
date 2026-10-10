import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { ADMIN_ROLE_LABEL } from "../types";
import { Button, Icon, IconName } from "./ui";
import { navigate } from "../router";
import { useQuery } from "../api/useQuery";
import * as api from "../api";
import { ADMIN_NAV, NAV } from "../routes";

export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  match?: string[];
  badge?: "pendingCertificates";
}

export function UniversityMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-mark"><span>U</span></span>
      {!compact && <span><strong>UniAbsence</strong><small>Administration</small></span>}
    </div>
  );
}

function PendingBadge() {
  const { data } = useQuery(() => api.listCertificates({ status: "pending", pageSize: 1 }), []);
  if (!data || data.total === 0) return null;
  return <span className="nav-count">{data.total}</span>;
}

function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <button type="button" className={`nav-item ${active ? "active" : ""}`} onClick={() => navigate(item.path)}>
      <Icon name={item.icon} /><span>{item.label}</span>{item.badge === "pendingCertificates" && <PendingBadge />}
    </button>
  );
}

export function Shell({ path, title, children }: { path: string; title: string; children: ReactNode }) {
  const { session, logout, isSuperAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);
  if (!session) return null;
  const { user } = session;
  const isActive = (item: NavItem) => (item.path === "/" ? path === "/" : path === item.path || (item.match ?? []).some((m) => path.startsWith(m)));
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-head"><UniversityMark /><button type="button" className="icon-btn close-menu" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu"><Icon name="close" /></button></div>
        <nav className="nav" aria-label="Navigation principale">
          <span className="nav-label">GESTION</span>
          {NAV.map((item) => <NavButton key={item.path} item={item} active={isActive(item)} />)}
          <span className="nav-label nav-label-secondary">CONFIGURATION</span>
          {ADMIN_NAV.filter((item) => isSuperAdmin || item.path === "/subjects" || item.path === "/teachers").map((item) => <NavButton key={item.path} item={item} active={isActive(item)} />)}
          <button type="button" className={`nav-item ${path.startsWith("/account") ? "active" : ""}`} onClick={() => navigate("/account")}><Icon name="lock" /><span>Mon compte</span></button>
        </nav>
        <div className="sidebar-foot"><div className="avatar">{initials}</div><div><strong>{user.firstName} {user.lastName}</strong><span>{ADMIN_ROLE_LABEL[user.role]}</span></div></div>
      </aside>
      {menuOpen && <button type="button" className="scrim" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu" />}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="icon-btn mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu"><Icon name="menu" /></button>
            <div><span className="eyebrow">{ADMIN_ROLE_LABEL[user.role]}</span><h1>{title}</h1></div>
          </div>
          <div className="topbar-user">
            <div className="avatar avatar-light">{initials}</div>
            <div className="user-copy"><strong>{user.email}</strong><span>{ADMIN_ROLE_LABEL[user.role]}</span></div>
            <Button variant="ghost" icon="logout" onClick={() => logout().then(() => navigate("/login", true))}>Déconnexion</Button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
