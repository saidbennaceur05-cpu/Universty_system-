import { useRef, useState } from "react";
import * as api from "../../api";
import { useMutation } from "../../api/useQuery";
import { Alert, Button, Card, Icon, PageHeader, Tabs, useToast } from "../../components/ui";
import { parseCsv, downloadCsv, STUDENT_TEMPLATE, ABSENCE_TEMPLATE } from "../../utils/csv";
import type { ImportPreview, ImportRow } from "../../api";

type Kind = "students" | "absences";

export default function ImportPage() {
  const [kind, setKind] = useState<Kind>("students");
  return (
    <>
      <PageHeader title="Importer des données" subtitle="Chargez des étudiants ou des absences depuis un fichier CSV" />
      <Card>
        <div className="tabs-bar"><Tabs value={kind} onChange={(k) => setKind(k as Kind)} items={[{ value: "students" as Kind, label: "Étudiants" }, { value: "absences" as Kind, label: "Absences" }]} /></div>
        <div className="pad-lg">{kind === "students" ? <ImportPanel key="students" kind="students" /> : <ImportPanel key="absences" kind="absences" />}</div>
      </Card>
    </>
  );
}

function ImportPanel({ kind }: { kind: Kind }) {
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview<unknown> | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const toast = useToast();
  const previewStudents = useMutation(api.previewStudentImport);
  const previewAbsences = useMutation(api.previewAbsenceImport);
  const commitStudents = useMutation(api.commitStudentImport);
  const commitAbsences = useMutation(api.commitAbsenceImport);
  const committing = kind === "students" ? commitStudents.pending : commitAbsences.pending;

  const template = kind === "students" ? STUDENT_TEMPLATE : ABSENCE_TEMPLATE;
  const cols = kind === "students" ? "nom, prenom, matricule, email, filiere, niveau, groupe" : "matricule, matiere (code ou nom), date (AAAA-MM-JJ), debut, fin";

  const pick = async (file: File | undefined) => {
    setParseError(null);
    setPreview(null);
    setDone(null);
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const records = parseCsv(text);
    if (records.length === 0) {
      setParseError("Le fichier est vide ou mal formaté (en-tête + au moins une ligne attendus).");
      return;
    }
    const r = kind === "students" ? await previewStudents.run(records) : await previewAbsences.run(records);
    if (r.ok) setPreview(r.data as ImportPreview<unknown>);
  };

  const commit = async () => {
    if (!preview) return;
    const r = kind === "students" ? await commitStudents.run(preview.rows as ImportRow<api.StudentInput>[]) : await commitAbsences.run(preview.rows as ImportRow<api.AbsenceImportData>[]);
    if (r.ok) {
      setDone(r.data);
      toast(`${r.data} ${kind === "students" ? "étudiant(s)" : "absence(s)"} importé(s).`);
      setPreview(null);
      setFileName(null);
    }
  };

  return (
    <div className="stack">
      <div className="import-intro">
        <p className="muted small">Colonnes attendues : <strong>{cols}</strong>. Séparateur virgule ou point-virgule. Les filières, niveaux et groupes doivent correspondre à ceux des paramètres.</p>
        <Button variant="secondary" icon="download" onClick={() => downloadCsv(`modele_${kind}.csv`, template)}>Télécharger le modèle</Button>
      </div>

      {done !== null && <Alert tone="success">{done} ligne(s) importée(s) avec succès.</Alert>}
      {parseError && <Alert tone="danger">{parseError}</Alert>}

      {!preview ? (
        <button type="button" className="dropzone" onClick={() => input.current?.click()}>
          <span className="upload-icon"><Icon name="upload" size={28} /></span>
          <strong>{fileName ?? "Choisir un fichier CSV"}</strong>
          <span>{previewStudents.pending || previewAbsences.pending ? "Analyse…" : "Cliquez pour sélectionner votre fichier"}</span>
        </button>
      ) : (
        <>
          <div className="import-summary">
            <span className="import-stat ok"><strong>{preview.validCount}</strong> à importer</span>
            <span className="import-stat warn"><strong>{preview.rows.filter((r) => r.duplicate).length}</strong> doublons ignorés</span>
            <span className="import-stat err"><strong>{preview.errorCount}</strong> en erreur</span>
            <div className="actions-row"><Button variant="secondary" onClick={() => { setPreview(null); setFileName(null); }}>Changer de fichier</Button><Button icon="check" loading={committing} disabled={preview.validCount === 0} onClick={commit}>Importer {preview.validCount} ligne(s)</Button></div>
          </div>
          <div className="table-wrap import-table">
            <table>
              <thead><tr><th>Ligne</th><th>Contenu</th><th>État</th></tr></thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className={r.error && !r.duplicate ? "row-error" : r.duplicate ? "row-warn" : ""}>
                    <td data-label="Ligne">{r.line}</td>
                    <td data-label="Contenu" className="muted small">{Object.values(r.raw).filter(Boolean).slice(0, 5).join(" · ")}</td>
                    <td data-label="État">{r.error && !r.duplicate ? <span className="state-err"><Icon name="alert" size={14} /> {r.error}</span> : r.duplicate ? <span className="state-warn"><Icon name="info" size={14} /> {r.error}</span> : <span className="state-ok"><Icon name="check" size={14} /> Prêt</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
