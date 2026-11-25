# Spot the Game

**Tu pars quelque part ? Choisis tes dates, on te montre les matchs de foot que tu peux aller voir sur place.**

Spot the Game est une appli web pour les fans de foot qui voyagent et les groundhoppers : un lieu, des dates,
un rayon, et la carte de tous les matchs accessibles, toutes divisions confondues.

Site actuel : https://spotthegame.netlify.app

Le produit, sa roadmap et les phases suivantes sont décrits dans [`docs/BRIEF-FABLE.md`](docs/BRIEF-FABLE.md).
Les choix techniques et ce qui reste à vérifier sont dans [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Comment ça marche

```
API-Football ──(fonction planifiée)──▶ Supabase (Postgres + PostGIS) ◀──(lecture publique)── site Angular
Wikidata, Nominatim ──(coordonnées)──▶           ▲
GeoNames ──(villes, fuseaux)────────────────────┘
```

- **Le site ne parle jamais à API-Football.** Des fonctions planifiées remplissent la base ; le site lit la
  base (API REST de Supabase, clé publique, règles RLS en lecture seule).
- **Recherche** : la fonction SQL `search_fixtures` prend un point, un rayon, une période et renvoie les matchs
  avec leur distance.
- **Rendu serveur** (Angular SSR) pour l'accueil et les pages stade, match et club : elles sont indexables.
- **Interface** : PrimeNG (thème violet dans `src/app/theme.ts`) et MapLibre pour la carte.

## Démarrer en local

Prérequis : Node.js 22 (voir `.nvmrc`).

```bash
npm ci
cp .env.example .env      # puis remplis les variables (voir plus bas)
npm start                 # http://localhost:4200
```

**Sans projet Supabase**, tu peux quand même voir le site tourner avec un jeu de matchs de démonstration
autour de Lens (c'est aussi ce qu'utilisent les tests de bout en bout) :

```bash
node e2e/fake-supabase.mjs &
SUPABASE_URL=http://127.0.0.1:54399 SUPABASE_ANON_KEY=demo \
MAP_STYLE_URL=http://127.0.0.1:54399/style.json npm start
```

`npm run dev` (Netlify CLI) lance en plus les fonctions, dont le géocodage des adresses.

## Mettre la base en place

1. Crée un projet [Supabase](https://supabase.com/) et applique les migrations de `supabase/migrations/`
   (`supabase db push` avec la [CLI Supabase](https://supabase.com/docs/guides/cli), ou en les collant dans
   l'éditeur SQL, dans l'ordre).
2. Importe les villes GeoNames (autocomplétion du champ « Où ? », fuseaux horaires, position de secours des
   stades). Les commandes de téléchargement sont en tête de `scripts/import-places.mjs`, puis :
   ```bash
   npm run import:places -- tmp/geonames
   ```
3. Lance une première synchronisation :
   ```bash
   npm run sync -- fixtures --days 21   # 21 requêtes API-Football
   npm run sync -- coords --limit 200   # coordonnées précises des stades les plus demandés
   npm run sync -- venues --limit 10    # adresse et capacité, 1 requête par pays
   ```
4. Ensuite, les fonctions planifiées Netlify prennent le relais.

### Synchronisation planifiée

| Fonction        | Fréquence         | Rôle                                                                                                |
| --------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `sync-fixtures` | toutes les heures | 3 journées de matchs par passage, les plus en retard d'abord (72 req./j)                            |
| `locate-venues` | toutes les 15 min | Coordonnées de quelques stades : Wikidata, puis Nominatim (4 req. max)                              |
| `sync-venues`   | chaque nuit       | Adresse et capacité des stades de 5 pays (5 req./j)                                                 |
| `geocode`       | à la demande      | Adresse ou hôtel saisi par un visiteur, à la validation du formulaire                               |
| `health`        | à la demande      | État du service pour un outil de surveillance : 200 si la synchronisation a moins de 6 h, 503 sinon |

Le quota API-Football est suivi à chaque appel (en-têtes de réponse) et journalisé dans la table `sync_runs` ;
la synchronisation s'arrête avant d'entamer une réserve de 10 requêtes.

**Surveillance.** Branche un outil de surveillance (UptimeRobot, Better Stack…) sur
`/.netlify/functions/health`, et renseigne `ALERT_WEBHOOK_URL` pour être prévenu dès qu'une synchronisation
casse. Sans cela, une panne ne se voit que lorsque les matchs sont déjà périmés ; le site affiche alors
lui-même un avertissement au-dessus des résultats.

Corriger les coordonnées d'un stade à la main : ajoute une ligne dans `venue_overrides`
(`source_key`, `lat`, `lng`). Elle l'emporte sur toutes les sources automatiques.

## Tester la base

Les migrations sont rejouées sur un vrai PostGIS à chaque push (job `database` de la CI), puis vérifiées
par les tests de `supabase/tests/` : ingestion, recherche, droits, « J'y vais », blocage, signalement, check-in.
En local, avec Docker :

```bash
docker run -d --name stg-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgis/postgis:16-3.4
export PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres PGOPTIONS="-c search_path=public,extensions"
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/00_bootstrap.sql
for f in supabase/migrations/*.sql supabase/tests/[1-9]*.sql; do psql -v ON_ERROR_STOP=1 -q -f "$f"; done
```

## Scripts

| Commande                 | Rôle                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `npm start`              | Site en local, rendu serveur compris (lit `.env`)                     |
| `npm run dev`            | Site + fonctions Netlify en local (Netlify CLI)                       |
| `npm run build`          | Build de production dans `dist/football-gh`                           |
| `npm run serve:ssr`      | Sert le build de production en local (après `npm run build`)          |
| `npm test`               | Tests unitaires du front (Chrome headless)                            |
| `npm run test:functions` | Tests des fonctions serveur et de la synchronisation                  |
| `npm run e2e`            | Build puis tests de bout en bout et d'accessibilité (Playwright)      |
| `npm run lint`           | ESLint                                                                |
| `npm run format`         | Formatage Prettier                                                    |
| `npm run check`          | Lint, format, tests unitaires et build : à lancer avant chaque commit |
| `npm run sync`           | Synchronisation manuelle (`fixtures`, `coords`, `venues`)             |
| `npm run import:places`  | Import des villes GeoNames                                            |

Les tests de bout en bout utilisent le Chrome installé sur la machine. Sans Chrome :
`npx playwright install chromium` puis `PW_CHANNEL=chromium npm run e2e`.

## Variables d'environnement

À définir dans Netlify (et dans `.env` en local). Aucune n'est écrite dans le code.

| Variable                    | Obligatoire | Utilisée par    | Rôle                                                                                         |
| --------------------------- | ----------- | --------------- | -------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | oui         | site, fonctions | URL du projet Supabase                                                                       |
| `SUPABASE_ANON_KEY`         | oui         | site            | Clé publique (lecture seule, protégée par RLS)                                               |
| `SUPABASE_SERVICE_ROLE_KEY` | oui         | fonctions       | Clé d'écriture. **Secrète** : ne jamais l'exposer au navigateur                              |
| `API_FOOTBALL_KEY`          | oui         | fonctions       | Clé API-Football. **Secrète**                                                                |
| `CONTACT_EMAIL`             | oui         | fonctions       | Contact envoyé à Wikidata et Nominatim (exigé par leurs conditions)                          |
| `SITE_URL`                  | non         | site, fonctions | Origine publique (URL canoniques). Par défaut : `URL` de Netlify                             |
| `ALLOWED_ORIGINS`           | non         | `geocode`       | Origines autorisées en plus de l'URL du site (séparées par virgules)                         |
| `GEOCODER_URL`              | non         | fonctions       | Instance Nominatim à utiliser à la place du service public                                   |
| `SSR_ALLOWED_HOSTS`         | non         | site            | Domaines servis en plus de ceux du déploiement Netlify (virgules)                            |
| `ALERT_WEBHOOK_URL`         | non         | fonctions       | Webhook Slack ou Discord prévenu quand une synchronisation échoue ou que le quota est épuisé |
| `MAP_STYLE_URL`             | non         | site            | Style de carte clair (par défaut : OpenFreeMap Positron)                                     |
| `MAP_STYLE_URL_DARK`        | non         | site            | Style de carte sombre (par défaut : OpenFreeMap Dark)                                        |
| `SYNC_DAYS_AHEAD`           | non         | `sync-fixtures` | Jours synchronisés à l'avance (21)                                                           |
| `SYNC_DAYS_PER_RUN`         | non         | `sync-fixtures` | Journées rafraîchies par passage (3)                                                         |
| `SYNC_QUOTA_RESERVE`        | non         | `sync-fixtures` | Requêtes API-Football gardées en réserve (10)                                                |

Le site reçoit sa configuration du serveur au moment du rendu : changer une variable ne demande pas de
reconstruire, seulement de redéployer.

## Organisation du code

```
src/app/core/        logique pure et services : périodes, filtres, formats, URL, accès aux données, SEO
src/app/features/    une page par dossier : home, trip (mode Voyage), match, venue, team, not-found
src/app/shared/      briques d'interface : ui/ (champ, puce, écusson), match-card, search, map
src/app/theme.ts     thème PrimeNG de la marque
src/styles/          design system : tokens, styles de base, réglages PrimeNG, feuille de la carte
netlify/functions/   fonctions planifiées et géocodage
netlify/lib/         code serveur partagé (client API-Football, transformation, Wikidata, Nominatim)
supabase/migrations/ schéma de la base, versionné
scripts/             synchronisation manuelle, import GeoNames, serveur local du build
e2e/                 tests de bout en bout et faux Supabase
tests/functions/     tests du code serveur
```

## Contribuer

Les conventions de code sont dans [`CLAUDE.md`](CLAUDE.md). Avant chaque commit : `npm run check`.

## Crédits

Matchs : [API-Football](https://www.api-football.com/). Coordonnées des stades :
[Wikidata](https://www.wikidata.org/) (CC0) et [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL).
Villes : [GeoNames](https://www.geonames.org/) (CC BY 4.0). Fond de carte : [OpenFreeMap](https://openfreemap.org/),
© OpenMapTiles, données © les contributeurs d'OpenStreetMap.
