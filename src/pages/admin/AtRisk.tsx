import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../api";
import { useDebounced, useMutation, useQuery } from "../../api/useQuery";
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Icon, Loading, Modal, PageHeader, Person, SelectField } from "../../components/ui";
import { navigate, queryParams } from "../../router";
import { downloadCsv, toCsv } from "../../utils/csv";
import { formatDate, shortFiliere, todayIso } from "../../utils/format";
import type { RiskRow } from "../../types";
import type { WarningNotice } from "../../api";

export default function AtRiskPage({ path }: { path: string }) {
  const initial = useMemo(() => queryParams(path), []); // eslint-disable-line react-hooks/exhaustive-deps
  const settings = useQuery(() => api.getSettings(), []);
  const years = useQuery(() => api.listAcademicYears(), []);
  const [year, setYear] = useState<number | null>(null);
  const selected = year ?? years.data?.[0] ?? null;
  const [query, setQuery] = useState("");
  const [filiere, setFiliere] = useState("");
  const debounced = useDebounced(query);
  const risk = useQuery(() => (selected ? api.listAtRisk({ academicYear: selected, query: debounced, filiere }) : Promise.resolve([])), [selected, debounced, filiere]);
  const [notice, setNotice] = useState<string | null>(initial.get("studentId"));

  const exportCsv = () => {
    const rows = (risk.data ?? []).map((r) => [r.student.registrationNumber, r.student.lastName, r.student.firstName, shortFiliere(r.student.filiere), `${r.student.niveau} ${r.student.groupe}`, r.totalUnjustified, r.topSubject ? `${r.topSubject.subject.name} (${r.topSubject.unjustified})` : ""]);
    downloadCsv(`etudiants_a_risque_${todayIso()}.csv`, toCsv(["matricule", "nom", "prenom", "filiere", "groupe", "total_non_justifiees", "matiere_principale"], rows));
  };

  const s = settings.data;

  return (
    <>
      <PageHeader title="Étudiants à risque" subtitle={s ? `Seuils : ${s.subjectThreshold} par matière, ${s.overallThreshold} au total (non justifiées)` : "Chargement…"} action={<Button variant="secondary" icon="download" onClick={exportCsv} disabled={!risk.data?.length}>Exporter la liste</Button>} />
      <Card>
        <div className="filters filters-4">
          <div className="search"><Icon name="search" size={18} /><input aria-label="Rechercher" placeholder="Nom, n° d'inscription…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <SelectField label="Filière" value={filiere} onChange={(e) => setFiliere(e.target.value)}><option value="">Toutes les filières</option>{(s?.filieres ?? []).map((f) => <option key={f} value={f}>{f}</option>)}</SelectField>
          <SelectField label="Année" value={selected ?? ""} onChange={(e) => setYear(Number(e.target.value))}>{(years.data ?? []).map((y) => <option key={y} value={y}>{y}–{y + 1}</option>)}</SelectField>
        </div>
        {risk.error ? <ErrorState message={risk.error} onRetry={risk.refetch} /> : !risk.data ? <Loading /> : risk.data.length === 0 ? (
          <EmptyState icon="check" title="Aucun étudiant à risque" text="Aucun étudiant ne dépasse les seuils pour cette période." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Étudiant</th><th>Groupe</th><th>Matières dépassées</th><th>Total non justifiées</th><th>Actions</th></tr></thead>
              <tbody>
                {risk.data.map((r) => (
                  <tr key={r.student.id}>
                    <td data-label="Étudiant"><Person firstName={r.student.firstName} lastName={r.student.lastName} sub={r.student.registrationNumber} /></td>
                    <td data-label="Groupe">{shortFiliere(r.student.filiere)} · {r.student.niveau} {r.student.groupe}</td>
                    <td data-label="Matières dépassées"><div className="chip-row">{r.subjects.filter((x) => x.flag).map((x) => <Badge key={x.subject.id} tone="danger">{x.subject.name} · {x.unjustified}</Badge>)}{r.overallFlag && <Badge tone="warning">Seuil global</Badge>}</div></td>
                    <td data-label="Total non justifiées"><span className="count-pill">{r.totalUnjustified}</span></td>
                    <td data-label="Actions"><div className="actions-row"><Button variant="secondary" icon="mail" onClick={() => setNotice(r.student.id)}>Mise en garde</Button><button type="button" className="icon-btn" onClick={() => navigate(`/absences?studentId=${r.student.id}`)} aria-label="Voir les absences" title="Voir les absences"><Icon name="calendar" size={17} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {notice && selected && <NoticeModal studentId={notice} year={selected} onClose={() => setNotice(null)} />}
    </>
  );
}

function noticeText(n: WarningNotice): string {
  const lines = n.lines.map((l) => `  - ${l.subject} : ${l.unjustified} absence(s) non justifiée(s)${l.flagged ? " (seuil dépassé)" : ""}`).join("\n");
  return `${n.institutionName}
Le ${formatDate(n.generatedAt.slice(0, 10))}

Objet : Mise en garde pour absences non justifiées

Étudiant : ${n.student.firstName} ${n.student.lastName}
N° d'inscription : ${n.student.registrationNumber}
Filière : ${n.student.filiere}
Niveau / Groupe : ${n.student.niveau} · ${n.student.groupe}
Année universitaire : ${n.academicYear}–${n.academicYear + 1}

Madame, Monsieur,

Nos services ont enregistré un total de ${n.totalUnjustified} absence(s) non justifiée(s) répartie(s) comme suit :
${lines}

Au-delà de ${n.subjectThreshold} absences non justifiées dans une matière, ou de ${n.overallThreshold} au total, votre situation peut entraîner des mesures disciplinaires conformément au règlement intérieur. Nous vous invitons à régulariser votre situation auprès du service de scolarité dans les plus brefs délais.

Le service de scolarité`;
}

function NoticeModal({ studentId, year, onClose }: { studentId: string; year: number; onClose: () => void }) {
  const { data, error } = useQuery(() => api.buildWarningNotice(studentId, year), [studentId, year]);
  const [copied, setCopied] = useState(false);
  const logged = useRef(false);
  // Log the generation exactly once per open. Not tied to `data`, because logging commits to the
  // store, which would re-run the query and retrigger the effect (infinite loop otherwise).
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    void api.logNoticeGenerated([studentId]);
  }, [studentId]);

  const copy = async () => {
    if (!data) return;
    try { await navigator.clipboard.writeText(noticeText(data)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const print = () => {
    if (!data) return;
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) return;
    w.document.write(`<pre style="font-family:Georgia,serif;font-size:14px;line-height:1.6;white-space:pre-wrap;padding:40px">${noticeText(data).replace(/</g, "&lt;")}</pre>`);
    w.document.title = `Mise en garde - ${data.student.lastName}`;
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Modal title="Mise en garde" eyebrow={data ? `${data.student.firstName} ${data.student.lastName}`.toUpperCase() : "GÉNÉRATION"} onClose={onClose} footer={data && <><Button variant="secondary" icon={copied ? "check" : "file"} onClick={copy}>{copied ? "Copié" : "Copier le texte"}</Button><Button icon="download" onClick={print}>Imprimer / PDF</Button></>}>
      {error ? <div className="confirm-body"><Alert tone="danger">{error}</Alert></div> : !data ? <Loading /> : (
        <div className="notice-preview"><pre>{noticeText(data)}</pre></div>
      )}
    </Modal>
  );
}
