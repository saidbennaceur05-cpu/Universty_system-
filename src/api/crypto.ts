// Password hashing for the local version. SHA-256 through WebCrypto when the page runs in a
// secure context (https or localhost); a non-cryptographic fallback otherwise so the demo still
// works over a LAN IP. A real backend must do this server-side with bcrypt/argon2 instead.

const SALT = "uniabsence::";

export async function hashPassword(password: string): Promise<string> {
  const input = SALT + password;
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return "sha256:" + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "fnv:" + fnv1a(input);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const scheme = stored.split(":")[0];
  const candidate = scheme === "fnv" ? "fnv:" + fnv1a(SALT + password) : await hashPassword(password);
  return candidate === stored;
}

/** "Univ-XXXX-XXXX": each block mixes letters and digits so the password policy always holds. */
export function generateTemporaryPassword(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const c = globalThis.crypto as Crypto | undefined;
  const randomInt = (max: number) => {
    if (c && typeof c.getRandomValues === "function") {
      const v = new Uint32Array(1);
      c.getRandomValues(v);
      return v[0] % max;
    }
    return Math.floor(Math.random() * max);
  };
  const block = () => {
    const chars = [letters[randomInt(letters.length)], letters[randomInt(letters.length)], digits[randomInt(digits.length)], (letters + digits)[randomInt(letters.length + digits.length)]];
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
  };
  return `Univ-${block()}-${block()}`;
}

export function newId(prefix: string): string {
  const c = globalThis.crypto as Crypto | undefined;
  const rnd = c && typeof c.randomUUID === "function" ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
