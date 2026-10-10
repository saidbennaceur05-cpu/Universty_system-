import { useState } from "react";
import * as api from "../../api";
import { useQuery } from "../../api/useQuery";
import { Button, Card, EmptyState, ErrorState, Field, Loading, PageHeader, SelectField, StatCard } from "../../components/ui";
import { MonthlyChart } from "./Dashboard";
import { downloadCsv, toCsv } from "../../utils/csv";
import { formatNumber, todayIso } from "../../utils/format";
import type { ReportResult } from "../../api";

export default function ReportsPage() {
  const settings = useQuery(() => api.getSettings(), []);
  const subjects = useQuery(() => api.listSubjects(), []);
  const years = useQuery(() => api.listAcademicYears(), []);
  const [year, setYear] = useState<number | null>(null);
  const selectedYear = year ?? years.data?.[0] ?? null;
  const [filiere, setFiliere] = useState("");
  const [niveau, setNiveau] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const report = useQuery(() => (selectedYear ? api.runReport({ academicYear: selectedYear, filiere, niveau, subjectId, from, to }) : Promise.resolve(null)), [selectedYear, filiere, niveau, subjectId, from, to]);
  const s = settings.data;
  const r = report.data;

  const exportReport = () => {
    if (!r) return;
    const blocks: string[] = [];
    blocks.push(toCsv(["Indicateur", "Valeur"], [["Total absences", r.total], ["Non justifiées", r.statusBreakdown.unjustified + r.statusBreakdown.rejected], ["En attente", r.statusBreakdown.pending], ["Justifiées", r.statusBreakdown.justified]]));
    blocks.push("\r\nPar matière\r\n" + toCsv(["Matière", "Total", "Non justifiées"], r.bySubject.map((x) => [x.subject, x.total, x.unjustified])));
    blocks.push("\r\nPar groupe\r\n" + toCsv(["Groupe", "Total", "Non justifiées"], r.byGroup.map((x) => [x.label, x.total, x.unjustified])));
    blocks.push("\r\nÉtudiants les plus absents\r\n" + toCsv(["Matricule", "Nom", "Prénom", "Total", "Non justifiées"], r.topStudents.map((x) => [x.student.registrationNumber, x.student.lastName, x.student.firstName, x.total, x.unjustified])));
    downloadCsv(`rapport_absences_${todayIso()}.csv`, blocks.join("\r\n"));
  };

  return (
    <>
      <PageHeader title="Rapports" subtitle="Analyse des absences par période, filière, groupe et matière" action={<Button variant="secondary" icon="download" onClick={exportReport} disabled={!r || r.total === 0}>Exporter (Excel)</Button>} />
      <Card className="mb">
        <div className="filters filters-6">
          <SelectField label="Année" value={selectedYear ?? ""} onChange={(e) => setYear(Number(e.target.value))}>{(years.data ?? []).map((y) => <option key={y} value={y}>{y}–{y + 1}</option>)}</SelectField>
          <SelectField label="Filière" value={filiere} onChange={(e) => setFiliere(e.target.value)}><option value="">Toutes</option>{(s?.filieres ?? []).map((f) => <option key={f} value={f}>{f}</option>)}</SelectField>
          <SelectField label="Niveau" value={niveau} onChange={(e) => setNiveau(e.target.value)}><option value="">Tous</option>{(s?.niveaux ?? []).map((n) => <option key={n} value={n}>{n}</option>)}</SelectField>
          <SelectField label="Matière" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Toutes</option>{(subjects.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectField>
          <Field label="Du" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <Field label="Au" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>
      {report.error ? <ErrorState message={report.error} onRetry={report.refetch} /> : !r ? <Loading /> : r.total === 0 ? (
        <Card><EmptyState icon="chart" title="Aucune donnée" text="Aucune absence ne correspond à ces critères." /></Card>
      ) : (
        <ReportView r={r} />
      )}
    </>
  );
}

function ReportView({ r }: { r: ReportResult }) {
  const unjustified = r.statusBreakdown.unjustified + r.statusBreakdown.rejected;
  const rate = r.total ? Math.round((unjustified / r.total) * 100) : 0;
  const maxSub = Math.max(1, ...r.bySubject.map((x) => x.total));
  const maxGrp = Math.max(1, ...r.byGroup.map((x) => x.total));
  return (
    <>
      <div className="stats stats-4">
        <StatCard label="Total absences" value={formatNumber(r.total)} icon="calendar" tone="indigo" />
        <StatCard label="Non justifiées" value={formatNumber(unjustified)} detail={`${rate} % du total`} icon="alert" tone={rate > 50 ? "red" : "orange"} />
        <StatCard label="En attente" value={r.statusBreakdown.pending} icon="clock" tone="orange" />
        <StatCard label="Justifiées" value={r.statusBreakdown.justified} icon="check" tone="green" />
      </div>
      <div className="dashboard-grid">
        <Card className="chart-card"><div className="card-title"><div><h3>Absences par mois</h3></div></div><MonthlyChart values={r.byMonth.map((m) => m.count)} /></Card>
        <Card className="activity-card"><div className="card-title"><div><h3>Par matière</h3></div></div>
          <div className="hbar-list">{r.bySubject.slice(0, 8).map((x) => <div key={x.subject} className="hbar"><span className="hbar-label">{x.subject}</span><span className="hbar-track"><span className="hbar-fill" style={{ width: `${(x.total / maxSub) * 100}%` }} /></span><span className="hbar-value">{x.total}</span></div>)}</div>
        </Card>
      </div>
      <div className="two-col">
        <Card>
          <div className="card-title"><div><h3>Par groupe</h3></div></div>
          <div className="hbar-list pad">{r.byGroup.slice(0, 10).map((x) => <div key={x.label} className="hbar"><span className="hbar-label" title={x.label}>{x.label}</span><span className="hbar-track"><span className="hbar-fill" style={{ width: `${(x.total / maxGrp) * 100}%` }} /></span><span className="hbar-value">{x.unjustified}<small>/{x.total}</small></span></div>)}</div>
        </Card>
        <Card>
          <div className="card-title"><div><h3>Étudiants les plus absents</h3><p>Classés par absences non justifiées</p></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Étudiant</th><th>Non justifiées</th><th>Total</th></tr></thead>
              <tbody>{r.topStudents.map((x) => <tr key={x.student.id}><td data-label="Étudiant">{x.student.lastName} {x.student.firstName}</td><td data-label="Non justifiées"><span className="count-pill">{x.unjustified}</span></td><td data-label="Total">{x.total}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
