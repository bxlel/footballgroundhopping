import { FixtureStatus, Level, Slot } from '../models';
import { PeriodPreset } from '../period';

const matches = (n: number) => (n === 0 ? 'Aucun match' : n === 1 ? '1 match' : `${n} matchs`);

/**
 * Tous les textes de l'interface, en français.
 * Pour ajouter une langue : créer `messages.<langue>.ts` avec le type `Messages`
 * et le fournir via le jeton MESSAGES (voir messages.ts).
 */
export const FR = {
  locale: 'fr-FR',
  brand: {
    name: 'Spot the Game',
    home: 'Spot the Game, accueil',
  },
  nav: {
    skip: 'Aller au contenu',
    search: 'Chercher un match',
  },
  footer: {
    pitch: 'Trouve un match à voir, où que tu sois.',
    credits: 'Données : API-Football, Wikidata, GeoNames et © les contributeurs d’OpenStreetMap.',
  },
  home: {
    title: 'Spot the Game — Trouve un match à voir, où que tu sois',
    description:
      'Tu pars quelque part ? Choisis tes dates : Spot the Game te montre tous les matchs de foot à voir sur place, toutes divisions confondues.',
    headline: 'Tu pars quelque part ?',
    headlineAccent: 'Trouve ton match.',
    lead: 'Choisis un lieu et des dates. On te montre tous les matchs à voir sur place.',
  },
  search: {
    legend: 'Chercher des matchs',
    where: 'Où ?',
    wherePlaceholder: 'Ville, stade ou adresse',
    aroundMe: 'Autour de moi',
    myPosition: 'Ma position',
    locating: 'Localisation…',
    when: 'Quand ?',
    presets: {
      today: 'Aujourd’hui',
      weekend: 'Ce week-end',
      week: '7 prochains jours',
    } satisfies Record<PeriodPreset, string>,
    otherDates: 'Autres dates',
    from: 'Du',
    to: 'Au',
    howFar: 'Jusqu’où ?',
    radius: (km: number) => `${km} km`,
    radiusHint: 'Distance à vol d’oiseau autour du point de départ.',
    submit: 'Voir les matchs',
    edit: 'Modifier',
    editLabel: 'Modifier la recherche',
    suggestions: {
      loading: 'Recherche…',
      none: 'Aucune suggestion. Valide pour chercher cette adresse.',
      kinds: { city: 'Ville', venue: 'Stade', address: 'Adresse' },
      count: (n: number) => (n === 1 ? '1 suggestion' : `${n} suggestions`),
    },
    errors: {
      missingPlace: 'Indique une ville, un stade ou une adresse, ou utilise ta position.',
      placeNotFound: (text: string) =>
        `On ne trouve pas « ${text} ». Essaie le nom d’une ville proche.`,
      geoDenied:
        'Tu as refusé la localisation. Autorise-la dans ton navigateur, ou tape une ville.',
      geoUnavailable: 'Impossible de te localiser. Tape une ville à la place.',
    },
  },
  trip: {
    title: (label: string) => (label ? `Matchs autour de ${label}` : 'Matchs autour de toi'),
    pageTitle: (label: string) =>
      `${label ? `Matchs autour de ${label}` : 'Matchs autour de toi'} — Spot the Game`,
    description: 'Carte et liste des matchs de foot à voir pendant ton voyage.',
    summary: (count: number, radiusKm: number) => `${matches(count)} à moins de ${radiusKm} km`,
    filtered: (shown: number, total: number) => `${shown} sur ${matches(total).toLowerCase()}`,
    loading: 'On cherche les matchs…',
    listLabel: 'Liste des matchs',
    noQuery: {
      title: 'Où veux-tu voir un match ?',
      body: 'Choisis un lieu et des dates pour afficher les matchs.',
    },
    empty: {
      title: 'Aucun match ici à ces dates',
      body: 'Élargis le rayon ou les dates : il y a sûrement un match un peu plus loin.',
      widen: (km: number) => `Chercher à ${km} km`,
      week: 'Voir les 7 prochains jours',
    },
    emptyFiltered: {
      title: 'Aucun match avec ces filtres',
      body: 'Retire un filtre pour retrouver les matchs de la zone.',
      clear: 'Retirer les filtres',
    },
    error: {
      title: 'Les matchs ne se chargent pas',
      body: 'Vérifie ta connexion, puis réessaie.',
      retry: 'Réessayer',
    },
    stale: (hours: number) =>
      hours < 48
        ? 'Les matchs n’ont pas été mis à jour depuis hier. Vérifie l’horaire auprès du club avant de partir.'
        : `Les matchs n’ont pas été mis à jour depuis ${Math.floor(hours / 24)} jours. Vérifie l’horaire auprès du club avant de partir.`,
    sheet: {
      showList: 'Afficher la liste',
      showMap: 'Afficher la carte',
    },
  },
  filters: {
    title: 'Filtres',
    slot: 'Créneau',
    level: 'Niveau',
    country: 'Pays',
    clear: 'Tout retirer',
    active: (n: number) => (n === 1 ? '1 filtre actif' : `${n} filtres actifs`),
    slots: {
      evening: 'Soirée',
      daytime: 'Journée',
      weekend: 'Week-end',
    } satisfies Record<Slot, string>,
    levels: {
      top: '1re division',
      lower: 'Divisions inférieures',
      cup: 'Coupe',
      women: 'Féminin',
      youth: 'Jeunes',
      other: 'Autres',
    } satisfies Record<Level, string>,
  },
  match: {
    versus: 'contre',
    timeUnconfirmed: 'Horaire à confirmer',
    localTime: 'heure locale',
    utcTime: 'UTC',
    venueUnknown: 'Stade à confirmer',
    approximate: 'Position approximative',
    directions: 'Itinéraire',
    directionsTo: (venue: string) => `Itinéraire vers ${venue}`,
    status: {
      scheduled: '',
      live: 'En cours',
      finished: 'Terminé',
      postponed: 'Reporté',
      cancelled: 'Annulé',
    } satisfies Record<FixtureStatus, string>,
    page: {
      title: (home: string, away: string, day: string) =>
        `${home} – ${away}, ${day} — Spot the Game`,
      description: (p: {
        home: string;
        away: string;
        competition: string;
        day: string;
        venue: string;
      }) =>
        `${p.home} – ${p.away} (${p.competition}), ${p.day}${p.venue ? `, ${p.venue}` : ''}. Horaire, stade et itinéraire.`,
      kickoff: 'Coup d’envoi',
      competition: 'Compétition',
      venue: 'Stade',
      seeVenue: 'Voir la fiche du stade',
      googleMaps: 'Itinéraire Google Maps',
      appleMaps: 'Itinéraire Plans',
      around: 'Autres matchs autour de ce stade',
    },
  },
  venue: {
    page: {
      title: (name: string, city: string | null) =>
        `${name}${city ? `, ${city}` : ''} : prochains matchs et accès — Spot the Game`,
      description: (name: string, city: string | null, count: number) =>
        `${name}${city ? ` à ${city}` : ''} : adresse, capacité, plan et ${
          count ? matches(count).toLowerCase() + ' à venir' : 'prochains matchs'
        }.`,
      address: 'Adresse',
      capacity: 'Capacité',
      seats: (n: string) => `${n} places`,
      surface: 'Pelouse',
      surfaces: { grass: 'Naturelle', 'artificial turf': 'Synthétique' } as Record<string, string>,
      upcoming: 'Prochains matchs',
      noUpcoming: 'Aucun match annoncé ici dans les 3 prochaines semaines.',
      practical: 'Infos pratiques',
      practicalSoon: 'Accès, billetterie, conseils de supporters : cette rubrique arrive bientôt.',
      around: 'Voir les matchs autour de ce stade',
      mapLabel: (name: string) => `Carte : ${name}`,
    },
  },
  team: {
    page: {
      title: (name: string) => `${name} : prochains matchs et stade — Spot the Game`,
      description: (name: string, venue: string | null) =>
        `Prochains matchs de ${name}${venue ? ` et accès à son stade, ${venue}` : ''}.`,
      venue: 'Stade',
      upcoming: 'Prochains matchs',
      noUpcoming: 'Aucun match annoncé dans les 3 prochaines semaines.',
    },
  },
  social: {
    go: 'J’y vais',
    going: 'Tu y vas',
    count: (n: number) =>
      n === 0
        ? 'Sois le premier à y aller.'
        : n === 1
          ? '1 personne y va'
          : `${n} personnes y vont`,
    countShort: (n: number) => (n === 1 ? '1 y va' : `${n} y vont`),
    goingError: 'Ça n’a pas été enregistré. Réessaie dans un instant.',
    share: 'Partager',
    linkCopied: 'Lien copié',
    shareFailed: 'Copie le lien depuis la barre d’adresse.',
    calendar: 'Ajouter au calendrier',
    shareMatch: (home: string, away: string, day: string) =>
      `${home} – ${away}, ${day} : qui vient ?`,
  },
  map: {
    label: 'Carte des matchs',
    origin: 'Point de départ',
    show: 'Afficher la carte',
    marker: (venue: string, count: number) => `${venue} : ${matches(count).toLowerCase()}`,
    unavailable: 'La carte ne peut pas s’afficher ici. La liste reste complète.',
  },
  notFound: {
    title: 'Hors-jeu',
    pageTitle: 'Page introuvable — Spot the Game',
    body: 'Cette page n’existe pas, ou plus.',
    cta: 'Chercher un match',
  },
  loadError: {
    title: 'Cette page ne se charge pas',
    body: 'Vérifie ta connexion, puis recharge la page.',
  },
};

export type Messages = typeof FR;
