import { access, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const baseSeedPath = join(__dirname, '..', 'data', 'attractions.seed.json');
const extraSeedPath = join(__dirname, '..', 'data', 'attractions.extra.json');
const outPath = join(__dirname, '..', 'attractions.json');
const userAgent = 'japan-attractions-map/1.1 (codex local script)';
const delayMs = 1100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadJsonArray(path, label, required = true) {
  const exists = await fileExists(path);
  if (!exists) {
    if (required) {
      throw new Error(`${label} not found: ${path}`);
    }
    return [];
  }

  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be an array: ${path}`);
  }

  return parsed;
}

function createDefaultFeature(item) {
  const pref = item.prefecture ?? '当地';

  switch (item.category) {
    case '自然风景':
      return `${item.name}是${pref}的人气自然景观，四季景色变化明显，适合拍照与轻徒步。`;
    case '神社寺院':
      return `${item.name}兼具参拜与人文观赏价值，常作为${pref}深度文化线路的核心站点。`;
    case '历史文化':
      return `${item.name}保留了鲜明的历史文化层次，适合安排半天到一天的慢游参观。`;
    case '温泉疗愈':
      return `${item.name}以温泉与慢节奏体验见长，适合与周边自然或古街行程组合。`;
    case '艺术建筑':
      return `${item.name}融合建筑与展陈体验，是${pref}热门的人文打卡地之一。`;
    case '岛屿海岸':
      return `${item.name}以海岸风光与离岛氛围见长，晴天时观景和摄影体验尤佳。`;
    case '城市地标':
      return `${item.name}是${pref}辨识度很高的城市地标，交通便捷且周边配套丰富。`;
    default:
      return `${item.name}是${pref}值得安排的旅行点位，适合作为区域路线中的核心停靠点。`;
  }
}

function normalizeItem(raw) {
  const item = { ...raw };

  if (!item.id || !item.name || !item.prefecture || !item.region || !item.category || !item.popularity) {
    throw new Error(`Invalid seed item, missing required fields: ${JSON.stringify(raw)}`);
  }

  if (!item.enName) {
    item.enName = item.name;
  }

  if (!item.query) {
    item.query = `${item.name} ${item.prefecture} 日本`;
  }

  if (!item.feature) {
    item.feature = createDefaultFeature(item);
  }

  item.sourceName = item.sourceName ?? 'Google Maps';
  item.sourceUrl =
    item.sourceUrl ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.name} ${item.prefecture}`)}`;

  return item;
}

function mergeSeedArrays(base, extra) {
  const merged = [];
  const seen = new Set();

  for (const item of [...base, ...extra]) {
    const normalized = normalizeItem(item);
    if (seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    merged.push(normalized);
  }

  return merged;
}

async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'jp');

  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      'Accept-Language': 'ja,en',
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
  const baseSeed = await loadJsonArray(baseSeedPath, 'base seed', true);
  const extraSeed = await loadJsonArray(extraSeedPath, 'extra seed', false);
  const mergedSeed = mergeSeedArrays(baseSeed, extraSeed);

  if (mergedSeed.length === 0) {
    throw new Error('No attractions found after merging seed files.');
  }

  console.log(`Base seed: ${baseSeed.length}`);
  console.log(`Extra seed: ${extraSeed.length}`);
  console.log(`Merged unique attractions: ${mergedSeed.length}`);

  const out = [];
  const failures = [];

  for (let i = 0; i < mergedSeed.length; i += 1) {
    const item = mergedSeed[i];
    if (i > 0) {
      await sleep(delayMs);
    }

    try {
      const geo = await geocode(item.query);
      if (!geo) {
        failures.push({ id: item.id, name: item.name, query: item.query, reason: 'No result' });
        console.warn(`[${i + 1}/${mergedSeed.length}] MISS ${item.name}`);
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

      console.log(`[${i + 1}/${mergedSeed.length}] OK   ${item.name}`);
    } catch (error) {
      failures.push({ id: item.id, name: item.name, query: item.query, reason: error.message });
      console.warn(`[${i + 1}/${mergedSeed.length}] ERR  ${item.name} -> ${error.message}`);
    }
  }

  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    total: out.length,
    failed: failures.length,
    baseSeed: baseSeed.length,
    extraSeed: extraSeed.length,
    mergedSeed: mergedSeed.length,
    data: out,
  };

  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`\nGenerated ${out.length} attractions -> ${outPath}`);
  if (failures.length > 0) {
    console.log(`Failed items (${failures.length}):`);
    for (const fail of failures) {
      console.log(`- ${fail.id} (${fail.name}): ${fail.reason}`);
    }
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
