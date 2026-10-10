// Application API for the UniAbsence administration platform.
// Every function is async and returns plain data, so the UI never knows whether it is talking to
// localStorage (this implementation) or to an HTTP backend. A teammate replaces this file with
// fetch() calls against a real server; the signatures and return types are the contract.
// See API_CONTRACT.md for the full spec.

import type {
  Absence, AbsenceRow, AbsenceStatus, AdminRole, AdminUser, AuditAction, AuditEntry, AuthSession,
  Certificate, CertificateRow, CertificateStatus, Paged, RiskRow, Session, Settings, Student, Subject,
  Teacher, UserStatus,
} from "../types";
import { ABSENCE_STATUS_LABEL } from "../types";
import { academicYearOf } from "../data/seed";
import { commit, getDb, initDb, readSessionUserId, resetDb, writeSessionUserId } from "./db";
import { generateTemporaryPassword, hashPassword, newId, verifyPassword } from "./crypto";

export class ApiError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

const LATENCY_MS = 70;
const delay = () => new Promise<void>((r) => setTimeout(r, LATENCY_MS));
const nowIso = () => new Date().toISOString();
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

function paginate<T>(items: T[], page = 1, pageSize = 10): Paged<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(Math.max(1, page), pageCount);
  return { items: items.slice((safe - 1) * pageSize, safe * pageSize), total, page: safe, pageSize, pageCount };
}

// ---------------------------------------------------------------------------------------------
// Auth & session

function currentUser(): AdminUser {
  const id = readSessionUserId();
  const user = id ? getDb().admins.find((u) => u.id === id) : undefined;
  if (!user) throw new ApiError("Session expirée. Veuillez vous reconnecter.");
  return user;
}

function requireRole(...roles: AdminRole[]): AdminUser {
  const user = currentUser();
  if (!roles.includes(user.role)) throw new ApiError("Cette action est réservée au super administrateur.");
  return user;
}

function audit(action: AuditAction, summary: string, actor: AdminUser, entity?: string) {
  const db = getDb();
  db.audit.push({ id: newId("aud"), action, summary, actorUserId: actor.id, actorName: fullName(actor), entity, at: nowIso() });
  if (db.audit.length > 1000) db.audit.splice(0, db.audit.length - 1000);
}

export async function bootstrap(): Promise<AuthSession | null> {
  await initDb();
  const id = readSessionUserId();
  const user = id ? getDb().admins.find((u) => u.id === id && u.status === "active") : undefined;
  if (!user) {
    writeSessionUserId(null);
    return null;
  }
  return { user };
}

export async function login(email: string, password: string): Promise<AuthSession> {
  await delay();
  const user = getDb().admins.find((u) => norm(u.email) === norm(email));
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new ApiError("Email ou mot de passe incorrect.");
  if (user.status === "disabled") throw new ApiError("Ce compte est désactivé. Contactez le super administrateur.");
  user.lastLoginAt = nowIso();
  audit("login", `Connexion de ${fullName(user)}`, user);
  commit();
  writeSessionUserId(user.id);
  return { user };
}

export async function logout(): Promise<void> {
  writeSessionUserId(null);
}

function validatePassword(password: string) {
  if (password.length < 8) throw new ApiError("Le mot de passe doit contenir au moins 8 caractères.", "next");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new ApiError("Le mot de passe doit contenir des lettres et au moins un chiffre.", "next");
}

export async function changePassword(currentPassword: string, nextPassword: string): Promise<AuthSession> {
  await delay();
  const user = currentUser();
  if (!user.mustChangePassword && !(await verifyPassword(currentPassword, user.passwordHash))) throw new ApiError("Le mot de passe actuel est incorrect.", "current");
  validatePassword(nextPassword);
  if (await verifyPassword(nextPassword, user.passwordHash)) throw new ApiError("Le nouveau mot de passe doit être différent de l'ancien.", "next");
  user.passwordHash = await hashPassword(nextPassword);
  user.mustChangePassword = false;
  audit("password_changed", `${fullName(user)} a modifié son mot de passe`, user);
  commit();
  return { user };
}

// ---------------------------------------------------------------------------------------------
// Admin accounts (super-admin only)

export async function listAdmins(): Promise<AdminUser[]> {
  requireRole("super-admin");
  return [...getDb().admins].sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"));
}

export interface AdminInput {
  firstName: string;
  lastName: string;
  email: string;
  role: AdminRole;
}

export async function createAdmin(input: AdminInput): Promise<{ admin: AdminUser; temporaryPassword: string }> {
  await delay();
  const actor = requireRole("super-admin");
  const db = getDb();
  if (!input.lastName.trim()) throw new ApiError("Le nom est requis.", "lastName");
  if (!input.firstName.trim()) throw new ApiError("Le prénom est requis.", "firstName");
  if (!EMAIL_RE.test(input.email.trim())) throw new ApiError("L'adresse email n'est pas valide.", "email");
  if (db.admins.some((u) => norm(u.email) === norm(input.email))) throw new ApiError("Cette adresse email est déjà utilisée.", "email");
  const temporaryPassword = generateTemporaryPassword();
  const admin: AdminUser = { id: newId("adm"), email: input.email.trim(), passwordHash: await hashPassword(temporaryPassword), role: input.role, firstName: input.firstName.trim(), lastName: input.lastName.trim(), status: "active", mustChangePassword: true, createdAt: nowIso() };
  db.admins.push(admin);
  audit("admin_created", `Compte administrateur créé : ${fullName(admin)} (${input.role === "super-admin" ? "super admin" : "agent"})`, actor, "admin");
  commit();
  return { admin, temporaryPassword };
}

export async function updateAdmin(id: string, input: AdminInput): Promise<AdminUser> {
  await delay();
  const actor = requireRole("super-admin");
  const db = getDb();
  const admin = db.admins.find((u) => u.id === id);
  if (!admin) throw new ApiError("Compte introuvable.");
  if (!EMAIL_RE.test(input.email.trim())) throw new ApiError("L'adresse email n'est pas valide.", "email");
  if (db.admins.some((u) => u.id !== id && norm(u.email) === norm(input.email))) throw new ApiError("Cette adresse email est déjà utilisée.", "email");
  if (admin.id === actor.id && input.role !== "super-admin") throw new ApiError("Vous ne pouvez pas retirer votre propre rôle de super administrateur.", "role");
  if (admin.role === "super-admin" && input.role !== "super-admin" && db.admins.filter((u) => u.role === "super-admin" && u.status === "active").length <= 1) throw new ApiError("Il doit rester au moins un super administrateur actif.", "role");
  Object.assign(admin, { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email.trim(), role: input.role });
  audit("admin_updated", `Compte administrateur mis à jour : ${fullName(admin)}`, actor, "admin");
  commit();
  return admin;
}

export async function setAdminStatus(id: string, status: UserStatus): Promise<void> {
  await delay();
  const actor = requireRole("super-admin");
  const db = getDb();
  const admin = db.admins.find((u) => u.id === id);
  if (!admin) throw new ApiError("Compte introuvable.");
  if (admin.id === actor.id) throw new ApiError("Vous ne pouvez pas désactiver votre propre compte.");
  if (status === "disabled" && admin.role === "super-admin" && db.admins.filter((u) => u.role === "super-admin" && u.status === "active").length <= 1) throw new ApiError("Il doit rester au moins un super administrateur actif.");
  admin.status = status;
  audit("admin_status", `Compte de ${fullName(admin)} ${status === "active" ? "réactivé" : "désactivé"}`, actor, "admin");
  commit();
}

export async function resetAdminPassword(id: string): Promise<string> {
  await delay();
  const actor = requireRole("super-admin");
  const db = getDb();
  const admin = db.admins.find((u) => u.id === id);
  if (!admin) throw new ApiError("Compte introuvable.");
  const temporaryPassword = generateTemporaryPassword();
  admin.passwordHash = await hashPassword(temporaryPassword);
  admin.mustChangePassword = true;
  audit("password_reset", `Mot de passe réinitialisé pour ${fullName(admin)}`, actor, "admin");
  commit();
  return temporaryPassword;
}

export async function deleteAdmin(id: string): Promise<void> {
  await delay();
  const actor = requireRole("super-admin");
  const db = getDb();
  const admin = db.admins.find((u) => u.id === id);
  if (!admin) throw new ApiError("Compte introuvable.");
  if (admin.id === actor.id) throw new ApiError("Vous ne pouvez pas supprimer votre propre compte.");
  if (admin.role === "super-admin" && db.admins.filter((u) => u.role === "super-admin" && u.status === "active").length <= 1) throw new ApiError("Il doit rester au moins un super administrateur actif.");
  db.admins = db.admins.filter((u) => u.id !== id);
  audit("admin_deleted", `Compte administrateur supprimé : ${fullName(admin)}`, actor, "admin");
  commit();
}

// ---------------------------------------------------------------------------------------------
// Settings & reference data

export async function getSettings(): Promise<Settings> {
  return { ...getDb().settings };
}

export async function updateSettings(input: Partial<Settings>): Promise<Settings> {
  await delay();
  const actor = requireRole("super-admin");
  const db = getDb();
  const s = db.settings;
  if (input.institutionName !== undefined) {
    if (!input.institutionName.trim()) throw new ApiError("Le nom de l'établissement est requis.", "institutionName");
    s.institutionName = input.institutionName.trim();
  }
  if (input.subjectThreshold !== undefined) {
    if (!Number.isInteger(input.subjectThreshold) || input.subjectThreshold < 1) throw new ApiError("Le seuil par matière doit être un entier positif.", "subjectThreshold");
    s.subjectThreshold = input.subjectThreshold;
  }
  if (input.overallThreshold !== undefined) {
    if (!Number.isInteger(input.overallThreshold) || input.overallThreshold < 1) throw new ApiError("Le seuil global doit être un entier positif.", "overallThreshold");
    s.overallThreshold = input.overallThreshold;
  }
  if (input.academicYearStartMonth !== undefined) {
    if (input.academicYearStartMonth < 1 || input.academicYearStartMonth > 12) throw new ApiError("Mois invalide.", "academicYearStartMonth");
    s.academicYearStartMonth = input.academicYearStartMonth;
  }
  if (input.filieres) s.filieres = dedupeList(input.filieres);
  if (input.niveaux) s.niveaux = dedupeList(input.niveaux);
  if (input.groupes) s.groupes = dedupeList(input.groupes);
  audit("settings_updated", "Paramètres mis à jour", actor, "settings");
  commit();
  return { ...s };
}

function dedupeList(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values.map((x) => x.trim()).filter(Boolean)) {
    const k = norm(v);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

export async function resetDemoData(): Promise<void> {
  requireRole("super-admin");
  await resetDb();
}

// ---------------------------------------------------------------------------------------------
// Subjects

export async function listSubjects(): Promise<Subject[]> {
  return [...getDb().subjects].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function createSubject(input: { name: string; code: string }): Promise<Subject> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!name) throw new ApiError("Le nom de la matière est requis.", "name");
  if (!code) throw new ApiError("Le code est requis.", "code");
  if (db.subjects.some((s) => norm(s.name) === norm(name))) throw new ApiError("Cette matière existe déjà.", "name");
  if (db.subjects.some((s) => s.code === code)) throw new ApiError("Ce code est déjà utilisé.", "code");
  const subject: Subject = { id: newId("sub"), name, code };
  db.subjects.push(subject);
  audit("subject_created", `Matière créée : ${name}`, actor, "subject");
  commit();
  return subject;
}

export async function updateSubject(id: string, input: { name: string; code: string }): Promise<Subject> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const subject = db.subjects.find((s) => s.id === id);
  if (!subject) throw new ApiError("Matière introuvable.");
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!name) throw new ApiError("Le nom de la matière est requis.", "name");
  if (db.subjects.some((s) => s.id !== id && norm(s.name) === norm(name))) throw new ApiError("Cette matière existe déjà.", "name");
  if (db.subjects.some((s) => s.id !== id && s.code === code)) throw new ApiError("Ce code est déjà utilisé.", "code");
  subject.name = name;
  subject.code = code;
  audit("subject_updated", `Matière mise à jour : ${name}`, actor, "subject");
  commit();
  return subject;
}

export async function deleteSubject(id: string): Promise<void> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  if (db.sessions.some((s) => s.subjectId === id)) throw new ApiError("Impossible de supprimer : des séances existent pour cette matière.");
  const subject = db.subjects.find((s) => s.id === id);
  db.teachers.forEach((t) => (t.subjectIds = t.subjectIds.filter((x) => x !== id)));
  db.subjects = db.subjects.filter((s) => s.id !== id);
  if (subject) audit("subject_deleted", `Matière supprimée : ${subject.name}`, actor, "subject");
  commit();
}

export async function listGroups(): Promise<{ filiere: string; niveau: string; groupe: string; count: number }[]> {
  const map = new Map<string, { filiere: string; niveau: string; groupe: string; count: number }>();
  for (const s of getDb().students) {
    const key = `${s.filiere}|${s.niveau}|${s.groupe}`;
    const e = map.get(key) ?? { filiere: s.filiere, niveau: s.niveau, groupe: s.groupe, count: 0 };
    e.count += 1;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => a.filiere.localeCompare(b.filiere, "fr") || a.niveau.localeCompare(b.niveau, "fr") || a.groupe.localeCompare(b.groupe, "fr"));
}

export async function listTeachersSimple(): Promise<Teacher[]> {
  return [...getDb().teachers].sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"));
}

export interface TeacherInput {
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  subjectIds: string[];
}

function validateTeacher(input: TeacherInput, excludeId?: string) {
  const db = getDb();
  if (!input.lastName.trim()) throw new ApiError("Le nom est requis.", "lastName");
  if (!input.firstName.trim()) throw new ApiError("Le prénom est requis.", "firstName");
  if (!EMAIL_RE.test(input.email.trim())) throw new ApiError("L'adresse email n'est pas valide.", "email");
  if (input.subjectIds.length === 0) throw new ApiError("Sélectionnez au moins une matière.", "subjectIds");
  if (db.teachers.some((t) => t.id !== excludeId && norm(t.email) === norm(input.email))) throw new ApiError("Cette adresse email est déjà utilisée.", "email");
}

export async function createTeacher(input: TeacherInput): Promise<Teacher> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  validateTeacher(input);
  const db = getDb();
  const teacher: Teacher = { id: newId("tch"), title: input.title, firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email.trim(), subjectIds: [...input.subjectIds], createdAt: nowIso() };
  db.teachers.push(teacher);
  audit("teacher_created", `Enseignant ajouté : ${fullName(teacher)}`, actor, "teacher");
  commit();
  return teacher;
}

export async function updateTeacher(id: string, input: TeacherInput): Promise<Teacher> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const teacher = db.teachers.find((t) => t.id === id);
  if (!teacher) throw new ApiError("Enseignant introuvable.");
  validateTeacher(input, id);
  Object.assign(teacher, { title: input.title, firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email.trim(), subjectIds: [...input.subjectIds] });
  audit("teacher_updated", `Enseignant mis à jour : ${fullName(teacher)}`, actor, "teacher");
  commit();
  return teacher;
}

export async function deleteTeacher(id: string): Promise<void> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const teacher = db.teachers.find((t) => t.id === id);
  if (!teacher) throw new ApiError("Enseignant introuvable.");
  if (db.sessions.some((s) => s.teacherId === id)) throw new ApiError("Cet enseignant a des séances enregistrées et ne peut pas être supprimé.");
  db.teachers = db.teachers.filter((t) => t.id !== id);
  audit("teacher_deleted", `Enseignant supprimé : ${fullName(teacher)}`, actor, "teacher");
  commit();
}

// ---------------------------------------------------------------------------------------------
// Students

export interface StudentFilters {
  query?: string;
  filiere?: string;
  niveau?: string;
  groupe?: string;
  page?: number;
  pageSize?: number;
}

function matchStudent(s: Student, q: string) {
  return !q || norm(`${s.firstName} ${s.lastName} ${s.lastName} ${s.firstName} ${s.registrationNumber} ${s.email}`).includes(q);
}

function filterStudents(f: StudentFilters): Student[] {
  const q = norm(f.query ?? "");
  return getDb()
    .students.filter((s) => (!f.filiere || s.filiere === f.filiere) && (!f.niveau || s.niveau === f.niveau) && (!f.groupe || s.groupe === f.groupe) && matchStudent(s, q))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"));
}

export async function listStudents(f: StudentFilters = {}): Promise<Paged<Student>> {
  await delay();
  return paginate(filterStudents(f), f.page, f.pageSize);
}

export async function listAllStudents(f: StudentFilters = {}): Promise<Student[]> {
  return filterStudents(f);
}

export async function searchStudents(query: string, limit = 8): Promise<Student[]> {
  const q = norm(query);
  if (!q) return [];
  return getDb().students.filter((s) => matchStudent(s, q)).slice(0, limit);
}

export async function getStudent(id: string): Promise<Student> {
  const s = getDb().students.find((x) => x.id === id);
  if (!s) throw new ApiError("Étudiant introuvable.");
  return s;
}

export interface StudentInput {
  firstName: string;
  lastName: string;
  registrationNumber: string;
  email: string;
  filiere: string;
  niveau: string;
  groupe: string;
}

function validateStudent(input: StudentInput, excludeId?: string) {
  const db = getDb();
  if (!input.lastName.trim()) throw new ApiError("Le nom est requis.", "lastName");
  if (!input.firstName.trim()) throw new ApiError("Le prénom est requis.", "firstName");
  if (!input.registrationNumber.trim()) throw new ApiError("Le numéro d'inscription est requis.", "registrationNumber");
  if (!/^\d{6,12}$/.test(input.registrationNumber.trim())) throw new ApiError("Le numéro d'inscription doit contenir entre 6 et 12 chiffres.", "registrationNumber");
  if (!EMAIL_RE.test(input.email.trim())) throw new ApiError("L'adresse email n'est pas valide.", "email");
  if (!input.filiere) throw new ApiError("Sélectionnez une filière.", "filiere");
  if (!input.niveau) throw new ApiError("Sélectionnez un niveau.", "niveau");
  if (!input.groupe) throw new ApiError("Sélectionnez un groupe.", "groupe");
  if (db.students.some((s) => s.id !== excludeId && s.registrationNumber === input.registrationNumber.trim())) throw new ApiError("Ce numéro d'inscription existe déjà.", "registrationNumber");
  if (db.students.some((s) => s.id !== excludeId && norm(s.email) === norm(input.email))) throw new ApiError("Cette adresse email est déjà utilisée.", "email");
}

export async function createStudent(input: StudentInput): Promise<Student> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  validateStudent(input);
  const db = getDb();
  const student: Student = { id: newId("stu"), firstName: input.firstName.trim(), lastName: input.lastName.trim(), registrationNumber: input.registrationNumber.trim(), email: input.email.trim(), filiere: input.filiere, niveau: input.niveau, groupe: input.groupe, createdAt: nowIso() };
  db.students.push(student);
  audit("student_created", `Étudiant ajouté : ${fullName(student)} (${student.registrationNumber})`, actor, "student");
  commit();
  return student;
}

export async function updateStudent(id: string, input: StudentInput): Promise<Student> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const student = db.students.find((s) => s.id === id);
  if (!student) throw new ApiError("Étudiant introuvable.");
  validateStudent(input, id);
  Object.assign(student, { firstName: input.firstName.trim(), lastName: input.lastName.trim(), registrationNumber: input.registrationNumber.trim(), email: input.email.trim(), filiere: input.filiere, niveau: input.niveau, groupe: input.groupe });
  audit("student_updated", `Fiche mise à jour : ${fullName(student)}`, actor, "student");
  commit();
  return student;
}

export async function deleteStudent(id: string): Promise<void> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const student = db.students.find((s) => s.id === id);
  if (!student) throw new ApiError("Étudiant introuvable.");
  db.absences = db.absences.filter((a) => a.studentId !== id);
  db.certificates = db.certificates.filter((c) => c.studentId !== id);
  db.students = db.students.filter((s) => s.id !== id);
  audit("student_deleted", `Étudiant supprimé : ${fullName(student)}`, actor, "student");
  commit();
}

export async function deleteStudents(ids: string[]): Promise<number> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const set = new Set(ids);
  const removed = db.students.filter((s) => set.has(s.id));
  if (removed.length === 0) return 0;
  db.absences = db.absences.filter((a) => !set.has(a.studentId));
  db.certificates = db.certificates.filter((c) => !set.has(c.studentId));
  db.students = db.students.filter((s) => !set.has(s.id));
  audit("student_deleted", `${removed.length} étudiant(s) supprimé(s)`, actor, "student");
  commit();
  return removed.length;
}

// ---------------------------------------------------------------------------------------------
// Absences

function toAbsenceRow(a: Absence): AbsenceRow | null {
  const db = getDb();
  const student = db.students.find((s) => s.id === a.studentId);
  const session = db.sessions.find((s) => s.id === a.sessionId);
  const subject = session && db.subjects.find((s) => s.id === session.subjectId);
  if (!student || !session || !subject) return null;
  return { absence: a, student, session, subject, teacher: db.teachers.find((t) => t.id === session.teacherId), certificate: a.certificateId ? db.certificates.find((c) => c.id === a.certificateId) : undefined };
}

const byDateDesc = (a: AbsenceRow, b: AbsenceRow) => (a.session.date === b.session.date ? b.session.startTime.localeCompare(a.session.startTime) : b.session.date.localeCompare(a.session.date));

export interface AbsenceFilters {
  query?: string;
  studentId?: string;
  teacherId?: string;
  subjectId?: string;
  status?: AbsenceStatus | "";
  filiere?: string;
  niveau?: string;
  groupe?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

function queryAbsences(f: AbsenceFilters): AbsenceRow[] {
  const q = norm(f.query ?? "");
  return getDb()
    .absences.map(toAbsenceRow)
    .filter((r): r is AbsenceRow => !!r)
    .filter((r) =>
      (!f.studentId || r.student.id === f.studentId) &&
      (!f.teacherId || r.session.teacherId === f.teacherId) &&
      (!f.subjectId || r.subject.id === f.subjectId) &&
      (!f.status || r.absence.status === f.status) &&
      (!f.filiere || r.student.filiere === f.filiere) &&
      (!f.niveau || r.student.niveau === f.niveau) &&
      (!f.groupe || r.student.groupe === f.groupe) &&
      (!f.from || r.session.date >= f.from) &&
      (!f.to || r.session.date <= f.to) &&
      (!q || norm(`${r.student.firstName} ${r.student.lastName} ${r.student.lastName} ${r.student.firstName} ${r.student.registrationNumber} ${r.subject.name}`).includes(q)))
    .sort(byDateDesc);
}

export async function listAbsences(f: AbsenceFilters = {}): Promise<Paged<AbsenceRow>> {
  await delay();
  return paginate(queryAbsences(f), f.page, f.pageSize);
}

export async function listAllAbsences(f: AbsenceFilters = {}): Promise<AbsenceRow[]> {
  return queryAbsences(f);
}

export async function getAbsence(id: string): Promise<AbsenceRow> {
  const a = getDb().absences.find((x) => x.id === id);
  const row = a && toAbsenceRow(a);
  if (!row) throw new ApiError("Absence introuvable.");
  return row;
}

export interface ManualAbsenceInput {
  studentId: string;
  subjectId: string;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
}

/** Records one absence, reusing or creating the matching session. */
function recordAbsence(input: ManualAbsenceInput, actorId: string): Absence {
  const db = getDb();
  const student = db.students.find((s) => s.id === input.studentId);
  if (!student) throw new ApiError("Étudiant introuvable.", "studentId");
  let session = db.sessions.find((s) => s.subjectId === input.subjectId && s.date === input.date && s.startTime === input.startTime && s.filiere === student.filiere && s.niveau === student.niveau && s.groupe === student.groupe);
  if (!session) {
    session = { id: newId("ses"), subjectId: input.subjectId, teacherId: input.teacherId, date: input.date, startTime: input.startTime, endTime: input.endTime, filiere: student.filiere, niveau: student.niveau, groupe: student.groupe, createdAt: nowIso() };
    db.sessions.push(session);
  }
  if (db.absences.some((a) => a.sessionId === session!.id && a.studentId === student.id)) throw new ApiError("Cette absence est déjà enregistrée.", "date");
  const absence: Absence = { id: newId("abs"), studentId: student.id, sessionId: session.id, status: "unjustified", createdAt: nowIso(), updatedAt: nowIso() };
  db.absences.push(absence);
  void actorId;
  return absence;
}

export async function createAbsence(input: ManualAbsenceInput): Promise<AbsenceRow> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  if (!db.students.find((s) => s.id === input.studentId)) throw new ApiError("Sélectionnez un étudiant.", "studentId");
  if (!input.subjectId) throw new ApiError("Sélectionnez une matière.", "subjectId");
  if (!input.teacherId) throw new ApiError("Sélectionnez un enseignant.", "teacherId");
  if (!input.date) throw new ApiError("La date est requise.", "date");
  if (input.date > todayIso()) throw new ApiError("La date ne peut pas être dans le futur.", "date");
  if (!input.startTime || !input.endTime || input.startTime >= input.endTime) throw new ApiError("Horaires invalides.", "startTime");
  const absence = recordAbsence(input, actor.id);
  const student = db.students.find((s) => s.id === absence.studentId)!;
  audit("absence_created", `Absence ajoutée pour ${fullName(student)}`, actor, "absence");
  commit();
  return toAbsenceRow(absence)!;
}

export async function setAbsenceStatus(id: string, status: AbsenceStatus, note?: string): Promise<AbsenceRow> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const absence = db.absences.find((a) => a.id === id);
  if (!absence) throw new ApiError("Absence introuvable.");
  if (absence.status === "pending" && status !== "pending") throw new ApiError("Un justificatif est en attente : traitez le certificat plutôt que de changer le statut à la main.");
  absence.status = status;
  absence.note = note?.trim() || undefined;
  absence.updatedAt = nowIso();
  const student = db.students.find((s) => s.id === absence.studentId);
  audit("absence_updated", `Absence de ${student ? fullName(student) : "?"} → « ${ABSENCE_STATUS_LABEL[status]} »`, actor, "absence");
  commit();
  return toAbsenceRow(absence)!;
}

function removeAbsenceInternal(absence: Absence) {
  const db = getDb();
  if (absence.certificateId) {
    const cert = db.certificates.find((c) => c.id === absence.certificateId);
    if (cert) {
      cert.absenceIds = cert.absenceIds.filter((x) => x !== absence.id);
      if (cert.absenceIds.length === 0) db.certificates = db.certificates.filter((c) => c.id !== cert.id);
    }
  }
  db.absences = db.absences.filter((a) => a.id !== absence.id);
}

export async function deleteAbsence(id: string): Promise<void> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const absence = db.absences.find((a) => a.id === id);
  if (!absence) throw new ApiError("Absence introuvable.");
  const student = db.students.find((s) => s.id === absence.studentId);
  removeAbsenceInternal(absence);
  audit("absence_deleted", `Absence de ${student ? fullName(student) : "?"} supprimée`, actor, "absence");
  commit();
}

/** Bulk operation on many absences at once. Returns how many were affected. */
export async function bulkAbsences(ids: string[], op: { kind: "status"; status: Exclude<AbsenceStatus, "pending">; note?: string } | { kind: "delete" }): Promise<number> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const set = new Set(ids);
  const targets = db.absences.filter((a) => set.has(a.id));
  let affected = 0;
  if (op.kind === "delete") {
    for (const a of [...targets]) {
      removeAbsenceInternal(a);
      affected += 1;
    }
    if (affected) audit("absences_bulk", `${affected} absence(s) supprimée(s) en lot`, actor, "absence");
  } else {
    for (const a of targets) {
      if (a.status === "pending") continue; // don't trample a certificate under review
      a.status = op.status;
      a.note = op.note?.trim() || undefined;
      a.updatedAt = nowIso();
      affected += 1;
    }
    if (affected) audit("absences_bulk", `${affected} absence(s) → « ${ABSENCE_STATUS_LABEL[op.status]} » en lot`, actor, "absence");
  }
  commit();
  return affected;
}

// ---------------------------------------------------------------------------------------------
// Certificates

function toCertificateRow(c: Certificate): CertificateRow | null {
  const db = getDb();
  const student = db.students.find((s) => s.id === c.studentId);
  if (!student) return null;
  return {
    certificate: c,
    student,
    absences: c.absenceIds.map((id) => db.absences.find((a) => a.id === id)).filter((a): a is Absence => !!a).map(toAbsenceRow).filter((r): r is AbsenceRow => !!r).sort(byDateDesc),
    uploadedBy: db.admins.find((u) => u.id === c.uploadedByUserId),
    reviewedBy: c.reviewedByUserId ? db.admins.find((u) => u.id === c.reviewedByUserId) : undefined,
  };
}

export interface CertificateFilters {
  status?: CertificateStatus | "";
  studentId?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}

export async function listCertificates(f: CertificateFilters = {}): Promise<Paged<CertificateRow>> {
  await delay();
  const q = norm(f.query ?? "");
  const rows = getDb()
    .certificates.map(toCertificateRow)
    .filter((r): r is CertificateRow => !!r)
    .filter((r) => (!f.status || r.certificate.status === f.status) && (!f.studentId || r.student.id === f.studentId))
    .filter((r) => !q || norm(`${r.student.firstName} ${r.student.lastName} ${r.student.lastName} ${r.student.firstName} ${r.student.registrationNumber} ${r.certificate.fileName}`).includes(q))
    .sort((a, b) => b.certificate.uploadedAt.localeCompare(a.certificate.uploadedAt));
  return paginate(rows, f.page, f.pageSize);
}

export async function getCertificate(id: string): Promise<CertificateRow> {
  const c = getDb().certificates.find((x) => x.id === id);
  const row = c && toCertificateRow(c);
  if (!row) throw new ApiError("Certificat introuvable.");
  return row;
}

export interface UploadCertificateInput {
  studentId: string;
  absenceIds: string[];
  file: { name: string; type: string; size: number; dataUrl?: string };
  startDate: string;
  endDate: string;
}

export async function uploadCertificate(input: UploadCertificateInput): Promise<CertificateRow> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const student = db.students.find((s) => s.id === input.studentId);
  if (!student) throw new ApiError("Sélectionnez un étudiant.", "studentId");
  if (!input.file?.name) throw new ApiError("Ajoutez le document justificatif.", "file");
  if (!input.startDate || !input.endDate) throw new ApiError("Indiquez la période couverte par le certificat.", "startDate");
  if (input.startDate > input.endDate) throw new ApiError("La date de fin doit être après la date de début.", "endDate");
  if (input.absenceIds.length === 0) throw new ApiError("Sélectionnez au moins une absence à justifier.", "absenceIds");
  const absences = input.absenceIds.map((id) => db.absences.find((a) => a.id === id));
  if (absences.some((a) => !a || a.studentId !== student.id)) throw new ApiError("Une des absences sélectionnées est invalide.", "absenceIds");
  const valid = absences as Absence[];
  if (valid.some((a) => a.status === "pending" || a.status === "justified")) throw new ApiError("Une des absences est déjà justifiée ou en cours de traitement.", "absenceIds");
  const outside = valid.map((a) => db.sessions.find((s) => s.id === a.sessionId)!).find((s) => s.date < input.startDate || s.date > input.endDate);
  if (outside) throw new ApiError(`La séance du ${outside.date} n'est pas couverte par la période du certificat.`, "startDate");

  const certificate: Certificate = { id: newId("cert"), studentId: student.id, absenceIds: valid.map((a) => a.id), fileName: input.file.name, fileType: input.file.type, fileSize: input.file.size, dataUrl: input.file.dataUrl, startDate: input.startDate, endDate: input.endDate, status: "pending", uploadedByUserId: actor.id, uploadedAt: nowIso() };
  db.certificates.push(certificate);
  for (const a of valid) {
    a.status = "pending";
    a.certificateId = certificate.id;
    a.note = undefined;
    a.updatedAt = nowIso();
  }
  audit("certificate_uploaded", `Justificatif enregistré pour ${fullName(student)}`, actor, "certificate");
  commit();
  return toCertificateRow(certificate)!;
}

export async function reviewCertificate(id: string, decision: "accepted" | "rejected", note?: string): Promise<CertificateRow> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const certificate = db.certificates.find((c) => c.id === id);
  if (!certificate) throw new ApiError("Certificat introuvable.");
  if (certificate.status !== "pending") throw new ApiError("Ce certificat a déjà été traité.");
  if (decision === "rejected" && !note?.trim()) throw new ApiError("Indiquez le motif du refus.", "note");
  certificate.status = decision;
  certificate.reviewedByUserId = actor.id;
  certificate.reviewedAt = nowIso();
  certificate.reviewNote = note?.trim() || undefined;
  for (const absenceId of certificate.absenceIds) {
    const a = db.absences.find((x) => x.id === absenceId);
    if (!a) continue;
    a.status = decision === "accepted" ? "justified" : "rejected";
    a.note = decision === "rejected" ? certificate.reviewNote : undefined;
    a.updatedAt = nowIso();
  }
  const student = db.students.find((s) => s.id === certificate.studentId);
  audit("certificate_reviewed", `Certificat ${decision === "accepted" ? "validé" : "refusé"} pour ${student ? fullName(student) : "?"}`, actor, "certificate");
  commit();
  return toCertificateRow(certificate)!;
}

export async function deleteCertificate(id: string): Promise<void> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  const certificate = db.certificates.find((c) => c.id === id);
  if (!certificate) throw new ApiError("Certificat introuvable.");
  for (const absenceId of certificate.absenceIds) {
    const a = db.absences.find((x) => x.id === absenceId);
    if (!a) continue;
    a.status = "unjustified";
    a.certificateId = undefined;
    a.note = undefined;
    a.updatedAt = nowIso();
  }
  db.certificates = db.certificates.filter((c) => c.id !== id);
  audit("certificate_deleted", "Justificatif supprimé", actor, "certificate");
  commit();
}

// ---------------------------------------------------------------------------------------------
// Dashboards, stats, at-risk engine

export const MONTH_LABELS = ["Sep", "Oct", "Nov", "Déc", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août"];

function monthIndex(date: string, startMonth: number): number {
  const m = Number(date.split("-")[1]);
  return (m - startMonth + 12) % 12;
}

export async function listAcademicYears(): Promise<number[]> {
  const start = getDb().settings.academicYearStartMonth;
  const years = new Set<number>([academicYearOf(todayIso(), start)]);
  getDb().sessions.forEach((s) => years.add(academicYearOf(s.date, start)));
  return [...years].sort((a, b) => b - a);
}

const isUnjustified = (s: AbsenceStatus) => s === "unjustified" || s === "rejected";

function computeRisk(rows: AbsenceRow[]): RiskRow[] {
  const { subjectThreshold, overallThreshold } = getDb().settings;
  const byStudent = new Map<string, { student: Student; total: number; subjects: Map<string, { subject: Subject; count: number }> }>();
  for (const r of rows) {
    if (!isUnjustified(r.absence.status)) continue;
    const e = byStudent.get(r.student.id) ?? { student: r.student, total: 0, subjects: new Map() };
    e.total += 1;
    const se = e.subjects.get(r.subject.id) ?? { subject: r.subject, count: 0 };
    se.count += 1;
    e.subjects.set(r.subject.id, se);
    byStudent.set(r.student.id, e);
  }
  const risks: RiskRow[] = [];
  for (const e of byStudent.values()) {
    const subjects = [...e.subjects.values()].map((s) => ({ subject: s.subject, unjustified: s.count, flag: s.count >= subjectThreshold })).sort((a, b) => b.unjustified - a.unjustified);
    const overallFlag = e.total >= overallThreshold;
    const anySubjectFlag = subjects.some((s) => s.flag);
    if (!overallFlag && !anySubjectFlag) continue;
    risks.push({ student: e.student, totalUnjustified: e.total, overallFlag, subjects, topSubject: subjects[0] ? { subject: subjects[0].subject, unjustified: subjects[0].unjustified } : undefined });
  }
  return risks.sort((a, b) => b.totalUnjustified - a.totalUnjustified);
}

export interface AdminStats {
  studentCount: number;
  teacherCount: number;
  subjectCount: number;
  pendingCertificates: number;
  absencesThisMonth: number;
  unjustifiedRate: number;
  atRiskCount: number;
  absencesByMonth: number[];
  statusBreakdown: Record<AbsenceStatus, number>;
  recentAbsences: AbsenceRow[];
  recentActivity: AuditEntry[];
  topRisk: RiskRow[];
}

export async function adminStats(academicYear: number): Promise<AdminStats> {
  await delay();
  const db = getDb();
  const start = db.settings.academicYearStartMonth;
  const rows = queryAbsences({});
  const inYear = rows.filter((r) => academicYearOf(r.session.date, start) === academicYear);
  const absencesByMonth = Array(12).fill(0) as number[];
  inYear.forEach((r) => (absencesByMonth[monthIndex(r.session.date, start)] += 1));
  const month = todayIso().slice(0, 7);
  const statusBreakdown = { unjustified: 0, pending: 0, justified: 0, rejected: 0 } as Record<AbsenceStatus, number>;
  inYear.forEach((r) => (statusBreakdown[r.absence.status] += 1));
  const unjustified = inYear.filter((r) => isUnjustified(r.absence.status)).length;
  const risk = computeRisk(inYear);
  return {
    studentCount: db.students.length,
    teacherCount: db.teachers.length,
    subjectCount: db.subjects.length,
    pendingCertificates: db.certificates.filter((c) => c.status === "pending").length,
    absencesThisMonth: rows.filter((r) => r.session.date.startsWith(month)).length,
    unjustifiedRate: inYear.length ? Math.round((unjustified / inYear.length) * 100) : 0,
    atRiskCount: risk.length,
    absencesByMonth,
    statusBreakdown,
    recentAbsences: rows.slice(0, 6),
    recentActivity: [...db.audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8),
    topRisk: risk.slice(0, 5),
  };
}

export interface RiskFilters {
  academicYear: number;
  query?: string;
  filiere?: string;
  niveau?: string;
  groupe?: string;
}

export async function listAtRisk(f: RiskFilters): Promise<RiskRow[]> {
  await delay();
  const start = getDb().settings.academicYearStartMonth;
  const q = norm(f.query ?? "");
  const rows = queryAbsences({}).filter((r) =>
    academicYearOf(r.session.date, start) === f.academicYear &&
    (!f.filiere || r.student.filiere === f.filiere) &&
    (!f.niveau || r.student.niveau === f.niveau) &&
    (!f.groupe || r.student.groupe === f.groupe));
  return computeRisk(rows).filter((rk) => !q || norm(`${rk.student.firstName} ${rk.student.lastName} ${rk.student.registrationNumber}`).includes(q));
}

/** Everything needed to render/print a warning notice for one student. */
export interface WarningNotice {
  student: Student;
  academicYear: number;
  generatedAt: string;
  institutionName: string;
  subjectThreshold: number;
  overallThreshold: number;
  totalUnjustified: number;
  lines: { subject: string; unjustified: number; flagged: boolean }[];
}

export async function buildWarningNotice(studentId: string, academicYear: number): Promise<WarningNotice> {
  const db = getDb();
  const start = db.settings.academicYearStartMonth;
  const student = db.students.find((s) => s.id === studentId);
  if (!student) throw new ApiError("Étudiant introuvable.");
  const rows = queryAbsences({ studentId }).filter((r) => academicYearOf(r.session.date, start) === academicYear && isUnjustified(r.absence.status));
  const bySubject = new Map<string, { subject: string; unjustified: number }>();
  for (const r of rows) {
    const e = bySubject.get(r.subject.id) ?? { subject: r.subject.name, unjustified: 0 };
    e.unjustified += 1;
    bySubject.set(r.subject.id, e);
  }
  return {
    student,
    academicYear,
    generatedAt: nowIso(),
    institutionName: db.settings.institutionName,
    subjectThreshold: db.settings.subjectThreshold,
    overallThreshold: db.settings.overallThreshold,
    totalUnjustified: rows.length,
    lines: [...bySubject.values()].map((e) => ({ ...e, flagged: e.unjustified >= db.settings.subjectThreshold })).sort((a, b) => b.unjustified - a.unjustified),
  };
}

export async function logNoticeGenerated(studentIds: string[]): Promise<void> {
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  if (studentIds.length === 1) {
    const s = db.students.find((x) => x.id === studentIds[0]);
    audit("notice_generated", `Mise en garde générée pour ${s ? fullName(s) : "?"}`, actor, "student");
  } else {
    audit("notice_generated", `${studentIds.length} mises en garde générées`, actor, "student");
  }
  commit();
}

// ---------------------------------------------------------------------------------------------
// Reports

export interface ReportFilters {
  academicYear: number;
  filiere?: string;
  niveau?: string;
  groupe?: string;
  subjectId?: string;
  from?: string;
  to?: string;
}

export interface ReportResult {
  total: number;
  statusBreakdown: Record<AbsenceStatus, number>;
  byMonth: { label: string; count: number }[];
  bySubject: { subject: string; total: number; unjustified: number }[];
  byGroup: { label: string; total: number; unjustified: number }[];
  topStudents: { student: Student; total: number; unjustified: number }[];
}

export async function runReport(f: ReportFilters): Promise<ReportResult> {
  await delay();
  const db = getDb();
  const start = db.settings.academicYearStartMonth;
  const rows = queryAbsences({ filiere: f.filiere, niveau: f.niveau, groupe: f.groupe, subjectId: f.subjectId, from: f.from, to: f.to }).filter((r) => academicYearOf(r.session.date, start) === f.academicYear);
  const statusBreakdown = { unjustified: 0, pending: 0, justified: 0, rejected: 0 } as Record<AbsenceStatus, number>;
  rows.forEach((r) => (statusBreakdown[r.absence.status] += 1));
  const months = Array(12).fill(0) as number[];
  rows.forEach((r) => (months[monthIndex(r.session.date, start)] += 1));
  const subMap = new Map<string, { subject: string; total: number; unjustified: number }>();
  const grpMap = new Map<string, { label: string; total: number; unjustified: number }>();
  const stuMap = new Map<string, { student: Student; total: number; unjustified: number }>();
  for (const r of rows) {
    const s = subMap.get(r.subject.id) ?? { subject: r.subject.name, total: 0, unjustified: 0 };
    s.total += 1;
    if (isUnjustified(r.absence.status)) s.unjustified += 1;
    subMap.set(r.subject.id, s);
    const gk = `${r.student.filiere}|${r.student.niveau}|${r.student.groupe}`;
    const g = grpMap.get(gk) ?? { label: `${shortFiliereLabel(r.student.filiere)} · ${r.student.niveau} · ${r.student.groupe}`, total: 0, unjustified: 0 };
    g.total += 1;
    if (isUnjustified(r.absence.status)) g.unjustified += 1;
    grpMap.set(gk, g);
    const st = stuMap.get(r.student.id) ?? { student: r.student, total: 0, unjustified: 0 };
    st.total += 1;
    if (isUnjustified(r.absence.status)) st.unjustified += 1;
    stuMap.set(r.student.id, st);
  }
  return {
    total: rows.length,
    statusBreakdown,
    byMonth: months.map((count, i) => ({ label: MONTH_LABELS[i], count })),
    bySubject: [...subMap.values()].sort((a, b) => b.total - a.total),
    byGroup: [...grpMap.values()].sort((a, b) => b.total - a.total),
    topStudents: [...stuMap.values()].sort((a, b) => b.unjustified - a.unjustified || b.total - a.total).slice(0, 15),
  };
}

function shortFiliereLabel(filiere: string): string {
  const parts = filiere.split(" - ");
  return parts.length > 1 ? parts[parts.length - 1] : filiere;
}

// ---------------------------------------------------------------------------------------------
// Audit log

export interface AuditFilters {
  query?: string;
  action?: AuditAction | "";
  actorUserId?: string;
  page?: number;
  pageSize?: number;
}

export async function listAudit(f: AuditFilters = {}): Promise<Paged<AuditEntry>> {
  await delay();
  const q = norm(f.query ?? "");
  const rows = [...getDb().audit]
    .filter((e) => (!f.action || e.action === f.action) && (!f.actorUserId || e.actorUserId === f.actorUserId))
    .filter((e) => !q || norm(`${e.summary} ${e.actorName}`).includes(q))
    .sort((a, b) => b.at.localeCompare(a.at));
  return paginate(rows, f.page, f.pageSize);
}

// ---------------------------------------------------------------------------------------------
// CSV import — parse & validate in one call, commit in another (preview-then-confirm)

export interface ImportRow<T> {
  line: number;
  raw: Record<string, string>;
  data?: T;
  error?: string;
  duplicate?: boolean;
}

export interface ImportPreview<T> {
  rows: ImportRow<T>[];
  validCount: number;
  errorCount: number;
}

export async function previewStudentImport(records: Record<string, string>[]): Promise<ImportPreview<StudentInput>> {
  requireRole("super-admin", "staff");
  const db = getDb();
  const settings = db.settings;
  const seenReg = new Set<string>();
  const seenEmail = new Set<string>();
  const rows: ImportRow<StudentInput>[] = records.map((raw, i) => {
    const line = i + 2; // header is line 1
    const data: StudentInput = {
      lastName: (raw.nom ?? raw.lastName ?? "").trim(),
      firstName: (raw.prenom ?? raw.prénom ?? raw.firstName ?? "").trim(),
      registrationNumber: (raw.matricule ?? raw.inscription ?? raw.registrationNumber ?? "").trim(),
      email: (raw.email ?? "").trim(),
      filiere: (raw.filiere ?? raw.filière ?? "").trim(),
      niveau: (raw.niveau ?? "").trim(),
      groupe: (raw.groupe ?? "").trim(),
    };
    try {
      if (!data.lastName) throw new ApiError("Nom manquant.");
      if (!data.firstName) throw new ApiError("Prénom manquant.");
      if (!/^\d{6,12}$/.test(data.registrationNumber)) throw new ApiError("Numéro d'inscription invalide (6 à 12 chiffres).");
      if (!EMAIL_RE.test(data.email)) throw new ApiError("Email invalide.");
      if (!settings.filieres.includes(data.filiere)) throw new ApiError("Filière inconnue (doit correspondre à une filière existante).");
      if (!settings.niveaux.includes(data.niveau)) throw new ApiError("Niveau inconnu.");
      if (!settings.groupes.includes(data.groupe)) throw new ApiError("Groupe inconnu.");
      let duplicate = false;
      if (db.students.some((s) => s.registrationNumber === data.registrationNumber) || seenReg.has(data.registrationNumber)) duplicate = true;
      if (db.students.some((s) => norm(s.email) === norm(data.email)) || seenEmail.has(norm(data.email))) duplicate = true;
      seenReg.add(data.registrationNumber);
      seenEmail.add(norm(data.email));
      if (duplicate) return { line, raw, data, duplicate: true, error: "Déjà existant (sera ignoré)." };
      return { line, raw, data };
    } catch (e) {
      return { line, raw, error: e instanceof Error ? e.message : "Ligne invalide." };
    }
  });
  return { rows, validCount: rows.filter((r) => r.data && !r.duplicate).length, errorCount: rows.filter((r) => r.error && !r.duplicate).length };
}

export async function commitStudentImport(rows: ImportRow<StudentInput>[]): Promise<number> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  const db = getDb();
  let count = 0;
  for (const r of rows) {
    if (!r.data || r.duplicate || r.error) continue;
    db.students.push({ id: newId("stu"), firstName: r.data.firstName, lastName: r.data.lastName, registrationNumber: r.data.registrationNumber, email: r.data.email, filiere: r.data.filiere, niveau: r.data.niveau, groupe: r.data.groupe, createdAt: nowIso() });
    count += 1;
  }
  if (count) audit("students_imported", `${count} étudiant(s) importé(s) depuis un fichier`, actor, "student");
  commit();
  return count;
}

export interface AbsenceImportData {
  studentId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export async function previewAbsenceImport(records: Record<string, string>[]): Promise<ImportPreview<AbsenceImportData>> {
  requireRole("super-admin", "staff");
  const db = getDb();
  const rows: ImportRow<AbsenceImportData>[] = records.map((raw, i) => {
    const line = i + 2;
    const reg = (raw.matricule ?? raw.inscription ?? raw.registrationNumber ?? "").trim();
    const code = (raw.matiere ?? raw.matière ?? raw.code ?? raw.subject ?? "").trim();
    const date = (raw.date ?? "").trim();
    const start = (raw.debut ?? raw.début ?? raw.start ?? "08:30").trim();
    const end = (raw.fin ?? raw.end ?? "10:00").trim();
    try {
      const student = db.students.find((s) => s.registrationNumber === reg);
      if (!student) throw new ApiError(`Aucun étudiant avec le matricule ${reg || "(vide)"}.`);
      const subject = db.subjects.find((s) => s.code.toUpperCase() === code.toUpperCase() || norm(s.name) === norm(code));
      if (!subject) throw new ApiError(`Matière inconnue : ${code || "(vide)"}.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError("Date invalide (format AAAA-MM-JJ).");
      if (date > todayIso()) throw new ApiError("Date dans le futur.");
      if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end) throw new ApiError("Horaires invalides.");
      const teacher = db.teachers.find((t) => t.subjectIds.includes(subject.id)) ?? db.teachers[0];
      const data: AbsenceImportData = { studentId: student.id, studentName: fullName(student), subjectId: subject.id, subjectName: subject.name, teacherId: teacher?.id ?? "", date, startTime: start, endTime: end };
      // existing-absence duplicate check
      const session = db.sessions.find((s) => s.subjectId === subject.id && s.date === date && s.startTime === start && s.filiere === student.filiere && s.niveau === student.niveau && s.groupe === student.groupe);
      if (session && db.absences.some((a) => a.sessionId === session.id && a.studentId === student.id)) return { line, raw, data, duplicate: true, error: "Absence déjà enregistrée (sera ignorée)." };
      return { line, raw, data };
    } catch (e) {
      return { line, raw, error: e instanceof Error ? e.message : "Ligne invalide." };
    }
  });
  return { rows, validCount: rows.filter((r) => r.data && !r.duplicate).length, errorCount: rows.filter((r) => r.error && !r.duplicate).length };
}

export async function commitAbsenceImport(rows: ImportRow<AbsenceImportData>[]): Promise<number> {
  await delay();
  const actor = requireRole("super-admin", "staff");
  let count = 0;
  for (const r of rows) {
    if (!r.data || r.duplicate || r.error) continue;
    try {
      recordAbsence({ studentId: r.data.studentId, subjectId: r.data.subjectId, teacherId: r.data.teacherId, date: r.data.date, startTime: r.data.startTime, endTime: r.data.endTime }, actor.id);
      count += 1;
    } catch {
      // skip rows that collide at commit time
    }
  }
  if (count) audit("absences_imported", `${count} absence(s) importée(s) depuis un fichier`, actor, "absence");
  commit();
  return count;
}
