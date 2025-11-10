import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GeoPoint } from './geo';


@Injectable({ providedIn: 'root' })
export class GeoCacheService {
  private readonly BASE = '/osm/search'; // via proxy
  private lastCall = 0;

  constructor(private http: HttpClient) {}

  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
  private async throttle() {
    const minGap = 1100;
    const now = Date.now();
    const delta = now - this.lastCall;
    if (delta < minGap) await this.sleep(minGap - delta);
    this.lastCall = Date.now();
  }

  private key(q: string) { return `geo:${q.toLowerCase().trim()}`; }
  private read(q: string): GeoPoint | null {
    try {
      const raw = localStorage.getItem(this.key(q));
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > 30 * 24 * 3600 * 1000) return null;
      return data ?? null;
    } catch { return null; }
  }
  private write(q: string, data: GeoPoint) {
    try { localStorage.setItem(this.key(q), JSON.stringify({ ts: Date.now(), data })); } catch {}
  }

  async geocodeOnce(q: string): Promise<GeoPoint | null> {
    if (!q || !q.trim()) return null;

    const cached = this.read(q);
    if (cached) return cached;

    await this.throttle();

    // NB: pas de User-Agent custom côté navigateur (bloqué).
    const params = new HttpParams()
      .set('q', q)
      .set('format', 'jsonv2')
      .set('limit', '1');

    try {
      const res: any[] = await firstValueFrom(this.http.get<any[]>(this.BASE, { params }));
      const hit = res?.[0];
      if (!hit) return null;

      const pt = { lat: Number(hit.lat), lng: Number(hit.lon) };
      if (Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) {
        this.write(q, pt);
        return pt;
      }
      return null;
    } catch {
      return null;
    }
  }

  async enrichMissing<T extends { lat?: number; lng?: number }>(
    items: T[],
    fnQuery: (x: T) => string
  ): Promise<T[]> {
    const out: T[] = [];
    for (const it of items) {
      if (Number.isFinite(it.lat) && Number.isFinite(it.lng)) { out.push(it); continue; }
      const q = fnQuery(it);
      const pt = await this.geocodeOnce(q);
      out.push(pt ? { ...it, lat: pt.lat, lng: pt.lng } : it);
    }
    return out;
  }
}
