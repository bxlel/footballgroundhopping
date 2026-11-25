// Normalisation de texte partagée par la synchronisation.

/** « Stade Bollaert-Delelis, Lens » -> « stade-bollaert-delelis-lens » */
export function slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Clé de comparaison : minuscules, sans accents ni ponctuation. */
export function searchKey(value) {
  return slugify(value).replace(/-/g, ' ');
}

/** Chaîne non vide ou null. */
export function cleanText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed === '' ? null : trimmed;
}
