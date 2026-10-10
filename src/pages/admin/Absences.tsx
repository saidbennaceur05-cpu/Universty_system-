import { FormEvent, useEffect, useMemo, useState } from "react";
import * as api from "../../api";
import { useDebounced, useMutation, useQuery } from "../../api/useQuery";
import { AbsenceDetailModal } from "../../components/AbsenceDetail";
import { AbsenceTable } from "../../components/AbsenceTable";
import { StudentSearch } from "../../components/StudentSearch";
import { Alert, Button, Card, EmptyState, ErrorState, Field, Icon, Loading, PageHeader, Pagination, SelectField, Tabs, useConfirm, useToast } from "../../components/ui";
import { navigate, queryParams } from "../../router";
import { absencesToCsv, downloadCsv } from "../../utils/csv";
import { todayIso } from "../../utils/format";
import type { AbsenceStatus, Student } from "../../types";
import { ABSENCE_STATUS_LABEL } from "../../types";

const STATUSES: AbsenceStatus[] = ["unjustified", "pending", "justified", "rejected"];

export default function AbsencesPage({ path, detailId }: { path: string; detailId?: string }) {
  const initial = useMemo(() => queryParams(path), []); // eslint-disable-line react-hooks/exhaustive-deps
  const settings = useQuery(() => api.getSettings(), []);
  const subjects = useQuery(() => api.listSubjects(), []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AbsenceStatus | "">((initial.get("status") as AbsenceStatus | null) ?? "");
  const [subjectId, setSubjectId] = useState(initial.get("subjectId") ?? "");
  const [filiere, setFiliere] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<string | null>(detailId ?? null);
  useEffect(() => { if (detailId) setDetail(detailId); }, [detailId]);
  const closeDetail = () => { setDetail(null); if (detailId) navigate("/absences", true); };
  const studentId = initial.get("studentId") ?? "";
  const debounced = useDebounced(query);
  const student = useQuery(() => (studentId ? api.getStudent(studentId) : Promise.resolve(null)), [studentId]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [debounced, status, subjectId, filiere, from, to]);
  const list = useQuery(() => api.listAbsences({ query: debounced, status, subjectId, filiere, from, to, studentId, page, pageSize: 10 }), [debounced, status, subjectId, filiere, from, to, studentId, page]);
  const counts = useQuery(async () => {
    const all = await Promise.all(STATUSES.map((s) => api.listAbsences({ status: s, studentId, pageSize: 1 })));
    return Object.fromEntries(STATUSES.map((s, i) => [s, all[i].total])) as Record<AbsenceStatus, number>;
  }, [studentId]);
  const confirm = useConfirm();
  const toast = useToast();
  const bulk = useMutation(api.bulkAbsences);

  const hasFilters = !!(query || status || subjectId || filiere || from || to);
  const resetFilters = () => { setQuery(""); setStatus(""); setSubjectId(""); setFiliere(""); setFrom(""); setTo(""); };

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pageIds = (list.data?.items ?? []).map((r) => r.absence.id);
  const exportCsv = async () => {
    const all = await api.listAllAbsences({ query: debounced, status, subjectId, filiere, from, to, studentId });
    downloadCsv(`absences_${todayIso()}.csv`, absencesToCsv(all));
  };
  const runBulk = async (op: Parameters<typeof api.bulkAbsences>[1]) => {
    const label = op.kind === "delete" ? "supprimer" : `marquer « ${ABSENCE_STATUS_LABEL[op.status]} »`;
    if (!(await confirm({ title: "Action groupée", tone: op.kind === "delete" ? "danger" : "primary", confirmLabel: "Confirmer", message: <>Voulez-vous {label} <strong>{selected.size}</strong> absence(s) ? Les justificatifs en attente sont ignorés.</> }))) return;
    const r = await bulk.run([...selected], op);
    if (r.ok) { toast(`${r.data} absence(s) mises à jour.`); setSelected(new Set()); }
  };

  return (
    <>
      <PageHeader
        title={student.data ? `Absences de ${student.data.firstName} ${student.data.lastName}` : "Absences"}
        subtitle={student.data ? `N° ${student.data.registrationNumber} · ${student.data.niveau} ${student.data.groupe}` : "Consultez, traitez et exportez les absences"}
        action={<div className="actions-row">{studentId && <Button variant="secondary" icon="chevronLeft" onClick={() => navigate("/absences")}>Toutes</Button>}<Button variant="secondary" icon="download" onClick={exportCsv}>Exporter</Button><Button icon="plus" onClick={() => navigate("/absences/new")}>Ajouter</Button></div>}
      />
      {bulk.error && <Alert tone="danger" onClose={bulk.clearError}>{bulk.error.message}</Alert>}
      <Card>
        <div className="tabs-bar"><Tabs value={status} onChange={setStatus} items={[{ value: "" as AbsenceStatus | "", label: "Toutes", count: counts.data ? STATUSES.reduce((n, s) => n + counts.data![s], 0) : undefined }, ...STATUSES.map((s) => ({ value: s as AbsenceStatus | "", label: ABSENCE_STATUS_LABEL[s], count: counts.data?.[s] }))]} /></div>
        <div className="filters filters-5">
          <div className="search"><Icon name="search" size={18} /><input aria-label="Rechercher" placeholder="Étudiant, n° d'inscription, matière…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <SelectField label="Matière" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Toutes les matières</option>{(subjects.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
          <SelectField label="Filière" value={filiere} onChange={(e) => setFiliere(e.target.value)}><option value="">Toutes les filières</option>{(settings.data?.filieres ?? []).map((f) => <option key={f} value={f}>{f}</option>)}</SelectField>
          <Field label="Du" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <Field label="Au" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        {selected.size > 0 && (
          <div className="bulk-bar">
            <span>{selected.size} sélectionné(s)</span>
            <div className="actions-row">
              <Button variant="secondary" onClick={() => runBulk({ kind: "status", status: "justified" })} loading={bulk.pending}>Marquer justifiées</Button>
              <Button variant="secondary" onClick={() => runBulk({ kind: "status", status: "unjustified" })} loading={bulk.pending}>Marquer non justifiées</Button>
              <Button variant="danger" icon="trash" onClick={() => runBulk({ kind: "delete" })} loading={bulk.pending}>Supprimer</Button>
            </div>
          </div>
        )}
        {list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> : !list.data ? <Loading /> : list.data.total === 0 ? (
          <EmptyState icon="calendar" title="Aucune absence trouvée." text={hasFilters ? "Modifiez vos filtres." : "Ajoutez ou importez des absences."} action={hasFilters ? <Button variant="secondary" onClick={resetFilters}>Réinitialiser</Button> : undefined} />
        ) : (
          <>
            <AbsenceTable rows={list.data.items} stale={list.loading} onDetail={(r) => setDetail(r.absence.id)} selectable={() => true} selected={selected} onToggle={toggle} allIds={pageIds} onToggleAll={(ids, on) => setSelected((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; })} />
            <Pagination page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>
      {detail && <AbsenceDetailModal absenceId={detail} onClose={closeDetail} />}
    </>
  );
}

export function NewAbsencePage() {
  const subjects = useQuery(() => api.listSubjects(), []);
  const teachers = useQuery(() => api.listTeachersSimple(), []);
  const [student, setStudent] = useState<Student | null>(null);
  const [form, setForm] = useState({ subjectId: "", teacherId: "", date: todayIso(), startTime: "08:30", endTime: "10:00" });
  const create = useMutation(api.createAbsence);
  const toast = useToast();
  const fieldError = (k: string) => (create.error?.field === k ? create.error.message : undefined);
  const availableTeachers = (teachers.data ?? []).filter((t) => !form.subjectId || t.subjectIds.includes(form.subjectId));

  useEffect(() => {
    if (form.teacherId && !availableTeachers.some((t) => t.id === form.teacherId)) setForm((f) => ({ ...f, teacherId: "" }));
  }, [form.subjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await create.run({ studentId: student?.id ?? "", ...form });
    if (r.ok) { toast("Absence enregistrée."); navigate(`/absences?studentId=${r.data.student.id}`); }
  };

  return (
    <>
      <PageHeader title="Ajouter une absence" subtitle="Saisie manuelle par l'administration" />
      <Card className="form-card">
        {create.error && !create.error.field && <Alert tone="danger" onClose={create.clearError}>{create.error.message}</Alert>}
        <form onSubmit={submit} noValidate>
          <div className="form-section">
            <div className="section-title"><span className="step-num">1</span><div><h3>Étudiant</h3><p>L'absence sera rattachée à son groupe.</p></div></div>
            <StudentSearch value={student} onChange={setStudent} error={fieldError("studentId")} autoFocus />
          </div>
          <div className="form-section">
            <div className="section-title"><span className="step-num">2</span><div><h3>Séance</h3><p>Une séance identique existante est réutilisée.</p></div></div>
            <div className="form-grid">
              <SelectField label="Matière" value={form.subjectId} onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))} error={fieldError("subjectId")} required><option value="">Sélectionner une matière</option>{(subjects.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
              <SelectField label="Enseignant" value={form.teacherId} onChange={(e) => setForm((f) => ({ ...f, teacherId: e.target.value }))} error={fieldError("teacherId")} required><option value="">Sélectionner un enseignant</option>{availableTeachers.map((t) => <option key={t.id} value={t.id}>{t.title} {t.firstName} {t.lastName}</option>)}</SelectField>
              <Field label="Date" type="date" value={form.date} max={todayIso()} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} error={fieldError("date")} required />
              <div className="form-grid inner">
                <Field label="Début" type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} error={fieldError("startTime")} required />
                <Field label="Fin" type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} error={fieldError("endTime")} required />
              </div>
            </div>
          </div>
          <div className="form-actions"><Button variant="secondary" onClick={() => navigate("/absences")}>Annuler</Button><Button type="submit" loading={create.pending}>Enregistrer</Button></div>
        </form>
      </Card>
    </>
  );
}
