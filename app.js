const map = L.map('map', {
  center: [36.35, 138.25],
  zoom: 5,
  zoomControl: true,
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const summaryEl = document.querySelector('#summary');
const listEl = document.querySelector('#attractionList');
const detailCardEl = document.querySelector('#detailCard');

const searchInput = document.querySelector('#searchInput');
const regionSelect = document.querySelector('#regionSelect');
const categorySelect = document.querySelector('#categorySelect');
const popularitySelect = document.querySelector('#popularitySelect');

const colorByPopularity = {
  热门: '#d9480f',
  小众: '#0f766e',
};

const state = {
  attractions: [],
  filtered: [],
  markersById: new Map(),
  selectedId: null,
  firstRender: true,
};

const collator = new Intl.Collator('zh-CN');

function uniqueSorted(items) {
  return [...new Set(items)].sort((a, b) => collator.compare(a, b));
}

function populateSelectOptions(selectEl, values) {
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectEl.append(option);
  }
}

function normalizeKeyword(raw) {
  return raw.trim().toLowerCase();
}

function matchesKeyword(item, keyword) {
  if (!keyword) {
    return true;
  }

  const haystack = [item.name, item.enName, item.prefecture, item.region, item.category, item.feature]
    .join(' ')
    .toLowerCase();

  return haystack.includes(keyword);
}

function applyFilters() {
  const keyword = normalizeKeyword(searchInput.value);
  const region = regionSelect.value;
  const category = categorySelect.value;
  const popularity = popularitySelect.value;

  state.filtered = state.attractions.filter((item) => {
    if (!matchesKeyword(item, keyword)) {
      return false;
    }
    if (region !== 'all' && item.region !== region) {
      return false;
    }
    if (category !== 'all' && item.category !== category) {
      return false;
    }
    if (popularity !== 'all' && item.popularity !== popularity) {
      return false;
    }
    return true;
  });

  state.filtered.sort((a, b) => {
    if (a.region !== b.region) {
      return collator.compare(a.region, b.region);
    }
    if (a.popularity !== b.popularity) {
      return a.popularity === '热门' ? -1 : 1;
    }
    return collator.compare(a.name, b.name);
  });

  renderList();
  renderMarkers();
  renderSummary();

  if (state.filtered.length > 0) {
    if (state.selectedId && !state.filtered.some((item) => item.id === state.selectedId)) {
      state.selectedId = null;
      detailCardEl.classList.add('empty');
      detailCardEl.innerHTML = '<h3>选择一个景点</h3><p>当前筛选下无已选景点，请重新选择。</p>';
    }

    if (state.firstRender) {
      fitMapToVisible();
      state.firstRender = false;
    }
  }
}

function fitMapToVisible() {
  if (state.filtered.length === 0) {
    return;
  }

  const bounds = L.latLngBounds(state.filtered.map((item) => [item.lat, item.lng]));
  map.fitBounds(bounds, {
    padding: [36, 36],
    maxZoom: 7,
  });
}

function createPopupHtml(item) {
  const color = colorByPopularity[item.popularity] ?? '#475569';
  return `
    <div style="min-width: 228px; line-height: 1.45;">
      <h4 style="margin: 0 0 4px; font-size: 15px;">${item.name}</h4>
      <p style="margin: 0; color: #57534e; font-size: 12px;">${item.prefecture} · ${item.category}</p>
      <p style="margin: 6px 0; font-size: 13px;">${item.feature}</p>
      <p style="margin: 0 0 8px;">
        <span style="display: inline-block; color: ${color}; font-weight: 700; font-size: 12px;">${item.popularity}</span>
      </p>
      <a href="${item.googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 12px;">Google Maps</a>
      <span style="margin: 0 4px; color: #999;">|</span>
      <a href="${item.openStreetMapUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 12px;">OpenStreetMap</a>
    </div>
  `;
}

function renderMarkers() {
  markerLayer.clearLayers();
  state.markersById.clear();

  for (const item of state.filtered) {
    const marker = L.circleMarker([item.lat, item.lng], {
      radius: item.popularity === '热门' ? 8 : 7,
      color: '#ffffff',
      weight: 1.2,
      fillColor: colorByPopularity[item.popularity] ?? '#475569',
      fillOpacity: 0.92,
    });

    marker.bindPopup(createPopupHtml(item));
    marker.on('click', () => {
      selectAttraction(item.id, { openPopup: false, pan: false });
    });

    marker.addTo(markerLayer);
    state.markersById.set(item.id, marker);
  }
}

function renderList() {
  if (state.filtered.length === 0) {
    listEl.innerHTML = '<p style="color:#57534e;margin:0.8rem 0.2rem;">没有匹配结果，试试放宽筛选条件。</p>';
    return;
  }

  const html = state.filtered
    .map((item) => {
      const activeClass = item.id === state.selectedId ? 'active' : '';
      const tagClass = item.popularity === '热门' ? 'popular' : 'hidden';

      return `
        <button class="spot-item ${activeClass}" type="button" data-id="${item.id}">
          <div class="spot-head">
            <h3 class="spot-title">${item.name}</h3>
            <span class="tag ${tagClass}">${item.popularity}</span>
          </div>
          <p class="spot-meta">${item.region} · ${item.prefecture} · ${item.category}</p>
          <p class="spot-feature">${item.feature}</p>
        </button>
      `;
    })
    .join('');

  listEl.innerHTML = html;

  for (const button of listEl.querySelectorAll('.spot-item')) {
    button.addEventListener('click', () => {
      const { id } = button.dataset;
      selectAttraction(id, { openPopup: true, pan: true });
    });
  }
}

function renderSummary() {
  const total = state.attractions.length;
  const current = state.filtered.length;
  summaryEl.textContent = `显示 ${current} / ${total} 个景点`;
}

function renderDetail(item) {
  detailCardEl.classList.remove('empty');

  const tagClass = item.popularity === '热门' ? 'popular' : 'hidden';

  detailCardEl.innerHTML = `
    <div class="detail-top">
      <div>
        <h3>${item.name}</h3>
        <p class="detail-sub">${item.enName} · ${item.prefecture} · ${item.region}</p>
      </div>
      <span class="tag ${tagClass}">${item.popularity}</span>
    </div>

    <p class="detail-feature">${item.feature}</p>

    <p class="detail-sub">类型：${item.category}</p>

    <div class="detail-links">
      <a class="primary" href="${item.googleMapsUrl}" target="_blank" rel="noopener noreferrer">Google Maps</a>
      <a href="${item.openStreetMapUrl}" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
      <a href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer">来源链接</a>
    </div>
  `;
}

function selectAttraction(id, opts = { openPopup: true, pan: true }) {
  const item = state.filtered.find((entry) => entry.id === id) || state.attractions.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  state.selectedId = id;
  renderList();
  renderDetail(item);

  const marker = state.markersById.get(id);
  if (!marker) {
    return;
  }

  if (opts.pan) {
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 8), { duration: 0.7 });
  }

  if (opts.openPopup) {
    marker.openPopup();
  }
}

async function loadAttractions() {
  try {
    const response = await fetch('./attractions.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`数据加载失败: ${response.status}`);
    }

    const payload = await response.json();
    state.attractions = payload.data;

    const regions = uniqueSorted(state.attractions.map((item) => item.region));
    const categories = uniqueSorted(state.attractions.map((item) => item.category));

    populateSelectOptions(regionSelect, regions);
    populateSelectOptions(categorySelect, categories);

    applyFilters();
  } catch (error) {
    console.error(error);
    summaryEl.textContent = '加载失败';
    listEl.innerHTML = `<p style="color:#b91c1c;">${error.message}</p>`;
  }
}

for (const el of [searchInput, regionSelect, categorySelect, popularitySelect]) {
  el.addEventListener('input', applyFilters);
  el.addEventListener('change', applyFilters);
}

loadAttractions();
