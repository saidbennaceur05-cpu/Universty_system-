import { useCallback, useEffect, useState } from "react";

// Minimal hash router: "#/admin/students/42/edit" → path "/admin/students/42/edit".
// Hash routing keeps the app servable from any static host (Figma Make preview, GitHub Pages…)
// without server-side rewrites, and makes refresh + back/forward work.

function readPath(): string {
  const raw = window.location.hash.replace(/^#/, "");
  return raw.startsWith("/") ? raw : "/" + raw;
}

export function useHashRoute() {
  const [path, setPath] = useState(readPath);
  useEffect(() => {
    const onChange = () => setPath(readPath());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((to: string, replace = false) => {
    const target = "#" + (to.startsWith("/") ? to : "/" + to);
    if (replace) window.location.replace(target);
    else window.location.hash = target;
  }, []);
  return { path, navigate };
}

export function navigate(to: string, replace = false) {
  const target = "#" + (to.startsWith("/") ? to : "/" + to);
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

/** matchRoute("/admin/students/:id/edit", "/admin/students/42/edit") → { id: "42" } ; null if no match. */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("?")[0].split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function queryParams(path: string): URLSearchParams {
  const idx = path.indexOf("?");
  return new URLSearchParams(idx >= 0 ? path.slice(idx + 1) : "");
}
