// Application API. Every function is async and returns plain data, so the UI never knows whether
// it is talking to localStorage (this implementation) or to an HTTP backend (a future one).

import type {
  Absence,
  AbsenceRow,
  AbsenceStatus,
  Activity,
  ActivityKind,
  AuthSession,
  Certificate,
  CertificateStatus,
  Paged,
  Role,
  Session,
  SessionRow,
  Student,
  Subject,
  Teacher,
  User,
  UserStatus,
} from "../types";
import { ABSENCE_STATUS_LABEL, UNJUSTIFIED_WARNING_THRESHOLD } from "../types";
import { academicYearOf } from "../data/seed";
import { commit, getDb, initDb, readSessionUserId, resetDb, writeSessionUserId } from "./db";
import { generateTemporaryPassword, hashPassword, newId, verifyPassword } from "./crypto";

export class ApiError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

const LATENCY_MS = 90;
const delay = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));
const nowIso = () => new Date().toISOString();
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function paginate<T>(items: T[], page = 1, pageSize = 10): Paged<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  return { items: items.slice((safePage - 1) * pageSize, safePage * pageSize), total, page: safePage, pageSize, pageCount };
}

function log(kind: ActivityKind, message: string, actorUserId: string, subjectUserIds: string[] = []) {
  const db = getDb();
  db.activities.push({ id: newId("act"), kind, message, actorUserId, subjectUserIds, at: nowIso() });
  if (db.activities.length > 300) db.activities.splice(0, db.activities.length - 300);
}

function fullName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`;
}

function currentUser(): User {
  const id = readSessionUserId();
  const user = id ? getDb().users.find((u) => u.id === id) : undefined;
  if (!user) throw new ApiError("Session expirée. Veuillez vous reconnecter.");
  return user;
}

function requireRole(...roles: Role[]): User {
  const user = currentUser();
  if (!roles.includes(user.role)) throw new ApiError("Vous n'avez pas les droits pour cette action.");
  return user;
}

function buildAuthSession(user: User): AuthSession {
  const db = getDb();
  return {
    user,
    student: user.role === "student" ? db.students.find((s) => s.userId === user.id) : undefined,
    teacher: user.role === "teacher" ? db.teachers.find((t) => t.userId === user.id) : undefined,
  };
}

function toAbsenceRow(a: Absence): AbsenceRow | null {
  const db = getDb();
  const student = db.students.find((s) => s.id === a.studentId);
  const session = db.sessions.find((s) => s.id === a.sessionId);
  const subject = session && db.subjects.find((s) => s.id === session.subjectId);
  if (!student || !session || !subject) return null;
  return {
    absence: a,
    student,
    session,
    subject,
    teacher: db.teachers.find((t) => t.id === session.teacherId),
    certificate: a.certificateId ? db.certificates.find((c) => c.id === a.certificateId) : undefined,
  };
}

function toSessionRow(s: Session): SessionRow | null {
  const db = getDb();
  const subject = db.subjects.find((x) => x.id === s.subjectId);
  if (!subject) return null;
  return {
    session: s,
    subject,
    teacher: db.teachers.find((t) => t.id === s.teacherId),
    absentCount: db.absences.filter((a) => a.sessionId === s.id).length,
    studentCount: db.students.filter((st) => st.filiere === s.filiere && st.niveau === s.niveau && st.groupe === s.groupe).length,
  };
}

const byDateDesc = (a: AbsenceRow, b: AbsenceRow) => (a.session.date === b.session.date ? b.session.startTime.localeCompare(a.session.startTime) : b.session.date.localeCompare(a.session.date));

// ---------------------------------------------------------------------------------------------
// Bootstrap & auth

export async function bootstrap(): Promise<AuthSession | null> {
  await initDb();
  const id = readSessionUserId();
  const user = id ? getDb().users.find((u) => u.id === id && u.status === "active") : undefined;
  if (!user) {
    writeSessionUserId(null);
    return null;
  }
  return buildAuthSession(user);
}

export async function login(email: string, password: string): Promise<AuthSession> {
  await delay();
  const user = getDb().users.find((u) => norm(u.email) === norm(email));
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new ApiError("Email ou mot de passe incorrect.");
  if (user.status === "disabled") throw new ApiError("Ce compte est désactivé. Contactez l'administration.");
  writeSessionUserId(user.id);
  return buildAuthSession(user);
}

export async function logout(): Promise<void> {
  writeSessionUserId(null);
}

export async function changePassword(currentPassword: string, nextPassword: string): Promise<AuthSession> {
  await delay();
  const user = currentUser();
  if (!user.mustChangePassword && !(await verifyPassword(currentPassword, user.passwordHash))) throw new ApiError("Le mot de passe actuel est incorrect.", "current");
  validatePassword(nextPassword);
  if (await verifyPassword(nextPassword, user.passwordHash)) throw new ApiError("Le nouveau mot de passe doit être différent de l'ancien.", "next");
  user.passwordHash = await hashPassword(nextPassword);
  user.mustChangePassword = false;
  log("password_changed", `${fullName(user)} a modifié son mot de passe`, user.id, [user.id]);
  commit();
  return buildAuthSession(user);
}

export async function resetDemoData(): Promise<void> {
  requireRole("admin");
  await resetDb();
}

function validatePassword(password: string) {
  if (password.length < 8) throw new ApiError("Le mot de passe doit contenir au moins 8 caractères.", "next");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new ApiError("Le mot de passe doit contenir des lettres et au moins un chiffre.", "next");
}

// ---------------------------------------------------------------------------------------------
// Reference data

export async function listSubjects(): Promise<Subject[]> {
  return [...getDb().subjects].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function createSubject(input: { name: string; code: string }): Promise<Subject> {
  await delay();
  const admin = requireRole("admin");
  const db = getDb();
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!name) throw new ApiError("Le nom de la matière est requis.", "name");
  if (!code) throw new ApiError("Le code est requis.", "code");
  if (db.subjects.some((s) => norm(s.name) === norm(name))) throw new ApiError("Cette matière existe déjà.", "name");
  if (db.subjects.some((s) => s.code === code)) throw new ApiError("Ce code est déjà utilisé.", "code");
  const subject: Subject = { id: newId("sub"), name, code };
  db.subjects.push(subject);
  log("subject_created", `Matière ${name} créée`, admin.id);
  commit();
  return subject;
}

export async function updateSubject(id: string, input: { name: string; code: string }): Promise<Subject> {
  await delay();
  requireRole("admin");
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
  commit();
  return subject;
}

export async function deleteSubject(id: string): Promise<void> {
  await delay();
  requireRole("admin");
  const db = getDb();
  if (db.sessions.some((s) => s.subjectId === id)) throw new ApiError("Impossible de supprimer : des séances sont enregistrées pour cette matière.");
  db.teachers.forEach((t) => (t.subjectIds = t.subjectIds.filter((x) => x !== id)));
  db.subjects = db.subjects.filter((s) => s.id !== id);
  commit();
}

/** Distinct (filière, niveau, groupe) combinations that currently have students. */
export async function listGroups(): Promise<{ filiere: string; niveau: string; groupe: string; count: number }[]> {
  const map = new Map<string, { filiere: string; niveau: string; groupe: string; count: number }>();
  for (const s of getDb().students) {
    const key = `${s.filiere}|${s.niveau}|${s.groupe}`;
    const entry = map.get(key) ?? { filiere: s.filiere, niveau: s.niveau, groupe: s.groupe, count: 0 };
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => a.filiere.localeCompare(b.filiere, "fr") || a.niveau.localeCompare(b.niveau, "fr") || a.groupe.localeCompare(b.groupe, "fr"));
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

export async function listStudents(filters: StudentFilters = {}): Promise<Paged<Student>> {
  await delay();
  const q = norm(filters.query ?? "");
  const items = getDb()
    .students.filter((s) => (!filters.filiere || s.filiere === filters.filiere) && (!filters.niveau || s.niveau === filters.niveau) && (!filters.groupe || s.groupe === filters.groupe))
    .filter((s) => !q || norm(`${s.firstName} ${s.lastName} ${s.lastName} ${s.firstName} ${s.registrationNumber} ${s.email}`).includes(q))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"));
  return paginate(items, filters.page, filters.pageSize);
}

export async function searchStudents(query: string, limit = 8): Promise<Student[]> {
  const q = norm(query);
  if (!q) return [];
  return getDb()
    .students.filter((s) => norm(`${s.firstName} ${s.lastName} ${s.lastName} ${s.firstName} ${s.registrationNumber}`).includes(q))
    .slice(0, limit);
}

export async function getStudent(id: string): Promise<Student> {
  const student = getDb().students.find((s) => s.id === id);
  if (!student) throw new ApiError("Étudiant introuvable.");
  return student;
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

function validateStudentInput(input: StudentInput, excludeId?: string) {
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
  const current = excludeId ? db.students.find((s) => s.id === excludeId) : undefined;
  if (db.users.some((u) => u.id !== current?.userId && norm(u.email) === norm(input.email))) throw new ApiError("Cette adresse email est déjà utilisée.", "email");
}

export async function createStudent(input: StudentInput): Promise<{ student: Student; temporaryPassword: string }> {
  await delay();
  const admin = requireRole("admin");
  validateStudentInput(input);
  const db = getDb();
  const temporaryPassword = generateTemporaryPassword();
  const user: User = { id: newId("usr"), email: input.email.trim(), passwordHash: await hashPassword(temporaryPassword), role: "student", firstName: input.firstName.trim(), lastName: input.lastName.trim(), status: "active", mustChangePassword: true, createdAt: nowIso() };
  const student: Student = { id: newId("stu"), userId: user.id, firstName: user.firstName, lastName: user.lastName, registrationNumber: input.registrationNumber.trim(), email: user.email, filiere: input.filiere, niveau: input.niveau, groupe: input.groupe, createdAt: user.createdAt };
  db.users.push(user);
  db.students.push(student);
  log("student_created", `Nouvel étudiant : ${fullName(student)}`, admin.id, [user.id]);
  commit();
  return { student, temporaryPassword };
}

export async function updateStudent(id: string, input: StudentInput): Promise<Student> {
  await delay();
  const admin = requireRole("admin");
  const db = getDb();
  const student = db.students.find((s) => s.id === id);
  if (!student) throw new ApiError("Étudiant introuvable.");
  validateStudentInput(input, id);
  Object.assign(student, { firstName: input.firstName.trim(), lastName: input.lastName.trim(), registrationNumber: input.registrationNumber.trim(), email: input.email.trim(), filiere: input.filiere, niveau: input.niveau, groupe: input.groupe });
  const user = db.users.find((u) => u.id === student.userId);
  if (user) Object.assign(user, { firstName: student.firstName, lastName: student.lastName, email: student.email });
  log("student_updated", `Fiche de ${fullName(student)} mise à jour`, admin.id, [student.userId]);
  commit();
  return student;
}

export async function deleteStudent(id: string): Promise<void> {
  await delay();
  const admin = requireRole("admin");
  const db = getDb();
  const student = db.students.find((s) => s.id === id);
  if (!student) throw new ApiError("Étudiant introuvable.");
  db.absences = db.absences.filter((a) => a.studentId !== id);
  db.certificates = db.certificates.filter((c) => c.studentId !== id);
  db.users = db.users.filter((u) => u.id !== student.userId);
  db.students = db.students.filter((s) => s.id !== id);
  log("student_deleted", `Étudiant ${fullName(student)} supprimé`, admin.id);
  commit();
}

export async function resetStudentPassword(id: string): Promise<string> {
  await delay();
  requireRole("admin");
  const db = getDb();
  const student = db.students.find((s) => s.id === id);
  const user = student && db.users.find((u) => u.id === student.userId);
  if (!user) throw new ApiError("Étudiant introuvable.");
  const temporaryPassword = generateTemporaryPassword();
  user.passwordHash = await hashPassword(temporaryPassword);
  user.mustChangePassword = true;
  commit();
  return temporaryPassword;
}

// ---------------------------------------------------------------------------------------------
// Teachers

export interface TeacherRow {
  teacher: Teacher;
  user: User;
  subjects: Subject[];
}

export interface TeacherFilters {
  query?: string;
  status?: UserStatus | "";
  page?: number;
  pageSize?: number;
}

function toTeacherRow(t: Teacher): TeacherRow | null {
  const db = getDb();
  const user = db.users.find((u) => u.id === t.userId);
  if (!user) return null;
  return { teacher: t, user, subjects: db.subjects.filter((s) => t.subjectIds.includes(s.id)) };
}

export async function listTeachers(filters: TeacherFilters = {}): Promise<Paged<TeacherRow>> {
  await delay();
  const q = norm(filters.query ?? "");
  const rows = getDb()
    .teachers.map(toTeacherRow)
    .filter((r): r is TeacherRow => !!r)
    .filter((r) => !filters.status || r.user.status === filters.status)
    .filter((r) => !q || norm(`${r.teacher.firstName} ${r.teacher.lastName} ${r.teacher.email} ${r.subjects.map((s) => s.name).join(" ")}`).includes(q))
    .sort((a, b) => a.teacher.lastName.localeCompare(b.teacher.lastName, "fr"));
  return paginate(rows, filters.page, filters.pageSize);
}

export async function getTeacher(id: string): Promise<TeacherRow> {
  const t = getDb().teachers.find((x) => x.id === id);
  const row = t && toTeacherRow(t);
  if (!row) throw new ApiError("Enseignant introuvable.");
  return row;
}

export interface TeacherInput {
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  subjectIds: string[];
}

function validateTeacherInput(input: TeacherInput, excludeId?: string) {
  const db = getDb();
  if (!input.lastName.trim()) throw new ApiError("Le nom est requis.", "lastName");
  if (!input.firstName.trim()) throw new ApiError("Le prénom est requis.", "firstName");
  if (!EMAIL_RE.test(input.email.trim())) throw new ApiError("L'adresse email n'est pas valide.", "email");
  if (input.subjectIds.length === 0) throw new ApiError("Sélectionnez au moins une matière.", "subjectIds");
  const current = excludeId ? db.teachers.find((t) => t.id === excludeId) : undefined;
  if (db.users.some((u) => u.id !== current?.userId && norm(u.email) === norm(input.email))) throw new ApiError("Cette adresse email est déjà utilisée.", "email");
}

export async function createTeacher(input: TeacherInput, temporaryPassword: string): Promise<TeacherRow> {
  await delay();
  const admin = requireRole("admin");
  validateTeacherInput(input);
  validatePassword(temporaryPassword);
  const db = getDb();
  const user: User = { id: newId("usr"), email: input.email.trim(), passwordHash: await hashPassword(temporaryPassword), role: "teacher", firstName: input.firstName.trim(), lastName: input.lastName.trim(), status: "active", mustChangePassword: true, createdAt: nowIso() };
  const teacher: Teacher = { id: newId("tch"), userId: user.id, firstName: user.firstName, lastName: user.lastName, title: input.title, email: user.email, subjectIds: [...input.subjectIds], createdAt: user.createdAt };
  db.users.push(user);
  db.teachers.push(teacher);
  log("teacher_created", `Compte enseignant créé pour ${fullName(teacher)}`, admin.id, [user.id]);
  commit();
  return toTeacherRow(teacher)!;
}

export async function updateTeacher(id: string, input: TeacherInput): Promise<TeacherRow> {
  await delay();
  const admin = requireRole("admin");
  const db = getDb();
  const teacher = db.teachers.find((t) => t.id === id);
  if (!teacher) throw new ApiError("Enseignant introuvable.");
  validateTeacherInput(input, id);
  Object.assign(teacher, { title: input.title, firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email.trim(), subjectIds: [...input.subjectIds] });
  const user = db.users.find((u) => u.id === teacher.userId);
  if (user) Object.assign(user, { firstName: teacher.firstName, lastName: teacher.lastName, email: teacher.email });
  log("teacher_updated", `Fiche de ${fullName(teacher)} mise à jour`, admin.id, [teacher.userId]);
  commit();
  return toTeacherRow(teacher)!;
}

export async function setTeacherStatus(id: string, status: UserStatus): Promise<void> {
  await delay();
  const admin = requireRole("admin");
  const db = getDb();
  const teacher = db.teachers.find((t) => t.id === id);
  const user = teacher && db.users.find((u) => u.id === teacher.userId);
  if (!teacher || !user) throw new ApiError("Enseignant introuvable.");
  user.status = status;
  log("teacher_status", `Compte de ${fullName(teacher)} ${status === "active" ? "réactivé" : "désactivé"}`, admin.id, [user.id]);
  commit();
}

export async function resetTeacherPassword(id: string, temporaryPassword: string): Promise<void> {
  await delay();
  requireRole("admin");
  validatePassword(temporaryPassword);
  const db = getDb();
  const teacher = db.teachers.find((t) => t.id === id);
  const user = teacher && db.users.find((u) => u.id === teacher.userId);
  if (!user) throw new ApiError("Enseignant introuvable.");
  user.passwordHash = await hashPassword(temporaryPassword);
  user.mustChangePassword = true;
  commit();
}

export async function deleteTeacher(id: string): Promise<void> {
  await delay();
  const admin = requireRole("admin");
  const db = getDb();
  const teacher = db.teachers.find((t) => t.id === id);
  if (!teacher) throw new ApiError("Enseignant introuvable.");
  if (db.sessions.some((s) => s.teacherId === id)) throw new ApiError("Cet enseignant a des séances enregistrées. Désactivez son compte plutôt que de le supprimer.");
  db.users = db.users.filter((u) => u.id !== teacher.userId);
  db.teachers = db.teachers.filter((t) => t.id !== id);
  log("teacher_deleted", `Enseignant ${fullName(teacher)} supprimé`, admin.id);
  commit();
}

// ---------------------------------------------------------------------------------------------
// Sessions & roll call

export interface SessionFilters {
  teacherId?: string;
  subjectId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listSessions(filters: SessionFilters = {}): Promise<Paged<SessionRow>> {
  await delay();
  const rows = getDb()
    .sessions.filter((s) => (!filters.teacherId || s.teacherId === filters.teacherId) && (!filters.subjectId || s.subjectId === filters.subjectId) && (!filters.from || s.date >= filters.from) && (!filters.to || s.date <= filters.to))
    .map(toSessionRow)
    .filter((r): r is SessionRow => !!r)
    .sort((a, b) => b.session.date.localeCompare(a.session.date) || b.session.startTime.localeCompare(a.session.startTime));
  return paginate(rows, filters.page, filters.pageSize);
}

export async function getSessionDetail(id: string): Promise<{ row: SessionRow; students: Student[]; absences: Absence[] }> {
  const db = getDb();
  const session = db.sessions.find((s) => s.id === id);
  const row = session && toSessionRow(session);
  if (!session || !row) throw new ApiError("Séance introuvable.");
  const students = db.students.filter((st) => st.filiere === session.filiere && st.niveau === session.niveau && st.groupe === session.groupe).sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"));
  return { row, students, absences: db.absences.filter((a) => a.sessionId === id) };
}

export interface RollCallInput {
  sessionId?: string;
  subjectId: string;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
  filiere: string;
  niveau: string;
  groupe: string;
  absentStudentIds: string[];
}

export async function saveRollCall(input: RollCallInput): Promise<{ session: Session; added: number; removed: number; kept: Student[] }> {
  await delay();
  const actor = requireRole("teacher", "admin");
  const db = getDb();
  if (actor.role === "teacher") {
    const me = db.teachers.find((t) => t.userId === actor.id);
    if (!me || me.id !== input.teacherId) throw new ApiError("Vous ne pouvez enregistrer que vos propres séances.");
    if (!me.subjectIds.includes(input.subjectId)) throw new ApiError("Cette matière ne vous est pas attribuée.", "subjectId");
  }
  if (!input.subjectId) throw new ApiError("Sélectionnez une matière.", "subjectId");
  if (!input.date) throw new ApiError("La date est requise.", "date");
  if (input.date > todayIso()) throw new ApiError("Impossible de faire l'appel pour une séance future.", "date");
  if (!input.startTime || !input.endTime) throw new ApiError("Les horaires sont requis.", "startTime");
  if (input.startTime >= input.endTime) throw new ApiError("L'heure de fin doit être après l'heure de début.", "endTime");
  if (!input.filiere || !input.niveau || !input.groupe) throw new ApiError("Sélectionnez le groupe.", "groupe");

  let session = input.sessionId ? db.sessions.find((s) => s.id === input.sessionId) : undefined;
  if (input.sessionId && !session) throw new ApiError("Séance introuvable.");
  if (!session) {
    const duplicate = db.sessions.find((s) => s.subjectId === input.subjectId && s.date === input.date && s.startTime === input.startTime && s.filiere === input.filiere && s.niveau === input.niveau && s.groupe === input.groupe);
    if (duplicate) throw new ApiError("Une séance identique existe déjà. Ouvrez-la depuis « Mes séances » pour la modifier.", "date");
    session = { id: newId("ses"), subjectId: input.subjectId, teacherId: input.teacherId, date: input.date, startTime: input.startTime, endTime: input.endTime, filiere: input.filiere, niveau: input.niveau, groupe: input.groupe, createdAt: nowIso() };
    db.sessions.push(session);
  } else {
    Object.assign(session, { subjectId: input.subjectId, date: input.date, startTime: input.startTime, endTime: input.endTime, filiere: input.filiere, niveau: input.niveau, groupe: input.groupe });
  }

  const groupStudentIds = new Set(db.students.filter((st) => st.filiere === session!.filiere && st.niveau === session!.niveau && st.groupe === session!.groupe).map((s) => s.id));
  const wanted = new Set(input.absentStudentIds.filter((id) => groupStudentIds.has(id)));
  const existing = db.absences.filter((a) => a.sessionId === session!.id);
  let added = 0;
  let removed = 0;
  const kept: Student[] = [];
  for (const a of existing) {
    if (wanted.has(a.studentId)) continue;
    if (a.status === "unjustified") {
      db.absences = db.absences.filter((x) => x.id !== a.id);
      removed += 1;
    } else {
      // A justified or pending absence is not silently erased by a roll-call edit.
      const st = db.students.find((s) => s.id === a.studentId);
      if (st) kept.push(st);
    }
  }
  for (const studentId of wanted) {
    if (existing.some((a) => a.studentId === studentId)) continue;
    db.absences.push({ id: newId("abs"), studentId, sessionId: session.id, status: "unjustified", createdAt: nowIso(), updatedAt: nowIso() });
    added += 1;
  }
  const subject = db.subjects.find((s) => s.id === session.subjectId);
  const total = db.absences.filter((a) => a.sessionId === session!.id).length;
  log("session_saved", `Appel ${subject?.name ?? ""} · ${session.groupe} du ${session.date} enregistré (${total} absence${total > 1 ? "s" : ""})`, actor.id, [actor.id]);
  commit();
  return { session, added, removed, kept };
}

export async function deleteSession(id: string): Promise<void> {
  await delay();
  const actor = requireRole("teacher", "admin");
  const db = getDb();
  const session = db.sessions.find((s) => s.id === id);
  if (!session) throw new ApiError("Séance introuvable.");
  if (actor.role === "teacher") {
    const me = db.teachers.find((t) => t.userId === actor.id);
    if (!me || me.id !== session.teacherId) throw new ApiError("Vous ne pouvez supprimer que vos propres séances.");
  }
  if (db.absences.some((a) => a.sessionId === id && a.status !== "unjustified")) throw new ApiError("Des justificatifs sont rattachés à cette séance. Elle ne peut pas être supprimée.");
  db.absences = db.absences.filter((a) => a.sessionId !== id);
  db.sessions = db.sessions.filter((s) => s.id !== id);
  commit();
}

// ---------------------------------------------------------------------------------------------
// Absences

export interface AbsenceFilters {
  query?: string;
  studentId?: string;
  teacherId?: string;
  subjectId?: string;
  status?: AbsenceStatus | "";
  filiere?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

function queryAbsences(filters: AbsenceFilters): AbsenceRow[] {
  const q = norm(filters.query ?? "");
  return getDb()
    .absences.map(toAbsenceRow)
    .filter((r): r is AbsenceRow => !!r)
    .filter(
      (r) =>
        (!filters.studentId || r.student.id === filters.studentId) &&
        (!filters.teacherId || r.session.teacherId === filters.teacherId) &&
        (!filters.subjectId || r.subject.id === filters.subjectId) &&
        (!filters.status || r.absence.status === filters.status) &&
        (!filters.filiere || r.student.filiere === filters.filiere) &&
        (!filters.from || r.session.date >= filters.from) &&
        (!filters.to || r.session.date <= filters.to) &&
        (!q || norm(`${r.student.firstName} ${r.student.lastName} ${r.student.lastName} ${r.student.firstName} ${r.student.registrationNumber} ${r.subject.name}`).includes(q)),
    )
    .sort(byDateDesc);
}

export async function listAbsences(filters: AbsenceFilters = {}): Promise<Paged<AbsenceRow>> {
  await delay();
  return paginate(queryAbsences(filters), filters.page, filters.pageSize);
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

/** Admin shortcut: records one absence, reusing or creating the matching session. */
export async function createAbsence(input: ManualAbsenceInput): Promise<AbsenceRow> {
  await delay();
  const admin = requireRole("admin");
  const db = getDb();
  const student = db.students.find((s) => s.id === input.studentId);
  if (!student) throw new ApiError("Sélectionnez un étudiant.", "studentId");
  if (!input.subjectId) throw new ApiError("Sélectionnez une matière.", "subjectId");
  if (!input.teacherId) throw new ApiError("Sélectionnez un enseignant.", "teacherId");
  if (!input.date) throw new ApiError("La date est requise.", "date");
  if (input.date > todayIso()) throw new ApiError("La date ne peut pas être dans le futur.", "date");
  if (!input.startTime || !input.endTime || input.startTime >= input.endTime) throw new ApiError("Horaires invalides.", "startTime");
  let session = db.sessions.find((s) => s.subjectId === input.subjectId && s.date === input.date && s.startTime === input.startTime && s.filiere === student.filiere && s.niveau === student.niveau && s.groupe === student.groupe);
  if (!session) {
    session = { id: newId("ses"), subjectId: input.subjectId, teacherId: input.teacherId, date: input.date, startTime: input.startTime, endTime: input.endTime, filiere: student.filiere, niveau: student.niveau, groupe: student.groupe, createdAt: nowIso() };
    db.sessions.push(session);
  }
  if (db.absences.some((a) => a.sessionId === session!.id && a.studentId === student.id)) throw new ApiError("Cette absence est déjà enregistrée.", "date");
  const absence: Absence = { id: newId("abs"), studentId: student.id, sessionId: session.id, status: "unjustified", createdAt: nowIso(), updatedAt: nowIso() };
  db.absences.push(absence);
  log("absence_created", `Absence ajoutée pour ${fullName(student)}`, admin.id, [student.userId]);
  commit();
  return toAbsenceRow(absence)!;
}

/** Admin manual decision without a file (paper certificate, administrative justification…). */
export async function setAbsenceStatus(id: string, status: AbsenceStatus, note?: string): Promise<AbsenceRow> {
  await delay();
  const admin = requireRole("admin");
  const db = getDb();
  const absence = db.absences.find((a) => a.id === id);
  if (!absence) throw new ApiError("Absence introuvable.");
  if (absence.status === "pending" && status !== "pending") throw new ApiError("Un justificatif est en attente : traitez le certificat plutôt que de changer le statut à la main.");
  absence.status = status;
  absence.note = note?.trim() || undefined;
  absence.updatedAt = nowIso();
  const student = db.students.find((s) => s.id === absence.studentId);
  log("absence_updated", `Absence de ${student ? fullName(student) : "?"} marquée « ${ABSENCE_STATUS_LABEL[status]} »`, admin.id, student ? [student.userId] : []);
  commit();
  return toAbsenceRow(absence)!;
}

export async function deleteAbsence(id: string): Promise<void> {
  await delay();
  const admin = requireRole("admin");
  const db = getDb();
  const absence = db.absences.find((a) => a.id === id);
  if (!absence) throw new ApiError("Absence introuvable.");
  if (absence.certificateId) {
    const cert = db.certificates.find((c) => c.id === absence.certificateId);
    if (cert) {
      cert.absenceIds = cert.absenceIds.filter((x) => x !== id);
      if (cert.absenceIds.length === 0) db.certificates = db.certificates.filter((c) => c.id !== cert.id);
    }
  }
  db.absences = db.absences.filter((a) => a.id !== id);
  const student = db.students.find((s) => s.id === absence.studentId);
  log("absence_deleted", `Absence de ${student ? fullName(student) : "?"} supprimée`, admin.id, student ? [student.userId] : []);
  commit();
}

// ---------------------------------------------------------------------------------------------
// Certificates

export interface CertificateRow {
  certificate: Certificate;
  student: Student;
  absences: AbsenceRow[];
  uploadedBy: User | undefined;
  reviewedBy: User | undefined;
}

function toCertificateRow(c: Certificate): CertificateRow | null {
  const db = getDb();
  const student = db.students.find((s) => s.id === c.studentId);
  if (!student) return null;
  return {
    certificate: c,
    student,
    absences: c.absenceIds.map((id) => db.absences.find((a) => a.id === id)).filter((a): a is Absence => !!a).map(toAbsenceRow).filter((r): r is AbsenceRow => !!r).sort(byDateDesc),
    uploadedBy: db.users.find((u) => u.id === c.uploadedByUserId),
    reviewedBy: c.reviewedByUserId ? db.users.find((u) => u.id === c.reviewedByUserId) : undefined,
  };
}

export interface CertificateFilters {
  status?: CertificateStatus | "";
  studentId?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}

export async function listCertificates(filters: CertificateFilters = {}): Promise<Paged<CertificateRow>> {
  await delay();
  const q = norm(filters.query ?? "");
  const rows = getDb()
    .certificates.map(toCertificateRow)
    .filter((r): r is CertificateRow => !!r)
    .filter((r) => (!filters.status || r.certificate.status === filters.status) && (!filters.studentId || r.student.id === filters.studentId))
    .filter((r) => !q || norm(`${r.student.firstName} ${r.student.lastName} ${r.student.lastName} ${r.student.firstName} ${r.student.registrationNumber} ${r.certificate.fileName}`).includes(q))
    .sort((a, b) => b.certificate.uploadedAt.localeCompare(a.certificate.uploadedAt));
  return paginate(rows, filters.page, filters.pageSize);
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
  const actor = requireRole("student", "admin");
  const db = getDb();
  const student = db.students.find((s) => s.id === input.studentId);
  if (!student) throw new ApiError("Sélectionnez un étudiant.", "studentId");
  if (actor.role === "student" && student.userId !== actor.id) throw new ApiError("Vous ne pouvez justifier que vos propres absences.");
  if (!input.file?.name) throw new ApiError("Ajoutez le document justificatif.", "file");
  if (!input.startDate || !input.endDate) throw new ApiError("Indiquez la période couverte par le certificat.", "startDate");
  if (input.startDate > input.endDate) throw new ApiError("La date de fin doit être après la date de début.", "endDate");
  if (input.absenceIds.length === 0) throw new ApiError("Sélectionnez au moins une absence à justifier.", "absenceIds");
  const absences = input.absenceIds.map((id) => db.absences.find((a) => a.id === id));
  if (absences.some((a) => !a || a.studentId !== student.id)) throw new ApiError("Une des absences sélectionnées est invalide.", "absenceIds");
  const valid = absences as Absence[];
  const blocked = valid.find((a) => a.status === "pending" || a.status === "justified");
  if (blocked) throw new ApiError("Une des absences sélectionnées est déjà justifiée ou en cours de traitement.", "absenceIds");
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
  log("certificate_uploaded", `${actor.role === "student" ? fullName(student) + " a déposé" : "L'administration a déposé pour " + fullName(student)} un justificatif (${valid.length} absence${valid.length > 1 ? "s" : ""})`, actor.id, [student.userId]);
  commit();
  return toCertificateRow(certificate)!;
}

export async function reviewCertificate(id: string, decision: "accepted" | "rejected", note?: string): Promise<CertificateRow> {
  await delay();
  const admin = requireRole("admin");
  const db = getDb();
  const certificate = db.certificates.find((c) => c.id === id);
  if (!certificate) throw new ApiError("Certificat introuvable.");
  if (certificate.status !== "pending") throw new ApiError("Ce certificat a déjà été traité.");
  if (decision === "rejected" && !note?.trim()) throw new ApiError("Indiquez le motif du refus.", "note");
  certificate.status = decision;
  certificate.reviewedByUserId = admin.id;
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
  log(decision === "accepted" ? "certificate_accepted" : "certificate_rejected", `Certificat ${decision === "accepted" ? "validé" : "refusé"} pour ${student ? fullName(student) : "?"}`, admin.id, student ? [student.userId] : []);
  commit();
  return toCertificateRow(certificate)!;
}

export async function deleteCertificate(id: string): Promise<void> {
  await delay();
  const actor = requireRole("admin", "student");
  const db = getDb();
  const certificate = db.certificates.find((c) => c.id === id);
  if (!certificate) throw new ApiError("Certificat introuvable.");
  if (actor.role === "student") {
    const student = db.students.find((s) => s.userId === actor.id);
    if (!student || student.id !== certificate.studentId) throw new ApiError("Action non autorisée.");
    if (certificate.status !== "pending") throw new ApiError("Un certificat déjà traité ne peut plus être retiré.");
  }
  for (const absenceId of certificate.absenceIds) {
    const a = db.absences.find((x) => x.id === absenceId);
    if (!a) continue;
    a.status = "unjustified";
    a.certificateId = undefined;
    a.note = undefined;
    a.updatedAt = nowIso();
  }
  db.certificates = db.certificates.filter((c) => c.id !== id);
  commit();
}

// ---------------------------------------------------------------------------------------------
// Dashboards

export const MONTH_LABELS = ["Sep", "Oct", "Nov", "Déc", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août"];

function monthIndex(date: string): number {
  const m = Number(date.split("-")[1]);
  return (m + 3) % 12; // Sep -> 0 … Août -> 11
}

export async function listAcademicYears(): Promise<number[]> {
  const years = new Set<number>([academicYearOf(todayIso())]);
  getDb().sessions.forEach((s) => years.add(academicYearOf(s.date)));
  return [...years].sort((a, b) => b - a);
}

export interface AdminStats {
  studentCount: number;
  teacherCount: number;
  activeTeacherCount: number;
  pendingCertificates: number;
  absencesThisMonth: number;
  unjustifiedRate: number;
  absencesByMonth: number[];
  recentAbsences: AbsenceRow[];
  recentActivity: Activity[];
  flaggedStudents: { student: Student; subject: Subject; count: number }[];
}

export async function adminStats(academicYear: number): Promise<AdminStats> {
  await delay();
  const db = getDb();
  const rows = queryAbsences({});
  const inYear = rows.filter((r) => academicYearOf(r.session.date) === academicYear);
  const absencesByMonth = Array(12).fill(0) as number[];
  inYear.forEach((r) => (absencesByMonth[monthIndex(r.session.date)] += 1));
  const month = todayIso().slice(0, 7);
  const unjustified = inYear.filter((r) => r.absence.status === "unjustified" || r.absence.status === "rejected").length;
  return {
    studentCount: db.students.length,
    teacherCount: db.teachers.length,
    activeTeacherCount: db.teachers.filter((t) => db.users.find((u) => u.id === t.userId)?.status === "active").length,
    pendingCertificates: db.certificates.filter((c) => c.status === "pending").length,
    absencesThisMonth: rows.filter((r) => r.session.date.startsWith(month)).length,
    unjustifiedRate: inYear.length ? Math.round((unjustified / inYear.length) * 100) : 0,
    absencesByMonth,
    recentAbsences: rows.slice(0, 6),
    recentActivity: [...db.activities].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8),
    flaggedStudents: flagged(inYear),
  };
}

function flagged(rows: AbsenceRow[]) {
  const map = new Map<string, { student: Student; subject: Subject; count: number }>();
  for (const r of rows) {
    if (r.absence.status !== "unjustified" && r.absence.status !== "rejected") continue;
    const key = `${r.student.id}|${r.subject.id}`;
    const entry = map.get(key) ?? { student: r.student, subject: r.subject, count: 0 };
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].filter((e) => e.count >= UNJUSTIFIED_WARNING_THRESHOLD).sort((a, b) => b.count - a.count);
}

export interface TeacherStats {
  subjects: Subject[];
  sessionCount: number;
  absenceCount: number;
  pendingCount: number;
  recentSessions: SessionRow[];
  flaggedStudents: { student: Student; subject: Subject; count: number }[];
  absencesBySubject: { subject: Subject; count: number }[];
}

export async function teacherStats(teacherId: string): Promise<TeacherStats> {
  await delay();
  const db = getDb();
  const teacher = db.teachers.find((t) => t.id === teacherId);
  if (!teacher) throw new ApiError("Enseignant introuvable.");
  const year = academicYearOf(todayIso());
  const rows = queryAbsences({ teacherId }).filter((r) => academicYearOf(r.session.date) === year);
  const sessions = db.sessions.filter((s) => s.teacherId === teacherId && academicYearOf(s.date) === year);
  const subjects = db.subjects.filter((s) => teacher.subjectIds.includes(s.id));
  return {
    subjects,
    sessionCount: sessions.length,
    absenceCount: rows.length,
    pendingCount: rows.filter((r) => r.absence.status === "pending").length,
    recentSessions: (await listSessions({ teacherId, pageSize: 5 })).items,
    flaggedStudents: flagged(rows),
    absencesBySubject: subjects.map((subject) => ({ subject, count: rows.filter((r) => r.subject.id === subject.id).length })),
  };
}

export interface StudentStats {
  total: number;
  unjustified: number;
  pending: number;
  justified: number;
  rejected: number;
  bySubject: { subject: Subject; total: number; unjustified: number; flagged: boolean }[];
  recent: AbsenceRow[];
  recentActivity: Activity[];
}

export async function studentStats(studentId: string): Promise<StudentStats> {
  await delay();
  const db = getDb();
  const student = db.students.find((s) => s.id === studentId);
  if (!student) throw new ApiError("Étudiant introuvable.");
  const year = academicYearOf(todayIso());
  const rows = queryAbsences({ studentId }).filter((r) => academicYearOf(r.session.date) === year);
  const subjectIds = [...new Set(rows.map((r) => r.subject.id))];
  const count = (status: AbsenceStatus) => rows.filter((r) => r.absence.status === status).length;
  return {
    total: rows.length,
    unjustified: count("unjustified"),
    pending: count("pending"),
    justified: count("justified"),
    rejected: count("rejected"),
    bySubject: subjectIds
      .map((id) => {
        const subject = db.subjects.find((s) => s.id === id)!;
        const mine = rows.filter((r) => r.subject.id === id);
        const unjustified = mine.filter((r) => r.absence.status === "unjustified" || r.absence.status === "rejected").length;
        return { subject, total: mine.length, unjustified, flagged: unjustified >= UNJUSTIFIED_WARNING_THRESHOLD };
      })
      .sort((a, b) => b.unjustified - a.unjustified || b.total - a.total),
    recent: rows.slice(0, 5),
    recentActivity: db.activities.filter((a) => a.subjectUserIds.includes(student.userId)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6),
  };
}

export async function listActivity(forUserId?: string, limit = 20): Promise<Activity[]> {
  return getDb()
    .activities.filter((a) => !forUserId || a.subjectUserIds.includes(forUserId) || a.actorUserId === forUserId)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}
