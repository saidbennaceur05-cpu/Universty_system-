import type { Absence, Activity, Certificate, Database, Session, Student, Subject, Teacher, User } from "../types";

export const FILIERES = [
  "Licence en Science Informatique - Big Data et Analyse de Données",
  "Master Recherche en Science Informatique - Data Science",
  "Master Recherche en Automatique & Informatique Industrielle",
  "Master Professionnel en Gestion Maintenance des Systèmes Industriels",
  "Master Professionnel en Génie Mécanique",
  "Master Professionnel en Commandes des Systèmes Industriels",
  "Licence en EEA - Système Electrique",
  "Licence en EEA - Automatique et Informatique Industrielle",
  "Licence en Electronique Electrotechnique & Automatique - EEA Tronc commun",
  "Licence en Génie Informatique - Systèmes Embarqués et Internet des Objets",
  "Licence en Génie Mécanique - Conception et Production Intégrée",
  "Licence en Energétique Nouvelles et Renouvelables",
];

export const NIVEAUX = ["1ère année", "2ème année", "3ème année"];
export const GROUPES = ["G1", "G2", "G3"];

export const DEMO_ACCOUNTS: { role: string; label: string; email: string; password: string }[] = [
  { role: "admin", label: "Administration", email: "admin@univ.tn", password: "Admin123!" },
  { role: "teacher", label: "Enseignant · Dr. Amine Larbi", email: "a.larbi@univ.tn", password: "Prof123!" },
  { role: "student", label: "Étudiante · Lina Benali", email: "lina.benali@etu.univ.tn", password: "Etud123!" },
];

/** Deterministic PRNG so the seed is identical on every machine. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (date: string, time = "09:00") => new Date(`${date}T${time}:00`).toISOString();

const subjectDefs: Subject[] = [
  { id: "sub_alg", name: "Algorithmique", code: "ALG" },
  { id: "sub_bd", name: "Base de données", code: "BD" },
  { id: "sub_res", name: "Réseaux", code: "RES" },
  { id: "sub_se", name: "Systèmes embarqués", code: "SE" },
  { id: "sub_iot", name: "Internet des objets", code: "IOT" },
  { id: "sub_elec", name: "Électronique", code: "ELEC" },
  { id: "sub_auto", name: "Automatique", code: "AUTO" },
  { id: "sub_mf", name: "Mécanique des fluides", code: "MF" },
  { id: "sub_ang", name: "Anglais", code: "ANG" },
  { id: "sub_math", name: "Mathématiques", code: "MATH" },
  { id: "sub_bgd", name: "Big Data", code: "BGD" },
  { id: "sub_ml", name: "Machine Learning", code: "ML" },
];

const teacherDefs: { id: string; title: string; firstName: string; lastName: string; email: string; subjectIds: string[]; status: "active" | "disabled"; password: string }[] = [
  { id: "tch_01", title: "Dr.", firstName: "Amine", lastName: "Larbi", email: "a.larbi@univ.tn", subjectIds: ["sub_alg", "sub_bd"], status: "active", password: "Prof123!" },
  { id: "tch_02", title: "Pr.", firstName: "Claire", lastName: "Moreau", email: "c.moreau@univ.tn", subjectIds: ["sub_math", "sub_ml"], status: "active", password: "Prof123!" },
  { id: "tch_03", title: "Dr.", firstName: "Youssef", lastName: "Haddad", email: "y.haddad@univ.tn", subjectIds: ["sub_res", "sub_iot"], status: "active", password: "Prof123!" },
  { id: "tch_04", title: "Mme", firstName: "Julie", lastName: "André", email: "j.andre@univ.tn", subjectIds: ["sub_ang"], status: "active", password: "Prof123!" },
  { id: "tch_05", title: "M.", firstName: "Karim", lastName: "Jebali", email: "k.jebali@univ.tn", subjectIds: ["sub_se", "sub_elec", "sub_auto"], status: "disabled", password: "Prof123!" },
  { id: "tch_06", title: "Dr.", firstName: "Sami", lastName: "Trabelsi", email: "s.trabelsi@univ.tn", subjectIds: ["sub_mf", "sub_bgd"], status: "active", password: "Prof123!" },
];

/** Groups that have students, with a 3-subject weekly timetable each. weekday: 1 = Monday. */
const groupDefs: { filiere: string; niveau: string; groupe: string; students: [string, string][]; slots: { subjectId: string; teacherId: string; weekday: number; start: string; end: string }[] }[] = [
  {
    filiere: FILIERES[9], niveau: "2ème année", groupe: "G1",
    students: [["Benali", "Lina"], ["Dubois", "Théo"], ["Chaabane", "Omar"], ["Gharbi", "Yasmine"], ["Mansour", "Aziz"], ["Ferchichi", "Rim"]],
    slots: [
      { subjectId: "sub_alg", teacherId: "tch_01", weekday: 1, start: "08:30", end: "10:00" },
      { subjectId: "sub_bd", teacherId: "tch_01", weekday: 3, start: "10:15", end: "11:45" },
      { subjectId: "sub_iot", teacherId: "tch_03", weekday: 4, start: "14:00", end: "15:30" },
    ],
  },
  {
    filiere: FILIERES[9], niveau: "2ème année", groupe: "G2",
    students: [["Khelifi", "Mehdi"], ["Saidi", "Ines"], ["Bouazizi", "Wael"], ["Zouari", "Salma"], ["Hamdi", "Rayen"]],
    slots: [
      { subjectId: "sub_alg", teacherId: "tch_01", weekday: 1, start: "10:15", end: "11:45" },
      { subjectId: "sub_bd", teacherId: "tch_01", weekday: 3, start: "08:30", end: "10:00" },
      { subjectId: "sub_iot", teacherId: "tch_03", weekday: 5, start: "08:30", end: "10:00" },
    ],
  },
  {
    filiere: FILIERES[0], niveau: "3ème année", groupe: "G1",
    students: [["Martin", "Hugo"], ["Ben Salah", "Nour"], ["Jlassi", "Ahmed"], ["Mejri", "Eya"], ["Toumi", "Khalil"]],
    slots: [
      { subjectId: "sub_bgd", teacherId: "tch_06", weekday: 2, start: "08:30", end: "10:00" },
      { subjectId: "sub_ml", teacherId: "tch_02", weekday: 4, start: "10:15", end: "11:45" },
      { subjectId: "sub_ang", teacherId: "tch_04", weekday: 5, start: "10:15", end: "11:45" },
    ],
  },
  {
    filiere: FILIERES[6], niveau: "1ère année", groupe: "G1",
    students: [["El Amrani", "Sara"], ["Dridi", "Bilel"], ["Ayari", "Mariem"], ["Nasri", "Ghassen"], ["Lahmar", "Hiba"]],
    slots: [
      { subjectId: "sub_elec", teacherId: "tch_05", weekday: 1, start: "14:00", end: "15:30" },
      { subjectId: "sub_math", teacherId: "tch_02", weekday: 2, start: "10:15", end: "11:45" },
      { subjectId: "sub_ang", teacherId: "tch_04", weekday: 3, start: "14:00", end: "15:30" },
    ],
  },
  {
    filiere: FILIERES[10], niveau: "2ème année", groupe: "G1",
    students: [["Alaoui", "Nora"], ["Sassi", "Firas"], ["Rezgui", "Amal"], ["Baccouche", "Iyed"]],
    slots: [
      { subjectId: "sub_mf", teacherId: "tch_06", weekday: 2, start: "14:00", end: "15:30" },
      { subjectId: "sub_auto", teacherId: "tch_05", weekday: 4, start: "08:30", end: "10:00" },
      { subjectId: "sub_ang", teacherId: "tch_04", weekday: 5, start: "14:00", end: "15:30" },
    ],
  },
  {
    filiere: FILIERES[9], niveau: "1ère année", groupe: "G1",
    students: [["Abidi", "Yassine"], ["Karoui", "Chaima"], ["Belhadj", "Adam"], ["Mrad", "Sirine"], ["Oueslati", "Nizar"]],
    slots: [
      { subjectId: "sub_alg", teacherId: "tch_01", weekday: 2, start: "14:00", end: "15:30" },
      { subjectId: "sub_math", teacherId: "tch_02", weekday: 3, start: "10:15", end: "11:45" },
      { subjectId: "sub_ang", teacherId: "tch_04", weekday: 1, start: "10:15", end: "11:45" },
    ],
  },
];

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
}

function demoCertificateSvg(studentName: string, from: string, to: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="860" viewBox="0 0 620 860"><rect width="620" height="860" fill="#fff"/><rect x="40" y="40" width="540" height="780" fill="none" stroke="#cbd5e1" stroke-width="2"/><text x="310" y="110" font-family="Georgia,serif" font-size="20" font-weight="700" text-anchor="middle" fill="#334155">CENTRE MEDICAL UNIVERSITAIRE</text><text x="310" y="200" font-family="Georgia,serif" font-size="30" text-anchor="middle" fill="#1e293b">Certificat medical</text><text x="80" y="300" font-family="Arial,sans-serif" font-size="16" fill="#475569">Je soussigne(e) certifie avoir examine</text><text x="80" y="340" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#1e293b">${studentName}</text><text x="80" y="400" font-family="Arial,sans-serif" font-size="16" fill="#475569">et atteste que son etat de sante necessite un arret</text><text x="80" y="430" font-family="Arial,sans-serif" font-size="16" fill="#475569">du ${from} au ${to} inclus.</text><circle cx="470" cy="700" r="60" fill="none" stroke="#94a3b8" stroke-width="4" stroke-dasharray="6 4"/><text x="470" y="706" font-family="Arial,sans-serif" font-size="14" font-weight="700" text-anchor="middle" fill="#94a3b8">CERTIFIE</text><text x="310" y="800" font-family="Arial,sans-serif" font-size="11" text-anchor="middle" fill="#94a3b8">Document de demonstration genere par UniAbsence</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** The academic year a date belongs to: 2026 means 2026-09 .. 2027-08. */
export function academicYearOf(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return m >= 9 ? y : y - 1;
}

export async function buildSeed(hash: (password: string) => Promise<string>, now = new Date()): Promise<Database> {
  const rand = mulberry32(20261010);
  const users: User[] = [];
  const students: Student[] = [];
  const teachers: Teacher[] = [];
  const sessions: Session[] = [];
  const absences: Absence[] = [];
  const certificates: Certificate[] = [];
  const activities: Activity[] = [];

  const adminHash = await hash("Admin123!");
  const profHash = await hash("Prof123!");
  const etudHash = await hash("Etud123!");
  const createdAt = at("2026-09-01", "08:00");

  const adminUser: User = { id: "usr_admin", email: "admin@univ.tn", passwordHash: adminHash, role: "admin", firstName: "Service", lastName: "Scolarité", status: "active", mustChangePassword: false, createdAt };
  users.push(adminUser);

  for (const t of teacherDefs) {
    const userId = `usr_${t.id}`;
    users.push({ id: userId, email: t.email, passwordHash: profHash, role: "teacher", firstName: t.firstName, lastName: t.lastName, status: t.status, mustChangePassword: false, createdAt });
    teachers.push({ id: t.id, userId, firstName: t.firstName, lastName: t.lastName, title: t.title, email: t.email, subjectIds: t.subjectIds, createdAt });
  }

  let studentIndex = 0;
  for (const g of groupDefs) {
    for (const [lastName, firstName] of g.students) {
      studentIndex += 1;
      const id = `stu_${pad(studentIndex)}`;
      const userId = `usr_${id}`;
      const email = `${stripAccents(firstName)}.${stripAccents(lastName)}@etu.univ.tn`;
      const yearPrefix = g.niveau.startsWith("1") ? "2026" : g.niveau.startsWith("2") ? "2025" : "2024";
      users.push({ id: userId, email, passwordHash: etudHash, role: "student", firstName, lastName, status: "active", mustChangePassword: false, createdAt });
      students.push({ id, userId, firstName, lastName, registrationNumber: `${yearPrefix}${pad(studentIndex + 10)}`, email, filiere: g.filiere, niveau: g.niveau, groupe: g.groupe, createdAt });
    }
  }

  // Sessions: current academic year weekly from the first Monday of September up to yesterday,
  // plus a lighter sample (every third week) of the previous academic year for history.
  const today = iso(now);
  const currentYear = academicYearOf(today);
  const weeks: { monday: Date; current: boolean }[] = [];
  const firstMonday = (year: number) => {
    const d = new Date(year, 8, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    return d;
  };
  for (let w = 0, d = firstMonday(currentYear - 1); w < 40; w += 3, d = new Date(d.getTime() + 21 * 86400000)) {
    if (d.getMonth() >= 6 && d.getMonth() <= 7) continue; // skip summer
    weeks.push({ monday: new Date(d), current: false });
  }
  for (let d = firstMonday(currentYear); iso(d) <= today; d = new Date(d.getTime() + 7 * 86400000)) weeks.push({ monday: new Date(d), current: true });

  let sessionIndex = 0;
  let absenceIndex = 0;
  let certIndex = 0;
  const unjustifiedStreak = new Map<string, number>();

  for (const g of groupDefs) {
    const groupStudents = students.filter((s) => s.filiere === g.filiere && s.niveau === g.niveau && s.groupe === g.groupe);
    for (const week of weeks) {
      for (const slot of g.slots) {
        const date = new Date(week.monday.getTime() + (slot.weekday - 1) * 86400000);
        const dateIso = iso(date);
        if (dateIso >= today) continue;
        sessionIndex += 1;
        const session: Session = { id: `ses_${String(sessionIndex).padStart(4, "0")}`, subjectId: slot.subjectId, teacherId: slot.teacherId, date: dateIso, startTime: slot.start, endTime: slot.end, filiere: g.filiere, niveau: g.niveau, groupe: g.groupe, createdAt: at(dateIso, slot.end) };
        sessions.push(session);
        for (const s of groupStudents) {
          const key = `${s.id}:${slot.subjectId}`;
          const streak = unjustifiedStreak.get(key) ?? 0;
          const p = s.id === "stu_01" ? 0.16 : 0.09 + Math.min(streak, 2) * 0.02;
          if (rand() > p) continue;
          absenceIndex += 1;
          const absence: Absence = { id: `abs_${String(absenceIndex).padStart(4, "0")}`, studentId: s.id, sessionId: session.id, status: "unjustified", createdAt: at(dateIso, slot.end), updatedAt: at(dateIso, slot.end) };
          const roll = rand();
          if (roll < (week.current ? 0.18 : 0.3)) {
            certIndex += 1;
            const cert: Certificate = { id: `cert_${String(certIndex).padStart(4, "0")}`, studentId: s.id, absenceIds: [absence.id], fileName: `certificat_${stripAccents(s.lastName)}_${dateIso}.svg`, fileType: "image/svg+xml", fileSize: 24_000 + Math.floor(rand() * 8000), dataUrl: demoCertificateSvg(`${s.firstName} ${s.lastName}`, dateIso, dateIso), startDate: dateIso, endDate: dateIso, status: "accepted", uploadedByUserId: s.userId, uploadedAt: at(dateIso, "18:00"), reviewedByUserId: adminUser.id, reviewedAt: at(dateIso, "19:00") };
            certificates.push(cert);
            absence.certificateId = cert.id;
            absence.status = "justified";
            absence.updatedAt = cert.reviewedAt!;
          } else if (week.current && roll < 0.36) {
            certIndex += 1;
            const cert: Certificate = { id: `cert_${String(certIndex).padStart(4, "0")}`, studentId: s.id, absenceIds: [absence.id], fileName: `certificat_${stripAccents(s.lastName)}_${dateIso}.svg`, fileType: "image/svg+xml", fileSize: 24_000 + Math.floor(rand() * 8000), dataUrl: demoCertificateSvg(`${s.firstName} ${s.lastName}`, dateIso, dateIso), startDate: dateIso, endDate: dateIso, status: "pending", uploadedByUserId: s.userId, uploadedAt: at(dateIso, "18:00") };
            certificates.push(cert);
            absence.certificateId = cert.id;
            absence.status = "pending";
            absence.updatedAt = cert.uploadedAt;
          } else if (!week.current && roll < 0.36) {
            certIndex += 1;
            const cert: Certificate = { id: `cert_${String(certIndex).padStart(4, "0")}`, studentId: s.id, absenceIds: [absence.id], fileName: `certificat_${stripAccents(s.lastName)}_${dateIso}.svg`, fileType: "image/svg+xml", fileSize: 24_000 + Math.floor(rand() * 8000), dataUrl: demoCertificateSvg(`${s.firstName} ${s.lastName}`, dateIso, dateIso), startDate: dateIso, endDate: dateIso, status: "rejected", uploadedByUserId: s.userId, uploadedAt: at(dateIso, "18:00"), reviewedByUserId: adminUser.id, reviewedAt: at(dateIso, "19:00"), reviewNote: "Les dates du certificat ne couvrent pas la séance." };
            certificates.push(cert);
            absence.certificateId = cert.id;
            absence.status = "rejected";
            absence.note = cert.reviewNote;
            absence.updatedAt = cert.reviewedAt!;
          }
          unjustifiedStreak.set(key, absence.status === "unjustified" ? streak + 1 : 0);
          absences.push(absence);
        }
      }
    }
  }

  // A handful of recent activities so the dashboard feed is not empty on first run.
  const recentCerts = certificates.filter((c) => c.status !== "pending").slice(-3);
  for (const c of recentCerts) {
    const s = students.find((x) => x.id === c.studentId)!;
    activities.push({ id: `act_${c.id}`, kind: c.status === "accepted" ? "certificate_accepted" : "certificate_rejected", message: `Certificat ${c.status === "accepted" ? "validé" : "refusé"} pour ${s.firstName} ${s.lastName}`, actorUserId: adminUser.id, subjectUserIds: [s.userId], at: c.reviewedAt! });
  }
  const recentPending = certificates.filter((c) => c.status === "pending").slice(-3);
  for (const c of recentPending) {
    const s = students.find((x) => x.id === c.studentId)!;
    activities.push({ id: `act_${c.id}`, kind: "certificate_uploaded", message: `${s.firstName} ${s.lastName} a déposé un justificatif`, actorUserId: s.userId, subjectUserIds: [s.userId], at: c.uploadedAt });
  }
  const lastSessions = sessions.slice(-3);
  for (const se of lastSessions) {
    const t = teachers.find((x) => x.id === se.teacherId)!;
    const count = absences.filter((a) => a.sessionId === se.id).length;
    const subject = subjectDefs.find((x) => x.id === se.subjectId)!;
    activities.push({ id: `act_${se.id}`, kind: "session_saved", message: `Appel ${subject.name} · ${se.groupe} enregistré (${count} absence${count > 1 ? "s" : ""})`, actorUserId: t.userId, subjectUserIds: [t.userId], at: se.createdAt });
  }
  activities.sort((a, b) => (a.at < b.at ? -1 : 1));

  return { version: 1, users, students, teachers, subjects: subjectDefs, sessions, absences, certificates, activities };
}
