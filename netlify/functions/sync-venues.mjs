// Fonction planifiée : complète chaque nuit l'adresse et la capacité des stades de quelques pays.

import { runVenueDetailsSync } from '../lib/sync-venues.mjs';
import { notify, syncProblem } from '../lib/alert.mjs';

export default async function handler() {
  try {
    const report = await runVenueDetailsSync({ env: process.env });
    const problem = syncProblem('Détails des stades', report);
    if (problem) await notify(process.env, problem);
    return Response.json(report);
  } catch (error) {
    console.error(`Détails des stades : ${error.message}`);
    await notify(process.env, `Détails des stades en échec : ${error.message}`);
    return new Response('Tâche en échec', { status: 500 });
  }
}

export const config = { schedule: '17 3 * * *' };
