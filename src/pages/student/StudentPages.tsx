import { useEffect, useState } from "react";
import * as api from "../../api";
import { useQuery } from "../../api/useQuery";
import { useSession } from "../../auth";
import { AbsenceDetailModal } from "../../components/AbsenceDetail";
import { AbsenceTable } from "../../components/AbsenceTable";
import { CertificateUploadForm } from "../../components/CertificateUploadForm";
import { Alert, Button, Card, CertificateBadge, EmptyState, ErrorState, Icon, Loading, PageHeader, Pagination, SelectField, StatCard, Tabs } from "../../components/ui";
import { ActivityFeed } from "../admin/Dashboard";
import { navigate } from "../../router";
import type { AbsenceStatus, Student } from "../../types";
import { ABSENCE_STATUS_LABEL, UNJUSTIFIED_WARNING_THRESHOLD } from "../../types";
import { formatBytes, formatDate, formatDateTime } from "../../utils/format";

function useStudent(): Student {
  const { student } = useSession();
  if (!student) throw new Error("Aucune fiche étudiant liée à ce compte.");
  return student;
}

export function StudentDashboard() {
  const student = useStudent();
  const stats = useQuery(() => api.studentStats(student.id), [student.id]);
  const [detail, setDetail] = useState<string | null>(null);
  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.refetch} />;
  const s = stats.data;
  const toJustify = s ? s.unjustified + s.rejected : 0;
  return (
    <>
      <PageHeader title={`Bonjour, ${student.firstName}`} subtitle={`${student.filiere} · ${student.niveau} · ${student.groupe}`} action={toJustify > 0 ? <Button icon="upload" onClick={() => navigate("/student/justify")}>Justifier une absence</Button> : undefined} />
      {s && s.bySubject.some((b) => b.flagged) && <Alert tone="warning">Vous avez {UNJUSTIFIED_WARNING_THRESHOLD} absences non justifiées ou plus en {s.bySubject.filter((b) => b.flagged).map((b) => b.subject.name).join(", ")}. Déposez un justificatif si vous en avez un.</Alert>}
      <div className="stats stats-4">
        <StatCard label="Absences cette année" value={s ? s.total : "…"} icon="calendar" tone="indigo" />
        <StatCard label="Non justifiées" value={s ? s.unjustified + s.rejected : "…"} detail={s && s.rejected > 0 ? `dont ${s.rejected} justificatif${s.rejected > 1 ? "s" : ""} refusé${s.rejected > 1 ? "s" : ""}` : undefined} icon="alert" tone={toJustify > 0 ? "red" : "green"} />
        <StatCard label="En attente" value={s ? s.pending : "…"} detail="justificatif en cours d'examen" icon="clock" tone="orange" />
        <StatCard label="Justifiées" value={s ? s.justified : "…"} icon="check" tone="green" />
      </div>
      <div className="dashboard-grid">
        <Card className="chart-card">
          <div className="card-title"><div><h3>Par matière</h3><p>Seuil d'alerte : {UNJUSTIFIED_WARNING_THRESHOLD} absences non justifiées</p></div></div>
          {!s ? <Loading /> : s.bySubject.length === 0 ? <EmptyState icon="check" title="Aucune absence cette année" text="Continuez comme ça." /> : (
            <div className="hbar-list">
              {s.bySubject.map((b) => (
                <div key={b.subject.id} className={`hbar ${b.flagged ? "hbar-flagged" : ""}`}>
                  <span className="hbar-label">{b.subject.name}</span>
                  <span className="hbar-track"><span className="hbar-fill" style={{ width: `${Math.min(100, (b.unjustified / UNJUSTIFIED_WARNING_THRESHOLD) * 100)}%` }} /></span>
                  <span className="hbar-value">{b.unjustified}<small>/{b.total}</small></span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="activity-card">
          <div className="card-title"><div><h3>Activité récente</h3><p>Vos justificatifs et décisions</p></div></div>
          {!s ? <Loading /> : <ActivityFeed items={s.recentActivity} />}
        </Card>
      </div>
      <Card>
        <div className="card-title"><div><h3>Dernières absences</h3></div><Button variant="ghost" onClick={() => navigate("/student/absences")}>Voir toutes <Icon name="chevron" size={16} /></Button></div>
        {!s ? <Loading /> : s.recent.length === 0 ? <p className="muted small pad">Aucune absence enregistrée.</p> : <AbsenceTable rows={s.recent} showStudent={false} onDetail={(r) => setDetail(r.absence.id)} />}
      </Card>
      {detail && <AbsenceDetailModal absenceId={detail} role="student" onClose={() => setDetail(null)} />}
    </>
  );
}

const STATUSES: AbsenceStatus[] = ["unjustified", "pending", "justified", "rejected"];

export function StudentAbsencesPage() {
  const student = useStudent();
  const [status, setStatus] = useState<AbsenceStatus | "">("");
  const [subjectId, setSubjectId] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const subjects = useQuery(() => api.listSubjects(), []);
  useEffect(() => setPage(1), [status, subjectId]);
  const list = useQuery(() => api.listAbsences({ studentId: student.id, status, subjectId, page, pageSize: 10 }), [student.id, status, subjectId, page]);
  const counts = useQuery(async () => {
    const all = await Promise.all(STATUSES.map((s) => api.listAbsences({ studentId: student.id, status: s, pageSize: 1 })));
    return Object.fromEntries(STATUSES.map((s, i) => [s, all[i].total])) as Record<AbsenceStatus, number>;
  }, [student.id]);
  return (
    <>
      <PageHeader title="Mes absences" subtitle="Toutes vos absences enregistrées par vos enseignants" action={<Button icon="upload" onClick={() => navigate("/student/justify")}>Justifier une absence</Button>} />
      <Card>
        <div className="tabs-bar"><Tabs value={status} onChange={setStatus} items={[{ value: "" as AbsenceStatus | "", label: "Toutes" }, ...STATUSES.map((s) => ({ value: s as AbsenceStatus | "", label: ABSENCE_STATUS_LABEL[s], count: counts.data?.[s] }))]} /></div>
        <div className="filters filters-1-narrow">
          <SelectField label="Matière" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Toutes les matières</option>{(subjects.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
        </div>
        {list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> : !list.data ? <Loading /> : list.data.total === 0 ? <EmptyState icon="calendar" title="Aucune absence" text="Rien à afficher pour ces critères." /> : (
          <>
            <AbsenceTable rows={list.data.items} showStudent={false} stale={list.loading} onDetail={(r) => setDetail(r.absence.id)} />
            <Pagination page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>
      {detail && <AbsenceDetailModal absenceId={detail} role="student" onClose={() => setDetail(null)} />}
    </>
  );
}

export function StudentJustifyPage({ absenceId }: { absenceId?: string }) {
  const student = useStudent();
  return (
    <>
      <PageHeader title="Justifier une absence" subtitle="Déposez un certificat médical ou un autre justificatif" />
      <CertificateUploadForm student={student} preselectedAbsenceId={absenceId} onDone={() => navigate("/student/certificates")} />
    </>
  );
}

export function StudentCertificatesPage() {
  const student = useStudent();
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const list = useQuery(() => api.listCertificates({ studentId: student.id, page, pageSize: 10 }), [student.id, page]);
  return (
    <>
      <PageHeader title="Mes justificatifs" subtitle="Suivez le traitement de vos certificats" action={<Button icon="upload" onClick={() => navigate("/student/justify")}>Nouveau justificatif</Button>} />
      <Card>
        {list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> : !list.data ? <Loading /> : list.data.total === 0 ? <EmptyState icon="file" title="Aucun justificatif déposé" text="Quand vous déposerez un certificat, son suivi apparaîtra ici." action={<Button onClick={() => navigate("/student/justify")}>Justifier une absence</Button>} /> : (
          <>
            <div className={`table-wrap ${list.loading ? "is-stale" : ""}`}>
              <table>
                <thead><tr><th>Document</th><th>Période</th><th>Absences couvertes</th><th>Déposé le</th><th>Statut</th><th /></tr></thead>
                <tbody>
                  {list.data.items.map((row) => (
                    <tr key={row.certificate.id} className="clickable" onClick={() => row.absences[0] && setDetail(row.absences[0].absence.id)}>
                      <td data-label="Document"><span className="date-cell"><strong className="ellipsis">{row.certificate.fileName}</strong><small>{formatBytes(row.certificate.fileSize)}</small></span></td>
                      <td data-label="Période">{row.certificate.startDate === row.certificate.endDate ? formatDate(row.certificate.startDate) : `${formatDate(row.certificate.startDate)} → ${formatDate(row.certificate.endDate)}`}</td>
                      <td data-label="Absences couvertes" className="wrap">{row.absences.map((a) => `${a.subject.name} (${formatDate(a.session.date)})`).join(", ")}</td>
                      <td data-label="Déposé le">{formatDateTime(row.certificate.uploadedAt)}</td>
                      <td data-label="Statut"><span className="status-cell"><CertificateBadge status={row.certificate.status} />{row.certificate.reviewNote && <span className="muted small">{row.certificate.reviewNote}</span>}</span></td>
                      <td className="row-action"><button type="button" className="icon-btn" aria-label="Voir"><Icon name="more" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>
      {detail && <AbsenceDetailModal absenceId={detail} role="student" onClose={() => setDetail(null)} />}
    </>
  );
}
