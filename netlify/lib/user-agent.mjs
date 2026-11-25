// Wikidata et Nominatim exigent un User-Agent qui identifie l'application et un contact.

export function userAgent(env) {
  const contact = env.CONTACT_EMAIL;
  if (!contact) {
    throw new Error('CONTACT_EMAIL manquante : requise pour appeler Wikidata et Nominatim');
  }
  const site = env.SITE_URL || env.URL || 'https://github.com/bxlel/footballgroundhopping';
  return `SpotTheGame/1.0 (${site}; ${contact})`;
}
