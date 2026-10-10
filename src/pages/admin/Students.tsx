import { FormEvent, useEffect, useState } from "react";
import * as api from "../../api";
import { useDebounced, useMutation, useQuery } from "../../api/useQuery";
import { Alert, Button, Card, EmptyState, ErrorState, Field, Icon, Loading, PageHeader, Pagination, Person, SelectField, useConfirm, useToast } from "../../components/ui";
import { navigate } from "../../router";
import { downloadCsv, studentsToCsv } from "../../utils/csv";
import { shortFiliere } from "../../utils/format";
import type { Settings, Student } from "../../types";

export default function StudentsPage() {
  const settings = useQuery(() => api.getSettings(), []);
  const [query, setQuery] = useState("");
  const [filiere, setFiliere] = useState("");
  const [niveau, setNiveau] = useState("");
  const [groupe, setGroupe] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const debounced = useDebounced(query);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [debounced, filiere, niveau, groupe]);
  const list = useQuery(() => api.listStudents({ query: debounced, filiere, niveau, groupe, page, pageSize: 10 }), [debounced, filiere, niveau, groupe, page]);
  const confirm = useConfirm();
  const toast = useToast();
  const remove = useMutation(api.deleteStudent);
  const removeMany = useMutation(api.deleteStudents);

  const onDelete = async (s: Student) => {
    if (!(await confirm({ title: "Supprimer l'étudiant", tone: "danger", confirmLabel: "Supprimer", message: <>Supprimer <strong>{s.firstName} {s.lastName}</strong> ({s.registrationNumber}) ? Ses absences et justificatifs seront aussi supprimés.</> }))) return;
    const r = await remove.run(s.id);
    if (r.ok) toast("Étudiant supprimé.");
  };

  const onDeleteSelected = async () => {
    if (!(await confirm({ title: "Supprimer la sélection", tone: "danger", confirmLabel: `Supprimer ${selected.size}`, message: <>Supprimer <strong>{selected.size}</strong> étudiant(s) et toutes leurs absences ?</> }))) return;
    const r = await removeMany.run([...selected]);
    if (r.ok) { toast(`${r.data} étudiant(s) supprimé(s).`); setSelected(new Set()); }
  };

  const exportCsv = async () => {
    const all = await api.listAllStudents({ query: debounced, filiere, niveau, groupe });
    downloadCsv(`etudiants_${new Date().toISOString().slice(0, 10)}.csv`, studentsToCsv(all));
  };

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pageIds = (list.data?.items ?? []).map((s) => s.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); allOnPage ? pageIds.forEach((id) => n.delete(id)) : pageIds.forEach((id) => n.add(id)); return n; });
  const hasFilters = !!(query || filiere || niveau || groupe);
  const resetFilters = () => { setQuery(""); setFiliere(""); setNiveau(""); setGroupe(""); };
  const s = settings.data;

  return (
    <>
      <PageHeader title="Étudiants" subtitle="Gérez les étudiants et leurs informations" action={<div className="actions-row"><Button variant="secondary" icon="upload" onClick={() => navigate("/import")}>Importer</Button><Button variant="secondary" icon="download" onClick={exportCsv}>Exporter</Button><Button icon="plus" onClick={() => navigate("/students/new")}>Ajouter</Button></div>} />
      {remove.error && <Alert tone="danger" onClose={remove.clearError}>{remove.error.message}</Alert>}
      <Card>
        <div className="filters filters-4">
          <div className="search"><Icon name="search" size={18} /><input aria-label="Rechercher" placeholder="Nom, prénom, n° d'inscription, email…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <SelectField label="Filière" value={filiere} onChange={(e) => setFiliere(e.target.value)}><option value="">Toutes les filières</option>{(s?.filieres ?? []).map((f) => <option key={f} value={f}>{f}</option>)}</SelectField>
          <SelectField label="Niveau" value={niveau} onChange={(e) => setNiveau(e.target.value)}><option value="">Tous les niveaux</option>{(s?.niveaux ?? []).map((n) => <option key={n} value={n}>{n}</option>)}</SelectField>
          <SelectField label="Groupe" value={groupe} onChange={(e) => setGroupe(e.target.value)}><option value="">Tous les groupes</option>{(s?.groupes ?? []).map((g) => <option key={g} value={g}>{g}</option>)}</SelectField>
        </div>
        {selected.size > 0 && <div className="bulk-bar"><span>{selected.size} sélectionné(s)</span><div className="actions-row"><Button variant="secondary" onClick={() => setSelected(new Set())}>Désélectionner</Button><Button variant="danger" icon="trash" loading={removeMany.pending} onClick={onDeleteSelected}>Supprimer</Button></div></div>}
        {list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> : !list.data ? <Loading /> : list.data.total === 0 ? (
          <EmptyState title="Aucun étudiant trouvé." text={hasFilters ? "Modifiez votre recherche ou réinitialisez les filtres." : "Commencez par ajouter ou importer des étudiants."} action={hasFilters ? <Button variant="secondary" onClick={resetFilters}>Réinitialiser</Button> : <Button icon="plus" onClick={() => navigate("/students/new")}>Ajouter un étudiant</Button>} />
        ) : (
          <>
            <div className={`table-wrap ${list.loading ? "is-stale" : ""}`}>
              <table>
                <thead><tr><th className="th-check"><input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Tout sélectionner" /></th><th>Étudiant</th><th>N° d'inscription</th><th>Email</th><th>Filière</th><th>Niveau</th><th>Groupe</th><th>Actions</th></tr></thead>
                <tbody>
                  {list.data.items.map((st) => (
                    <tr key={st.id} className={selected.has(st.id) ? "row-selected" : ""}>
                      <td className="td-check" data-label="Sélection"><input type="checkbox" checked={selected.has(st.id)} onChange={() => toggle(st.id)} aria-label={`Sélectionner ${st.firstName} ${st.lastName}`} /></td>
                      <td data-label="Étudiant"><Person firstName={st.firstName} lastName={st.lastName} /></td>
                      <td data-label="N° d'inscription">{st.registrationNumber}</td>
                      <td data-label="Email" className="muted">{st.email}</td>
                      <td data-label="Filière" title={st.filiere}>{shortFiliere(st.filiere)}</td>
                      <td data-label="Niveau">{st.niveau}</td>
                      <td data-label="Groupe">{st.groupe}</td>
                      <td data-label="Actions">
                        <div className="actions">
                          <button type="button" className="icon-btn" onClick={() => navigate(`/absences?studentId=${st.id}`)} aria-label="Voir les absences" title="Voir les absences"><Icon name="calendar" size={17} /></button>
                          <button type="button" className="icon-btn edit" onClick={() => navigate(`/students/${st.id}/edit`)} aria-label="Modifier" title="Modifier"><Icon name="edit" size={17} /></button>
                          <button type="button" className="icon-btn delete" onClick={() => onDelete(st)} aria-label="Supprimer" title="Supprimer"><Icon name="trash" size={17} /></button>
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
    </>
  );
}

const EMPTY: api.StudentInput = { firstName: "", lastName: "", registrationNumber: "", email: "", filiere: "", niveau: "", groupe: "" };

export function StudentFormPage({ id }: { id?: string }) {
  const editing = !!id;
  const settings = useQuery(() => api.getSettings(), []);
  const existing = useQuery(() => (id ? api.getStudent(id) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState<api.StudentInput>(EMPTY);
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
    const r = editing ? await update.run(form) : await create.run(form);
    if (r.ok) {
      toast(editing ? "Fiche mise à jour." : "Étudiant ajouté.");
      navigate("/students");
    }
  };

  if (editing && existing.error) return <ErrorState message={existing.error} />;
  if ((editing && !existing.data) || !settings.data) return <Loading />;
  const s = settings.data;

  return (
    <>
      <PageHeader title={editing ? "Modifier l'étudiant" : "Ajouter un étudiant"} subtitle={editing ? "Mettez à jour les informations de l'étudiant" : "Renseignez les informations du nouvel étudiant"} />
      <Card className="form-card">
        {mutation.error && !mutation.error.field && <Alert tone="danger" onClose={mutation.clearError}>{mutation.error.message}</Alert>}
        <form onSubmit={submit} noValidate>
          <div className="form-section">
            <div className="section-title"><span className="step-num">1</span><div><h3>Informations personnelles</h3><p>Identité et contact de l'étudiant.</p></div></div>
            <div className="form-grid">
              <Field label="Nom" placeholder="Ex. Benali" value={form.lastName} onChange={set("lastName")} error={fieldError("lastName")} required autoFocus />
              <Field label="Prénom" placeholder="Ex. Lina" value={form.firstName} onChange={set("firstName")} error={fieldError("firstName")} required />
              <Field label="N° d'inscription" placeholder="Ex. 20240018" inputMode="numeric" value={form.registrationNumber} onChange={set("registrationNumber")} error={fieldError("registrationNumber")} hint="6 à 12 chiffres, unique." required />
              <Field label="Email" type="email" placeholder="lina.benali@etu.univ.tn" value={form.email} onChange={set("email")} error={fieldError("email")} required />
            </div>
          </div>
          <div className="form-section">
            <div className="section-title"><span className="step-num">2</span><div><h3>Parcours académique</h3><p>Affectation de l'étudiant.</p></div></div>
            <div className="form-grid">
              <SelectField label="Filière" value={form.filiere} onChange={set("filiere")} error={fieldError("filiere")} required><option value="">Sélectionner une filière</option>{s.filieres.map((f) => <option key={f} value={f}>{f}</option>)}</SelectField>
              <SelectField label="Niveau" value={form.niveau} onChange={set("niveau")} error={fieldError("niveau")} required><option value="">Sélectionner un niveau</option>{s.niveaux.map((n) => <option key={n} value={n}>{n}</option>)}</SelectField>
              <SelectField label="Groupe" value={form.groupe} onChange={set("groupe")} error={fieldError("groupe")} required><option value="">Sélectionner un groupe</option>{s.groupes.map((g) => <option key={g} value={g}>{g}</option>)}</SelectField>
            </div>
          </div>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => navigate("/students")}>Annuler</Button>
            <Button type="submit" loading={mutation.pending}>{editing ? "Enregistrer" : "Ajouter l'étudiant"}</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
