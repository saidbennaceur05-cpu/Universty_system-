import { useEffect, useState } from "react";
import * as api from "../../api";
import { useDebounced, useQuery } from "../../api/useQuery";
import { Card, EmptyState, ErrorState, Icon, Loading, PageHeader, Pagination, SelectField } from "../../components/ui";
import { formatDateTime } from "../../utils/format";
import type { AuditAction } from "../../types";

const ACTION_GROUPS: { label: string; value: AuditAction | "" }[] = [
  { label: "Toutes les actions", value: "" },
  { label: "Connexions", value: "login" },
  { label: "Étudiants", value: "student_created" },
  { label: "Absences", value: "absence_created" },
  { label: "Certificats", value: "certificate_reviewed" },
  { label: "Imports", value: "students_imported" },
  { label: "Mises en garde", value: "notice_generated" },
  { label: "Comptes admin", value: "admin_created" },
  { label: "Paramètres", value: "settings_updated" },
];

export default function AuditPage() {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<AuditAction | "">("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(query);
  useEffect(() => setPage(1), [debounced, action]);
  const list = useQuery(() => api.listAudit({ query: debounced, action, page, pageSize: 20 }), [debounced, action, page]);

  return (
    <>
      <PageHeader title="Journal d'activité" subtitle="Historique complet des actions effectuées sur la plateforme" />
      <Card>
        <div className="filters filters-2">
          <div className="search"><Icon name="search" size={18} /><input aria-label="Rechercher" placeholder="Rechercher dans le journal…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <SelectField label="Catégorie" value={action} onChange={(e) => setAction(e.target.value as AuditAction | "")}>{ACTION_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</SelectField>
        </div>
        {list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> : !list.data ? <Loading /> : list.data.total === 0 ? (
          <EmptyState icon="list" title="Aucune entrée" text="Aucune action ne correspond à ces critères." />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Action</th><th>Par</th></tr></thead>
                <tbody>
                  {list.data.items.map((e) => (
                    <tr key={e.id}>
                      <td data-label="Date" className="muted nowrap">{formatDateTime(e.at)}</td>
                      <td data-label="Action">{e.summary}</td>
                      <td data-label="Par">{e.actorName}</td>
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
