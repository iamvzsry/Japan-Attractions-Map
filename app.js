const map = L.map('map', {
  center: [36.4, 138.25],
  zoom: 5,
  zoomControl: true,
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  // High-DPI tiles improve clarity on mobile retina screens.
  // CARTO tiles still rely on OpenStreetMap data.
  maxZoom: 20,
  maxNativeZoom: 20,
  detectRetina: true,
  subdomains: 'abcd',
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

const summaryEl = document.querySelector('#summary');
const listEl = document.querySelector('#attractionList');
const detailCardEl = document.querySelector('#detailCard');
const heroStatsEl = document.querySelector('#heroStats');

const searchInput = document.querySelector('#searchInput');
const regionSelect = document.querySelector('#regionSelect');
const categorySelect = document.querySelector('#categorySelect');
const popularitySelect = document.querySelector('#popularitySelect');

const colorByPopularity = {
  热门: '#ea580c',
  小众: '#0891b2',
};

const state = {
  attractions: [],
  filtered: [],
  markersById: new Map(),
  selectedId: null,
  firstRender: true,
};

const collator = new Intl.Collator('zh-CN');

function isMobileViewport() {
  return window.matchMedia('(max-width: 980px)').matches;
}

function escapeHtml(input) {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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

function buildGuideLinks(item) {
  const keyword = `${item.name} ${item.prefecture} 日本 旅行 攻略`;
  const zhKeyword = encodeURIComponent(keyword);
  const enKeyword = encodeURIComponent(`${item.enName ?? item.name} ${item.prefecture} travel guide`);

  return [
    {
      label: '小红书攻略',
      url: `https://www.xiaohongshu.com/search_result?keyword=${zhKeyword}`,
    },
    {
      label: 'B站视频',
      url: `https://search.bilibili.com/all?keyword=${zhKeyword}`,
    },
    {
      label: '马蜂窝',
      url: `https://www.mafengwo.cn/search/q.php?q=${zhKeyword}`,
    },
    {
      label: 'Google攻略',
      url: `https://www.google.com/search?q=${enKeyword}`,
    },
  ];
}

function renderHeroStats() {
  if (!heroStatsEl) {
    return;
  }

  const total = state.attractions.length;
  const popular = state.attractions.filter((item) => item.popularity === '热门').length;
  const hidden = state.attractions.filter((item) => item.popularity === '小众').length;
  const regions = new Set(state.attractions.map((item) => item.region)).size;
  const categories = new Set(state.attractions.map((item) => item.category)).size;

  heroStatsEl.innerHTML = `
    <article class="stat-card">
      <p>景点总数</p>
      <strong>${total}</strong>
    </article>
    <article class="stat-card">
      <p>热门 / 小众</p>
      <strong>${popular} / ${hidden}</strong>
    </article>
    <article class="stat-card">
      <p>覆盖地区</p>
      <strong>${regions}</strong>
    </article>
    <article class="stat-card">
      <p>类型数量</p>
      <strong>${categories}</strong>
    </article>
  `;
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
      detailCardEl.innerHTML = '<h3>重新选择景点</h3><p>当前筛选下已选景点不可见，请重新点击地图或列表。</p>';
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
    padding: [30, 30],
    maxZoom: 7,
  });
}

function createPopupHtml(item) {
  const color = colorByPopularity[item.popularity] ?? '#475569';
  const safeName = escapeHtml(item.name);
  const safeMeta = escapeHtml(`${item.prefecture} · ${item.category}`);
  const featureText = isMobileViewport() && item.feature.length > 42 ? `${item.feature.slice(0, 42)}...` : item.feature;
  const safeFeature = escapeHtml(featureText);
  const guideLinks = buildGuideLinks(item);

  return `
    <div style="line-height: 1.48;">
      <h4 style="margin: 0 0 4px; font-size: 15px;">${safeName}</h4>
      <p style="margin: 0; color: #475569; font-size: 12px;">${safeMeta}</p>
      <p style="margin: 6px 0; font-size: 13px;">${safeFeature}</p>
      <p style="margin: 0 0 7px; color: ${color}; font-weight: 700; font-size: 12px;">${escapeHtml(item.popularity)}</p>
      <a href="${item.googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 12px;">Google Maps</a>
      <span style="margin: 0 4px; color: #94a3b8;">|</span>
      <a href="${item.openStreetMapUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 12px;">OpenStreetMap</a>
      <span style="margin: 0 4px; color: #94a3b8;">|</span>
      <a href="${guideLinks[0].url}" target="_blank" rel="noopener noreferrer" style="font-size: 12px;">小红书</a>
    </div>
  `;
}

function renderMarkers() {
  markerLayer.clearLayers();
  state.markersById.clear();

  for (const item of state.filtered) {
    const marker = L.circleMarker([item.lat, item.lng], {
      radius: item.popularity === '热门' ? 8.5 : 7,
      color: '#ffffff',
      weight: 1.3,
      fillColor: colorByPopularity[item.popularity] ?? '#475569',
      fillOpacity: 0.9,
    });

    marker.bindPopup(createPopupHtml(item), {
      maxWidth: isMobileViewport() ? 210 : 300,
      minWidth: isMobileViewport() ? 120 : 180,
      autoPanPaddingTopLeft: [18, 18],
      autoPanPaddingBottomRight: [18, isMobileViewport() ? 120 : 22],
      keepInView: true,
    });
    marker.on('click', () => {
      selectAttraction(item.id, { openPopup: false, pan: false });
    });

    marker.addTo(markerLayer);
    state.markersById.set(item.id, marker);
  }
}

function renderList() {
  if (state.filtered.length === 0) {
    listEl.innerHTML = '<p style="color:#334155;margin:0.8rem 0.2rem;">没有匹配结果，试试放宽筛选条件。</p>';
    return;
  }

  const html = state.filtered
    .map((item) => {
      const activeClass = item.id === state.selectedId ? 'active' : '';
      const tagClass = item.popularity === '热门' ? 'popular' : 'hidden';

      return `
        <button class="spot-item ${activeClass}" type="button" data-id="${item.id}">
          <div class="spot-head">
            <h3 class="spot-title">${escapeHtml(item.name)}</h3>
            <span class="tag ${tagClass}">${escapeHtml(item.popularity)}</span>
          </div>
          <p class="spot-meta">${escapeHtml(`${item.region} · ${item.prefecture} · ${item.category}`)}</p>
          <p class="spot-feature">${escapeHtml(item.feature)}</p>
        </button>
      `;
    })
    .join('');

  listEl.innerHTML = html;

  for (const button of listEl.querySelectorAll('.spot-item')) {
    button.addEventListener('click', () => {
      const { id } = button.dataset;
      selectAttraction(id, { openPopup: !isMobileViewport(), pan: true });
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
  const guideLinks = buildGuideLinks(item)
    .map(
      (link) =>
        `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`
    )
    .join('');

  detailCardEl.innerHTML = `
    <div class="detail-top">
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <p class="detail-sub">${escapeHtml(`${item.enName} · ${item.prefecture} · ${item.region}`)}</p>
      </div>
      <span class="tag ${tagClass}">${escapeHtml(item.popularity)}</span>
    </div>

    <p class="detail-feature">${escapeHtml(item.feature)}</p>
    <p class="detail-sub">类型：${escapeHtml(item.category)}</p>

    <p class="section-title">地图导航</p>
    <div class="detail-links">
      <a class="primary" href="${item.googleMapsUrl}" target="_blank" rel="noopener noreferrer">Google Maps</a>
      <a href="${item.openStreetMapUrl}" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
      <a href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer">来源链接</a>
    </div>

    <p class="section-title">攻略平台</p>
    <div class="guide-links">${guideLinks}</div>
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
    const targetZoom = isMobileViewport() ? Math.min(Math.max(map.getZoom(), 6), 7) : Math.max(map.getZoom(), 8);
    map.flyTo(marker.getLatLng(), targetZoom, { duration: isMobileViewport() ? 0.4 : 0.62 });
  }

  if (opts.openPopup) {
    marker.openPopup();
  } else {
    map.closePopup();
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

    renderHeroStats();
    applyFilters();
  } catch (error) {
    console.error(error);
    summaryEl.textContent = '加载失败';
    listEl.innerHTML = `<p style="color:#b91c1c;">${escapeHtml(error.message)}</p>`;
  }
}

for (const el of [searchInput, regionSelect, categorySelect, popularitySelect]) {
  el.addEventListener('input', applyFilters);
  el.addEventListener('change', applyFilters);
}

loadAttractions();
