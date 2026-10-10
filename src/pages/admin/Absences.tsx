import { FormEvent, useEffect, useMemo, useState } from "react";
import * as api from "../../api";
import { useDebounced, useMutation, useQuery } from "../../api/useQuery";
import { AbsenceDetailModal } from "../../components/AbsenceDetail";
import { AbsenceTable } from "../../components/AbsenceTable";
import { StudentSearch } from "../../components/StudentSearch";
import { Alert, Button, Card, EmptyState, ErrorState, Field, Icon, Loading, PageHeader, Pagination, SelectField, Tabs, useToast } from "../../components/ui";
import { FILIERES } from "../../data/seed";
import { navigate, queryParams } from "../../router";
import type { AbsenceStatus, Student } from "../../types";
import { ABSENCE_STATUS_LABEL } from "../../types";
import { todayIso } from "../../utils/format";

const STATUSES: AbsenceStatus[] = ["unjustified", "pending", "justified", "rejected"];

export default function AbsencesPage({ path, detailId }: { path: string; detailId?: string }) {
  const initial = useMemo(() => queryParams(path), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AbsenceStatus | "">((initial.get("status") as AbsenceStatus | null) ?? "");
  const [subjectId, setSubjectId] = useState(initial.get("subjectId") ?? "");
  const [filiere, setFiliere] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const studentId = initial.get("studentId") ?? "";
  const [detail, setDetail] = useState<string | null>(detailId ?? null);
  useEffect(() => {
    if (detailId) setDetail(detailId);
  }, [detailId]);
  const closeDetail = () => {
    setDetail(null);
    if (detailId) navigate("/admin/absences", true);
  };
  const debounced = useDebounced(query);
  const subjects = useQuery(() => api.listSubjects(), []);
  const student = useQuery(() => (studentId ? api.getStudent(studentId) : Promise.resolve(null)), [studentId]);
  useEffect(() => setPage(1), [debounced, status, subjectId, filiere, from, to]);
  const list = useQuery(() => api.listAbsences({ query: debounced, status, subjectId, filiere, from, to, studentId, page, pageSize: 10 }), [debounced, status, subjectId, filiere, from, to, studentId, page]);
  const counts = useQuery(async () => {
    const all = await Promise.all(STATUSES.map((s) => api.listAbsences({ status: s, studentId, pageSize: 1 })));
    return Object.fromEntries(STATUSES.map((s, i) => [s, all[i].total])) as Record<AbsenceStatus, number>;
  }, [studentId]);

  const hasFilters = !!(query || status || subjectId || filiere || from || to);
  const resetFilters = () => { setQuery(""); setStatus(""); setSubjectId(""); setFiliere(""); setFrom(""); setTo(""); };

  return (
    <>
      <PageHeader
        title={student.data ? `Absences de ${student.data.firstName} ${student.data.lastName}` : "Absences"}
        subtitle={student.data ? `N° ${student.data.registrationNumber} · ${student.data.niveau} ${student.data.groupe}` : "Consultez et traitez les absences signalées"}
        action={<div className="actions-row">{studentId && <Button variant="secondary" icon="chevronLeft" onClick={() => navigate("/admin/absences")}>Toutes les absences</Button>}<Button icon="plus" onClick={() => navigate("/admin/absences/new")}>Ajouter une absence</Button></div>}
      />
      <Card>
        <div className="tabs-bar">
          <Tabs value={status} onChange={setStatus} items={[{ value: "" as AbsenceStatus | "", label: "Toutes", count: counts.data ? STATUSES.reduce((n, s) => n + counts.data![s], 0) : undefined }, ...STATUSES.map((s) => ({ value: s as AbsenceStatus | "", label: ABSENCE_STATUS_LABEL[s], count: counts.data?.[s] }))]} />
        </div>
        <div className="filters filters-5">
          <div className="search"><Icon name="search" size={18} /><input aria-label="Rechercher" placeholder="Étudiant, n° d'inscription, matière…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <SelectField label="Matière" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Toutes les matières</option>{(subjects.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
          <SelectField label="Filière" value={filiere} onChange={(e) => setFiliere(e.target.value)}><option value="">Toutes les filières</option>{FILIERES.map((f) => <option key={f} value={f}>{f}</option>)}</SelectField>
          <Field label="Du" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <Field label="Au" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        {list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> : !list.data ? <Loading /> : list.data.total === 0 ? (
          <EmptyState icon="calendar" title="Aucune absence trouvée." text={hasFilters ? "Modifiez vos filtres." : "Aucune absence enregistrée pour le moment."} action={hasFilters ? <Button variant="secondary" onClick={resetFilters}>Réinitialiser les filtres</Button> : undefined} />
        ) : (
          <>
            <AbsenceTable rows={list.data.items} stale={list.loading} onDetail={(r) => setDetail(r.absence.id)} />
            <Pagination page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>
      {detail && <AbsenceDetailModal absenceId={detail} role="admin" onClose={closeDetail} />}
    </>
  );
}

export function NewAbsencePage() {
  const subjects = useQuery(() => api.listSubjects(), []);
  const teachers = useQuery(() => api.listTeachers({ status: "active", pageSize: 500 }), []);
  const [student, setStudent] = useState<Student | null>(null);
  const [form, setForm] = useState({ subjectId: "", teacherId: "", date: todayIso(), startTime: "08:30", endTime: "10:00" });
  const create = useMutation(api.createAbsence);
  const toast = useToast();
  const fieldError = (k: string) => (create.error?.field === k ? create.error.message : undefined);
  const availableTeachers = (teachers.data?.items ?? []).filter((t) => !form.subjectId || t.teacher.subjectIds.includes(form.subjectId));

  useEffect(() => {
    if (form.teacherId && !availableTeachers.some((t) => t.teacher.id === form.teacherId)) setForm((f) => ({ ...f, teacherId: "" }));
  }, [form.subjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await create.run({ studentId: student?.id ?? "", ...form });
    if (r.ok) {
      toast("Absence enregistrée.");
      navigate(`/admin/absences?studentId=${r.data.student.id}`);
    }
  };

  return (
    <>
      <PageHeader title="Ajouter une absence" subtitle="Saisie manuelle par l'administration (l'appel en séance reste le circuit normal)" />
      <Card className="form-card">
        {create.error && !create.error.field && <Alert tone="danger" onClose={create.clearError}>{create.error.message}</Alert>}
        <form onSubmit={submit} noValidate>
          <div className="form-section">
            <div className="section-title"><span>1</span><div><h3>Étudiant</h3><p>L'absence sera rattachée à son groupe.</p></div></div>
            <StudentSearch value={student} onChange={setStudent} error={fieldError("studentId")} autoFocus />
          </div>
          <div className="form-section">
            <div className="section-title"><span>2</span><div><h3>Séance</h3><p>Si une séance identique existe déjà, l'absence y sera ajoutée.</p></div></div>
            <div className="form-grid">
              <SelectField label="Matière" value={form.subjectId} onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))} error={fieldError("subjectId")} required><option value="">Sélectionner une matière</option>{(subjects.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
              <SelectField label="Enseignant" value={form.teacherId} onChange={(e) => setForm((f) => ({ ...f, teacherId: e.target.value }))} error={fieldError("teacherId")} required><option value="">Sélectionner un enseignant</option>{availableTeachers.map((t) => <option key={t.teacher.id} value={t.teacher.id}>{t.teacher.title} {t.teacher.firstName} {t.teacher.lastName}</option>)}</SelectField>
              <Field label="Date" type="date" value={form.date} max={todayIso()} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} error={fieldError("date")} required />
              <div className="form-grid inner">
                <Field label="Début" type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} error={fieldError("startTime")} required />
                <Field label="Fin" type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} error={fieldError("endTime")} required />
              </div>
            </div>
          </div>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => navigate("/admin/absences")}>Annuler</Button>
            <Button type="submit" loading={create.pending}>Enregistrer l'absence</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
