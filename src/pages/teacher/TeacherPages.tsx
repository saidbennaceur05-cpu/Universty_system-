import { FormEvent, useEffect, useMemo, useState } from "react";
import * as api from "../../api";
import { useMutation, useQuery } from "../../api/useQuery";
import { useSession } from "../../auth";
import { AbsenceDetailModal } from "../../components/AbsenceDetail";
import { AbsenceTable } from "../../components/AbsenceTable";
import { Alert, Avatar, Button, Card, EmptyState, ErrorState, Field, Icon, Loading, PageHeader, Pagination, SelectField, StatCard, Tabs, useConfirm, useToast } from "../../components/ui";
import { navigate } from "../../router";
import type { AbsenceStatus, Teacher } from "../../types";
import { ABSENCE_STATUS_LABEL } from "../../types";
import { formatDate, plural, shortFiliere, todayIso } from "../../utils/format";

function useTeacher(): Teacher {
  const { teacher } = useSession();
  if (!teacher) throw new Error("Aucune fiche enseignant liée à ce compte.");
  return teacher;
}

// ---------------------------------------------------------------------------------------------

export function TeacherDashboard() {
  const teacher = useTeacher();
  const stats = useQuery(() => api.teacherStats(teacher.id), [teacher.id]);
  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.refetch} />;
  const s = stats.data;
  return (
    <>
      <PageHeader title={`Bonjour, ${teacher.title} ${teacher.lastName}`} subtitle="Vos séances et les absences de vos étudiants cette année" action={<Button icon="checkAll" onClick={() => navigate("/teacher/roll-call")}>Faire l'appel</Button>} />
      <div className="stats stats-4">
        <StatCard label="Matières" value={s ? s.subjects.length : "…"} detail={s ? s.subjects.map((x) => x.code).join(" · ") : ""} icon="book" tone="indigo" />
        <StatCard label="Séances enregistrées" value={s ? s.sessionCount : "…"} detail="année en cours" icon="clock" tone="blue" />
        <StatCard label="Absences relevées" value={s ? s.absenceCount : "…"} detail={s ? `${s.pendingCount} en attente de justificatif` : ""} icon="calendar" tone="orange" />
        <StatCard label="Étudiants à surveiller" value={s ? s.flaggedStudents.length : "…"} detail="3 absences non justifiées ou plus" icon="warning" tone={s && s.flaggedStudents.length > 0 ? "red" : "green"} />
      </div>
      <div className="dashboard-grid">
        <Card className="chart-card">
          <div className="card-title"><div><h3>Dernières séances</h3><p>Cliquez pour revoir ou corriger l'appel</p></div><Button variant="ghost" onClick={() => navigate("/teacher/sessions")}>Toutes <Icon name="chevron" size={16} /></Button></div>
          {!s ? <Loading /> : s.recentSessions.length === 0 ? <EmptyState icon="clock" title="Aucune séance" text="Faites votre premier appel." action={<Button onClick={() => navigate("/teacher/roll-call")}>Faire l'appel</Button>} /> : (
            <div className="session-list">
              {s.recentSessions.map((r) => (
                <button type="button" key={r.session.id} className="session-item" onClick={() => navigate(`/teacher/roll-call/${r.session.id}`)}>
                  <span className="session-date"><strong>{formatDate(r.session.date)}</strong><small>{r.session.startTime}–{r.session.endTime}</small></span>
                  <span className="session-main"><strong>{r.subject.name}</strong><small>{shortFiliere(r.session.filiere)} · {r.session.niveau} · {r.session.groupe}</small></span>
                  <span className={`count-pill ${r.absentCount === 0 ? "pill-ok" : ""}`}>{r.absentCount}/{r.studentCount} abs.</span>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card className="activity-card">
          <div className="card-title"><div><h3>Absences par matière</h3><p>Année en cours</p></div></div>
          {!s ? <Loading /> : s.absencesBySubject.length === 0 ? <p className="muted small">Aucune matière attribuée.</p> : (
            <div className="hbar-list">
              {s.absencesBySubject.map(({ subject, count }) => {
                const max = Math.max(1, ...s.absencesBySubject.map((x) => x.count));
                return <div key={subject.id} className="hbar"><span className="hbar-label">{subject.name}</span><span className="hbar-track"><span className="hbar-fill" style={{ width: `${(count / max) * 100}%` }} /></span><span className="hbar-value">{count}</span></div>;
              })}
            </div>
          )}
        </Card>
      </div>
      {s && s.flaggedStudents.length > 0 && (
        <Card>
          <div className="card-title"><div><h3>Étudiants à surveiller</h3><p>Absences non justifiées répétées dans vos matières</p></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Étudiant</th><th>Groupe</th><th>Matière</th><th>Non justifiées</th><th /></tr></thead>
              <tbody>
                {s.flaggedStudents.map((f) => (
                  <tr key={f.student.id + f.subject.id} className="clickable" onClick={() => navigate(`/teacher/absences?studentId=${f.student.id}&subjectId=${f.subject.id}`)}>
                    <td data-label="Étudiant"><span className="person"><Avatar firstName={f.student.firstName} lastName={f.student.lastName} />{f.student.lastName} {f.student.firstName}</span></td>
                    <td data-label="Groupe">{shortFiliere(f.student.filiere)} · {f.student.niveau} {f.student.groupe}</td>
                    <td data-label="Matière">{f.subject.name}</td>
                    <td data-label="Non justifiées"><span className="count-pill">{f.count}</span></td>
                    <td className="row-action"><Icon name="chevron" size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------

export function RollCallPage({ sessionId }: { sessionId?: string }) {
  const teacher = useTeacher();
  const subjects = useQuery(() => api.listSubjects(), []);
  const groups = useQuery(() => api.listGroups(), []);
  const existing = useQuery(() => (sessionId ? api.getSessionDetail(sessionId) : Promise.resolve(null)), [sessionId]);
  const mySubjects = (subjects.data ?? []).filter((s) => teacher.subjectIds.includes(s.id));

  const defaultForm = () => ({ subjectId: mySubjects[0]?.id ?? "", groupKey: "", date: todayIso(), startTime: "08:30", endTime: "10:00" });
  const [form, setForm] = useState(defaultForm);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ added: number; removed: number; kept: string[] } | null>(null);
  const save = useMutation(api.saveRollCall);
  const remove = useMutation(api.deleteSession);
  const confirm = useConfirm();
  const toast = useToast();

  useEffect(() => {
    if (!existing.data) return;
    const s = existing.data.row.session;
    setForm({ subjectId: s.subjectId, groupKey: `${s.filiere}|${s.niveau}|${s.groupe}`, date: s.date, startTime: s.startTime, endTime: s.endTime });
    setAbsent(new Set(existing.data.absences.map((a) => a.studentId)));
  }, [existing.data]);

  // Entering "new roll call" (also from an edit screen, same component instance) starts from a blank form.
  useEffect(() => {
    if (!sessionId) {
      setForm(defaultForm());
      setAbsent(new Set());
    }
  }, [sessionId, mySubjects.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const [filiere, niveau, groupe] = form.groupKey.split("|");
  const roster = useQuery(() => (form.groupKey ? api.listStudents({ filiere, niveau, groupe, pageSize: 500 }) : Promise.resolve(null)), [form.groupKey]);
  const lockedStatuses = useMemo(() => new Map((existing.data?.absences ?? []).filter((a) => a.status !== "unjustified").map((a) => [a.studentId, a.status])), [existing.data]);
  const fieldError = (k: string) => (save.error?.field === k ? save.error.message : undefined);

  const toggle = (id: string) => setAbsent((s) => {
    if (lockedStatuses.has(id)) return s;
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await save.run({ sessionId, subjectId: form.subjectId, teacherId: teacher.id, date: form.date, startTime: form.startTime, endTime: form.endTime, filiere, niveau, groupe, absentStudentIds: [...absent] });
    if (r.ok) {
      setResult({ added: r.data.added, removed: r.data.removed, kept: r.data.kept.map((s) => `${s.firstName} ${s.lastName}`) });
      toast(sessionId ? "Appel mis à jour." : "Appel enregistré.");
      if (!sessionId) navigate(`/teacher/roll-call/${r.data.session.id}`, true);
    }
  };

  const onDelete = async () => {
    if (!sessionId) return;
    if (!(await confirm({ title: "Supprimer la séance", tone: "danger", confirmLabel: "Supprimer", message: "La séance et ses absences non justifiées seront supprimées." }))) return;
    const r = await remove.run(sessionId);
    if (r.ok) {
      toast("Séance supprimée.");
      navigate("/teacher/sessions", true);
    }
  };

  if (sessionId && existing.error) return <ErrorState message={existing.error} />;
  if (!subjects.data || !groups.data || (sessionId && !existing.data)) return <Loading />;
  const students = roster.data?.items ?? [];
  const presentCount = students.length - students.filter((s) => absent.has(s.id)).length;

  return (
    <>
      <PageHeader title={sessionId ? "Modifier l'appel" : "Faire l'appel"} subtitle={sessionId ? "Corrigez la liste des absents de cette séance" : "Sélectionnez la séance puis cochez les étudiants absents"} action={sessionId ? <Button variant="secondary" icon="trash" onClick={onDelete} loading={remove.pending}>Supprimer la séance</Button> : undefined} />
      {result && <Alert tone="success" onClose={() => setResult(null)}>Appel enregistré : {plural(result.added, "absence ajoutée", "absences ajoutées")}, {plural(result.removed, "retirée")}.{result.kept.length > 0 && ` Conservées car déjà justifiées ou en attente : ${result.kept.join(", ")}.`}</Alert>}
      {(save.error && !save.error.field) || remove.error ? <Alert tone="danger" onClose={() => { save.clearError(); remove.clearError(); }}>{save.error?.message ?? remove.error?.message}</Alert> : null}
      {mySubjects.length === 0 && <Alert tone="warning">Aucune matière ne vous est attribuée. Contactez l'administration.</Alert>}
      <form onSubmit={submit} noValidate className="rollcall-grid">
        <Card className="form-card">
          <div className="step-label"><span className="step-num">1</span>Séance</div>
          <div className="stack">
            <SelectField label="Matière" value={form.subjectId} onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))} error={fieldError("subjectId")} required>{mySubjects.length === 0 && <option value="">Aucune matière</option>}{mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
            <SelectField label="Groupe" value={form.groupKey} onChange={(e) => { setForm((f) => ({ ...f, groupKey: e.target.value })); if (!sessionId) setAbsent(new Set()); }} error={fieldError("groupe")} required>
              <option value="">Sélectionner un groupe</option>
              {groups.data.map((g) => <option key={`${g.filiere}|${g.niveau}|${g.groupe}`} value={`${g.filiere}|${g.niveau}|${g.groupe}`}>{shortFiliere(g.filiere)} · {g.niveau} · {g.groupe} ({g.count})</option>)}
            </SelectField>
            <Field label="Date" type="date" value={form.date} max={todayIso()} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} error={fieldError("date")} required />
            <div className="form-grid inner">
              <Field label="Début" type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} error={fieldError("startTime")} required />
              <Field label="Fin" type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} error={fieldError("endTime")} required />
            </div>
          </div>
        </Card>
        <Card className="form-card">
          <div className="step-label between"><span className="step-left"><span className="step-num">2</span>Étudiants</span>{students.length > 0 && <span className="muted small">{presentCount} présent{presentCount > 1 ? "s" : ""} · {absent.size} absent{absent.size > 1 ? "s" : ""}</span>}</div>
          {!form.groupKey ? <EmptyState icon="students" title="Choisissez un groupe" text="La liste des étudiants s'affichera ici." /> : roster.loading && !roster.data ? <Loading /> : students.length === 0 ? <EmptyState icon="students" title="Aucun étudiant dans ce groupe" /> : (
            <>
              <div className="roster-actions">
                <Button variant="secondary" onClick={() => setAbsent(new Set([...lockedStatuses.keys()]))} disabled={absent.size === lockedStatuses.size}>Tous présents</Button>
              </div>
              <ul className="roster">
                {students.map((s) => {
                  const isAbsent = absent.has(s.id);
                  const locked = lockedStatuses.get(s.id);
                  return (
                    <li key={s.id}>
                      <label className={`roster-item ${isAbsent ? "absent" : ""} ${locked ? "locked" : ""}`}>
                        <input type="checkbox" checked={isAbsent} onChange={() => toggle(s.id)} disabled={!!locked} />
                        <Avatar firstName={s.firstName} lastName={s.lastName} />
                        <span className="roster-name"><strong>{s.lastName} {s.firstName}</strong><small>N° {s.registrationNumber}</small></span>
                        <span className={`roster-state ${isAbsent ? "is-absent" : ""}`}>{locked ? ABSENCE_STATUS_LABEL[locked as AbsenceStatus] : isAbsent ? "Absent" : "Présent"}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {lockedStatuses.size > 0 && <p className="muted small">Les absences déjà justifiées ou en attente d'un justificatif sont verrouillées.</p>}
            </>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => navigate(sessionId ? "/teacher/sessions" : "/teacher")}>Annuler</Button>
            <Button type="submit" icon="check" loading={save.pending} disabled={!form.groupKey || students.length === 0}>{sessionId ? "Enregistrer les modifications" : "Enregistrer l'appel"}</Button>
          </div>
        </Card>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

export function TeacherSessionsPage() {
  const teacher = useTeacher();
  const [subjectId, setSubjectId] = useState("");
  const [page, setPage] = useState(1);
  const subjects = useQuery(() => api.listSubjects(), []);
  useEffect(() => setPage(1), [subjectId]);
  const list = useQuery(() => api.listSessions({ teacherId: teacher.id, subjectId, page, pageSize: 12 }), [teacher.id, subjectId, page]);
  const mySubjects = (subjects.data ?? []).filter((s) => teacher.subjectIds.includes(s.id));
  return (
    <>
      <PageHeader title="Mes séances" subtitle="Toutes les séances pour lesquelles vous avez fait l'appel" action={<Button icon="checkAll" onClick={() => navigate("/teacher/roll-call")}>Faire l'appel</Button>} />
      <Card>
        <div className="filters filters-1-narrow">
          <SelectField label="Matière" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Toutes mes matières</option>{mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
        </div>
        {list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> : !list.data ? <Loading /> : list.data.total === 0 ? <EmptyState icon="clock" title="Aucune séance" text="Faites votre premier appel pour la voir apparaître ici." /> : (
          <>
            <div className={`table-wrap ${list.loading ? "is-stale" : ""}`}>
              <table>
                <thead><tr><th>Date</th><th>Matière</th><th>Groupe</th><th>Absents</th><th /></tr></thead>
                <tbody>
                  {list.data.items.map((r) => (
                    <tr key={r.session.id} className="clickable" onClick={() => navigate(`/teacher/roll-call/${r.session.id}`)}>
                      <td data-label="Date"><span className="date-cell"><strong>{formatDate(r.session.date)}</strong><small>{r.session.startTime}–{r.session.endTime}</small></span></td>
                      <td data-label="Matière">{r.subject.name}</td>
                      <td data-label="Groupe">{shortFiliere(r.session.filiere)} · {r.session.niveau} · {r.session.groupe}</td>
                      <td data-label="Absents"><span className={`count-pill ${r.absentCount === 0 ? "pill-ok" : ""}`}>{r.absentCount} / {r.studentCount}</span></td>
                      <td className="row-action"><button type="button" className="icon-btn" aria-label="Modifier l'appel"><Icon name="edit" size={17} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

const STATUSES: AbsenceStatus[] = ["unjustified", "pending", "justified", "rejected"];

export function TeacherAbsencesPage({ initialStudentId = "", initialSubjectId = "" }: { initialStudentId?: string; initialSubjectId?: string }) {
  const teacher = useTeacher();
  const [status, setStatus] = useState<AbsenceStatus | "">("");
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const subjects = useQuery(() => api.listSubjects(), []);
  const student = useQuery(() => (initialStudentId ? api.getStudent(initialStudentId) : Promise.resolve(null)), [initialStudentId]);
  useEffect(() => setPage(1), [status, subjectId, query]);
  const list = useQuery(() => api.listAbsences({ teacherId: teacher.id, status, subjectId, query, studentId: initialStudentId, page, pageSize: 10 }), [teacher.id, status, subjectId, query, initialStudentId, page]);
  const mySubjects = (subjects.data ?? []).filter((s) => teacher.subjectIds.includes(s.id));
  return (
    <>
      <PageHeader title={student.data ? `Absences de ${student.data.firstName} ${student.data.lastName}` : "Absences dans mes matières"} subtitle="Consultation : la validation des justificatifs est faite par l'administration" action={initialStudentId ? <Button variant="secondary" icon="chevronLeft" onClick={() => navigate("/teacher/absences")}>Toutes les absences</Button> : undefined} />
      <Card>
        <div className="tabs-bar"><Tabs value={status} onChange={setStatus} items={[{ value: "" as AbsenceStatus | "", label: "Toutes" }, ...STATUSES.map((s) => ({ value: s as AbsenceStatus | "", label: ABSENCE_STATUS_LABEL[s] }))]} /></div>
        <div className="filters teacher-filters">
          <div className="search"><Icon name="search" size={18} /><input aria-label="Rechercher" placeholder="Étudiant ou n° d'inscription…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <SelectField label="Matière" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Toutes mes matières</option>{mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
        </div>
        {list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> : !list.data ? <Loading /> : list.data.total === 0 ? <EmptyState icon="calendar" title="Aucune absence" text="Aucune absence ne correspond à ces critères." /> : (
          <>
            <AbsenceTable rows={list.data.items} showTeacher={false} stale={list.loading} onDetail={(r) => setDetail(r.absence.id)} />
            <Pagination page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>
      {detail && <AbsenceDetailModal absenceId={detail} role="teacher" onClose={() => setDetail(null)} />}
    </>
  );
}
