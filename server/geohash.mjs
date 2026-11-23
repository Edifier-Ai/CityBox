const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encode WGS84 coordinates into a standard base32 Geohash string.
 * Precision 8 corresponds to roughly 38m x 19m cells, ideal for 180m-220m diorama slices.
 */
export function encodeGeohash(lat, lng, precision = 8) {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = '';

  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lngMid = (lngMin + lngMax) / 2;
      if (lng >= lngMid) {
        idx = idx * 2 + 1;
        lngMin = lngMid;
      } else {
        idx = idx * 2;
        lngMax = lngMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) {
        idx = idx * 2 + 1;
        latMin = latMid;
      } else {
        idx = idx * 2;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (++bit === 5) {
      geohash += BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

export function buildWorkshopCacheKey(lat, lng, sliceSizeMeters) {
  const roundedSize = Math.round(Number(sliceSizeMeters) || 200);
  const geohash = encodeGeohash(lat, lng, 8);
  return `${geohash}-${roundedSize}`;
}
