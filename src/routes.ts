import type { Role } from "./types";
import type { NavItem } from "./components/Shell";

export function homeFor(role: Role): string {
  return role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/student";
}

export const ADMIN_NAV: NavItem[] = [
  { path: "/admin", label: "Tableau de bord", icon: "grid" },
  { path: "/admin/students", label: "Étudiants", icon: "students", match: ["/admin/students"] },
  { path: "/admin/teachers", label: "Enseignants", icon: "teacher", match: ["/admin/teachers"] },
  { path: "/admin/subjects", label: "Matières", icon: "book", match: ["/admin/subjects"] },
  { path: "/admin/absences", label: "Absences", icon: "calendar", match: ["/admin/absences"] },
  { path: "/admin/certificates", label: "Certificats", icon: "file", match: ["/admin/certificates"], badge: "pendingCertificates" },
];

export const TEACHER_NAV: NavItem[] = [
  { path: "/teacher", label: "Tableau de bord", icon: "grid" },
  { path: "/teacher/roll-call", label: "Faire l'appel", icon: "checkAll", match: ["/teacher/roll-call"] },
  { path: "/teacher/sessions", label: "Mes séances", icon: "clock", match: ["/teacher/sessions"] },
  { path: "/teacher/absences", label: "Absences", icon: "calendar", match: ["/teacher/absences"] },
];

export const STUDENT_NAV: NavItem[] = [
  { path: "/student", label: "Tableau de bord", icon: "grid" },
  { path: "/student/absences", label: "Mes absences", icon: "calendar", match: ["/student/absences"] },
  { path: "/student/justify", label: "Justifier une absence", icon: "upload", match: ["/student/justify"] },
  { path: "/student/certificates", label: "Mes justificatifs", icon: "file", match: ["/student/certificates"] },
];

export const EYEBROW: Record<Role, string> = { admin: "ESPACE ADMINISTRATION", teacher: "ESPACE ENSEIGNANT", student: "ESPACE ÉTUDIANT" };
