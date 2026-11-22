// Delivery zone of an address, shared by the checkout popup (browser) and /api/shop/orders
// (server, which decides). Zones are the rows of the website's delivery block (contact-v20);
// its hidden "places" list (`name | zone number | km`, one per line) names towns per zone.
// Rule (like the Zcena prototype): a town of the list named in the address → its zone; else,
// with coordinates (address register or geolocation), the straight-line distance from the shop
// against the farthest listed town of each zone; else the last zone ("rest of the country").
export interface Place {
  name: string;
  zone: number; // 0-based row of the delivery block
  km: number;
}
export interface Point {
  lat: number;
  lon: number;
}
export const foldText = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (s: string) => foldText(s).split(/[^a-z0-9]+/).filter(Boolean);

export function parsePlaces(text: string, zoneCount: number): Place[] {
  return text
    .split("\n")
    .map((line) => line.split("|").map((x) => x.trim()))
    .filter(([name, zone]) => name && Number(zone) >= 1 && Number(zone) <= zoneCount)
    .map(([name, zone, km]) => ({ name, zone: Number(zone) - 1, km: Number(km) }));
}
export function kmBetween(a: Point, b: Point) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r,
    dLon = (b.lon - a.lon) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
// Town of the list named in the address (the last one named wins: "Rīgas iela 5, Ogre" → Ogre).
export function placeInAddress(address: string, places: Place[]) {
  const tokens = words(address);
  let best: { place: Place; at: number } | null = null;
  for (const place of places) {
    const name = words(place.name);
    if (!name.length) continue;
    for (let i = tokens.length - name.length; i >= 0; i--)
      if (name.every((w, n) => tokens[i + n] === w)) {
        if (!best || i > best.at) best = { place, at: i };
        break;
      }
  }
  return best?.place || null;
}
export function zoneForAddress(
  address: string,
  places: Place[],
  zoneCount: number,
  point?: Point | null,
  origin?: Point | null,
): { zone: number; place: string } {
  if (zoneCount < 1) return { zone: -1, place: "" };
  const named = placeInAddress(address, places);
  if (named) return { zone: named.zone, place: named.name };
  if (point && origin && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
    const d = kmBetween(origin, point);
    for (let z = 0; z < zoneCount - 1; z++) {
      const far = Math.max(-1, ...places.filter((p) => p.zone === z && Number.isFinite(p.km)).map((p) => p.km));
      if (far >= 0 && d <= far) return { zone: z, place: "" };
    }
  }
  return { zone: zoneCount - 1, place: "" };
}
