import type { AbsenceRow } from "../types";
import { formatDate, shortFiliere } from "../utils/format";
import { AbsenceBadge, Icon, Person } from "./ui";

/** Shared absence table. Columns adapt to who is looking: students don't need their own name. */
export function AbsenceTable({ rows, onDetail, showStudent = true, showTeacher = true, stale = false, selectable, selected, onToggle, allIds, onToggleAll }: { rows: AbsenceRow[]; onDetail?: (row: AbsenceRow) => void; showStudent?: boolean; showTeacher?: boolean; stale?: boolean; selectable?: (row: AbsenceRow) => boolean; selected?: Set<string>; onToggle?: (id: string) => void; allIds?: string[]; onToggleAll?: (ids: string[], on: boolean) => void }) {
  const allOn = !!allIds && allIds.length > 0 && allIds.every((id) => selected?.has(id));
  return (
    <div className={`table-wrap ${stale ? "is-stale" : ""}`}>
      <table>
        <thead>
          <tr>
            {selectable && <th className="th-check">{allIds && onToggleAll && <input type="checkbox" checked={allOn} onChange={() => onToggleAll(allIds, !allOn)} aria-label="Tout sélectionner" />}</th>}
            {showStudent && <th>Étudiant</th>}
            <th>Date</th>
            <th>Matière</th>
            {showTeacher && <th>Enseignant</th>}
            <th>Statut</th>
            {onDetail && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const canSelect = selectable ? selectable(r) : false;
            const isSelected = selected?.has(r.absence.id) ?? false;
            return (
              <tr key={r.absence.id} className={`${onDetail ? "clickable" : ""} ${isSelected ? "row-selected" : ""}`} onClick={() => (selectable && canSelect && onToggle ? onToggle(r.absence.id) : onDetail?.(r))}>
                {selectable && <td className="td-check" data-label="Sélection"><input type="checkbox" checked={isSelected} disabled={!canSelect} onChange={() => onToggle?.(r.absence.id)} onClick={(e) => e.stopPropagation()} aria-label={`Sélectionner l'absence du ${formatDate(r.session.date)}`} /></td>}
                {showStudent && <td data-label="Étudiant"><Person firstName={r.student.firstName} lastName={r.student.lastName} sub={`${shortFiliere(r.student.filiere)} · ${r.student.niveau} ${r.student.groupe}`} /></td>}
                <td data-label="Date"><span className="date-cell"><strong>{formatDate(r.session.date)}</strong><small>{r.session.startTime}–{r.session.endTime}</small></span></td>
                <td data-label="Matière">{r.subject.name}</td>
                {showTeacher && <td data-label="Enseignant">{r.teacher ? `${r.teacher.title} ${r.teacher.firstName} ${r.teacher.lastName}` : "—"}</td>}
                <td data-label="Statut"><span className="status-cell"><AbsenceBadge status={r.absence.status} />{r.certificate && <Icon name="file" size={14} />}</span></td>
                {onDetail && <td className="row-action"><button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); onDetail(r); }} aria-label="Voir le détail"><Icon name="more" /></button></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
