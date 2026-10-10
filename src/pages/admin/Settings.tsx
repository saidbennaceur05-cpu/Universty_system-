import { FormEvent, useEffect, useState } from "react";
import * as api from "../../api";
import { useMutation, useQuery } from "../../api/useQuery";
import { Alert, Button, Card, ErrorState, Field, Loading, PageHeader, useConfirm, useToast } from "../../components/ui";
import { navigate } from "../../router";
import type { Settings } from "../../types";

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default function SettingsPage() {
  const settings = useQuery(() => api.getSettings(), []);
  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.refetch} />;
  if (!settings.data) return <Loading />;
  return <SettingsForm initial={settings.data} />;
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [form, setForm] = useState(initial);
  const save = useMutation(api.updateSettings);
  const resetDemo = useMutation(api.resetDemoData);
  const toast = useToast();
  const confirm = useConfirm();
  useEffect(() => setForm(initial), [initial]);

  const fieldError = (k: string) => (save.error?.field === k ? save.error.message : undefined);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await save.run(form);
    if (r.ok) toast("Paramètres enregistrés.");
  };

  const onResetDemo = async () => {
    if (!(await confirm({ title: "Réinitialiser les données", tone: "danger", confirmLabel: "Réinitialiser", message: "Toutes les données de ce navigateur (étudiants, absences, certificats, comptes, journal) seront remplacées par le jeu de démonstration. Action irréversible." }))) return;
    const r = await resetDemo.run();
    if (r.ok) { toast("Données réinitialisées."); navigate("/", true); }
  };

  const ListEditor = ({ label, value, onChange, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; hint?: string }) => (
    <div className="field">
      <span className="label">{label}</span>
      {hint && <span className="hint mb-s">{hint}</span>}
      <div className="list-editor">
        {value.map((item, i) => (
          <div key={i} className="list-row">
            <input className="input" value={item} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" className="icon-btn delete" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Retirer"><span aria-hidden>×</span></button>
          </div>
        ))}
        <Button variant="secondary" icon="plus" onClick={() => onChange([...value, ""])}>Ajouter</Button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Configuration de l'établissement et des règles d'absence" />
      {save.error && !save.error.field && <Alert tone="danger" onClose={save.clearError}>{save.error.message}</Alert>}
      <form onSubmit={submit} className="stack">
        <Card className="form-card">
          <h3 className="card-h">Établissement</h3>
          <div className="form-grid">
            <Field label="Nom de l'établissement" value={form.institutionName} onChange={(e) => setForm((f) => ({ ...f, institutionName: e.target.value }))} error={fieldError("institutionName")} required />
            <label className="field"><span className="label">Début de l'année universitaire</span><select className="input select" value={form.academicYearStartMonth} onChange={(e) => setForm((f) => ({ ...f, academicYearStartMonth: Number(e.target.value) }))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
          </div>
        </Card>
        <Card className="form-card">
          <h3 className="card-h">Seuils d'alerte</h3>
          <p className="muted small mb">Un étudiant est signalé « à risque » lorsqu'il atteint l'un de ces seuils d'absences non justifiées.</p>
          <div className="form-grid">
            <Field label="Seuil par matière" type="number" min={1} value={form.subjectThreshold} onChange={(e) => setForm((f) => ({ ...f, subjectThreshold: Number(e.target.value) }))} error={fieldError("subjectThreshold")} hint="Absences non justifiées dans une même matière." required />
            <Field label="Seuil global" type="number" min={1} value={form.overallThreshold} onChange={(e) => setForm((f) => ({ ...f, overallThreshold: Number(e.target.value) }))} error={fieldError("overallThreshold")} hint="Total d'absences non justifiées, toutes matières." required />
          </div>
        </Card>
        <div className="two-col">
          <Card className="form-card"><h3 className="card-h">Niveaux</h3><ListEditor label="" value={form.niveaux} onChange={(v) => setForm((f) => ({ ...f, niveaux: v }))} /></Card>
          <Card className="form-card"><h3 className="card-h">Groupes</h3><ListEditor label="" value={form.groupes} onChange={(v) => setForm((f) => ({ ...f, groupes: v }))} /></Card>
        </div>
        <Card className="form-card"><h3 className="card-h">Filières</h3><ListEditor label="" hint="Doivent correspondre exactement aux intitulés utilisés lors des imports." value={form.filieres} onChange={(v) => setForm((f) => ({ ...f, filieres: v }))} /></Card>
        <div className="form-actions sticky-actions"><Button type="submit" loading={save.pending} icon="check">Enregistrer les paramètres</Button></div>
      </form>
      <Card className="form-card danger-card">
        <h3 className="card-h">Zone sensible</h3>
        <p className="muted small">Réinitialiser remplace toutes les données locales par le jeu de démonstration. À utiliser uniquement en test.</p>
        {resetDemo.error && <Alert tone="danger">{resetDemo.error.message}</Alert>}
        <div className="form-actions"><Button variant="danger" icon="refresh" loading={resetDemo.pending} onClick={onResetDemo}>Réinitialiser les données de démonstration</Button></div>
      </Card>
    </>
  );
}
