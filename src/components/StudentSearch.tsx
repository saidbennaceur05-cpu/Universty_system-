import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import { useDebounced } from "../api/useQuery";
import type { Student } from "../types";
import { shortFiliere } from "../utils/format";
import { Avatar, Icon } from "./ui";

export function StudentSearch({ value, onChange, error, label = "Étudiant", autoFocus = false }: { value: Student | null; onChange: (s: Student | null) => void; error?: string; label?: string; autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query, 150);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.searchStudents(debounced).then((r) => !cancelled && setResults(r));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (value) {
    return (
      <div className="field">
        <span className="label">{label}</span>
        <div className="selected-student">
          <Avatar firstName={value.firstName} lastName={value.lastName} />
          <span><strong>{value.firstName} {value.lastName}</strong><small>N° {value.registrationNumber} · {shortFiliere(value.filiere)} · {value.niveau} {value.groupe}</small></span>
          <button type="button" className="icon-btn" onClick={() => { onChange(null); setQuery(""); }} aria-label="Changer d'étudiant"><Icon name="close" size={16} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="field" ref={box}>
      <span className="label">{label}</span>
      <div className={`search select-search ${error ? "input-error" : ""}`}>
        <Icon name="search" size={18} />
        <input aria-label="Rechercher un étudiant" placeholder="Rechercher par nom ou numéro…" value={query} autoFocus={autoFocus} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      </div>
      {error && <span className="error-text"><Icon name="alert" size={14} />{error}</span>}
      {open && query.trim() && (
        <div className="dropdown">
          {results.length === 0 ? <div className="dropdown-empty">Aucun étudiant ne correspond.</div> : results.map((s) => (
            <button type="button" key={s.id} className="dropdown-item" onClick={() => { onChange(s); setOpen(false); }}>
              <Avatar firstName={s.firstName} lastName={s.lastName} />
              <span><strong>{s.lastName} {s.firstName}</strong><small>N° {s.registrationNumber} · {shortFiliere(s.filiere)} · {s.niveau} {s.groupe}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
