import type { AbsenceRow, Student } from "../types";
import { ABSENCE_STATUS_LABEL } from "../types";

/** Parse CSV text into header-keyed records. Handles quotes, commas and semicolons. */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const delimiter = detectDelimiter(clean);
  const rows = splitRows(clean, delimiter);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => normalizeHeader(h));
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => (rec[h] = (cells[i] ?? "").trim()));
    return rec;
  });
}

function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0];
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, "");
}

function escapeCell(value: string): string {
  const v = value ?? "";
  return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Build CSV text (semicolon-separated, Excel-friendly, with BOM). */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map((h) => escapeCell(h)).join(";")];
  for (const r of rows) lines.push(r.map((c) => escapeCell(String(c))).join(";"));
  return "﻿" + lines.join("\r\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function studentsToCsv(students: Student[]): string {
  return toCsv(["nom", "prenom", "matricule", "email", "filiere", "niveau", "groupe"], students.map((s) => [s.lastName, s.firstName, s.registrationNumber, s.email, s.filiere, s.niveau, s.groupe]));
}

export function absencesToCsv(rows: AbsenceRow[]): string {
  return toCsv(
    ["matricule", "nom", "prenom", "date", "debut", "fin", "matiere", "enseignant", "statut"],
    rows.map((r) => [r.student.registrationNumber, r.student.lastName, r.student.firstName, r.session.date, r.session.startTime, r.session.endTime, r.subject.name, r.teacher ? `${r.teacher.title} ${r.teacher.firstName} ${r.teacher.lastName}` : "", ABSENCE_STATUS_LABEL[r.absence.status]]),
  );
}

export const STUDENT_TEMPLATE = toCsv(
  ["nom", "prenom", "matricule", "email", "filiere", "niveau", "groupe"],
  [["Benali", "Lina", "20240018", "lina.benali@etu.univ.tn", "Licence en Génie Informatique - Systèmes Embarqués et Internet des Objets", "2ème année", "G1"]],
);

export const ABSENCE_TEMPLATE = toCsv(
  ["matricule", "matiere", "date", "debut", "fin"],
  [["20240018", "ALG", "2026-10-06", "08:30", "10:00"]],
);
