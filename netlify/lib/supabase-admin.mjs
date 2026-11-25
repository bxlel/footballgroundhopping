// Accès serveur à Supabase (PostgREST) avec la clé service_role.
// Volontairement sans SDK : trois appels HTTP suffisent.

export class SupabaseError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'SupabaseError';
    this.status = status;
  }
}

/** Lit la configuration serveur ; lève une erreur claire s'il manque une variable. */
export function supabaseConfig(env) {
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new SupabaseError('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquante', 0);
  }
  return { url: url.replace(/\/+$/, ''), serviceKey };
}

export function createAdmin({ url, serviceKey, fetch = globalThis.fetch }) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  async function send(path, init) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new SupabaseError(
        `Supabase ${res.status} sur ${path} : ${detail.slice(0, 300)}`,
        res.status,
      );
    }
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  return {
    /** Appelle une fonction SQL. */
    rpc: (name, args = {}) => send(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) }),
    /** Insère une ligne (ou la remplace si `onConflict` est précisé). */
    upsert: (table, row, onConflict) =>
      send(`${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, {
        method: 'POST',
        headers: { Prefer: `return=minimal${onConflict ? ',resolution=merge-duplicates' : ''}` },
        body: JSON.stringify(row),
      }),
    /** Lit des lignes ; `query` est une chaîne de filtres PostgREST. */
    select: (table, query) => send(`${table}?${query}`, { method: 'GET' }),
  };
}
