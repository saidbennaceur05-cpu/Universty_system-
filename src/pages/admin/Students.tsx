import { FormEvent, useEffect, useState } from "react";
import * as api from "../../api";
import { useDebounced, useMutation, useQuery } from "../../api/useQuery";
import { Alert, Button, Card, CopyButton, EmptyState, ErrorState, Field, Icon, Loading, Modal, PageHeader, Pagination, Person, SelectField, useConfirm, useToast } from "../../components/ui";
import { FILIERES, GROUPES, NIVEAUX } from "../../data/seed";
import { navigate } from "../../router";
import { shortFiliere } from "../../utils/format";
import type { Student } from "../../types";

export default function StudentsPage() {
  const [query, setQuery] = useState("");
  const [filiere, setFiliere] = useState("");
  const [niveau, setNiveau] = useState("");
  const [groupe, setGroupe] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(query);
  useEffect(() => setPage(1), [debounced, filiere, niveau, groupe]);
  const list = useQuery(() => api.listStudents({ query: debounced, filiere, niveau, groupe, page, pageSize: 10 }), [debounced, filiere, niveau, groupe, page]);
  const confirm = useConfirm();
  const toast = useToast();
  const [tempPassword, setTempPassword] = useState<{ student: Student; password: string } | null>(null);
  const remove = useMutation(api.deleteStudent);
  const reset = useMutation(api.resetStudentPassword);

  const onDelete = async (s: Student) => {
    if (!(await confirm({ title: "Supprimer l'étudiant", tone: "danger", confirmLabel: "Supprimer", message: <>Supprimer <strong>{s.firstName} {s.lastName}</strong> ({s.registrationNumber}) ? Ses absences et justificatifs seront également supprimés. Cette action est irréversible.</> }))) return;
    const r = await remove.run(s.id);
    if (r.ok) toast("Étudiant supprimé.");
  };

  const onReset = async (s: Student) => {
    if (!(await confirm({ title: "Réinitialiser le mot de passe", confirmLabel: "Réinitialiser", message: <>Un nouveau mot de passe temporaire sera généré pour <strong>{s.firstName} {s.lastName}</strong>. L'étudiant devra le changer à sa prochaine connexion.</> }))) return;
    const r = await reset.run(s.id);
    if (r.ok) setTempPassword({ student: s, password: r.data });
  };

  const resetFilters = () => { setQuery(""); setFiliere(""); setNiveau(""); setGroupe(""); };
  const hasFilters = !!(query || filiere || niveau || groupe);

  return (
    <>
      <PageHeader title="Étudiants" subtitle="Gérez les étudiants et leurs informations" action={<Button icon="plus" onClick={() => navigate("/admin/students/new")}>Ajouter un étudiant</Button>} />
      {remove.error && <Alert tone="danger" onClose={remove.clearError}>{remove.error.message}</Alert>}
      <Card>
        <div className="filters filters-4">
          <div className="search"><Icon name="search" size={18} /><input aria-label="Rechercher" placeholder="Nom, prénom, n° d'inscription, email…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <SelectField label="Filière" value={filiere} onChange={(e) => setFiliere(e.target.value)}><option value="">Toutes les filières</option>{FILIERES.map((f) => <option key={f} value={f}>{f}</option>)}</SelectField>
          <SelectField label="Niveau" value={niveau} onChange={(e) => setNiveau(e.target.value)}><option value="">Tous les niveaux</option>{NIVEAUX.map((n) => <option key={n} value={n}>{n}</option>)}</SelectField>
          <SelectField label="Groupe" value={groupe} onChange={(e) => setGroupe(e.target.value)}><option value="">Tous les groupes</option>{GROUPES.map((g) => <option key={g} value={g}>{g}</option>)}</SelectField>
        </div>
        {list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> : !list.data ? <Loading /> : list.data.total === 0 ? (
          <EmptyState title="Aucun étudiant trouvé." text={hasFilters ? "Modifiez votre recherche ou réinitialisez les filtres." : "Commencez par ajouter un étudiant."} action={hasFilters ? <Button variant="secondary" onClick={resetFilters}>Réinitialiser la recherche</Button> : <Button icon="plus" onClick={() => navigate("/admin/students/new")}>Ajouter un étudiant</Button>} />
        ) : (
          <>
            <div className={`table-wrap ${list.loading ? "is-stale" : ""}`}>
              <table>
                <thead><tr><th>Étudiant</th><th>N° d'inscription</th><th>Email</th><th>Filière</th><th>Niveau</th><th>Groupe</th><th>Actions</th></tr></thead>
                <tbody>
                  {list.data.items.map((s) => (
                    <tr key={s.id}>
                      <td data-label="Étudiant"><Person firstName={s.firstName} lastName={s.lastName} /></td>
                      <td data-label="N° d'inscription">{s.registrationNumber}</td>
                      <td data-label="Email" className="muted">{s.email}</td>
                      <td data-label="Filière" title={s.filiere}>{shortFiliere(s.filiere)}</td>
                      <td data-label="Niveau">{s.niveau}</td>
                      <td data-label="Groupe">{s.groupe}</td>
                      <td data-label="Actions">
                        <div className="actions">
                          <button type="button" className="icon-btn" onClick={() => navigate(`/admin/absences?studentId=${s.id}`)} aria-label="Voir les absences" title="Voir les absences"><Icon name="calendar" size={17} /></button>
                          <button type="button" className="icon-btn" onClick={() => onReset(s)} aria-label="Réinitialiser le mot de passe" title="Réinitialiser le mot de passe"><Icon name="key" size={17} /></button>
                          <button type="button" className="icon-btn edit" onClick={() => navigate(`/admin/students/${s.id}/edit`)} aria-label="Modifier" title="Modifier"><Icon name="edit" size={17} /></button>
                          <button type="button" className="icon-btn delete" onClick={() => onDelete(s)} aria-label="Supprimer" title="Supprimer"><Icon name="trash" size={17} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>
      {tempPassword && (
        <Modal title="Mot de passe temporaire" eyebrow="ACCÈS ÉTUDIANT" onClose={() => setTempPassword(null)}>
          <div className="confirm-body">
            <p>Transmettez ces identifiants à <strong>{tempPassword.student.firstName} {tempPassword.student.lastName}</strong>. Ce mot de passe ne sera plus affiché.</p>
            <div className="credential"><span>Email</span><code>{tempPassword.student.email}</code></div>
            <div className="credential"><span>Mot de passe temporaire</span><code>{tempPassword.password}</code><CopyButton value={tempPassword.password} /></div>
          </div>
          <div className="modal-foot"><Button onClick={() => setTempPassword(null)}>Fermer</Button></div>
        </Modal>
      )}
    </>
  );
}

const EMPTY: api.StudentInput = { firstName: "", lastName: "", registrationNumber: "", email: "", filiere: "", niveau: "", groupe: "" };

export function StudentFormPage({ id }: { id?: string }) {
  const editing = !!id;
  const existing = useQuery(() => (id ? api.getStudent(id) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState<api.StudentInput>(EMPTY);
  const [created, setCreated] = useState<{ student: Student; temporaryPassword: string } | null>(null);
  const create = useMutation(api.createStudent);
  const update = useMutation((input: api.StudentInput) => api.updateStudent(id!, input));
  const toast = useToast();
  const mutation = editing ? update : create;

  useEffect(() => {
    if (existing.data) {
      const s = existing.data;
      setForm({ firstName: s.firstName, lastName: s.lastName, registrationNumber: s.registrationNumber, email: s.email, filiere: s.filiere, niveau: s.niveau, groupe: s.groupe });
    }
  }, [existing.data]);

  const set = (key: keyof api.StudentInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const fieldError = (key: keyof api.StudentInput) => (mutation.error?.field === key ? mutation.error.message : undefined);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (editing) {
      const r = await update.run(form);
      if (r.ok) {
        toast("Fiche étudiant mise à jour.");
        navigate("/admin/students");
      }
    } else {
      const r = await create.run(form);
      if (r.ok) setCreated(r.data);
    }
  };

  if (editing && existing.error) return <ErrorState message={existing.error} />;
  if (editing && !existing.data) return <Loading />;

  if (created) {
    return (
      <>
        <PageHeader title="Étudiant ajouté" subtitle="Le compte a été créé avec un mot de passe temporaire" />
        <Card className="form-card">
          <Alert>L'étudiant <strong>{created.student.firstName} {created.student.lastName}</strong> a été ajouté avec succès.</Alert>
          <p className="muted mt">Transmettez-lui ces identifiants. Il devra choisir un nouveau mot de passe à sa première connexion. Le mot de passe temporaire ne sera plus affiché après cette page.</p>
          <div className="credential"><span>Email</span><code>{created.student.email}</code></div>
          <div className="credential"><span>Mot de passe temporaire</span><code>{created.temporaryPassword}</code><CopyButton value={created.temporaryPassword} /></div>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => { setCreated(null); setForm(EMPTY); }}>Ajouter un autre étudiant</Button>
            <Button onClick={() => navigate("/admin/students")}>Retour à la liste</Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={editing ? "Modifier l'étudiant" : "Ajouter un étudiant"} subtitle={editing ? "Mettez à jour les informations de l'étudiant" : "Renseignez les informations du nouvel étudiant"} />
      <Card className="form-card">
        {mutation.error && !mutation.error.field && <Alert tone="danger" onClose={mutation.clearError}>{mutation.error.message}</Alert>}
        <form onSubmit={submit} noValidate>
          <div className="form-section">
            <div className="section-title"><span>1</span><div><h3>Informations personnelles</h3><p>Identité et contact. L'email sert d'identifiant de connexion.</p></div></div>
            <div className="form-grid">
              <Field label="Nom" placeholder="Ex. Benali" value={form.lastName} onChange={set("lastName")} error={fieldError("lastName")} required autoFocus />
              <Field label="Prénom" placeholder="Ex. Lina" value={form.firstName} onChange={set("firstName")} error={fieldError("firstName")} required />
              <Field label="N° d'inscription" placeholder="Ex. 20240018" inputMode="numeric" value={form.registrationNumber} onChange={set("registrationNumber")} error={fieldError("registrationNumber")} hint="6 à 12 chiffres, unique." required />
              <Field label="Email" type="email" placeholder="lina.benali@etu.univ.tn" value={form.email} onChange={set("email")} error={fieldError("email")} required />
            </div>
          </div>
          <div className="form-section">
            <div className="section-title"><span>2</span><div><h3>Parcours académique</h3><p>Affectation de l'étudiant. Elle détermine les séances qui le concernent.</p></div></div>
            <div className="form-grid">
              <SelectField label="Filière" value={form.filiere} onChange={set("filiere")} error={fieldError("filiere")} required><option value="">Sélectionner une filière</option>{FILIERES.map((f) => <option key={f} value={f}>{f}</option>)}</SelectField>
              <SelectField label="Niveau" value={form.niveau} onChange={set("niveau")} error={fieldError("niveau")} required><option value="">Sélectionner un niveau</option>{NIVEAUX.map((n) => <option key={n} value={n}>{n}</option>)}</SelectField>
              <SelectField label="Groupe" value={form.groupe} onChange={set("groupe")} error={fieldError("groupe")} required><option value="">Sélectionner un groupe</option>{GROUPES.map((g) => <option key={g} value={g}>{g}</option>)}</SelectField>
            </div>
          </div>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => navigate("/admin/students")}>Annuler</Button>
            <Button type="submit" loading={mutation.pending}>{editing ? "Enregistrer les modifications" : "Créer l'étudiant"}</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
