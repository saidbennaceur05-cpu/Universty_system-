import { FormEvent, useState } from "react";
import { useAuth, useSession } from "../auth";
import { Alert, Button, Card, Field, Icon, PageHeader, useToast } from "../components/ui";
import { useMutation } from "../api/useQuery";
import * as api from "../api";
import { ADMIN_ROLE_LABEL } from "../types";
import { formatDateTime } from "../utils/format";
import { navigate } from "../router";

export function ChangePasswordForm({ first = false, onDone }: { first?: boolean; onDone?: () => void }) {
  const { setSession } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const toast = useToast();
  const { run, pending, error } = useMutation(api.changePassword);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (next !== confirm) {
      setLocalError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    const r = await run(current, next);
    if (r.ok) {
      setSession(r.data);
      toast("Mot de passe modifié.");
      setCurrent("");
      setNext("");
      setConfirm("");
      onDone?.();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="stack">
      {first && <Alert tone="info">Vous utilisez un mot de passe temporaire. Choisissez-en un nouveau pour continuer.</Alert>}
      {error && !error.field && <Alert tone="danger">{error.message}</Alert>}
      {localError && <Alert tone="danger">{localError}</Alert>}
      {!first && <Field label="Mot de passe actuel" type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={error?.field === "current" ? error.message : undefined} required />}
      <Field label="Nouveau mot de passe" type={show ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint="8 caractères minimum, lettres et chiffres." error={error?.field === "next" ? error.message : undefined} required right={<button type="button" className="input-icon" onClick={() => setShow(!show)} aria-label={show ? "Masquer" : "Afficher"}><Icon name={show ? "eyeOff" : "eye"} size={19} /></button>} />
      <Field label="Confirmer le nouveau mot de passe" type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      <div className="form-actions"><Button type="submit" loading={pending} icon="key">{first ? "Enregistrer et continuer" : "Modifier le mot de passe"}</Button></div>
    </form>
  );
}

export function FirstPasswordPage() {
  const session = useSession();
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-copy"><span className="eyebrow">PREMIÈRE CONNEXION</span><h1>Bienvenue, {session.user.firstName}</h1><p>Définissez votre mot de passe personnel.</p></div>
        <ChangePasswordForm first onDone={() => navigate("/", true)} />
      </section>
    </main>
  );
}

export default function AccountPage() {
  const { user } = useSession();
  return (
    <>
      <PageHeader title="Mon compte" subtitle="Vos informations et la sécurité de votre accès" />
      <div className="two-col">
        <Card className="form-card">
          <h3 className="card-h">Profil</h3>
          <div className="info-list compact">
            <div><span>Nom</span><strong>{user.firstName} {user.lastName}</strong></div>
            <div><span>Email</span><strong>{user.email}</strong></div>
            <div><span>Rôle</span><strong>{ADMIN_ROLE_LABEL[user.role]}</strong></div>
            {user.lastLoginAt && <div><span>Dernière connexion</span><strong>{formatDateTime(user.lastLoginAt)}</strong></div>}
            <div><span>Compte créé le</span><strong>{formatDateTime(user.createdAt)}</strong></div>
          </div>
          <p className="muted small">Votre rôle et vos informations sont gérés par un super administrateur.</p>
        </Card>
        <Card className="form-card">
          <h3 className="card-h">Mot de passe</h3>
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  );
}
