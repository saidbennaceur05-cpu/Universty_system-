// Local persistence layer. The whole database is one JSON document in localStorage.
// Swapping this for a real backend means re-implementing src/api/index.ts against HTTP;
// nothing in the UI touches this file directly.

import type { Database } from "../types";
import { buildSeed } from "../data/seed";
import { hashPassword } from "./crypto";

const DB_KEY = "uniabsence.db.v1";
const SESSION_KEY = "uniabsence.session.v1";

let db: Database | null = null;
let version = 0;
const listeners = new Set<() => void>();

export class StorageError extends Error {}

export async function initDb(): Promise<Database> {
  if (db) return db;
  const raw = safeGet(DB_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Database;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.users)) {
        db = parsed;
        return db;
      }
    } catch {
      // fall through to reseed
    }
  }
  db = await buildSeed(hashPassword);
  persist();
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error("La base locale n'est pas initialisée.");
  return db;
}

/** Call after every mutation: writes to localStorage and notifies React subscribers. */
export function commit(): void {
  persist();
  version += 1;
  listeners.forEach((l) => l());
}

export async function resetDb(): Promise<void> {
  db = await buildSeed(hashPassword);
  commit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVersion(): number {
  return version;
}

export function readSessionUserId(): string | null {
  return safeGet(SESSION_KEY);
}

export function writeSessionUserId(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(SESSION_KEY, userId);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private mode or blocked storage: the session simply won't survive a reload.
  }
}

function persist() {
  if (!db) return;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (error) {
    const quota = error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
    throw new StorageError(quota ? "Le stockage local du navigateur est plein. Supprimez d'anciens certificats ou réinitialisez les données de démonstration." : "Impossible d'enregistrer les données dans ce navigateur.");
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
