import { ReactNode, useEffect } from "react";
import { AuthProvider, useAuth } from "./auth";
import { Shell } from "./components/Shell";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import { matchRoute, navigate, queryParams, useHashRoute } from "./router";

import Login from "./pages/Login";
import AccountPage, { FirstPasswordPage } from "./pages/Account";
import AdminDashboard from "./pages/admin/Dashboard";
import StudentsPage, { StudentFormPage } from "./pages/admin/Students";
import TeachersPage from "./pages/admin/Teachers";
import SubjectsPage from "./pages/admin/Subjects";
import AbsencesPage, { NewAbsencePage } from "./pages/admin/Absences";
import CertificatesPage, { NewCertificatePage } from "./pages/admin/Certificates";
import AtRiskPage from "./pages/admin/AtRisk";
import ReportsPage from "./pages/admin/Reports";
import ImportPage from "./pages/admin/Import";
import AccountsPage from "./pages/admin/Accounts";
import AuditPage from "./pages/admin/Audit";
import SettingsPage from "./pages/admin/Settings";

function Splash() {
  return <div className="splash"><span className="spinner spinner-dark" />Chargement de UniAbsence…</div>;
}

function NotFound() {
  return <div className="empty-state"><span>?</span><h3>Page introuvable</h3><p>Cette adresse ne correspond à aucun écran.</p><button type="button" className="btn btn-primary" onClick={() => navigate("/", true)}>Retour à l'accueil</button></div>;
}

/** Routes requiring super-admin. */
const SUPER_ONLY = ["/accounts", "/audit", "/settings"];

function resolve(path: string, isSuper: boolean): { title: string; node: ReactNode } | null {
  const clean = path.split("?")[0];
  const q = queryParams(path);
  let m: Record<string, string> | null;

  if (clean === "/") return { title: "Tableau de bord", node: <AdminDashboard /> };
  if (clean === "/account") return { title: "Mon compte", node: <AccountPage /> };
  if (clean === "/students") return { title: "Étudiants", node: <StudentsPage /> };
  if (clean === "/students/new") return { title: "Étudiants", node: <StudentFormPage /> };
  if ((m = matchRoute("/students/:id/edit", clean))) return { title: "Étudiants", node: <StudentFormPage key={m.id} id={m.id} /> };
  if (clean === "/absences") return { title: "Absences", node: <AbsencesPage key={path.includes("?") ? path : "list"} path={path} /> };
  if (clean === "/absences/new") return { title: "Absences", node: <NewAbsencePage /> };
  if ((m = matchRoute("/absences/:id", clean))) return { title: "Absences", node: <AbsencesPage key="list" path={path} detailId={m.id} /> };
  if (clean === "/certificates") return { title: "Certificats", node: <CertificatesPage /> };
  if (clean === "/certificates/new") return { title: "Certificats", node: <NewCertificatePage /> };
  if (clean === "/at-risk") return { title: "Étudiants à risque", node: <AtRiskPage key={path} path={path} /> };
  if (clean === "/reports") return { title: "Rapports", node: <ReportsPage /> };
  if (clean === "/import") return { title: "Importer", node: <ImportPage /> };
  if (clean === "/subjects") return { title: "Matières", node: <SubjectsPage /> };
  if (clean === "/teachers") return { title: "Enseignants", node: <TeachersPage /> };
  if (clean === "/accounts") return isSuper ? { title: "Comptes admin", node: <AccountsPage /> } : null;
  if (clean === "/audit") return isSuper ? { title: "Journal d'activité", node: <AuditPage /> } : null;
  if (clean === "/settings") return isSuper ? { title: "Paramètres", node: <SettingsPage /> } : null;
  void q;
  return null;
}

function Router() {
  const { session, ready, isSuperAdmin } = useAuth();
  const { path } = useHashRoute();
  const clean = path.split("?")[0];

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
    if (clean === "/login" || clean === "/account/password") navigate("/", true);
    if (SUPER_ONLY.includes(clean) && !isSuperAdmin) navigate("/", true);
  }, [ready, session, clean, isSuperAdmin]);

  if (!ready) return <Splash />;
  if (!session) return clean === "/login" ? <Login /> : <Splash />;
  if (session.user.mustChangePassword) return clean === "/account/password" ? <FirstPasswordPage /> : <Splash />;

  const page = resolve(path, isSuperAdmin);
  return (
    <Shell path={clean} title={page?.title ?? "Page introuvable"}>
      {page ? page.node : <NotFound />}
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
