// Alerte quand une tâche de fond casse : sans elle, une synchronisation en panne ne se voit
// que lorsque les matchs sont déjà périmés. Envoi vers un webhook (Slack, Discord, ou autre).

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} message
 * @returns {Promise<boolean>} vrai si l'alerte est partie
 */
export async function notify(env, message, { fetch = globalThis.fetch } = {}) {
  const url = env.ALERT_WEBHOOK_URL;
  if (!url) return false;
  const text = `Spot the Game — ${message}`.slice(0, 1500);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `text` pour Slack, `content` pour Discord : chacun ignore la clé de l'autre.
      body: JSON.stringify({ text, content: text }),
    });
    return res.ok;
  } catch (error) {
    // Une alerte qui échoue ne doit jamais faire échouer la tâche qui l'envoie.
    console.error(`Alerte non envoyée : ${error.message}`);
    return false;
  }
}

/** Message d'alerte pour un passage de synchronisation, ou null s'il s'est bien passé. */
export function syncProblem(name, report) {
  if (report.stopped === 'quota')
    return `${name} : quota API-Football épuisé. ${report.error ?? ''}`;
  if (report.stopped === 'plan') {
    return `${name} : le plan API-Football refuse cette requête. ${report.error ?? ''}`;
  }
  if (report.errors > 0) return `${name} : ${report.errors} erreur(s) pendant le passage.`;
  return null;
}
