# Spot the Game — instructions pour Claude

## Le produit

Spot the Game aide les fans de foot qui voyagent à **trouver les matchs à voir autour d'eux**, partout dans le monde.
Le cœur du produit est le **mode Voyage** : un lieu (ville, hôtel, position) + des dates + un rayon (en km pour l'instant)
→ une carte et une liste de tous les matchs accessibles, toutes divisions confondues.

Viendront ensuite, en s'appuyant dessus : comptes, check-ins géolocalisés au stade, XP, niveaux, médailles,
réseau social (suivre des hoppers, « Qui y va ? »), fiches pratiques par stade, puis monétisation
(premium, affiliation train/hôtel, offre B2B pour les clubs).

- Public : voyageurs curieux et groundhoppers, débutants inclus. Ton direct, tutoiement, français d'abord.
- Périmètre : monde entier.
- Vision complète et roadmap : `docs/BRIEF-FABLE.md`.

## Stack

- Angular 20 (composants standalone, signals, nouveau control flow), SCSS, Zone.js, rendu serveur (`@angular/ssr`).
- Données : Supabase (Postgres + PostGIS). Le site lit la base par son API REST avec la clé publique ;
  **il n'appelle jamais API-Football**. Des fonctions planifiées (`netlify/functions`) remplissent la base.
- Interface : PrimeNG 20 (thème Aura réglé dans `src/app/theme.ts`), police Plus Jakarta Sans.
- Carte : MapLibre GL, chargée à la demande, tuiles OpenFreeMap.
- Hébergement : Netlify (site, rendu serveur en Edge Function, fonctions planifiées).
- Tests : Jasmine/Karma (front), `node:test` (code serveur), Playwright + axe (bout en bout, accessibilité).
- Les raisons de ces choix sont dans `docs/DECISIONS.md`.

## Commandes

```bash
npm ci                 # installer
npm start              # site en local avec rendu serveur (lit .env)
npm run dev            # site + fonctions Netlify (Netlify CLI)
npm test               # tests unitaires front (Chrome headless)
npm run test:functions # tests du code serveur (synchronisation, géocodage)
npm run e2e            # build + tests de bout en bout et d'accessibilité (Playwright)
npm run lint           # ESLint (règles Angular + conventions ci-dessous)
npm run format         # Prettier
npm run check          # lint, format, tests unitaires, build : à lancer avant chaque commit
npm run sync -- fixtures|coords|venues   # synchronisation manuelle
```

Pour faire tourner le site sans base : `node e2e/fake-supabase.mjs` (voir le README).

## Organisation du code

```
src/app/
  core/       services, état (signals), modèles, utilitaires purs — sans dépendance à l'UI
    i18n/     tous les textes de l'interface (messages.fr.ts)
  features/   une page par dossier, chargée en lazy loading depuis app.routes.ts
  shared/     composants réutilisables : ui/ (champ, puce, écusson), match-card, search, map
  theme.ts    thème PrimeNG de la marque
src/styles/   design system : tokens (variables CSS), base, réglages PrimeNG, feuille de la carte
netlify/functions/  fonctions planifiées et géocodage, exposées sous /.netlify/functions/*
netlify/lib/        code serveur partagé, sans E/S dans les fonctions de transformation
supabase/migrations/ schéma de la base : toute modification passe par une nouvelle migration
supabase/tests/     tests SQL des migrations, rejoués en CI sur un vrai PostGIS
tests/functions/    tests du code serveur (hors du dossier déployé, sinon Netlify les publie)
e2e/                tests Playwright et faux Supabase
```

## Conventions (vérifiées par `npm run lint` quand c'est possible)

- Composants standalone sans `standalone: true` (valeur par défaut), `ChangeDetectionStrategy.OnPush` partout.
- État : `signal()` pour l'état, `computed()` pour le dérivé, jamais de méthode qui recalcule à chaque rendu.
  Les signals exposés sont `readonly` (ou `asReadonly()`).
- `inject()` plutôt que l'injection par constructeur ; `input()` / `output()` plutôt que les décorateurs.
- Bindings d'hôte dans l'objet `host` du décorateur, pas `@HostListener` / `@HostBinding`.
- Templates : `@if` / `@for` / `@switch`, pas de `*ngIf` / `*ngFor` ; pas de `ngClass` / `ngStyle`.
- Pas de `any` ; `unknown` si le type est réellement inconnu.
- Pas de `console.log` ; `console.error` seulement pour une vraie erreur, côté serveur de préférence.
- La logique métier (filtres, calculs de dates, distances, XP, badges…) vit dans des fonctions pures ou des services
  de `core/`, avec des tests unitaires. Les composants restent minces.
- Textes visibles en français, clairs et courts. Messages d'erreur utiles (« quoi faire »), jamais techniques.
  Aucun texte en dur dans les composants : tout passe par `core/i18n/messages.fr.ts` (jeton `MESSAGES`).
- Design system : n'utiliser que les tokens de `src/styles/_tokens.scss` (pas de couleur ni d'espacement en dur).
  Prendre d'abord un composant PrimeNG (`pButton`, `p-autocomplete`, `p-selectbutton`, `p-tag`…), importé
  un par un, puis les briques maison (`appChip`, `app-field`, `app-match-card`) ; n'en créer une nouvelle
  qu'en dernier recours. Les réglages de PrimeNG vont dans `src/app/theme.ts` et `src/styles/_components.scss`,
  jamais dans le style d'une page.
- Le dégradé violet (`--gradient`, `--gradient-hero`) est réservé à l'accueil, aux bandeaux des pages, à
  l'action principale et aux repères de la carte. Tout texte posé dessus est blanc ou `--on-hero-soft`.
- Rendu serveur : pas d'accès à `window`, `document` ou `navigator` hors de `afterNextRender` ou d'un garde
  `isPlatformBrowser`. Les lectures de données sont des GET (rejouées depuis le cache de transfert).
- Dates : les horaires s'affichent à l'heure locale du stade (`core/local-time.ts`), jamais celle du visiteur.
- Accessibilité : labels sur tous les champs, focus visible, contraste AA, `aria-live` pour les résultats.

## Règles sur les données et l'API

- Le navigateur ne lit que Supabase (clé publique, RLS en lecture seule) et nos propres fonctions.
  Les clés `SUPABASE_SERVICE_ROLE_KEY` et `API_FOOTBALL_KEY` ne quittent jamais le serveur ni le dépôt.
- Tout appel à un fournisseur externe passe par `netlify/lib`, avec des routes et paramètres **listés
  explicitement** et validés. Ne jamais relayer une requête arbitraire ni renvoyer `Access-Control-Allow-Origin: *`.
- Une fonction appelée par le navigateur garde son URL `/.netlify/functions/<nom>` : le rendu serveur
  intercepte tous les autres chemins.
- Ne pas géocoder depuis le navigateur, ni utiliser Nominatim pour de l'autocomplétion (interdit par sa
  politique). Nominatim : 1 requête/s, 4/min pour les tâches récurrentes, User-Agent avec contact, résultats
  mis en cache en base.
- Penser au quota API-Football (100 requêtes/jour) : une requête par journée de matchs, jamais par compétition
  ni par match. Le budget est détaillé en tête de `netlify/lib/sync-fixtures.mjs`.
- Toute nouvelle table a ses règles RLS dans la même migration, et un test dans `supabase/tests/` qui
  prouve ce qu'un visiteur et un autre membre ne peuvent PAS faire.
- Les lectures passent par `DataApi.get` (délai et relances) ; une écriture n'est jamais rejouée
  automatiquement.
- Social : rien ne s'écrit depuis le navigateur sans passer par une fonction SQL qui valide (compteurs,
  check-in, XP). Tout contenu publié par un membre doit pouvoir être signalé et son auteur bloqué. Les fonctions SQL d'écriture sont
  `security definer`, réservées à `service_role`.

## Ce qu'il ne faut pas faire

- Ajouter des fichiers de règles pour d'autres assistants (`.cursor`, `.gemini`…) : ce fichier est la seule source.
- Committer des fichiers de sauvegarde, du code mort, des données de test dans `src/assets`, ou des secrets.
- Installer une dépendance sans l'utiliser dans le même changement.
- Laisser des commentaires « TEMP », « debug » ou du code commenté.

## Définition de « terminé »

`npm run check` passe, la fonctionnalité a des tests sur sa logique, l'interface fonctionne sur mobile (375 px)
et sur desktop, `npm run e2e` passe si une page ou le parcours de recherche a changé, et le README est à jour
si une commande ou une variable d'environnement a changé.
Commits courts et descriptifs, en français, un sujet par commit.
