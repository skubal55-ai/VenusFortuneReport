// Free-text place name -> lat/lon via OpenStreetMap Nominatim.
// Requires internet access at runtime; always allow manual lat/lon entry as a fallback.
export async function geocodePlace(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await resp.json();
  if (data && data[0]) {
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  }
  return null;
}
