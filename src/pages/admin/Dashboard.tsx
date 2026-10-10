import { useState } from "react";
import * as api from "../../api";
import { useQuery } from "../../api/useQuery";
import { AbsenceBadge, Button, Card, ErrorState, Icon, IconName, Loading, PageHeader, Person, SelectField, StatCard } from "../../components/ui";
import { navigate } from "../../router";
import { formatDate, formatNumber, shortFiliere, timeAgo } from "../../utils/format";
import type { Activity } from "../../types";

const ACTIVITY_ICON: Record<Activity["kind"], IconName> = {
  student_created: "students", student_updated: "students", student_deleted: "trash",
  teacher_created: "teacher", teacher_updated: "teacher", teacher_deleted: "trash", teacher_status: "teacher",
  subject_created: "book", session_saved: "checkAll",
  absence_created: "calendar", absence_updated: "calendar", absence_deleted: "trash",
  certificate_uploaded: "upload", certificate_accepted: "check", certificate_rejected: "ban", password_changed: "key",
};

export function ActivityFeed({ items }: { items: Activity[] }) {
  if (items.length === 0) return <p className="muted small pad">Aucune activité pour le moment.</p>;
  return <>{items.map((a) => <div className="activity" key={a.id}><span className="activity-icon"><Icon name={ACTIVITY_ICON[a.kind]} size={17} /></span><div><strong>{a.message}</strong><span>{timeAgo(a.at)}</span></div></div>)}</>;
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
          <div className="bar-column" key={i} title={`${api.MONTH_LABELS[i]} : ${v} absence${v > 1 ? "s" : ""}`}>
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
        <StatCard label="Enseignants" value={s ? `${s.activeTeacherCount}` : "…"} detail={s ? `${s.teacherCount - s.activeTeacherCount} désactivé${s.teacherCount - s.activeTeacherCount > 1 ? "s" : ""}` : ""} icon="teacher" tone="blue" />
        <StatCard label="Certificats en attente" value={s ? s.pendingCertificates : "…"} detail={s && s.pendingCertificates > 0 ? "À traiter" : "Rien à traiter"} icon="file" tone="orange" />
        <StatCard label="Absences ce mois" value={s ? s.absencesThisMonth : "…"} detail={s ? `${s.unjustifiedRate} % non justifiées sur l'année` : ""} icon="calendar" tone={s && s.unjustifiedRate > 60 ? "red" : "green"} />
      </div>
      <div className="dashboard-grid">
        <Card className="chart-card">
          <div className="card-title">
            <div><h3>Absences par mois</h3><p>Année universitaire {selected ?? "…"}–{selected ? selected + 1 : "…"}</p></div>
            <SelectField label="Période" value={selected ?? ""} onChange={(e) => setYear(Number(e.target.value))}>
              {(years.data ?? []).map((y) => <option key={y} value={y}>{y}–{y + 1}</option>)}
            </SelectField>
          </div>
          {s ? <MonthlyChart values={s.absencesByMonth} /> : <Loading />}
        </Card>
        <Card className="activity-card">
          <div className="card-title"><div><h3>Activité récente</h3><p>Dernières mises à jour</p></div></div>
          {s ? <ActivityFeed items={s.recentActivity} /> : <Loading />}
        </Card>
      </div>
      {s && s.flaggedStudents.length > 0 && (
        <Card className="mb">
          <div className="card-title"><div><h3>Étudiants à surveiller</h3><p>3 absences non justifiées ou plus dans une même matière</p></div><Button variant="ghost" onClick={() => navigate("/admin/absences?status=unjustified")}>Voir les absences <Icon name="chevron" size={16} /></Button></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Étudiant</th><th>Filière</th><th>Matière</th><th>Non justifiées</th><th /></tr></thead>
              <tbody>
                {s.flaggedStudents.slice(0, 6).map((f) => (
                  <tr key={f.student.id + f.subject.id}>
                    <td data-label="Étudiant"><Person firstName={f.student.firstName} lastName={f.student.lastName} sub={f.student.registrationNumber} /></td>
                    <td data-label="Filière">{shortFiliere(f.student.filiere)} · {f.student.niveau} · {f.student.groupe}</td>
                    <td data-label="Matière">{f.subject.name}</td>
                    <td data-label="Non justifiées"><span className="count-pill">{f.count}</span></td>
                    <td className="row-action"><button type="button" className="icon-btn" onClick={() => navigate(`/admin/absences?studentId=${f.student.id}&subjectId=${f.subject.id}`)} aria-label="Voir le détail"><Icon name="chevron" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card>
        <div className="card-title"><div><h3>Dernières absences</h3><p>Les absences enregistrées récemment</p></div><Button variant="ghost" onClick={() => navigate("/admin/absences")}>Voir toutes <Icon name="chevron" size={16} /></Button></div>
        {s ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Étudiant</th><th>Date</th><th>Matière</th><th>Enseignant</th><th>Statut</th></tr></thead>
              <tbody>
                {s.recentAbsences.map((r) => (
                  <tr key={r.absence.id} className="clickable" onClick={() => navigate(`/admin/absences/${r.absence.id}`)}>
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
