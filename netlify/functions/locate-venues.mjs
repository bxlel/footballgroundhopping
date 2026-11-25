// Fonction planifiée : complète les coordonnées de quelques stades à chaque passage
// (Wikidata, puis Nominatim avec au plus 4 requêtes par quart d'heure).

import { runLocateVenues } from '../lib/locate-venues.mjs';
import { notify, syncProblem } from '../lib/alert.mjs';

export default async function handler() {
  try {
    const report = await runLocateVenues({ env: process.env, deadlineMs: 18_000 });
    const problem = syncProblem('Coordonnées des stades', report);
    if (problem) await notify(process.env, problem);
    return Response.json(report);
  } catch (error) {
    console.error(`Coordonnées des stades : ${error.message}`);
    await notify(process.env, `Coordonnées des stades en échec : ${error.message}`);
    return new Response('Tâche en échec', { status: 500 });
  }
}

export const config = { schedule: '*/15 * * * *' };
