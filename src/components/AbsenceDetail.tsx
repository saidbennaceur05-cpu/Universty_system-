import { useState } from "react";
import * as api from "../api";
import { useMutation, useQuery } from "../api/useQuery";
import type { AbsenceRow, AbsenceStatus, Certificate } from "../types";
import { ABSENCE_STATUS_LABEL } from "../types";
import { formatBytes, formatDate, formatDateTime, shortFiliere } from "../utils/format";
import { AbsenceBadge, Alert, Avatar, Button, CertificateBadge, Icon, Loading, Modal, SelectField, TextareaField, useConfirm, useToast } from "./ui";

export function CertificatePreview({ certificate }: { certificate: Certificate }) {
  const isImage = certificate.fileType.startsWith("image/");
  const isPdf = certificate.fileType === "application/pdf";
  return (
    <div className="document-preview">
      {certificate.dataUrl && isImage ? (
        <img className="doc-image" src={certificate.dataUrl} alt={`Aperçu de ${certificate.fileName}`} />
      ) : certificate.dataUrl && isPdf ? (
        <iframe className="doc-frame" src={certificate.dataUrl} title={`Aperçu de ${certificate.fileName}`} />
      ) : (
        <div className="doc-placeholder">
          <Icon name="file" size={36} />
          <strong>{certificate.fileName}</strong>
          <span>{formatBytes(certificate.fileSize)} · aperçu indisponible{certificate.fileSize > 1.5 * 1024 * 1024 ? " (fichier trop volumineux pour le stockage local)" : ""}</span>
        </div>
      )}
      {certificate.dataUrl && (
        <div className="preview-controls">
          <a className="btn btn-secondary" href={certificate.dataUrl} download={certificate.fileName}><Icon name="download" size={16} />Télécharger</a>
          <span>{formatBytes(certificate.fileSize)}</span>
        </div>
      )}
    </div>
  );
}

function ReviewPanel({ certificate, onDone }: { certificate: Certificate; onDone: () => void }) {
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [note, setNote] = useState("");
  const review = useMutation(api.reviewCertificate);
  const toast = useToast();
  const decide = async (decision: "accepted" | "rejected") => {
    const result = await review.run(certificate.id, decision, note);
    if (result.ok) {
      toast(decision === "accepted" ? "Certificat validé : les absences sont justifiées." : "Certificat refusé.");
      onDone();
    }
  };
  return (
    <div className="review-panel">
      {review.error && !review.error.field && <Alert tone="danger">{review.error.message}</Alert>}
      {mode === "reject" ? (
        <>
          <TextareaField label="Motif du refus" placeholder="Ex. Les dates ne couvrent pas la séance, document illisible…" value={note} onChange={(e) => setNote(e.target.value)} rows={3} required error={review.error?.field === "note" ? review.error.message : undefined} autoFocus />
          <div className="modal-actions"><Button variant="secondary" onClick={() => setMode("idle")}>Retour</Button><Button variant="danger" loading={review.pending} onClick={() => decide("rejected")}>Confirmer le refus</Button></div>
        </>
      ) : (
        <div className="modal-actions"><Button variant="danger" onClick={() => setMode("reject")}>Refuser</Button><Button icon="check" loading={review.pending} onClick={() => decide("accepted")}>Valider</Button></div>
      )}
    </div>
  );
}

function ManualStatusPanel({ row }: { row: AbsenceRow }) {
  const [status, setStatus] = useState<AbsenceStatus>(row.absence.status);
  const [note, setNote] = useState(row.absence.note ?? "");
  const set = useMutation(api.setAbsenceStatus);
  const toast = useToast();
  const apply = async () => {
    const r = await set.run(row.absence.id, status, note);
    if (r.ok) toast("Statut mis à jour.");
  };
  return (
    <div className="manual-panel">
      <span className="panel-title">Décision manuelle</span>
      <p className="muted small">Pour un justificatif papier ou une décision administrative sans fichier.</p>
      {set.error && <Alert tone="danger">{set.error.message}</Alert>}
      <SelectField label="Statut" value={status} onChange={(e) => setStatus(e.target.value as AbsenceStatus)}>
        {(["unjustified", "justified", "rejected"] as AbsenceStatus[]).map((s) => <option key={s} value={s}>{ABSENCE_STATUS_LABEL[s]}</option>)}
      </SelectField>
      <TextareaField label="Note (facultative)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Ex. Justificatif papier remis au secrétariat" />
      <Button variant="secondary" loading={set.pending} onClick={apply} disabled={status === row.absence.status && (note || "") === (row.absence.note ?? "")}>Appliquer</Button>
    </div>
  );
}

export function AbsenceDetailModal({ absenceId, onClose }: { absenceId: string; onClose: () => void }) {
  const { data: row, error } = useQuery(() => api.getAbsence(absenceId), [absenceId]);
  const certificate = row?.certificate;
  const certRow = useQuery(() => (certificate ? api.getCertificate(certificate.id) : Promise.resolve(null)), [certificate?.id, certificate?.status]);
  const remove = useMutation(api.deleteAbsence);
  const confirm = useConfirm();
  const toast = useToast();

  const onDelete = async () => {
    if (!row) return;
    if (!(await confirm({ title: "Supprimer l'absence", tone: "danger", confirmLabel: "Supprimer", message: <>Supprimer l'absence de <strong>{row.student.firstName} {row.student.lastName}</strong> du {formatDate(row.session.date)} en {row.subject.name} ?</> }))) return;
    const r = await remove.run(row.absence.id);
    if (r.ok) {
      toast("Absence supprimée.");
      onClose();
    }
  };


  return (
    <Modal title="Détail de l'absence" eyebrow={row ? row.subject.name.toUpperCase() : "ABSENCE"} onClose={onClose} wide={!!certificate}>
      {error ? <div className="confirm-body"><Alert tone="danger">{error}</Alert></div> : !row ? <Loading /> : (
        <div className={`modal-body ${certificate ? "" : "modal-body-single"}`}>
          {certificate && <CertificatePreview certificate={certificate} />}
          <div className="certificate-info">
            <div className="info-title">
              <div><Avatar firstName={row.student.firstName} lastName={row.student.lastName} size="large" /><div><span>Étudiant·e</span><strong>{row.student.firstName} {row.student.lastName}</strong><small>N° {row.student.registrationNumber} · {shortFiliere(row.student.filiere)} · {row.student.niveau} {row.student.groupe}</small></div></div>
              <AbsenceBadge status={row.absence.status} />
            </div>
            <div className="info-list">
              <div><span>Séance</span><strong>{row.subject.name} · {row.session.startTime}–{row.session.endTime}</strong></div>
              <div><span>Date</span><strong>{formatDate(row.session.date)}</strong></div>
              <div><span>Enseignant</span><strong>{row.teacher ? `${row.teacher.title} ${row.teacher.firstName} ${row.teacher.lastName}` : "—"}</strong></div>
              {row.absence.note && <div><span>Note</span><strong className="note">{row.absence.note}</strong></div>}
              {certificate && (
                <>
                  <div><span>Justificatif</span><strong>{certificate.fileName}</strong><span className="inline-badge"><CertificateBadge status={certificate.status} /></span></div>
                  <div><span>Période couverte</span><strong>Du {formatDate(certificate.startDate)} au {formatDate(certificate.endDate)}</strong></div>
                  <div><span>Déposé le</span><strong>{formatDateTime(certificate.uploadedAt)}{certRow.data?.uploadedBy && ` · ${certRow.data.uploadedBy.firstName} ${certRow.data.uploadedBy.lastName}`}</strong></div>
                  {certificate.reviewedAt && <div><span>Traité le</span><strong>{formatDateTime(certificate.reviewedAt)}{certRow.data?.reviewedBy && ` · ${certRow.data.reviewedBy.firstName} ${certRow.data.reviewedBy.lastName}`}</strong></div>}
                  {certificate.reviewNote && <div><span>Motif</span><strong className="note">{certificate.reviewNote}</strong></div>}
                  {certRow.data && certRow.data.absences.length > 1 && <div><span>Ce certificat couvre aussi</span><strong>{certRow.data.absences.filter((a) => a.absence.id !== row.absence.id).map((a) => `${a.subject.name} (${formatDate(a.session.date)})`).join(", ")}</strong></div>}
                </>
              )}
            </div>
            {certificate?.status === "pending" && <ReviewPanel certificate={certificate} onDone={() => undefined} />}
            {certificate && certificate.status !== "pending" && <ManualStatusPanel row={row} />}
            {!certificate && <ManualStatusPanel row={row} />}
            {remove.error && <Alert tone="danger">{remove.error.message}</Alert>}
            <div className="modal-actions danger-zone"><Button variant="ghost" icon="trash" loading={remove.pending} onClick={onDelete}>Supprimer cette absence</Button></div>
          </div>
        </div>
      )}
    </Modal>
  );
}
