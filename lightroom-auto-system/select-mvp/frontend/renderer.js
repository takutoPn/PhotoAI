const API = 'http://localhost:8008';

const runBtn = document.getElementById('runBtn');
const learnBtn = document.getElementById('learnBtn');
const saveBtn = document.getElementById('saveBtn');
const importHistoryBtn = document.getElementById('importHistoryBtn');
const historyCatalogPathInput = document.getElementById('historyCatalogPath');
const output = document.getElementById('output');
const summary = document.getElementById('summary');
const gallery = document.getElementById('gallery');
const catalogFile = document.getElementById('catalogFile');
const catalogPathInput = document.getElementById('catalogPath');
const dropzone = document.getElementById('dropzone');
const starFilter = document.getElementById('starFilter');
const columns = document.getElementById('columns');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const openLrCheckbox = document.getElementById('openLightroomAfterExport');

let currentJobId = null;
let currentPicks = [];
let currentVisible = [];
let renderedCount = 0;

const PAGE_SIZE = 120;

function toFileUrl(p) {
  const normalized = p.replace(/\\/g, '/');
  return encodeURI(`file:///${normalized}`);
}

function makePlaceholder(assetId) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'>
    <rect width='100%' height='100%' fill='#1f1f1f'/>
    <text x='50%' y='45%' fill='#ddd' font-size='28' text-anchor='middle'>RAWプレビューなし</text>
    <text x='50%' y='55%' fill='#999' font-size='18' text-anchor='middle'>${assetId}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function setCatalogPath(p) {
  if (!p) return;
  catalogPathInput.value = p.replace(/^file:\/\//i, '').replace(/\//g, '\\');
}

function setCatalogPathFromFile(file) {
  if (!file) return;
  const realPath = file.path || file.name;
  setCatalogPath(realPath);
}

function setDragover(isOn) {
  if (isOn) dropzone.classList.add('dragover');
  else dropzone.classList.remove('dragover');
}

async function extractCatalogPathFromDrop(e) {
  const files = Array.from(e.dataTransfer?.files || []);
  const fromFiles = files.find((f) => f.name?.toLowerCase().endsWith('.lrcat'));
  if (fromFiles) return fromFiles.path || fromFiles.name;

  const uri = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '';
  if (uri && uri.toLowerCase().includes('.lrcat')) {
    return uri.split('\n').find((x) => x.toLowerCase().includes('.lrcat'))?.trim() || null;
  }

  const items = Array.from(e.dataTransfer?.items || []);
  for (const item of items) {
    if (item.kind === 'string') {
      const text = await new Promise((resolve) => item.getAsString(resolve));
      if (text && text.toLowerCase().includes('.lrcat')) {
        return text.trim();
      }
    }
  }

  return null;
}

catalogFile.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  setCatalogPathFromFile(file);
});

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragover(true);
  });
});
['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragover(false);
  });
});

dropzone.addEventListener('drop', async (e) => {
  const path = await extractCatalogPathFromDrop(e);
  if (!path || !path.toLowerCase().includes('.lrcat')) {
    output.textContent = 'エラー: .lrcat ファイルを指定してください';
    return;
  }
  setCatalogPath(path);
});

function passesFilter(item, filter) {
  if (filter === 'all') return true;
  if (filter === '3') return item.star === 3;
  if (filter === '1') return item.star === 1;
  if (filter === '0') return item.star === 0;
  if (filter === '1plus') return item.star >= 1;
  if (filter === '3plus') return item.star >= 3;
  return true;
}

async function setStar(assetId, star) {
  if (!currentJobId) return;
  const res = await fetch(`${API}/jobs/${currentJobId}/stars`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_id: assetId, star })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`★更新失敗 (${res.status}): ${text}`);
  }
  const result = await res.json();
  currentPicks = result.picks;
  renderGallery(true);
}

function buildCard(item) {
  const card = document.createElement('div');
  card.className = 'item';

  const img = document.createElement('img');
  const viewPath = item.preview_path || item.path;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = item.preview_path ? toFileUrl(viewPath) : makePlaceholder(item.asset_id);
  img.alt = item.asset_id;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `
    <div><b>${item.asset_id}</b></div>
    <div>score: ${item.score}</div>
    <div>現在: ★${item.star}</div>
    <div>${item.preview_path ? '表示: プレビュー画像' : '表示: RAW(プレビュー未検出)'}</div>
    <div>${item.reason}</div>
  `;

  const stars = document.createElement('div');
  stars.className = 'stars';
  [0, 1, 3].forEach((s) => {
    const b = document.createElement('button');
    b.textContent = `★${s}`;
    if (item.star === s) b.classList.add('active');
    b.addEventListener('click', async () => {
      try {
        await setStar(item.asset_id, s);
      } catch (e) {
        output.textContent = `エラー: ${e.message}`;
      }
    });
    stars.appendChild(b);
  });

  meta.appendChild(stars);
  card.appendChild(img);
  card.appendChild(meta);
  return card;
}

function renderChunk(reset = false) {
  if (reset) {
    gallery.innerHTML = '';
    renderedCount = 0;
  }
  const end = Math.min(renderedCount + PAGE_SIZE, currentVisible.length);
  const frag = document.createDocumentFragment();
  for (let i = renderedCount; i < end; i += 1) frag.appendChild(buildCard(currentVisible[i]));
  gallery.appendChild(frag);
  renderedCount = end;
  loadMoreBtn.style.display = renderedCount < currentVisible.length ? 'inline-block' : 'none';
}

function renderGallery() {
  const filter = starFilter.value;
  const col = Number(columns.value || 6);
  gallery.style.gridTemplateColumns = `repeat(${col}, minmax(0, 1fr))`;

  currentVisible = currentPicks.filter((p) => passesFilter(p, filter));
  summary.textContent = `全${currentPicks.length}件 / 表示${currentVisible.length}件 / ★3:${currentPicks.filter(p=>p.star===3).length} ★1:${currentPicks.filter(p=>p.star===1).length} ★0:${currentPicks.filter(p=>p.star===0).length}`;
  renderChunk(true);
}

starFilter.addEventListener('change', renderGallery);
columns.addEventListener('change', renderGallery);
loadMoreBtn.addEventListener('click', () => renderChunk(false));

async function exportAndMaybeOpenLightroom(jobId, catalogPath) {
  const exportRes = await fetch(`${API}/jobs/${jobId}/export`, { method: 'POST' });
  if (!exportRes.ok) {
    const text = await exportRes.text();
    throw new Error(`カタログ書き出し失敗 (${exportRes.status}): ${text}`);
  }
  const exportInfo = await exportRes.json();

  let openInfo = 'OFF';
  if (openLrCheckbox.checked && window.desktop?.openLightroom) {
    const openRes = await window.desktop.openLightroom(catalogPath);
    openInfo = openRes?.ok ? 'OK' : `失敗(${openRes?.error || 'unknown'})`;
  }

  return { exportInfo, openInfo };
}

saveBtn.addEventListener('click', async () => {
  if (!currentJobId) {
    output.textContent = '先に「ジョブ作成して実行（表示のみ）」を実行してください。';
    return;
  }
  try {
    const catalogPath = catalogPathInput.value.trim();
    const { exportInfo, openInfo } = await exportAndMaybeOpenLightroom(currentJobId, catalogPath);
    output.textContent = `保存完了: job=${currentJobId}\n書き出し: updated=${exportInfo.updated}, missing=${exportInfo.missing}\nLightroom起動=${openInfo}`;
  } catch (e) {
    output.textContent = `保存エラー: ${e.message}`;
  }
});

learnBtn.addEventListener('click', async () => {
  if (!currentJobId) {
    output.textContent = '先に実行してください。';
    return;
  }
  try {
    const res = await fetch(`${API}/jobs/${currentJobId}/learn`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    const info = await res.json();
    output.textContent = `学習データ追加: ${info.count}件\n保存先: ${info.saved_to}`;
  } catch (e) {
    output.textContent = `学習データ追加エラー: ${e.message}`;
  }
});

importHistoryBtn.addEventListener('click', async () => {
  try {
    const catalogPath = historyCatalogPathInput.value.trim() || catalogPathInput.value.trim();
    if (!catalogPath) {
      output.textContent = '過去Catalogのパスを指定してください。';
      return;
    }

    const res = await fetch(`${API}/learning/import_catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalog_path: catalogPath, min_rating: 1, limit: 50000 })
    });
    if (!res.ok) throw new Error(await res.text());
    const info = await res.json();
    output.textContent = `過去データ取り込み完了: ${info.count}件\n保存先: ${info.saved_to}`;
  } catch (e) {
    output.textContent = `過去データ取り込みエラー: ${e.message}`;
  }
});

runBtn.addEventListener('click', async () => {
  try {
    const catalogPath = catalogPathInput.value.trim();
    if (!catalogPath) {
      output.textContent = 'エラー: Catalogファイルを選択してください';
      return;
    }

    output.textContent = '実行中...';

    const payload = {
      project_name: document.getElementById('projectName').value,
      catalog_path: catalogPath,
      rules: {
        target_picks: Number(document.getElementById('targetPicks').value), // ★3枚数
        max_per_person: Number(document.getElementById('maxPerPerson').value),
        max_per_cluster: Number(document.getElementById('maxPerCluster').value),
        quality_weight: 0.5,
        face_weight: 0.3,
        diversity_weight: 0.2
      }
    };

    const createRes = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!createRes.ok) throw new Error(`ジョブ作成失敗 (${createRes.status})`);
    const job = await createRes.json();

    const runRes = await fetch(`${API}/jobs/${job.id}/run`, { method: 'POST' });
    if (!runRes.ok) {
      const text = await runRes.text();
      throw new Error(`ジョブ実行失敗 (${runRes.status}): ${text}`);
    }

    const result = await runRes.json();
    currentJobId = result.job_id;
    currentPicks = result.picks;
    renderGallery();

    output.textContent = `完了(表示のみ): job=${result.job_id}\n画像総数=${result.total_assets}\n★3採用=${result.picked_assets}\n次は「評価をCatalogに保存」を押してください\n警告=${(result.warnings || []).join(', ') || 'なし'}`;
  } catch (e) {
    output.textContent = `エラー: ${e.message}\n\n対処:\n1) Backend(uvicorn)が起動しているか\n2) http://localhost:8008/health が開けるか\n3) Windows Defender/Firewallでブロックされていないか`;
  }
});
