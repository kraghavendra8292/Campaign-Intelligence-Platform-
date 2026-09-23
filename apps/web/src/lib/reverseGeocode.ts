/**
 * Resolve coordinates to a local Indian-style address line.
 *
 * Format (omit empty parts, nothing else):
 *   Road, Landmark, Area, Village, Taluk, District, Pincode
 *
 * Uses OpenStreetMap Nominatim with addressdetails so we can pick only those
 * fields — never state, country, or other noise.
 */

export interface ReverseGeocodeResult {
  readonly address: string;
}

/** Structured Nominatim `address` object (subset we care about). */
export interface NominatimAddress {
  readonly road?: string;
  readonly pedestrian?: string;
  readonly path?: string;
  readonly footway?: string;
  readonly residential?: string;

  readonly amenity?: string;
  readonly building?: string;
  readonly tourism?: string;
  readonly shop?: string;
  readonly office?: string;
  readonly leisure?: string;
  readonly historic?: string;
  readonly man_made?: string;
  readonly house_name?: string;
  readonly house_number?: string;

  readonly suburb?: string;
  readonly neighbourhood?: string;
  readonly quarter?: string;
  readonly city_block?: string;
  readonly subdivision?: string;

  readonly village?: string;
  readonly hamlet?: string;
  readonly town?: string;

  readonly county?: string;
  readonly municipality?: string;
  readonly city_district?: string;
  readonly district?: string;
  readonly state_district?: string;
  readonly borough?: string;

  readonly city?: string;
  readonly postcode?: string;
}

interface NominatimReverseResponse {
  readonly address?: NominatimAddress;
  readonly name?: string;
  readonly addresstype?: string;
  readonly category?: string;
  readonly type?: string;
}

function first(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Build the citizen-facing address line from Nominatim parts.
 * Exported for unit tests — order and field set are product requirements.
 */
export function formatLocalAddress(address: NominatimAddress, placeName?: string | null): string | null {
  const road = first(address.road, address.pedestrian, address.path, address.footway, address.residential);

  const landmark = first(
    address.amenity,
    address.building,
    address.tourism,
    address.shop,
    address.office,
    address.leisure,
    address.historic,
    address.man_made,
    address.house_name,
    // House number alone is a useful pin when no named landmark exists.
    address.house_number ? `No. ${address.house_number}` : null,
    // Named POI from the reverse hit itself (e.g. a temple node).
    placeName && placeName !== road ? placeName : null,
  );

  const area = first(address.suburb, address.neighbourhood, address.quarter, address.city_block, address.subdivision);

  const village = first(address.village, address.hamlet, address.town);

  // In India, OSM often maps taluk → county / municipality.
  const taluk = first(address.county, address.municipality);

  // District — prefer explicit district fields; fall back to city when it is
  // the district seat (common in urban OSM data) and not already used as village.
  const district = first(
    address.state_district,
    address.district,
    address.city_district,
    address.borough,
    village && address.city && address.city !== village ? address.city : null,
    !village ? address.city : null,
  );

  const pincode = first(address.postcode);

  const parts = [road, landmark, area, village, taluk, district, pincode].filter(
    (part): part is string => Boolean(part),
  );

  // Drop consecutive duplicates (e.g. same name used as area and village).
  const unique: string[] = [];
  for (const part of parts) {
    if (unique.length > 0 && unique[unique.length - 1]!.toLowerCase() === part.toLowerCase()) {
      continue;
    }
    if (unique.some((seen) => seen.toLowerCase() === part.toLowerCase())) {
      continue;
    }
    unique.push(part);
  }

  if (unique.length === 0) return null;
  return unique.join(', ').slice(0, 480);
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
  language: string = 'en',
): Promise<ReverseGeocodeResult | null> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '18',
    'accept-language': language.startsWith('kn') ? 'kn,en' : 'en',
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      },
    );
    clearTimeout(timer);

    if (!response.ok) return null;

    const data = (await response.json()) as NominatimReverseResponse;
    if (!data.address) return null;

    const address = formatLocalAddress(data.address, data.name);
    return address ? { address } : null;
  } catch {
    return null;
  }
}
