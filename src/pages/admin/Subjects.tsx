import { FormEvent, useState } from "react";
import * as api from "../../api";
import { useMutation, useQuery } from "../../api/useQuery";
import { Alert, Button, Card, EmptyState, ErrorState, Field, Icon, Loading, PageHeader, useConfirm, useToast } from "../../components/ui";
import type { Subject } from "../../types";

export default function SubjectsPage() {
  const subjects = useQuery(() => api.listSubjects(), []);
  const teachers = useQuery(() => api.listTeachersSimple(), []);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editing, setEditing] = useState<Subject | null>(null);
  const create = useMutation(api.createSubject);
  const update = useMutation((input: { name: string; code: string }) => api.updateSubject(editing!.id, input));
  const remove = useMutation(api.deleteSubject);
  const confirm = useConfirm();
  const toast = useToast();
  const mutation = editing ? update : create;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = editing ? await update.run({ name, code }) : await create.run({ name, code });
    if (result.ok) {
      toast(editing ? "Matière mise à jour." : "Matière créée.");
      setName("");
      setCode("");
      setEditing(null);
    }
  };

  const startEdit = (s: Subject) => {
    setEditing(s);
    setName(s.name);
    setCode(s.code);
    create.clearError();
    update.clearError();
  };

  const onDelete = async (s: Subject) => {
    if (!(await confirm({ title: "Supprimer la matière", tone: "danger", confirmLabel: "Supprimer", message: <>Supprimer <strong>{s.name}</strong> ? Elle sera retirée des enseignants qui l'ont. Impossible si des séances existent.</> }))) return;
    const r = await remove.run(s.id);
    if (r.ok) toast("Matière supprimée.");
  };

  const teachersOf = (subjectId: string) => (teachers.data ?? []).filter((t) => t.subjectIds.includes(subjectId));

  return (
    <>
      <PageHeader title="Matières" subtitle="Le catalogue des matières attribuables aux enseignants" />
      {remove.error && <Alert tone="danger" onClose={remove.clearError}>{remove.error.message}</Alert>}
      <div className="two-col two-col-narrow">
        <Card>
          {subjects.error ? <ErrorState message={subjects.error} onRetry={subjects.refetch} /> : !subjects.data ? <Loading /> : subjects.data.length === 0 ? <EmptyState icon="book" title="Aucune matière" text="Créez la première matière avec le formulaire." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Matière</th><th>Code</th><th>Enseignants</th><th>Actions</th></tr></thead>
                <tbody>
                  {subjects.data.map((s) => (
                    <tr key={s.id} className={editing?.id === s.id ? "row-active" : ""}>
                      <td data-label="Matière"><strong>{s.name}</strong></td>
                      <td data-label="Code"><code className="code">{s.code}</code></td>
                      <td data-label="Enseignants" className="wrap muted">{teachersOf(s.id).map((t) => `${t.title} ${t.lastName}`).join(", ") || "—"}</td>
                      <td data-label="Actions"><div className="actions"><button type="button" className="icon-btn edit" onClick={() => startEdit(s)} aria-label="Modifier"><Icon name="edit" size={17} /></button><button type="button" className="icon-btn delete" onClick={() => onDelete(s)} aria-label="Supprimer"><Icon name="trash" size={17} /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="form-card">
          <h3 className="card-h">{editing ? `Modifier « ${editing.name} »` : "Nouvelle matière"}</h3>
          {mutation.error && !mutation.error.field && <Alert tone="danger">{mutation.error.message}</Alert>}
          <form onSubmit={submit} noValidate className="stack">
            <Field label="Nom" placeholder="Ex. Algorithmique" value={name} onChange={(e) => setName(e.target.value)} error={mutation.error?.field === "name" ? mutation.error.message : undefined} required />
            <Field label="Code" placeholder="Ex. ALG" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} error={mutation.error?.field === "code" ? mutation.error.message : undefined} maxLength={8} required />
            <div className="form-actions">
              {editing && <Button variant="secondary" onClick={() => { setEditing(null); setName(""); setCode(""); }}>Annuler</Button>}
              <Button type="submit" icon={editing ? "check" : "plus"} loading={mutation.pending}>{editing ? "Enregistrer" : "Ajouter"}</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
