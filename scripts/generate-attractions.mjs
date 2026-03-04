import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const seedPath = join(__dirname, '..', 'data', 'attractions.seed.json');
const outPath = join(__dirname, '..', 'attractions.json');
const userAgent = 'japan-attractions-map/1.0 (codex local script)';
const delayMs = 1100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'jp');

  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      'Accept-Language': 'en',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim request failed (${response.status}) for query: ${query}`);
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const first = data[0];
  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    osmType: first.type,
    osmClass: first.class,
    displayName: first.display_name,
  };
}

async function main() {
  const raw = await readFile(seedPath, 'utf8');
  const seed = JSON.parse(raw);

  if (!Array.isArray(seed) || seed.length === 0) {
    throw new Error('Seed file is empty or invalid.');
  }

  const out = [];
  const failures = [];

  for (let i = 0; i < seed.length; i += 1) {
    const item = seed[i];
    if (i > 0) {
      await sleep(delayMs);
    }

    try {
      const geo = await geocode(item.query);
      if (!geo) {
        failures.push({ id: item.id, query: item.query, reason: 'No result' });
        continue;
      }

      out.push({
        ...item,
        lat: geo.lat,
        lng: geo.lng,
        mapSource: 'OpenStreetMap Nominatim',
        mapDisplayName: geo.displayName,
        osmType: geo.osmType,
        osmClass: geo.osmClass,
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.query)}`,
        openStreetMapUrl: `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lng}#map=13/${geo.lat}/${geo.lng}`,
      });

      console.log(`[${i + 1}/${seed.length}] OK  ${item.name}`);
    } catch (error) {
      failures.push({ id: item.id, query: item.query, reason: error.message });
      console.warn(`[${i + 1}/${seed.length}] ERR ${item.name} -> ${error.message}`);
    }
  }

  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    total: out.length,
    failed: failures.length,
    data: out,
  };

  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`\nGenerated ${out.length} attractions -> ${outPath}`);
  if (failures.length > 0) {
    console.log('Failed items:');
    for (const fail of failures) {
      console.log(`- ${fail.id}: ${fail.reason}`);
    }
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
