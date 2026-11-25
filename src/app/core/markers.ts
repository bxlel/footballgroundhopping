import { FixtureCard, GeoPoint } from './models';

/** Un repère sur la carte : un stade et le nombre de matchs qui s'y jouent. */
export interface MapMarker {
  /** Slug du stade. */
  id: string;
  position: GeoPoint;
  name: string;
  count: number;
  approximate: boolean;
}

/** Regroupe les matchs par stade : un seul repère par stade situé. */
export function venueMarkers(fixtures: readonly FixtureCard[]): MapMarker[] {
  const markers = new Map<string, MapMarker>();
  for (const { venue } of fixtures) {
    if (!venue?.position) continue;
    const existing = markers.get(venue.slug);
    if (existing) {
      existing.count += 1;
    } else {
      markers.set(venue.slug, {
        id: venue.slug,
        position: venue.position,
        name: venue.name,
        count: 1,
        approximate: venue.approximate,
      });
    }
  }
  return [...markers.values()];
}
