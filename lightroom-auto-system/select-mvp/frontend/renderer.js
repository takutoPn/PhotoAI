const API = 'http://localhost:8008';

const runBtn = document.getElementById('runBtn');
const output = document.getElementById('output');

runBtn.addEventListener('click', async () => {
  try {
    output.textContent = '実行中...';

    const payload = {
      project_name: document.getElementById('projectName').value,
      catalog_path: document.getElementById('catalogPath').value,
      rules: {
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
    const job = await createRes.json();

    const runRes = await fetch(`${API}/jobs/${job.id}/run`, {
      method: 'POST'
    });
    const result = await runRes.json();

    const picked = result.picks.filter((p) => p.pick).slice(0, 20);
    output.textContent = JSON.stringify({
      jobId: result.job_id,
      pickedCount: result.picks.filter((p) => p.pick).length,
      top20: picked
    }, null, 2);
  } catch (e) {
    output.textContent = `エラー: ${e.message}`;
  }
});
