# UniAbsence — plateforme d'administration des absences

Application d'administration universitaire pour la gestion des absences : étudiants, absences,
certificats, étudiants à risque, rapports, imports, comptes administrateurs et journal d'activité.
Réservée au service de scolarité (pas d'accès étudiant ni enseignant).

React 19 + Vite 8 + TypeScript. Le front-end parle à une **couche API unique** (`src/api/`), aujourd'hui
implémentée sur le `localStorage` du navigateur. Un backend réel se branche en réimplémentant ce seul
module : voir `API_CONTRACT.md`.

## Démarrer

```bash
npm install
npm run dev        # http://localhost:8443
npm run typecheck  # tsc --noEmit
npm run build      # production dans dist/
```

Node 22 (`.mise.toml`). `pnpm` fonctionne aussi.

## Comptes de démonstration

| Rôle | Email | Mot de passe |
| --- | --- | --- |
| Super administrateur | admin@univ.tn | Admin123! |
| Agent de scolarité | agent@univ.tn | Agent123! |

Le super administrateur accède à tout. L'agent gère étudiants, absences, certificats, imports, rapports
et matières, mais pas les comptes admin, les paramètres ni le journal.

## Fonctionnalités

- **Tableau de bord** : effectifs, certificats en attente, étudiants à risque, absences du mois, graphe
  mensuel par année universitaire, activité récente, top des cas à surveiller.
- **Étudiants** : recherche, filtres (filière/niveau/groupe), pagination, ajout/édition, suppression,
  sélection multiple pour suppression en lot, export CSV de la liste filtrée.
- **Absences** : onglets par statut, filtres, fiche détaillée (aperçu du certificat, validation/refus,
  décision manuelle, suppression), saisie manuelle, **actions en lot** (justifier / non justifier /
  supprimer), export CSV.
- **Certificats** : file des justificatifs à traiter, validation ou refus motivé, dépôt pour un étudiant.
- **Étudiants à risque** : moteur de seuils (par matière et global, configurables), page dédiée filtrable,
  **génération d'une mise en garde** par étudiant (texte prêt à copier + impression / PDF).
- **Rapports** : analyse par année, filière, niveau, matière, période ; graphes par mois, matière, groupe ;
  classement des étudiants les plus absents ; **export Excel (CSV)**.
- **Importer** : CSV d'étudiants et d'absences, avec modèle téléchargeable, **prévisualisation ligne par
  ligne** (erreurs et doublons signalés) puis confirmation.
- **Comptes admin** (super admin) : création (mot de passe temporaire), édition, activation/désactivation,
  réinitialisation de mot de passe, suppression — avec garde « au moins un super admin actif ».
- **Paramètres** (super admin) : nom de l'établissement, seuils d'alerte, début d'année universitaire,
  listes des filières / niveaux / groupes, réinitialisation des données de démonstration.
- **Journal d'activité** (super admin) : historique complet et filtrable de toutes les actions.
- **Transversal** : connexion réelle (mot de passe haché), session conservée au rechargement, changement
  de mot de passe imposé à la première connexion, contrôle d'accès par rôle.

## Architecture

```
src/
  types.ts              Modèle de données + constantes partagées
  data/seed.ts          Jeu de démonstration déterministe + listes par défaut
  api/
    index.ts            L'API applicative (le contrat — voir API_CONTRACT.md)
    db.ts               Persistance localStorage + abonnement React
    crypto.ts           Hachage de mot de passe (démo ; à remplacer côté serveur)
    useQuery.ts         useQuery / useMutation / useDebounced
  router.ts routes.ts   Routeur par hash + navigation
  auth.tsx              Contexte de session (rôle super-admin / staff)
  components/           ui.tsx (primitives), Shell, tables, fiche d'absence, upload, recherche
  utils/                format.ts, csv.ts (parse/export CSV + modèles)
  pages/                Login, Account, admin/* (Dashboard, Students, Absences, Certificates,
                        AtRisk, Reports, Import, Subjects, Teachers, Accounts, Audit, Settings)
  index.css             Styles (CSS maison ; Tailwind installé mais non utilisé)
```

## Brancher le backend

Tout passe par `src/api/index.ts`. Réimplémenter ses fonctions avec des appels HTTP (mêmes signatures,
mêmes types, mêmes erreurs `ApiError(message, field?)`), déplacer le hachage des mots de passe et le
journal d'activité côté serveur, et stocker les fichiers de certificats sur le serveur. Les écrans
n'importent que `src/api` et `src/types` : aucune page ne change. Détails dans `API_CONTRACT.md`.

### Limites de la version locale

Données propres à un navigateur (non partagées). Aperçu des certificats conservé seulement sous 1,5 Mo
(quota localStorage). Les contrôles de droits côté client sont fonctionnels, pas sécuritaires : la
sécurité réelle est la responsabilité du backend.
