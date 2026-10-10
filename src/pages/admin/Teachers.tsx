import { FormEvent, useEffect, useState } from "react";
import * as api from "../../api";
import { useDebounced, useMutation, useQuery } from "../../api/useQuery";
import { Alert, Button, Card, EmptyState, ErrorState, Field, Icon, Loading, Modal, PageHeader, Person, SelectField, useConfirm, useToast } from "../../components/ui";
import type { Teacher } from "../../types";

const TITLES = ["Dr.", "Pr.", "M.", "Mme"];
const EMPTY = { title: "Dr.", firstName: "", lastName: "", email: "", subjectIds: [] as string[] };

export default function TeachersPage() {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const teachers = useQuery(() => api.listTeachersSimple(), []);
  const subjects = useQuery(() => api.listSubjects(), []);
  const [editing, setEditing] = useState<Teacher | "new" | null>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const remove = useMutation(api.deleteTeacher);

  const onDelete = async (t: Teacher) => {
    if (!(await confirm({ title: "Supprimer l'enseignant", tone: "danger", confirmLabel: "Supprimer", message: <>Supprimer <strong>{t.title} {t.firstName} {t.lastName}</strong> ? Impossible si des séances existent.</> }))) return;
    const r = await remove.run(t.id);
    if (r.ok) toast("Enseignant supprimé.");
  };

  const filtered = (teachers.data ?? []).filter((t) => !debounced || `${t.firstName} ${t.lastName} ${t.email}`.toLowerCase().includes(debounced.toLowerCase()));
  const subjectNames = (ids: string[]) => (subjects.data ?? []).filter((s) => ids.includes(s.id)).map((s) => s.name);

  return (
    <>
      <PageHeader title="Enseignants" subtitle="Référentiel des enseignants et de leurs matières" action={<Button icon="plus" onClick={() => setEditing("new")}>Ajouter un enseignant</Button>} />
      {remove.error && <Alert tone="danger" onClose={remove.clearError}>{remove.error.message}</Alert>}
      <Card>
        <div className="filters filters-1">
          <div className="search"><Icon name="search" size={18} /><input aria-label="Rechercher" placeholder="Nom, email…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        </div>
        {teachers.error ? <ErrorState message={teachers.error} onRetry={teachers.refetch} /> : !teachers.data || !subjects.data ? <Loading /> : filtered.length === 0 ? (
          <EmptyState icon="teacher" title="Aucun enseignant" text="Ajoutez un enseignant pour commencer." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nom</th><th>Email</th><th>Matières</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Nom"><Person firstName={t.firstName} lastName={t.lastName} sub={t.title} /></td>
                    <td data-label="Email" className="muted">{t.email}</td>
                    <td data-label="Matières" className="wrap">{subjectNames(t.subjectIds).join(", ") || <span className="muted">Aucune</span>}</td>
                    <td data-label="Actions"><div className="actions"><button type="button" className="icon-btn edit" onClick={() => setEditing(t)} aria-label="Modifier"><Icon name="edit" size={17} /></button><button type="button" className="icon-btn delete" onClick={() => onDelete(t)} aria-label="Supprimer"><Icon name="trash" size={17} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && subjects.data && <TeacherModal teacher={editing === "new" ? null : editing} subjects={subjects.data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); teachers.refetch(); }} />}
    </>
  );
}

function TeacherModal({ teacher, subjects, onClose, onSaved }: { teacher: Teacher | null; subjects: { id: string; name: string; code: string }[]; onClose: () => void; onSaved: () => void }) {
  const editing = !!teacher;
  const [form, setForm] = useState(teacher ? { title: teacher.title, firstName: teacher.firstName, lastName: teacher.lastName, email: teacher.email, subjectIds: [...teacher.subjectIds] } : EMPTY);
  const create = useMutation(api.createTeacher);
  const update = useMutation((input: typeof EMPTY) => api.updateTeacher(teacher!.id, input));
  const toast = useToast();
  const mutation = editing ? update : create;
  const fieldError = (k: string) => (mutation.error?.field === k ? mutation.error.message : undefined);
  const toggle = (id: string) => setForm((f) => ({ ...f, subjectIds: f.subjectIds.includes(id) ? f.subjectIds.filter((x) => x !== id) : [...f.subjectIds, id] }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = editing ? await update.run(form) : await create.run(form);
    if (r.ok) {
      toast(editing ? "Enseignant mis à jour." : "Enseignant ajouté.");
      onSaved();
    }
  };

  return (
    <Modal title={editing ? "Modifier l'enseignant" : "Ajouter un enseignant"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="confirm-body">
        {mutation.error && !mutation.error.field && <Alert tone="danger">{mutation.error.message}</Alert>}
        <div className="form-grid">
          <SelectField label="Titre" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}>{TITLES.map((t) => <option key={t}>{t}</option>)}</SelectField>
          <Field label="Nom" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} error={fieldError("lastName")} required />
          <Field label="Prénom" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} error={fieldError("firstName")} required />
          <Field label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={fieldError("email")} required />
        </div>
        <div>
          <span className="label">Matières{fieldError("subjectIds") && <span className="error-inline"> — {fieldError("subjectIds")}</span>}</span>
          <div className="check-grid mt">
            {subjects.map((s) => (
              <label key={s.id} className={`check-item ${form.subjectIds.includes(s.id) ? "checked" : ""}`}>
                <input type="checkbox" checked={form.subjectIds.includes(s.id)} onChange={() => toggle(s.id)} />
                <span><strong>{s.name}</strong><small>{s.code}</small></span>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-foot inline-foot"><Button variant="secondary" onClick={onClose}>Annuler</Button><Button type="submit" loading={mutation.pending}>{editing ? "Enregistrer" : "Ajouter"}</Button></div>
      </form>
    </Modal>
  );
}
