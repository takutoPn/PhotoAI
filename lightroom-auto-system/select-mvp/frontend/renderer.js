const API = 'http://localhost:8008';

const runBtn = document.getElementById('runBtn');
const output = document.getElementById('output');
const catalogFile = document.getElementById('catalogFile');
const catalogPathInput = document.getElementById('catalogPath');
const dropzone = document.getElementById('dropzone');

function setCatalogPathFromFile(file) {
  if (!file) return;
  const realPath = file.path || file.name;
  catalogPathInput.value = realPath;
}

catalogFile.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  setCatalogPathFromFile(file);
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.lrcat')) {
    output.textContent = 'エラー: .lrcat ファイルを指定してください';
    return;
  }
  setCatalogPathFromFile(file);
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
        target_picks: Number(document.getElementById('targetPicks').value),
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

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`ジョブ作成失敗 (${createRes.status}): ${text}`);
    }

    const job = await createRes.json();

    const runRes = await fetch(`${API}/jobs/${job.id}/run`, {
      method: 'POST'
    });

    if (!runRes.ok) {
      const text = await runRes.text();
      throw new Error(`ジョブ実行失敗 (${runRes.status}): ${text}`);
    }

    const result = await runRes.json();

    const picked = result.picks.filter((p) => p.pick).slice(0, 30);
    output.textContent = JSON.stringify({
      jobId: result.job_id,
      totalAssets: result.total_assets,
      pickedCount: result.picked_assets,
      warnings: result.warnings,
      topPicked: picked
    }, null, 2);
  } catch (e) {
    output.textContent = `エラー: ${e.message}\n\n対処:\n1) Backend(uvicorn)が起動しているか\n2) http://localhost:8008/health が開けるか\n3) Windows Defender/Firewallでブロックされていないか`;
  }
});
