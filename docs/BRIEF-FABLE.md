# Brief de refonte — Spot the Game

Ce document est le point de départ de la refonte. Lis aussi `CLAUDE.md` (conventions, commandes, règles
sur l'API) avant d'écrire du code.

## 1. Contexte

Spot the Game est aujourd'hui un prototype Angular : une page d'accueil et une page « Explorer » qui cherche
des matchs par dates, pays et ville ou stade, via API-Football. Le dépôt vient d'être assaini (code mort
supprimé, filtre ville corrigé, fonction serveur sécurisée, lint, tests, CI). Il reste petit : la refonte
peut changer l'architecture et l'interface en profondeur, il n'y a rien à préserver à tout prix.

Le marché du groundhopping existe déjà (Futbology, Ground Hoppers App, Groppr…). Ces applis sont surtout des
carnets pour cocher des stades déjà visités, pensés pour des hoppers confirmés. **Notre différence : aider à
trouver le prochain match, où qu'on soit, y compris quand on n'a jamais fait de groundhopping.**

## 2. La promesse

> Tu pars quelque part ? Choisis tes dates, on te montre tous les matchs que tu peux aller voir sur place.

Décisions déjà prises :

- **Cœur du produit : le mode Voyage** (section 4).
- **Périmètre : monde entier** dès le départ.
- **On garde Angular.**
- Web d'abord, en PWA (installable, géolocalisation). Pas d'app native pour l'instant.
- Français d'abord, mais l'architecture doit permettre d'ajouter l'anglais sans tout reprendre.

## 3. Ce qu'on te demande dans cette itération

Livrer la **phase 1 : le mode Voyage, de bout en bout**, sur une architecture qui accueillera ensuite les
comptes, les check-ins, les médailles et le social sans refonte.

Hors périmètre pour l'instant (mais le modèle de données doit les prévoir) : comptes, check-ins, XP,
médailles, feed social, paiement.

## 4. Le mode Voyage

### Parcours

1. **Où ?** Une ville, un hôtel, une adresse, ou « ma position ».
2. **Quand ?** Une date ou une période, avec des raccourcis : aujourd'hui, ce week-end, les 7 prochains jours.
3. **Jusqu'où ?** Un rayon. Idéalement en temps de trajet (30 min, 1 h, 2 h) ; à défaut, en kilomètres
   pour cette première version, avec un affichage de la distance sur chaque match.
4. **Résultats** : une carte et une liste synchronisées (survoler ou taper un match le met en évidence sur
   la carte et inversement), triées par date puis par distance.

La page d'accueil doit permettre de lancer cette recherche immédiatement, avec des valeurs par défaut utiles
(par exemple « ce week-end, autour de moi » si la géolocalisation est acceptée). Pas de mur de texte.

### Ce qu'affiche chaque match

- Équipes (avec écussons si disponibles), compétition, pays, niveau (première division, divisions inférieures, féminin, jeunes).
- Date et heure locales, avec une mention quand l'horaire n'est pas encore confirmé.
- Stade, ville, distance depuis le point de départ, lien « Itinéraire » vers Google Maps / Apple Plans.
- Un lien vers une page match.

### Filtres

Créneau (soirée, week-end, journée), niveau de compétition, pays. Les filtres s'appliquent sans recharger.

### Pages indexables (SEO)

Chaque **stade**, **match** et **club** a sa propre URL lisible (par exemple `/stades/anfield-liverpool`,
`/matchs/2026-03-14-lens-lille`), un titre et une description uniques, et des données structurées
`SportsEvent` pour les matchs. Ces pages doivent être rendues côté serveur (Angular SSR) pour être
indexées. La page stade affiche : carte, adresse, capacité, prochains matchs, et un emplacement prévu pour
les futures infos pratiques (accès, billetterie, conseils).

## 5. Données : le vrai chantier

La recherche « dans un rayon de » impose une **base de stades avec coordonnées GPS** et des **matchs stockés
en base**. Le front ne doit plus jamais appeler API-Football à chaque recherche.

Architecture visée :

- **Supabase** : Postgres + PostGIS (requêtes de distance), puis plus tard authentification, stockage des
  photos, Row Level Security.
- **Synchronisation planifiée côté serveur** (fonction planifiée Netlify ou Supabase) :
  - compétitions et stades depuis API-Football (endpoints leagues / venues), mis à jour peu souvent ;
  - matchs des N prochains jours (par exemple 21), rafraîchis plusieurs fois par jour, en surveillant le quota ;
  - coordonnées des stades : API-Football ne les fournit pas toujours. Les compléter côté serveur via
    Wikidata (propriété de coordonnées des stades) et, en dernier recours, un géocodage par lots respectueux
    des conditions d'usage (OpenStreetMap/Nominatim : 1 requête/s, User-Agent identifiable, résultats mis en
    cache définitivement). Garder une table de corrections manuelles.
  - Vérifie ces sources et leurs limites avant de coder, et documente ce que tu as constaté.
- **Recherche** : une fonction RPC Postgres (ou une fonction serveur) qui prend un point, un rayon, une
  période et des filtres, et renvoie les matchs avec leur distance.
- La fonction actuelle `netlify/functions/api-football.mjs` peut disparaître une fois la synchronisation en
  place, ou rester pour un usage interne. Dans les deux cas, garde ses règles : liste blanche, validation,
  cache, pas de CORS ouvert.

Modèle de données minimal à prévoir dès maintenant (même si seules les premières tables sont utilisées) :
`venues` (stade, ville, pays, coordonnées géographiques, capacité, source et fiabilité des coordonnées),
`teams`, `competitions` (avec un niveau), `fixtures` (match, stade, statut, horaire confirmé ou non),
puis pour plus tard `profiles`, `checkins`, `badges`, `user_badges`, `follows`, `tips`, `trips`.

Variables d'environnement et secrets : jamais dans le code. Documente-les dans le README.

## 6. Direction visuelle

Le site actuel a l'esthétique « template généré » : dégradés génériques, pastilles partout, texte trop long.
On veut une identité reconnaissable et sobre.

Pistes (à toi de proposer et de trancher, en justifiant) :

- L'univers du **jour de match et du voyage** : billet, tableau d'affichage de gare, carnet de route,
  écharpe de supporter. Une typographie forte et condensée pour les affiches, une police lisible pour le texte.
- **La carte est le héros** de l'interface, pas une décoration.
- Une couleur d'accent assumée (vert pelouse, ou autre si tu as mieux), des surfaces calmes, peu d'effets.
- Mobile d'abord : la recherche et les résultats doivent être parfaits à 375 px de large, avec la carte et la
  liste qui cohabitent bien (par exemple liste en panneau déroulant au-dessus de la carte).

Commence par poser un **design system** : tokens (couleurs claires/sombres, typographie, espacements, rayons)
dans `src/styles/`, et une poignée de composants de base (bouton, champ, carte de match, puce de filtre).
Les pages s'assemblent ensuite à partir de ces briques.

Pour la carte : choisis la bibliothèque (Leaflet, MapLibre GL…) en justifiant, avec des tuiles dont les
conditions d'usage permettent un usage public.

## 7. Exigences de qualité

- Respect de `CLAUDE.md`. `npm run check` doit passer à chaque commit.
- Tests unitaires sur toute la logique : calcul de période, filtres, formatage des distances et horaires,
  construction des URL, transformation des données de synchronisation.
- Au moins un test de bout en bout (Playwright) sur le parcours principal : recherche → résultats → page match.
- Accessibilité AA (clavier, contraste, labels, annonces des résultats).
- Performance : Lighthouse mobile ≥ 90 en performance et SEO sur l'accueil et une page stade.
- Gestion des cas vides et des erreurs avec des messages utiles (aucun match → proposer d'élargir le rayon
  ou les dates).
- Commits petits et lisibles, en français.

## 8. Livrables attendus

1. Le design system et les composants de base.
2. La base de données (migrations versionnées dans le dépôt) et la synchronisation planifiée.
3. Le mode Voyage complet : accueil avec recherche, résultats carte + liste, filtres.
4. Les pages stade, match et club rendues côté serveur.
5. README et `CLAUDE.md` à jour (nouvelles commandes, variables d'environnement, architecture).
6. Un court fichier `docs/DECISIONS.md` qui liste tes choix importants (carte, sources de coordonnées, rendu
   serveur, structure des URL) et leurs raisons.

## 9. La suite (pour information)

- **Phase 2** : comptes, check-in géolocalisé au stade (fenêtre autour du coup d'envoi), historique,
  passeport des stades, XP, niveaux, premières médailles, visuels partageables.
- **Phase 3** : suivre des hoppers, feed, « Qui y va ? », profils recommandés, classements régionaux,
  conseils de la communauté et modération.
- **Phase 4** : premium (voyages enregistrés avec alertes, enchaînements de plusieurs matchs, recherche plus
  lointaine), affiliation train et hôtel, offre pour les clubs.

Garde ces phases en tête dans tes choix d'architecture, sans les construire maintenant.
