import { FormEvent, useState } from "react";
import * as api from "../../api";
import { useMutation, useQuery } from "../../api/useQuery";
import { useSession } from "../../auth";
import { Alert, Badge, Button, Card, CopyButton, EmptyState, ErrorState, Field, Icon, Loading, Modal, PageHeader, Person, SelectField, UserStatusBadge, useConfirm, useToast } from "../../components/ui";
import { ADMIN_ROLE_LABEL } from "../../types";
import type { AdminRole, AdminUser } from "../../types";
import { formatDateTime } from "../../utils/format";

export default function AccountsPage() {
  const me = useSession();
  const admins = useQuery(() => api.listAdmins(), []);
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [credential, setCredential] = useState<{ user: AdminUser; password: string; reset?: boolean } | null>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const setStatus = useMutation(api.setAdminStatus);
  const reset = useMutation(api.resetAdminPassword);
  const remove = useMutation(api.deleteAdmin);

  const onToggle = async (u: AdminUser) => {
    const next = u.status === "active" ? "disabled" : "active";
    if (next === "disabled" && !(await confirm({ title: "Désactiver le compte", tone: "danger", confirmLabel: "Désactiver", message: <><strong>{u.firstName} {u.lastName}</strong> ne pourra plus se connecter.</> }))) return;
    const r = await setStatus.run(u.id, next);
    if (r.ok) toast(next === "active" ? "Compte réactivé." : "Compte désactivé.");
  };
  const onReset = async (u: AdminUser) => {
    if (!(await confirm({ title: "Réinitialiser le mot de passe", confirmLabel: "Réinitialiser", message: <>Générer un nouveau mot de passe temporaire pour <strong>{u.firstName} {u.lastName}</strong> ?</> }))) return;
    const r = await reset.run(u.id);
    if (r.ok) setCredential({ user: u, password: r.data, reset: true });
  };
  const onDelete = async (u: AdminUser) => {
    if (!(await confirm({ title: "Supprimer le compte", tone: "danger", confirmLabel: "Supprimer", message: <>Supprimer définitivement le compte de <strong>{u.firstName} {u.lastName}</strong> ?</> }))) return;
    const r = await remove.run(u.id);
    if (r.ok) toast("Compte supprimé.");
  };

  return (
    <>
      <PageHeader title="Comptes administrateurs" subtitle="Gérez les accès au service de scolarité" action={<Button icon="plus" onClick={() => setEditing("new")}>Nouveau compte</Button>} />
      {(setStatus.error || reset.error || remove.error) && <Alert tone="danger" onClose={() => { setStatus.clearError(); reset.clearError(); remove.clearError(); }}>{setStatus.error?.message ?? reset.error?.message ?? remove.error?.message}</Alert>}
      <Card>
        {admins.error ? <ErrorState message={admins.error} onRetry={admins.refetch} /> : !admins.data ? <Loading /> : admins.data.length === 0 ? <EmptyState icon="user" title="Aucun compte" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th>Actions</th></tr></thead>
              <tbody>
                {admins.data.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Nom"><Person firstName={u.firstName} lastName={u.lastName} sub={u.id === me.user.id ? "Vous" : undefined} /></td>
                    <td data-label="Email" className="muted">{u.email}</td>
                    <td data-label="Rôle"><Badge tone={u.role === "super-admin" ? "info" : "neutral"}>{ADMIN_ROLE_LABEL[u.role]}</Badge></td>
                    <td data-label="Statut"><UserStatusBadge status={u.status} /></td>
                    <td data-label="Dernière connexion" className="muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Jamais"}</td>
                    <td data-label="Actions">
                      <div className="actions">
                        <button type="button" className="icon-btn" onClick={() => onReset(u)} aria-label="Réinitialiser le mot de passe" title="Réinitialiser le mot de passe"><Icon name="key" size={17} /></button>
                        <button type="button" className="icon-btn edit" onClick={() => setEditing(u)} aria-label="Modifier" title="Modifier"><Icon name="edit" size={17} /></button>
                        {u.id !== me.user.id && <><button type="button" className="icon-btn" onClick={() => onToggle(u)} aria-label={u.status === "active" ? "Désactiver" : "Réactiver"} title={u.status === "active" ? "Désactiver" : "Réactiver"}><Icon name={u.status === "active" ? "ban" : "check"} size={17} /></button><button type="button" className="icon-btn delete" onClick={() => onDelete(u)} aria-label="Supprimer" title="Supprimer"><Icon name="trash" size={17} /></button></>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <AdminModal admin={editing === "new" ? null : editing} onClose={() => setEditing(null)} onCreated={(user, password) => { setEditing(null); setCredential({ user, password }); admins.refetch(); }} onSaved={() => { setEditing(null); admins.refetch(); }} />}
      {credential && (
        <Modal title={credential.reset ? "Mot de passe réinitialisé" : "Compte créé"} eyebrow={`${credential.user.firstName} ${credential.user.lastName}`.toUpperCase()} onClose={() => setCredential(null)} footer={<Button onClick={() => setCredential(null)}>Fermer</Button>}>
          <div className="confirm-body">
            <p>Transmettez ces identifiants. Le mot de passe ne sera plus affiché. L'administrateur devra le changer à sa première connexion.</p>
            <div className="credential"><span>Email</span><code>{credential.user.email}</code></div>
            <div className="credential"><span>Mot de passe temporaire</span><code>{credential.password}</code><CopyButton value={credential.password} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}

const EMPTY: api.AdminInput = { firstName: "", lastName: "", email: "", role: "staff" };

function AdminModal({ admin, onClose, onCreated, onSaved }: { admin: AdminUser | null; onClose: () => void; onCreated: (u: AdminUser, p: string) => void; onSaved: () => void }) {
  const editing = !!admin;
  const [form, setForm] = useState<api.AdminInput>(admin ? { firstName: admin.firstName, lastName: admin.lastName, email: admin.email, role: admin.role } : EMPTY);
  const create = useMutation(api.createAdmin);
  const update = useMutation((input: api.AdminInput) => api.updateAdmin(admin!.id, input));
  const toast = useToast();
  const mutation = editing ? update : create;
  const fieldError = (k: string) => (mutation.error?.field === k ? mutation.error.message : undefined);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (editing) {
      const r = await update.run(form);
      if (r.ok) { toast("Compte mis à jour."); onSaved(); }
    } else {
      const r = await create.run(form);
      if (r.ok) onCreated(r.data.admin, r.data.temporaryPassword);
    }
  };

  return (
    <Modal title={editing ? "Modifier le compte" : "Nouveau compte administrateur"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="confirm-body">
        {mutation.error && !mutation.error.field && <Alert tone="danger">{mutation.error.message}</Alert>}
        <div className="form-grid">
          <Field label="Nom" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} error={fieldError("lastName")} required autoFocus />
          <Field label="Prénom" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} error={fieldError("firstName")} required />
        </div>
        <Field label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={fieldError("email")} required />
        <SelectField label="Rôle" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))} error={fieldError("role")} hint="Le super administrateur gère comptes, paramètres et journal. L'agent gère étudiants, absences et certificats.">
          <option value="staff">{ADMIN_ROLE_LABEL.staff}</option>
          <option value="super-admin">{ADMIN_ROLE_LABEL["super-admin"]}</option>
        </SelectField>
        <div className="modal-foot inline-foot"><Button variant="secondary" onClick={onClose}>Annuler</Button><Button type="submit" loading={mutation.pending}>{editing ? "Enregistrer" : "Créer le compte"}</Button></div>
      </form>
    </Modal>
  );
}
