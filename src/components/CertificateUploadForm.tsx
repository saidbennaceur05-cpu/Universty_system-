import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api";
import { useMutation, useQuery } from "../api/useQuery";
import type { AbsenceRow, CertificateRow, Student } from "../types";
import { ACCEPTED_CERTIFICATE_TYPES, MAX_CERTIFICATE_BYTES, MAX_PREVIEW_BYTES } from "../types";
import { formatBytes, formatDate, readFileAsDataUrl } from "../utils/format";
import { AbsenceTable } from "./AbsenceTable";
import { Alert, Badge, Button, Card, EmptyState, Field, Icon, Loading, useToast } from "./ui";

interface PickedFile {
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
}

const canJustify = (r: AbsenceRow) => r.absence.status === "unjustified" || r.absence.status === "rejected";

export function CertificateUploadForm({ student, preselectedAbsenceId, onDone }: { student: Student; preselectedAbsenceId?: string; onDone: (row: CertificateRow) => void }) {
  const absences = useQuery(() => api.listAbsences({ studentId: student.id, pageSize: 500 }), [student.id]);
  const [selected, setSelected] = useState<Set<string>>(new Set(preselectedAbsenceId ? [preselectedAbsenceId] : []));
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [datesTouched, setDatesTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation(api.uploadCertificate);
  const toast = useToast();

  const eligible = useMemo(() => (absences.data?.items ?? []).filter(canJustify), [absences.data]);
  const selectedRows = eligible.filter((r) => selected.has(r.absence.id));

  // Suggest the certificate period from the selected sessions until the user edits the dates.
  useEffect(() => {
    if (datesTouched || selectedRows.length === 0) return;
    const dates = selectedRows.map((r) => r.session.date).sort();
    setStartDate(dates[0]);
    setEndDate(dates[dates.length - 1]);
  }, [selectedRows.length, datesTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const pick = async (f: File | undefined) => {
    setFileError(null);
    if (!f) return;
    if (!ACCEPTED_CERTIFICATE_TYPES.includes(f.type)) {
      setFileError("Format non accepté. Utilisez un PDF, une image JPG ou PNG.");
      return;
    }
    if (f.size > MAX_CERTIFICATE_BYTES) {
      setFileError(`Le fichier dépasse 5 Mo (${formatBytes(f.size)}).`);
      return;
    }
    setReading(true);
    try {
      const dataUrl = f.size <= MAX_PREVIEW_BYTES ? await readFileAsDataUrl(f) : undefined;
      setFile({ name: f.name, type: f.type, size: f.size, dataUrl });
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Lecture du fichier impossible.");
    } finally {
      setReading(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setFileError("Ajoutez le document justificatif.");
      return;
    }
    const r = await upload.run({ studentId: student.id, absenceIds: [...selected], file, startDate, endDate });
    if (r.ok) {
      toast("Justificatif déposé. Il sera examiné par l'administration.");
      onDone(r.data);
    }
  };

  const fieldError = (k: string) => (upload.error?.field === k ? upload.error.message : undefined);

  return (
    <form onSubmit={submit} noValidate className="certificate-grid">
      <Card className="upload-card">
        {upload.error && !upload.error.field && <Alert tone="danger" onClose={upload.clearError}>{upload.error.message}</Alert>}
        <div className="step-label"><span className="step-num">1</span>Absences à justifier</div>
        {absences.error ? <Alert tone="danger">{absences.error}</Alert> : !absences.data ? <Loading /> : eligible.length === 0 ? (
          <EmptyState icon="check" title="Aucune absence à justifier" text="Toutes les absences sont justifiées ou en cours de traitement." />
        ) : (
          <>
            <p className="muted small">Cochez une ou plusieurs absences couvertes par le même document.</p>
            <AbsenceTable rows={eligible} showStudent={false} selectable={canJustify} selected={selected} onToggle={toggle} />
            {fieldError("absenceIds") && <span className="error-text mt"><Icon name="alert" size={14} />{fieldError("absenceIds")}</span>}
          </>
        )}

        <div className="step-label mt-lg"><span className="step-num">2</span>Document justificatif</div>
        {file ? (
          <div className="file-preview">
            <div className="file-thumb">{file.dataUrl && file.type.startsWith("image/") ? <img src={file.dataUrl} alt="" /> : <Icon name="file" size={30} />}</div>
            <div><strong>{file.name}</strong><span>{file.type === "application/pdf" ? "PDF" : "Image"} · {formatBytes(file.size)}{!file.dataUrl && " · aperçu non conservé (fichier > 1,5 Mo)"}</span></div>
            <Badge tone="success">Prêt</Badge>
            <button type="button" className="icon-btn" onClick={() => setFile(null)} aria-label="Retirer le fichier"><Icon name="trash" size={17} /></button>
          </div>
        ) : (
          <button type="button" className={`dropzone ${dragging ? "dragging" : ""} ${fileError ? "dropzone-error" : ""}`} onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} disabled={reading}>
            <span className="upload-icon"><Icon name="upload" size={28} /></span>
            <strong>{reading ? "Lecture du fichier…" : "Glissez le certificat ici ou cliquez pour choisir un fichier"}</strong>
            <span>PDF, JPG ou PNG · 5 Mo maximum</span>
            {reading && <span className="progress"><span /></span>}
          </button>
        )}
        <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        {fileError && <span className="error-text mt"><Icon name="alert" size={14} />{fileError}</span>}

        <div className="step-label mt-lg"><span className="step-num">3</span>Période couverte</div>
        <div className="form-grid">
          <Field label="Date de début" type="date" value={startDate} max={endDate || undefined} onChange={(e) => { setDatesTouched(true); setStartDate(e.target.value); }} error={fieldError("startDate")} required />
          <Field label="Date de fin" type="date" value={endDate} min={startDate || undefined} onChange={(e) => { setDatesTouched(true); setEndDate(e.target.value); }} error={fieldError("endDate")} required />
        </div>
        <div className="form-actions">
          <Button type="submit" icon="upload" loading={upload.pending} disabled={eligible.length === 0}>Déposer le justificatif{selected.size > 0 ? ` (${selected.size})` : ""}</Button>
        </div>
      </Card>
      <Card className="help-card">
        <span className="help-icon"><Icon name="file" size={22} /></span>
        <h3>Avant de déposer</h3>
        <ul>
          <li>Le document doit être lisible et complet.</li>
          <li>La période du certificat doit couvrir chaque séance sélectionnée.</li>
          <li>Le fichier ne doit pas dépasser 5 Mo.</li>
          <li>Un justificatif refusé peut être redéposé avec un nouveau document.</li>
        </ul>
        {selectedRows.length > 0 && (
          <div className="help-summary">
            <strong>Sélection</strong>
            {selectedRows.map((r) => <span key={r.absence.id}>{r.subject.name} · {formatDate(r.session.date)}</span>)}
          </div>
        )}
      </Card>
    </form>
  );
}
