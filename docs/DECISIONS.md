# Décisions de la phase 1

Les choix importants, leurs raisons, et ce qui n'a pas pu être vérifié. Daté du 25 novembre 2026.

## Direction visuelle : « nuit violette », sur PrimeNG

Deuxième version, à ta demande : la première (« tableau des départs », papier et vert pelouse) est abandonnée.

- **Bibliothèque** : PrimeNG 20, avec le thème Aura réglé sur le violet de la marque (`src/app/theme.ts`).
  En service : boutons, autocomplétion du champ « Où ? », choix exclusifs (dates, rayon), champs, étiquettes,
  squelettes de chargement. Restent maison, parce que PrimeNG n'apporte rien de mieux : la puce de filtre
  (`appChip`), la carte de match, le panneau tirable et la carte MapLibre.
- **Couleurs** : surfaces claires et calmes (lavande très pâle en clair, bleu nuit violacé en sombre), et le
  violet en dégradé là où ça compte : bandeau d'accueil, bandeaux des pages, action principale, repères de la
  carte. Tokens dans `src/styles/_tokens.scss`.
- **Typographie** : Plus Jakarta Sans (variable), installée par npm et servie par le site. Titres gras et
  serrés, en bas de casse.
- **Formes** : angles ronds (10 à 24 px), boutons en pilule, ombres douces teintées de violet.
- **Contraste** : tous les couples texte/fond dépassent 4,5:1 dans les deux thèmes. axe le contrôle sur les
  fonds unis (`e2e/accessibilite.e2e.ts`) ; sur les dégradés, qu'axe ne sait pas mesurer, je l'ai calculé à
  la main sur l'arrêt le plus clair (blanc sur `#9333ea` : 5,4:1 ; lavande `#e9d5ff` sur le bandeau : 5,1:1).
- **Mobile** : la carte occupe l'écran, la liste est un panneau à trois crans (replié, mi-hauteur, plein
  écran) qu'on tire par sa poignée ; un appui bascule entre carte et liste.
- **Textes** : tous dans `src/app/core/i18n/messages.fr.ts`. Ajouter l'anglais revient à écrire un second
  dictionnaire du même type et à le fournir par le jeton `MESSAGES`. Les URL (`/stades`, `/matchs`) restent
  françaises pour l'instant.
- **Le prix de PrimeNG** : environ 35 Ko compressés de plus au chargement initial (134 Ko contre 97), et
  l'accueil passe de 97 à environ 91 en performance Lighthouse (mesure locale). Pour rester au-dessus de 90,
  le formulaire d'accueil est affiché par le rendu serveur et son code ne s'active qu'au repos du navigateur.
  Le seuil d'alerte du poids initial est relevé de 500 à 600 Ko dans `angular.json`.

## Carte : MapLibre GL et tuiles OpenFreeMap

- **MapLibre plutôt que Leaflet** : tuiles vectorielles, donc un fond clair et un fond sombre assortis au
  site, et de la marge pour regrouper les repères quand il y en aura des centaines. Le prix est le poids
  (environ 250 Ko compressés) : la bibliothèque et sa feuille de style ne sont chargées que dans le navigateur,
  quand la carte approche de l'écran ; sur une fiche stade, où la carte est secondaire, elle attend le
  premier geste du visiteur. Les repères sont de vrais boutons, utilisables au clavier.
- **OpenFreeMap** : pas de clé, pas de plafond de requêtes, usage commercial permis, attribution affichée par
  MapLibre. Le service est fourni sans garantie : les deux styles sont des variables (`MAP_STYLE_URL`,
  `MAP_STYLE_URL_DARK`), on peut changer de fournisseur sans toucher au code.
- **Si la carte ne s'affiche pas** (WebGL absent, réseau coupé), un message le dit et la liste reste utilisable.

## Rayon : en kilomètres

Le rayon est une distance à vol d'oiseau (10, 25, 50, 100, 200 km), calculée par PostGIS. Le temps de trajet
demanderait un service d'isochrones payant ou à héberger ; il viendra avec le premium (phase 4).

## Données

### Matchs : API-Football, une requête par journée

`/fixtures?date=…` renvoie tous les matchs du monde pour un jour. On synchronise 3 journées par heure, les
plus en retard d'abord, soit 72 requêtes sur les 100 du plan gratuit ; chacun des 21 prochains jours est
rafraîchi 3 à 4 fois par jour, les 3 premiers deux fois plus souvent. Les stades et les équipes sont déduits
des matchs. L'adresse et la capacité des stades viennent de `/venues?country=…`, 5 pays par nuit.

Autres sources gratuites écartées : football-data.org (12 compétitions seulement) et TheSportsDB (base
communautaire, accès gratuit très bridé).

### Coordonnées des stades : une cascade, avec source et confiance

| Rang | Source (`coords_source`) | Confiance  | Détail                                                                    |
| ---- | ------------------------ | ---------- | ------------------------------------------------------------------------- |
| 1    | `manual`                 | 1          | Table `venue_overrides`, toujours prioritaire                             |
| 2    | `provider`               | —          | Prévu si le fournisseur donne un jour des coordonnées ; inutilisé         |
| 3    | `wikidata`               | 0,7 à 1    | Propriété P625 ; note = type d'entité + nom + distance à la ville         |
| 4    | `nominatim`              | 0,6 à 0,75 | Seulement un objet « stade » ou « terrain », à moins de 60 km de la ville |
| 5    | `city`                   | 0,3        | Centre de la ville (GeoNames), affiché « Position approximative »         |

Une source moins fiable ne remplace jamais une source plus fiable. **Changement par rapport à ma proposition
initiale** : un stade sans coordonnées précises est placé au centre de sa ville et signalé comme approximatif,
au lieu d'être absent de la recherche. En divisions inférieures, c'est la différence entre voir le match ou non.

- **Wikidata** : API MediaWiki (`wbsearchentities` puis `wbgetentities`), licence CC0, User-Agent avec contact.
- **Nominatim** : politique relue le 25/11/2026 (operations.osmfoundation.org/policies/nominatim). 1 requête
  par seconde au plus, **4 par minute pour une tâche récurrente**, pas d'autocomplétion, résultats en cache.
  La fonction planifiée fait donc au plus 4 appels par quart d'heure ; le rattrapage initial se lance à la main.
- **GeoNames** (`cities15000`, CC BY 4.0) : autocomplétion des villes, fuseau horaire des stades (celui de la
  ville la plus proche), position de secours.

### Champ « Où ? »

Nominatim interdisant l'autocomplétion, les suggestions viennent de notre base (villes GeoNames et stades).
Une adresse ou un hôtel est géocodé une seule fois, à la validation, par la fonction `geocode` (origine
vérifiée, un seul paramètre, cache CDN et cache définitif en base). `GEOCODER_URL` permet de passer à une
instance Nominatim privée ou à un fournisseur compatible si le trafic grandit.

### Horaires

Tout est stocké en UTC et affiché **à l'heure locale du stade**. Une recherche « samedi » renvoie les matchs
du samedi là-bas, pas chez le visiteur. Sans fuseau connu, l'heure est affichée en UTC et étiquetée comme telle.

### Niveau des compétitions

API-Football ne donne pas le niveau. Il est déduit du nom (féminin, jeunes, coupe, divisions inférieures,
première division) dans `netlify/lib/transform.mjs`, avec une courte liste d'identifiants sûrs. Ce qui n'est
pas reconnu est rangé dans « Autres ». Une erreur se corrige en base : `level` puis `level_locked = true`.

## Rendu serveur

- Toutes les pages sont rendues à la demande par Angular SSR, dans une Edge Function Netlify
  (`@netlify/angular-runtime`). Les pages de contenu sont mises en cache 10 minutes par le CDN.
- Une fiche inconnue répond **404**. Les résultats de recherche sont en `noindex` et exclus par `robots.txt`.
- La configuration publique (URL Supabase, clé publique, styles de carte) est lue dans l'environnement par le
  serveur et jointe à la page : rien n'est figé au build.
- Les lectures sont des GET vers Supabase, rejouées depuis le cache de transfert après l'hydratation.
- **Pas de service worker** dans cette phase : le site est installable (manifeste, icônes) mais ne fonctionne
  pas hors ligne. Un cache hors ligne mal réglé sert des horaires périmés ; il viendra avec les voyages
  enregistrés.

## Structure des URL

| Page      | URL                                      | Slug                                              |
| --------- | ---------------------------------------- | ------------------------------------------------- |
| Recherche | `/voyage?lieu=&lat=&lng=&du=&au=&rayon=` | —                                                 |
| Match     | `/matchs/2026-03-14-lens-lille`          | date locale au stade + équipes                    |
| Stade     | `/stades/anfield-liverpool`              | nom + ville                                       |
| Club      | `/clubs/lens`                            | nom ; en cas d'homonyme, `nom-pays`, puis `nom-2` |

Les slugs sont calculés par la base à la création et **ne changent plus** : un match reporté garde son URL.

## Social

### Dès maintenant, sans compte

- **« J'y vais »** : un bouton sur chaque page match, et le nombre de personnes qui y vont sur les cartes.
  L'appareil reçoit un identifiant aléatoire au premier clic (jamais avant), gardé dans le navigateur ; il ne
  contient rien de personnel. Garde-fous côté base : match à venir uniquement, 40 matchs par appareil, 60 ajouts
  par jour et par adresse IP (dont on ne garde qu'une empreinte). Le compteur reste indicatif : sans compte,
  quelqu'un de décidé peut le gonfler. Quand les comptes arriveront, la colonne `user_id` rattachera ces lignes
  à leur propriétaire.
- **Partager** : feuille de partage du téléphone, sinon copie du lien. Les liens ont un titre, une description
  et une image d'aperçu (`og.png`, la même pour toutes les pages pour l'instant).
- **Ajouter au calendrier** : fichier `.ics` ; journée entière quand l'horaire n'est pas confirmé.

### Garde-fous posés avant d'ouvrir les comptes

Les comptes, le fil et les médailles restent à construire (phases 2 et 3) : je n'ai aucun moyen de tester
l'authentification Supabase d'ici, et un social à moitié vérifié est pire que pas de social. En revanche, ce
qui est pénible à ajouter après coup est en base et testé :

- **Profils privés** : visibles de leurs seuls abonnés.
- **Blocage** : rompt les abonnements dans les deux sens, rend les profils invisibles l'un à l'autre, empêche
  de se suivre à nouveau. La personne bloquée ne peut pas savoir par qui.
- **Signalement** : une fois par contenu et par personne ; un conseil signalé trois fois repasse en modération.
- **Check-in** : fonction `check_in`, la seule voie d'écriture. Fenêtre de 2 h avant à 3 h après le coup
  d'envoi, 750 m autour du stade, un par match, trois par jour. Si le stade n'a qu'une position approximative,
  le check-in est enregistré mais non vérifié. L'XP ne s'écrit pas depuis le navigateur.

## Solidité

- **Lectures** : délai maximal (8 s dans le navigateur, 4 s pendant le rendu serveur) et relances espacées sur
  les pannes passagères seulement. Les écritures ne sont jamais rejouées.
- **Base** : délai d'exécution de 8 s sur les fonctions de recherche ; rayon, période et nombre de résultats
  bornés quoi que demande l'appelant.
- **Fraîcheur** : si la dernière synchronisation réussie a plus de 24 h, les résultats affichent un
  avertissement. `/.netlify/functions/health` répond 503 au-delà de 6 h.
- **Alertes** : `ALERT_WEBHOOK_URL` reçoit un message quand une tâche de fond échoue, que le quota est épuisé
  ou que le plan refuse une requête.
- **API-Football** : une seule relance, sur panne passagère, pour ne pas brûler le quota.
- **Référencement** : `/sitemap.xml` liste les matchs à venir et les stades et clubs concernés. Sans lui, rien
  ne menait à ces pages (les résultats de recherche ne sont pas indexés). `robots.txt` l'annonce.
- **Migrations** : rejouées et testées en CI sur un vrai PostGIS (`supabase/tests/`).
- **En-têtes** : HSTS, anti-clickjacking, géolocalisation limitée au site. Pas de Content-Security-Policy
  pour l'instant : PrimeNG et Angular injectent des styles et un script d'état en ligne, et une CSP écrite
  sans pouvoir l'essayer sur Netlify casserait le site plus sûrement qu'elle ne le protégerait.

## Modèle de données

Utilisées en phase 1 : `places`, `competitions`, `venues`, `venue_overrides`, `teams`, `fixtures`,
`fixture_interest` (« J'y vais »), et les
tables de suivi (`sync_days`, `sync_runs`, `sync_countries`, `geocode_cache`). Créées vides et verrouillées
par RLS pour la suite : `profiles`, `checkins`, `badges`, `user_badges`, `follows`, `tips`, `trips`,
`blocks`, `reports`.
`venues.practical_info` attend les infos pratiques.

## Ce qui n'a pas pu être vérifié

Ce travail a été fait sans accès à Internet depuis l'environnement de développement, sans clé API-Football
et sans projet Supabase. Tout ce qui suit est donc écrit et testé avec des doubles, **pas constaté en vrai**.

1. **API-Football.** La forme des réponses (`/fixtures`, `/venues`), les noms des en-têtes de quota et les
   messages d'erreur viennent de la documentation et de ma mémoire. Surtout : je n'ai pas pu confirmer que le
   plan gratuit donne accès aux dates futures. S'il ne le permet pas, la synchronisation s'arrête proprement
   (`stopped: "plan"` dans `sync_runs`) et il faudra le plan Pro (19 $/mois). Premier test à faire :
   `npm run sync -- fixtures`.
2. **PostGIS.** Les migrations et leurs tests ont été exécutés ici sur Postgres 16 avec un remplaçant minimal
   des fonctions PostGIS. Le job `database` de la CI les rejoue sur un vrai PostGIS : son premier passage dira
   si quelque chose m'a échappé. Reste à constater sur Supabase même : les droits par défaut et les index.
3. **Netlify.** Le rendu serveur suit la documentation du runtime Angular de Netlify, et a été testé en
   local avec `scripts/serve-ssr.mjs`. Le déploiement lui-même, la lecture des variables dans l'Edge Function
   et les fonctions planifiées n'ont pas été essayés.
4. **Fond de carte.** MapLibre, les repères, le rayon et le cadrage sont testés avec un style local sans
   tuiles. Les URL des styles OpenFreeMap (`positron`, `dark`) n'ont pas pu être chargées d'ici.
5. **Wikidata et Nominatim.** Testés avec des réponses simulées. Les seuils de confiance sont un point de
   départ à ajuster sur les premiers résultats réels.
6. **Lighthouse.** Mesuré en local sur le build de production (mobile, plusieurs passages) : 90 à 92 en
   performance sur l'accueil, 95 sur une page stade, 100 en SEO et en accessibilité sur les deux.
   L'accueil est juste au-dessus de l'objectif : à refaire en ligne, où la latence réelle de Supabase et
   du CDN s'ajoute.
7. **Hôtes autorisés.** Les versions récentes d'Angular refusent de rendre une page pour un en-tête `Host`
   inconnu. `src/server.ts` reprend la liste fournie par Netlify ; pour un domaine personnalisé qui ne serait
   pas reconnu, ajoute-le dans `SSR_ALLOWED_HOSTS`. Non essayé sur Netlify.

## Limites connues

- Les noms de pays sont ceux d'API-Football, en anglais (« Belgium », « England »).
- Les écussons sont chargés depuis le CDN d'API-Football ; à copier dans le stockage Supabase si besoin.
- Une recherche couvre 21 jours au plus : au-delà, la base n'a pas encore les matchs.
- La liste est limitée à 400 matchs par recherche.
