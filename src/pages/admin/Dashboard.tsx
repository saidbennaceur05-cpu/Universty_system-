import { useState } from "react";
import * as api from "../../api";
import { useQuery } from "../../api/useQuery";
import { AbsenceBadge, Button, Card, ErrorState, Icon, IconName, Loading, PageHeader, Person, SelectField, StatCard } from "../../components/ui";
import { navigate } from "../../router";
import { formatDate, formatNumber, shortFiliere, timeAgo } from "../../utils/format";
import type { AuditEntry } from "../../types";

const ACTIVITY_ICON: Record<string, IconName> = {
  login: "user", admin_created: "user", admin_updated: "user", admin_status: "user", admin_deleted: "trash", password_changed: "key", password_reset: "key",
  student_created: "students", student_updated: "students", student_deleted: "trash", students_imported: "upload",
  teacher_created: "teacher", teacher_updated: "teacher", teacher_status: "teacher", teacher_deleted: "trash",
  subject_created: "book", subject_updated: "book", subject_deleted: "trash",
  absence_created: "calendar", absence_updated: "calendar", absence_deleted: "trash", absences_imported: "upload", absences_bulk: "checkAll",
  certificate_uploaded: "upload", certificate_reviewed: "check", certificate_deleted: "trash",
  notice_generated: "mail", settings_updated: "settings", data_reset: "refresh",
};

export function ActivityFeed({ items }: { items: AuditEntry[] }) {
  if (items.length === 0) return <p className="muted small pad">Aucune activité pour le moment.</p>;
  return <>{items.map((a) => <div className="activity" key={a.id}><span className="activity-icon"><Icon name={ACTIVITY_ICON[a.action] ?? "info"} size={17} /></span><div><strong>{a.summary}</strong><span>{a.actorName} · {timeAgo(a.at)}</span></div></div>)}</>;
}

export function MonthlyChart({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  return (
    <div className="chart-area">
      <div className="y-axis">{[4, 3, 2, 1, 0].map((i) => <span key={i}>{i * step}</span>)}</div>
      <div className="bars">
        {values.map((v, i) => (
          <div className="bar-column" key={i} title={`${api.MONTH_LABELS[i]} : ${v}`}>
            <div className="bar-track"><div className={`bar ${v === 0 ? "bar-empty" : ""}`} style={{ height: `${(v / top) * 100}%` }} /></div>
            <span>{api.MONTH_LABELS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const years = useQuery(() => api.listAcademicYears(), []);
  const [year, setYear] = useState<number | null>(null);
  const selected = year ?? years.data?.[0] ?? null;
  const stats = useQuery(() => (selected ? api.adminStats(selected) : Promise.resolve(null)), [selected]);

  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.refetch} />;
  const s = stats.data;

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble de l'activité universitaire" />
      <div className="stats stats-4">
        <StatCard label="Étudiants" value={s ? formatNumber(s.studentCount) : "…"} detail="inscrits" icon="students" tone="indigo" />
        <StatCard label="Certificats en attente" value={s ? s.pendingCertificates : "…"} detail={s && s.pendingCertificates > 0 ? "À traiter" : "Rien à traiter"} icon="file" tone="orange" />
        <StatCard label="Étudiants à risque" value={s ? s.atRiskCount : "…"} detail="seuils dépassés" icon="warning" tone={s && s.atRiskCount > 0 ? "red" : "green"} />
        <StatCard label="Absences ce mois" value={s ? s.absencesThisMonth : "…"} detail={s ? `${s.unjustifiedRate} % non justifiées sur l'année` : ""} icon="calendar" tone={s && s.unjustifiedRate > 60 ? "red" : "blue"} />
      </div>
      <div className="dashboard-grid">
        <Card className="chart-card">
          <div className="card-title">
            <div><h3>Absences par mois</h3><p>Année universitaire {selected ?? "…"}–{selected ? selected + 1 : "…"}</p></div>
            <SelectField label="Période" value={selected ?? ""} onChange={(e) => setYear(Number(e.target.value))}>{(years.data ?? []).map((y) => <option key={y} value={y}>{y}–{y + 1}</option>)}</SelectField>
          </div>
          {s ? <MonthlyChart values={s.absencesByMonth} /> : <Loading />}
        </Card>
        <Card className="activity-card">
          <div className="card-title"><div><h3>Activité récente</h3><p>Journal des dernières actions</p></div></div>
          {s ? <ActivityFeed items={s.recentActivity} /> : <Loading />}
        </Card>
      </div>
      {s && s.topRisk.length > 0 && (
        <Card className="mb">
          <div className="card-title"><div><h3>Étudiants à surveiller</h3><p>Les cas les plus préoccupants cette année</p></div><Button variant="ghost" onClick={() => navigate("/at-risk")}>Tout voir <Icon name="chevron" size={16} /></Button></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Étudiant</th><th>Groupe</th><th>Matière principale</th><th>Total non justifiées</th><th /></tr></thead>
              <tbody>
                {s.topRisk.map((r) => (
                  <tr key={r.student.id} className="clickable" onClick={() => navigate(`/at-risk?studentId=${r.student.id}`)}>
                    <td data-label="Étudiant"><Person firstName={r.student.firstName} lastName={r.student.lastName} sub={r.student.registrationNumber} /></td>
                    <td data-label="Groupe">{shortFiliere(r.student.filiere)} · {r.student.niveau} {r.student.groupe}</td>
                    <td data-label="Matière principale">{r.topSubject ? `${r.topSubject.subject.name} (${r.topSubject.unjustified})` : "—"}</td>
                    <td data-label="Total non justifiées"><span className="count-pill">{r.totalUnjustified}</span></td>
                    <td className="row-action"><Icon name="chevron" size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card>
        <div className="card-title"><div><h3>Dernières absences</h3></div><Button variant="ghost" onClick={() => navigate("/absences")}>Voir toutes <Icon name="chevron" size={16} /></Button></div>
        {s ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Étudiant</th><th>Date</th><th>Matière</th><th>Enseignant</th><th>Statut</th></tr></thead>
              <tbody>
                {s.recentAbsences.map((r) => (
                  <tr key={r.absence.id} className="clickable" onClick={() => navigate(`/absences/${r.absence.id}`)}>
                    <td data-label="Étudiant"><Person firstName={r.student.firstName} lastName={r.student.lastName} /></td>
                    <td data-label="Date">{formatDate(r.session.date)}</td>
                    <td data-label="Matière">{r.subject.name}</td>
                    <td data-label="Enseignant">{r.teacher ? `${r.teacher.title} ${r.teacher.firstName} ${r.teacher.lastName}` : "—"}</td>
                    <td data-label="Statut"><AbsenceBadge status={r.absence.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Loading />}
      </Card>
    </>
  );
}
