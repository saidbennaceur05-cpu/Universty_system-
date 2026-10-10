import { useEffect, useState } from "react";
import * as api from "../../api";
import { useDebounced, useQuery } from "../../api/useQuery";
import { AbsenceDetailModal } from "../../components/AbsenceDetail";
import { CertificateUploadForm } from "../../components/CertificateUploadForm";
import { StudentSearch } from "../../components/StudentSearch";
import { Button, Card, CertificateBadge, EmptyState, ErrorState, Icon, Loading, PageHeader, Pagination, Person, Tabs } from "../../components/ui";
import { navigate } from "../../router";
import type { CertificateStatus, Student } from "../../types";
import { CERTIFICATE_STATUS_LABEL } from "../../types";
import { formatBytes, formatDate, formatDateTime } from "../../utils/format";

const STATUSES: CertificateStatus[] = ["pending", "accepted", "rejected"];

export default function CertificatesPage() {
  const [status, setStatus] = useState<CertificateStatus | "">("pending");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const debounced = useDebounced(query);
  useEffect(() => setPage(1), [debounced, status]);
  const list = useQuery(() => api.listCertificates({ status, query: debounced, page, pageSize: 10 }), [status, debounced, page]);
  const counts = useQuery(async () => {
    const all = await Promise.all(STATUSES.map((s) => api.listCertificates({ status: s, pageSize: 1 })));
    return Object.fromEntries(STATUSES.map((s, i) => [s, all[i].total])) as Record<CertificateStatus, number>;
  }, []);

  return (
    <>
      <PageHeader title="Certificats" subtitle="Justificatifs déposés par les étudiants, à valider ou refuser" action={<Button icon="plus" onClick={() => navigate("/admin/certificates/new")}>Déposer pour un étudiant</Button>} />
      <Card>
        <div className="tabs-bar">
          <Tabs value={status} onChange={setStatus} items={[...STATUSES.map((s) => ({ value: s as CertificateStatus | "", label: CERTIFICATE_STATUS_LABEL[s], count: counts.data?.[s] })), { value: "" as CertificateStatus | "", label: "Tous" }]} />
        </div>
        <div className="filters filters-1">
          <div className="search"><Icon name="search" size={18} /><input aria-label="Rechercher" placeholder="Étudiant, n° d'inscription, nom du fichier…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        </div>
        {list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> : !list.data ? <Loading /> : list.data.total === 0 ? (
          <EmptyState icon={status === "pending" ? "check" : "file"} title={status === "pending" ? "Aucun certificat en attente" : "Aucun certificat"} text={status === "pending" ? "Tous les justificatifs ont été traités." : "Aucun justificatif ne correspond."} />
        ) : (
          <>
            <div className={`table-wrap ${list.loading ? "is-stale" : ""}`}>
              <table>
                <thead><tr><th>Étudiant</th><th>Document</th><th>Période</th><th>Absences</th><th>Déposé le</th><th>Statut</th><th /></tr></thead>
                <tbody>
                  {list.data.items.map((row) => (
                    <tr key={row.certificate.id} className="clickable" onClick={() => row.absences[0] && setDetail(row.absences[0].absence.id)}>
                      <td data-label="Étudiant"><Person firstName={row.student.firstName} lastName={row.student.lastName} sub={`N° ${row.student.registrationNumber}`} /></td>
                      <td data-label="Document"><span className="date-cell"><strong className="ellipsis">{row.certificate.fileName}</strong><small>{formatBytes(row.certificate.fileSize)}</small></span></td>
                      <td data-label="Période">{row.certificate.startDate === row.certificate.endDate ? formatDate(row.certificate.startDate) : `${formatDate(row.certificate.startDate)} → ${formatDate(row.certificate.endDate)}`}</td>
                      <td data-label="Absences" className="wrap">{row.absences.map((a) => a.subject.name).join(", ")}</td>
                      <td data-label="Déposé le">{formatDateTime(row.certificate.uploadedAt)}</td>
                      <td data-label="Statut"><CertificateBadge status={row.certificate.status} /></td>
                      <td className="row-action"><button type="button" className="icon-btn" aria-label="Examiner"><Icon name="more" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>
      {detail && <AbsenceDetailModal absenceId={detail} role="admin" onClose={() => setDetail(null)} />}
    </>
  );
}

export function NewCertificatePage() {
  const [student, setStudent] = useState<Student | null>(null);
  return (
    <>
      <PageHeader title="Déposer un certificat" subtitle="Téléversez un justificatif au nom d'un étudiant (remis en main propre, par exemple)" />
      {!student ? (
        <Card className="form-card"><StudentSearch value={student} onChange={setStudent} autoFocus /><p className="muted small mt">Recherchez l'étudiant concerné pour afficher ses absences à justifier.</p></Card>
      ) : (
        <>
          <Card className="form-card mb"><StudentSearch value={student} onChange={setStudent} /></Card>
          <CertificateUploadForm key={student.id} student={student} onDone={() => navigate("/admin/certificates")} />
        </>
      )}
    </>
  );
}
