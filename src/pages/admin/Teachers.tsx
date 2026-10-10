import { FormEvent, useEffect, useState } from "react";
import * as api from "../../api";
import { useDebounced, useMutation, useQuery } from "../../api/useQuery";
import { Alert, Button, Card, CopyButton, EmptyState, ErrorState, Field, Icon, Loading, Modal, PageHeader, Pagination, Person, SelectField, UserStatusBadge, useConfirm, useToast } from "../../components/ui";
import { generateTemporaryPassword } from "../../api/crypto";
import { navigate } from "../../router";
import type { UserStatus } from "../../types";

const TITLES = ["Dr.", "Pr.", "M.", "Mme"];

export default function TeachersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(query);
  useEffect(() => setPage(1), [debounced, status]);
  const list = useQuery(() => api.listTeachers({ query: debounced, status, page, pageSize: 10 }), [debounced, status, page]);
  const confirm = useConfirm();
  const toast = useToast();
  const remove = useMutation(api.deleteTeacher);
  const setTeacherStatus = useMutation(api.setTeacherStatus);
  const resetPassword = useMutation(api.resetTeacherPassword);
  const [resetFor, setResetFor] = useState<api.TeacherRow | null>(null);
  const [resetValue, setResetValue] = useState("");
  const [resetDone, setResetDone] = useState(false);

  const onToggle = async (row: api.TeacherRow) => {
    const next: UserStatus = row.user.status === "active" ? "disabled" : "active";
    if (next === "disabled" && !(await confirm({ title: "Désactiver le compte", tone: "danger", confirmLabel: "Désactiver", message: <><strong>{row.teacher.firstName} {row.teacher.lastName}</strong> ne pourra plus se connecter. Ses séances et absences restent enregistrées.</> }))) return;
    const r = await setTeacherStatus.run(row.teacher.id, next);
    if (r.ok) toast(next === "active" ? "Compte réactivé." : "Compte désactivé.");
  };

  const onDelete = async (row: api.TeacherRow) => {
    if (!(await confirm({ title: "Supprimer l'enseignant", tone: "danger", confirmLabel: "Supprimer", message: <>Supprimer le compte de <strong>{row.teacher.firstName} {row.teacher.lastName}</strong> ? Cette action est irréversible.</> }))) return;
    const r = await remove.run(row.teacher.id);
    if (r.ok) toast("Enseignant supprimé.");
  };

  const openReset = (row: api.TeacherRow) => {
    setResetFor(row);
    setResetValue(generateTemporaryPassword());
    setResetDone(false);
    resetPassword.clearError();
  };

  const doReset = async () => {
    if (!resetFor) return;
    const r = await resetPassword.run(resetFor.teacher.id, resetValue);
    if (r.ok) setResetDone(true);
  };

  return (
    <>
      <PageHeader title="Enseignants" subtitle="Gérez les comptes et accès des enseignants" action={<Button icon="plus" onClick={() => navigate("/admin/teachers/new")}>Créer un compte enseignant</Button>} />
      {(remove.error || setTeacherStatus.error) && <Alert tone="danger" onClose={() => { remove.clearError(); setTeacherStatus.clearError(); }}>{remove.error?.message ?? setTeacherStatus.error?.message}</Alert>}
      <Card>
        <div className="filters teacher-filters">
          <div className="search"><Icon name="search" size={18} /><input aria-label="Rechercher" placeholder="Nom, email ou matière…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <SelectField label="Statut" value={status} onChange={(e) => setStatus(e.target.value as UserStatus | "")}><option value="">Tous les statuts</option><option value="active">Actif</option><option value="disabled">Désactivé</option></SelectField>
        </div>
        {list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> : !list.data ? <Loading /> : list.data.total === 0 ? (
          <EmptyState title="Aucun enseignant trouvé." text="Modifiez votre recherche ou créez un compte." action={<Button variant="secondary" onClick={() => { setQuery(""); setStatus(""); }}>Réinitialiser</Button>} />
        ) : (
          <>
            <div className={`table-wrap ${list.loading ? "is-stale" : ""}`}>
              <table>
                <thead><tr><th>Nom</th><th>Email</th><th>Matières</th><th>Statut</th><th>Actions</th></tr></thead>
                <tbody>
                  {list.data.items.map((row) => (
                    <tr key={row.teacher.id}>
                      <td data-label="Nom"><Person firstName={row.teacher.firstName} lastName={row.teacher.lastName} sub={row.teacher.title} /></td>
                      <td data-label="Email" className="muted">{row.teacher.email}</td>
                      <td data-label="Matières" className="wrap">{row.subjects.map((s) => s.name).join(", ") || <span className="muted">Aucune</span>}</td>
                      <td data-label="Statut"><UserStatusBadge status={row.user.status} /></td>
                      <td data-label="Actions">
                        <div className="actions">
                          <button type="button" className="icon-btn" onClick={() => openReset(row)} aria-label="Réinitialiser le mot de passe" title="Réinitialiser le mot de passe"><Icon name="key" size={17} /></button>
                          <button type="button" className="icon-btn" onClick={() => onToggle(row)} aria-label={row.user.status === "active" ? "Désactiver" : "Réactiver"} title={row.user.status === "active" ? "Désactiver le compte" : "Réactiver le compte"}><Icon name={row.user.status === "active" ? "ban" : "check"} size={17} /></button>
                          <button type="button" className="icon-btn edit" onClick={() => navigate(`/admin/teachers/${row.teacher.id}/edit`)} aria-label="Modifier" title="Modifier"><Icon name="edit" size={17} /></button>
                          <button type="button" className="icon-btn delete" onClick={() => onDelete(row)} aria-label="Supprimer" title="Supprimer"><Icon name="trash" size={17} /></button>
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
      {resetFor && (
        <Modal title="Réinitialiser le mot de passe" eyebrow={`${resetFor.teacher.firstName} ${resetFor.teacher.lastName}`} onClose={() => setResetFor(null)}>
          <div className="confirm-body">
            {resetDone ? (
              <>
                <Alert>Mot de passe réinitialisé. L'enseignant devra le changer à sa prochaine connexion.</Alert>
                <div className="credential"><span>Email</span><code>{resetFor.teacher.email}</code></div>
                <div className="credential"><span>Mot de passe temporaire</span><code>{resetValue}</code><CopyButton value={resetValue} /></div>
              </>
            ) : (
              <>
                {resetPassword.error && <Alert tone="danger">{resetPassword.error.message}</Alert>}
                <Field label="Nouveau mot de passe temporaire" value={resetValue} onChange={(e) => setResetValue(e.target.value)} right={<button type="button" className="generate" onClick={() => setResetValue(generateTemporaryPassword())}>Générer</button>} hint="8 caractères minimum, lettres et chiffres." />
              </>
            )}
          </div>
          <div className="modal-foot">
            {resetDone ? <Button onClick={() => setResetFor(null)}>Fermer</Button> : <><Button variant="secondary" onClick={() => setResetFor(null)}>Annuler</Button><Button loading={resetPassword.pending} onClick={doReset}>Réinitialiser</Button></>}
          </div>
        </Modal>
      )}
    </>
  );
}

const EMPTY: api.TeacherInput = { title: "Dr.", firstName: "", lastName: "", email: "", subjectIds: [] };

export function TeacherFormPage({ id }: { id?: string }) {
  const editing = !!id;
  const existing = useQuery(() => (id ? api.getTeacher(id) : Promise.resolve(null)), [id]);
  const subjects = useQuery(() => api.listSubjects(), []);
  const [form, setForm] = useState<api.TeacherInput>(EMPTY);
  const [password, setPassword] = useState(generateTemporaryPassword);
  const [created, setCreated] = useState<api.TeacherRow | null>(null);
  const create = useMutation((input: api.TeacherInput) => api.createTeacher(input, password));
  const update = useMutation((input: api.TeacherInput) => api.updateTeacher(id!, input));
  const toast = useToast();
  const mutation = editing ? update : create;

  useEffect(() => {
    if (existing.data) {
      const t = existing.data.teacher;
      setForm({ title: t.title, firstName: t.firstName, lastName: t.lastName, email: t.email, subjectIds: [...t.subjectIds] });
    }
  }, [existing.data]);

  const fieldError = (key: string) => (mutation.error?.field === key ? mutation.error.message : undefined);
  const toggleSubject = (subjectId: string) => setForm((f) => ({ ...f, subjectIds: f.subjectIds.includes(subjectId) ? f.subjectIds.filter((x) => x !== subjectId) : [...f.subjectIds, subjectId] }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (editing) {
      const r = await update.run(form);
      if (r.ok) {
        toast("Fiche enseignant mise à jour.");
        navigate("/admin/teachers");
      }
    } else {
      const r = await create.run(form);
      if (r.ok) setCreated(r.data);
    }
  };

  if (editing && existing.error) return <ErrorState message={existing.error} />;
  if ((editing && !existing.data) || !subjects.data) return <Loading />;

  if (created) {
    return (
      <>
        <PageHeader title="Compte enseignant créé" subtitle="Transmettez les identifiants à l'enseignant" />
        <Card className="form-card">
          <Alert>Le compte de <strong>{created.teacher.title} {created.teacher.firstName} {created.teacher.lastName}</strong> a été créé avec succès.</Alert>
          <p className="muted mt">L'enseignant devra choisir un nouveau mot de passe à sa première connexion. Le mot de passe temporaire ne sera plus affiché après cette page.</p>
          <div className="credential"><span>Email</span><code>{created.teacher.email}</code></div>
          <div className="credential"><span>Mot de passe temporaire</span><code>{password}</code><CopyButton value={password} /></div>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => { setCreated(null); setForm(EMPTY); setPassword(generateTemporaryPassword()); }}>Créer un autre compte</Button>
            <Button onClick={() => navigate("/admin/teachers")}>Retour à la liste</Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={editing ? "Modifier l'enseignant" : "Créer un compte enseignant"} subtitle={editing ? "Mettez à jour la fiche et les matières attribuées" : "Créez les accès d'un nouvel enseignant"} />
      <Card className="form-card">
        {mutation.error && !mutation.error.field && <Alert tone="danger" onClose={mutation.clearError}>{mutation.error.message}</Alert>}
        <form onSubmit={submit} noValidate>
          <div className="form-section">
            <div className="section-title"><span>1</span><div><h3>Informations personnelles</h3><p>Identité et email universitaire (identifiant de connexion).</p></div></div>
            <div className="form-grid">
              <SelectField label="Titre" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}>{TITLES.map((t) => <option key={t} value={t}>{t}</option>)}</SelectField>
              <Field label="Nom" placeholder="Ex. Larbi" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} error={fieldError("lastName")} required autoFocus />
              <Field label="Prénom" placeholder="Ex. Amine" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} error={fieldError("firstName")} required />
              <Field label="Email universitaire" type="email" placeholder="prenom.nom@univ.tn" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={fieldError("email")} required />
            </div>
          </div>
          <div className="form-section">
            <div className="section-title"><span>2</span><div><h3>Matières enseignées</h3><p>L'enseignant ne peut faire l'appel que pour ses matières.</p></div></div>
            <div>
              <div className={`check-grid ${fieldError("subjectIds") ? "check-grid-error" : ""}`}>
                {subjects.data.map((s) => (
                  <label key={s.id} className={`check-item ${form.subjectIds.includes(s.id) ? "checked" : ""}`}>
                    <input type="checkbox" checked={form.subjectIds.includes(s.id)} onChange={() => toggleSubject(s.id)} />
                    <span><strong>{s.name}</strong><small>{s.code}</small></span>
                  </label>
                ))}
              </div>
              {fieldError("subjectIds") && <span className="error-text"><Icon name="alert" size={14} />{fieldError("subjectIds")}</span>}
              {subjects.data.length === 0 && <p className="muted small">Aucune matière définie. <button type="button" className="link" onClick={() => navigate("/admin/subjects")}>Créer des matières</button></p>}
            </div>
          </div>
          {!editing && (
            <div className="form-section">
              <div className="section-title"><span>3</span><div><h3>Accès temporaire</h3><p>Communiqué à l'enseignant, à changer à la première connexion.</p></div></div>
              <div className="form-grid">
                <Field label="Mot de passe temporaire" value={password} onChange={(e) => setPassword(e.target.value)} hint="8 caractères minimum, lettres et chiffres." error={fieldError("next")} right={<button type="button" className="generate" onClick={() => setPassword(generateTemporaryPassword())}>Générer</button>} />
              </div>
            </div>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => navigate("/admin/teachers")}>Annuler</Button>
            <Button type="submit" loading={mutation.pending}>{editing ? "Enregistrer les modifications" : "Créer le compte"}</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
