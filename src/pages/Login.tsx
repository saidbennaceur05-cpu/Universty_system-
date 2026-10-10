import { FormEvent, useState } from "react";
import { useAuth } from "../auth";
import { Alert, Button, Field, Icon } from "../components/ui";
import { UniversityMark } from "../components/Shell";
import { DEMO_ACCOUNTS } from "../data/seed";
import { navigate } from "../router";
import { homeFor } from "../routes";

export default function Login() {
  const { login } = useAuth();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!email.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const session = await login(email.trim(), password);
      navigate(session.user.mustChangePassword ? "/account/password?first=1" : homeFor(session.user.role), true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-decoration decoration-one" />
      <div className="login-decoration decoration-two" />
      <section className="login-card">
        <UniversityMark compact />
        <div className="login-copy">
          <span className="eyebrow">PORTAIL UNIVERSITAIRE</span>
          <h1>Connexion</h1>
          <p>Étudiants, enseignants et administration : accédez à votre espace de gestion des absences.</p>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <form onSubmit={submit} noValidate>
          <Field label="Email" type="email" autoComplete="username" placeholder="prenom.nom@univ.tn" value={email} onChange={(e) => setEmail(e.target.value)} error={touched && !email.trim() ? "Veuillez saisir votre email." : undefined} />
          <Field
            label="Mot de passe"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Saisissez votre mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={touched && !password ? "Veuillez saisir votre mot de passe." : undefined}
            right={<button type="button" className="input-icon" onClick={() => setShow(!show)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}><Icon name={show ? "eyeOff" : "eye"} size={19} /></button>}
          />
          <Button type="submit" loading={loading} className="login-button">{loading ? "Connexion..." : "Se connecter"}</Button>
        </form>
        <div className="demo-accounts">
          <span className="demo-title">Comptes de démonstration</span>
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.email} type="button" className="demo-account" onClick={() => { setEmail(a.email); setPassword(a.password); setError(null); }}>
              <span><strong>{a.label}</strong><small>{a.email}</small></span>
              <span className="demo-fill">Remplir</span>
            </button>
          ))}
        </div>
        <p className="secure-note">Données stockées localement dans ce navigateur (version de démonstration)</p>
      </section>
      <p className="login-footer">© 2026 Université · Service de gestion académique</p>
    </main>
  );
}
