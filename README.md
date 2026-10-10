# UniAbsence

Gestion des absences universitaires : l'administration gère étudiants, enseignants, matières, absences et certificats ; les enseignants font l'appel ; les étudiants suivent leurs absences et déposent leurs justificatifs.

Application React 19 + Vite 8 + TypeScript. Cette version fonctionne **sans serveur** : toutes les données vivent dans le `localStorage` du navigateur, derrière une couche API asynchrone (`src/api/`) conçue pour être remplacée par un vrai backend sans toucher aux écrans.

## Démarrer

```bash
npm install
npm run dev        # http://localhost:8443
npm run typecheck  # tsc --noEmit
npm run build      # production dans dist/
```

Node 22 (voir `.mise.toml`). `pnpm` fonctionne aussi (`pnpm-lock.yaml` est présent).

## Comptes de démonstration

| Rôle | Email | Mot de passe |
| --- | --- | --- |
| Administration | admin@univ.tn | Admin123! |
| Enseignant (Dr. Amine Larbi) | a.larbi@univ.tn | Prof123! |
| Étudiante (Lina Benali) | lina.benali@etu.univ.tn | Etud123! |

Les autres enseignants du jeu de données utilisent `Prof123!`, les étudiants `Etud123!` (adresse `prenom.nom@etu.univ.tn`). Le compte de M. Karim Jebali est désactivé pour illustrer ce cas. « Mon compte » (admin) permet de réinitialiser les données de démonstration.

## Ce que fait chaque rôle

**Administration** : tableau de bord calculé (effectifs, certificats en attente, absences par mois sur l'année universitaire choisie, étudiants à surveiller, activité récente), CRUD étudiants avec recherche, filtres, pagination et création de compte (mot de passe temporaire à changer à la première connexion), comptes enseignants (matières attribuées, activation/désactivation, réinitialisation de mot de passe, suppression bloquée si des séances existent), catalogue des matières, liste des absences filtrable avec fiche détaillée, saisie manuelle d'une absence, file des certificats à valider ou refuser (motif obligatoire), dépôt d'un certificat au nom d'un étudiant.

**Enseignant** : tableau de bord de ses matières, appel par séance (matière, groupe, date, horaire, étudiants absents) avec reprise et correction d'une séance existante, liste de ses séances, consultation des absences dans ses matières. Les absences déjà justifiées ou en attente sont verrouillées lors d'une correction d'appel.

**Étudiant** : tableau de bord avec seuil d'alerte par matière (3 absences non justifiées), liste de ses absences, dépôt d'un justificatif (PDF/JPG/PNG, 5 Mo max, une ou plusieurs absences couvertes par le même document, période contrôlée), suivi des justificatifs, retrait d'un justificatif encore en attente.

**Tous** : connexion réelle (mot de passe haché), session conservée au rechargement, changement de mot de passe, garde par rôle sur les routes.

## Architecture

```
src/
  types.ts                  Modèle de données (User, Student, Teacher, Subject, Session, Absence, Certificate, Activity)
  data/seed.ts              Jeu de démonstration déterministe + filières/niveaux/groupes
  api/
    db.ts                   Persistance localStorage, versionnage, abonnement pour React
    crypto.ts               Hachage des mots de passe (SHA-256 WebCrypto), génération d'identifiants
    index.ts                L'API applicative : auth, étudiants, enseignants, matières, séances/appel,
                            absences, certificats, statistiques. Tout est async et renvoie des données simples.
    useQuery.ts             Hooks useQuery / useMutation / useDebounced
  router.ts                 Routeur par hash (#/admin/students/42/edit), compatible hébergement statique
  routes.ts                 Menus par rôle
  auth.tsx                  Contexte de session
  components/               UI partagée (ui.tsx), Shell (sidebar/topbar), tables d'absences,
                            fiche d'absence/certificat, recherche d'étudiant, formulaire de dépôt
  pages/                    Login, Account, admin/, teacher/, student/
  index.css                 Styles (CSS maison ; Tailwind est installé mais non utilisé)
```

### Brancher un vrai backend

Réimplémenter les fonctions de `src/api/index.ts` avec `fetch` vers une API REST (mêmes signatures, mêmes types de retour) et remplacer `db.ts` par la gestion du jeton de session. Les écrans n'importent que `src/api` et `src/types`. Le hachage des mots de passe doit alors se faire côté serveur (bcrypt/argon2), le `crypto.ts` local n'est qu'un substitut de démonstration.

### Limites connues de la version locale

Les données ne sont pas partagées entre navigateurs ni entre postes. L'aperçu d'un certificat n'est conservé que pour les fichiers de 1,5 Mo ou moins (quota du `localStorage`) ; les fichiers plus lourds sont acceptés mais seules leurs métadonnées sont gardées. Les contrôles de droits sont faits côté client et n'ont donc qu'une valeur fonctionnelle, pas sécuritaire.
