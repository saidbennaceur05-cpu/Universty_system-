import type { NavItem } from "./components/Shell";

export const NAV: NavItem[] = [
  { path: "/", label: "Tableau de bord", icon: "grid" },
  { path: "/students", label: "Étudiants", icon: "students", match: ["/students"] },
  { path: "/absences", label: "Absences", icon: "calendar", match: ["/absences"] },
  { path: "/certificates", label: "Certificats", icon: "file", match: ["/certificates"], badge: "pendingCertificates" },
  { path: "/at-risk", label: "Étudiants à risque", icon: "warning", match: ["/at-risk"] },
  { path: "/reports", label: "Rapports", icon: "chart", match: ["/reports"] },
  { path: "/import", label: "Importer", icon: "upload", match: ["/import"] },
];

export const ADMIN_NAV: NavItem[] = [
  { path: "/subjects", label: "Matières", icon: "book", match: ["/subjects"] },
  { path: "/teachers", label: "Enseignants", icon: "teacher", match: ["/teachers"] },
  { path: "/accounts", label: "Comptes admin", icon: "user", match: ["/accounts"] },
  { path: "/audit", label: "Journal d'activité", icon: "list", match: ["/audit"] },
  { path: "/settings", label: "Paramètres", icon: "settings", match: ["/settings"] },
];

export const EYEBROW = "PLATEFORME D'ADMINISTRATION";
