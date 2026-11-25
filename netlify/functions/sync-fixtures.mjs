// Fonction planifiée : rafraîchit quelques journées de matchs à chaque passage.
// Le détail du budget de requêtes est dans netlify/lib/sync-fixtures.mjs.

import { runFixturesSync } from '../lib/sync-fixtures.mjs';
import { notify, syncProblem } from '../lib/alert.mjs';

export default async function handler() {
  try {
    const report = await runFixturesSync({ env: process.env, deadlineMs: 18_000 });
    const problem = syncProblem('Synchronisation des matchs', report);
    if (problem) await notify(process.env, problem);
    return Response.json(report);
  } catch (error) {
    console.error(`Synchronisation des matchs : ${error.message}`);
    await notify(process.env, `Synchronisation des matchs en échec : ${error.message}`);
    return new Response('Tâche en échec', { status: 500 });
  }
}

export const config = { schedule: '5 * * * *' };
