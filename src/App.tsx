import { ReactNode, useEffect } from "react";
import { AuthProvider, useAuth } from "./auth";
import { Shell } from "./components/Shell";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import { matchRoute, navigate, queryParams, useHashRoute } from "./router";
import { ADMIN_NAV, EYEBROW, STUDENT_NAV, TEACHER_NAV, homeFor } from "./routes";
import type { AuthSession, Role } from "./types";

import Login from "./pages/Login";
import AccountPage, { FirstPasswordPage } from "./pages/Account";
import AdminDashboard from "./pages/admin/Dashboard";
import StudentsPage, { StudentFormPage } from "./pages/admin/Students";
import TeachersPage, { TeacherFormPage } from "./pages/admin/Teachers";
import SubjectsPage from "./pages/admin/Subjects";
import AbsencesPage, { NewAbsencePage } from "./pages/admin/Absences";
import CertificatesPage, { NewCertificatePage } from "./pages/admin/Certificates";
import { RollCallPage, TeacherAbsencesPage, TeacherDashboard, TeacherSessionsPage } from "./pages/teacher/TeacherPages";
import { StudentAbsencesPage, StudentCertificatesPage, StudentDashboard, StudentJustifyPage } from "./pages/student/StudentPages";

function Splash() {
  return <div className="splash"><span className="spinner spinner-dark" />Chargement de UniAbsence…</div>;
}

function NotFound({ home }: { home: string }) {
  return <div className="empty-state"><span>?</span><h3>Page introuvable</h3><p>Cette adresse ne correspond à aucun écran.</p><button type="button" className="btn btn-primary" onClick={() => navigate(home, true)}>Retour à l'accueil</button></div>;
}

/** Resolves the current path to a page for the signed-in role. */
function resolve(session: AuthSession, path: string): { title: string; node: ReactNode } | null {
  const role: Role = session.user.role;
  const clean = path.split("?")[0];
  const q = queryParams(path);
  let m: Record<string, string> | null;

  if (clean === "/account") return { title: "Mon compte", node: <AccountPage /> };

  if (role === "admin") {
    if (clean === "/admin") return { title: "Tableau de bord", node: <AdminDashboard /> };
    if (clean === "/admin/students") return { title: "Étudiants", node: <StudentsPage /> };
    if (clean === "/admin/students/new") return { title: "Étudiants", node: <StudentFormPage /> };
    if ((m = matchRoute("/admin/students/:id/edit", clean))) return { title: "Étudiants", node: <StudentFormPage key={m.id} id={m.id} /> };
    if (clean === "/admin/teachers") return { title: "Enseignants", node: <TeachersPage /> };
    if (clean === "/admin/teachers/new") return { title: "Enseignants", node: <TeacherFormPage /> };
    if ((m = matchRoute("/admin/teachers/:id/edit", clean))) return { title: "Enseignants", node: <TeacherFormPage key={m.id} id={m.id} /> };
    if (clean === "/admin/subjects") return { title: "Matières", node: <SubjectsPage /> };
    if (clean === "/admin/absences") return { title: "Absences", node: <AbsencesPage key={path.includes("?") ? path : "list"} path={path} /> };
    if (clean === "/admin/absences/new") return { title: "Absences", node: <NewAbsencePage /> };
    if ((m = matchRoute("/admin/absences/:id", clean))) return { title: "Absences", node: <AbsencesPage key="list" path={path} detailId={m.id} /> };
    if (clean === "/admin/certificates") return { title: "Certificats", node: <CertificatesPage /> };
    if (clean === "/admin/certificates/new") return { title: "Certificats", node: <NewCertificatePage /> };
  }

  if (role === "teacher") {
    if (clean === "/teacher") return { title: "Tableau de bord", node: <TeacherDashboard /> };
    if (clean === "/teacher/roll-call") return { title: "Faire l'appel", node: <RollCallPage key="rollcall" /> };
    if ((m = matchRoute("/teacher/roll-call/:id", clean))) return { title: "Faire l'appel", node: <RollCallPage key="rollcall" sessionId={m.id} /> };
    if (clean === "/teacher/sessions") return { title: "Mes séances", node: <TeacherSessionsPage /> };
    if (clean === "/teacher/absences") return { title: "Absences", node: <TeacherAbsencesPage key={path} initialStudentId={q.get("studentId") ?? ""} initialSubjectId={q.get("subjectId") ?? ""} /> };
  }

  if (role === "student") {
    if (clean === "/student") return { title: "Tableau de bord", node: <StudentDashboard /> };
    if (clean === "/student/absences") return { title: "Mes absences", node: <StudentAbsencesPage /> };
    if (clean === "/student/justify") return { title: "Justifier une absence", node: <StudentJustifyPage key="new" /> };
    if ((m = matchRoute("/student/justify/:id", clean))) return { title: "Justifier une absence", node: <StudentJustifyPage key={m.id} absenceId={m.id} /> };
    if (clean === "/student/certificates") return { title: "Mes justificatifs", node: <StudentCertificatesPage /> };
  }

  return null;
}

function Router() {
  const { session, ready } = useAuth();
  const { path } = useHashRoute();
  const clean = path.split("?")[0];

  // Redirects live in an effect so we never navigate during render.
  useEffect(() => {
    if (!ready) return;
    if (!session) {
      if (clean !== "/login") navigate("/login", true);
      return;
    }
    if (session.user.mustChangePassword) {
      if (clean !== "/account/password") navigate("/account/password?first=1", true);
      return;
    }
    const home = homeFor(session.user.role);
    const ownArea = clean === "/account" || clean === home || clean.startsWith(home + "/");
    if (!ownArea) navigate(home, true);
  }, [ready, session, clean]);

  if (!ready) return <Splash />;
  if (!session) return clean === "/login" ? <Login /> : <Splash />;
  if (session.user.mustChangePassword) return clean === "/account/password" ? <FirstPasswordPage /> : <Splash />;

  const home = homeFor(session.user.role);
  const ownArea = clean === "/account" || clean === home || clean.startsWith(home + "/");
  if (!ownArea) return <Splash />;

  const nav = session.user.role === "admin" ? ADMIN_NAV : session.user.role === "teacher" ? TEACHER_NAV : STUDENT_NAV;
  const page = resolve(session, path);
  return (
    <Shell items={nav} path={clean} title={page?.title ?? "Page introuvable"} eyebrow={EYEBROW[session.user.role]}>
      {page ? page.node : <NotFound home={home} />}
    </Shell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Router />
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
