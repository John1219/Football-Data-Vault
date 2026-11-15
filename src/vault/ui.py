"""Lightweight single-page web UI for the Ultimate Football Data Vault."""

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ultimate Football Data Vault</title>
  <style>
    :root {
      --bg: #0f172a; --panel: #1e293b; --border: #334155;
      --text: #f8fafc; --muted: #94a3b8; --accent: #38bdf8;
      --ok: #22c55e; --err: #ef4444;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); }
    header { display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; background: var(--panel); border-bottom: 1px solid var(--border); }
    h1 { margin: 0; font-size: 1.2rem; }
    .badge { padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; background: #064e3b; color: #6ee7b7; }
    .badge.err { background: #7f1d1d; color: #fca5a5; }
    nav { display: flex; gap: 8px; padding: 12px 24px; border-bottom: 1px solid var(--border); }
    nav button { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 8px 16px; border-radius: 6px; cursor: pointer; }
    nav button.active { background: var(--accent); color: #0f172a; border-color: var(--accent); font-weight: 600; }
    main { padding: 24px; max-width: 1280px; margin: 0 auto; }
    .tab { display: none; }
    .tab.active { display: block; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    button.primary { background: var(--accent); color: #0f172a; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; }
    button.secondary { background: #334155; color: var(--text); border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
    button:disabled { opacity: 0.5; cursor: wait; }
    textarea, input, select { background: #0f172a; color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px; font-family: inherit; }
    textarea { width: 100%; font-family: ui-monospace, monospace; font-size: 0.9rem; }
    .table-wrap { overflow-x: auto; max-height: 440px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    th { color: var(--muted); position: sticky; top: 0; background: var(--panel); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .media-item { background: #0f172a; border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
    .media-item img, .media-item video { width: 100%; border-radius: 6px; max-height: 180px; object-fit: cover; margin-top: 8px; }
    .media-item audio { width: 100%; margin-top: 8px; }
    .muted { color: var(--muted); font-size: 0.8rem; }
    .form-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .form-row > * { flex: 1 1 180px; }
    pre { background: #0f172a; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 0.8rem; }
  </style>
</head>
<body>
  <header>
    <h1>Ultimate Football Data Vault</h1>
    <span id="healthBadge" class="badge">Checking...</span>
  </header>
  <nav>
    <button class="active" onclick="showTab('overview', this)">Overview &amp; Sync</button>
    <button onclick="showTab('sql', this)">DuckDB SQL Explorer</button>
    <button onclick="showTab('media', this)">Media Vault</button>
  </nav>
  <main>
    <section id="overview" class="tab active">
      <div class="card">
        <h3>Sync Pipelines</h3>
        <div class="form-row" style="margin-bottom:12px;">
          <input id="syncSeasons" placeholder="Seasons (optional, e.g. 2020-2023 or 2021,2022 — blank uses .env)" />
        </div>
        <div class="actions">
          <button class="primary" onclick="runSync('/sync/current', this)">Quick Sync: Current Season Only</button>
          <button class="secondary" onclick="runSync('/sync/nfl', this)">Sync NFL</button>
          <button class="secondary" onclick="runSync('/sync/cfb', this)">Sync CFB</button>
          <button class="secondary" onclick="runSync('/sync/sleeper', this)">Sync Sleeper</button>
          <button class="secondary" onclick="runSync('/sync/weather', this)">Sync Weather</button>
          <button class="secondary" onclick="runSync('/media/scan', this)">Scan Local Media</button>
        </div>
        <pre id="syncOutput" style="display:none; margin-top:12px;"></pre>
      </div>
      <div class="card">
        <h3>Registered DuckDB Views</h3>
        <div id="viewsList" class="actions"></div>
      </div>
      <div class="card">
        <h3>Recent Ingestion Runs</h3>
        <div class="table-wrap"><table id="runsTable"></table></div>
      </div>
    </section>

    <section id="sql" class="tab">
      <div class="card">
        <div class="actions" style="margin-bottom:10px;">
          <button class="secondary" onclick="setSql('SELECT season, COUNT(*) AS games FROM nfl_schedules GROUP BY season ORDER BY season')">NFL Games by Season</button>
          <button class="secondary" onclick="setSql('SELECT passer_player_name, COUNT(*) AS plays, ROUND(AVG(epa), 3) AS avg_epa FROM nfl_pbp WHERE season = 2025 AND pass_attempt = 1 AND passer_player_name IS NOT NULL GROUP BY 1 HAVING COUNT(*) >= 150 ORDER BY avg_epa DESC LIMIT 15')">Top QBs by EPA (2025)</button>
          <button class="secondary" onclick="setSql('SELECT season, week, gameday, home_team, temp_f, wind_mph FROM nfl_weather ORDER BY temp_f ASC LIMIT 15')">Coldest Games (Weather)</button>
          <button class="secondary" onclick="setSql('SELECT season, COUNT(*) AS games FROM cfb_games GROUP BY season ORDER BY season')">CFB Games by Season</button>
        </div>
        <textarea id="sqlInput" rows="4">SELECT season, COUNT(*) AS games FROM nfl_schedules GROUP BY season ORDER BY season</textarea>
        <div style="margin-top:10px;">
          <button class="primary" onclick="runQuery()">Run Query</button>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap"><table id="sqlResults"></table></div>
      </div>
    </section>

    <section id="media" class="tab">
      <div class="card">
        <h3>Register Link-Only Media (YouTube, NFL+, Archive.org, LOC)</h3>
        <div class="form-row">
          <input id="mTitle" placeholder="Title (required)" />
          <select id="mType">
            <option value="video">video</option>
            <option value="audio">audio</option>
            <option value="image">image</option>
          </select>
          <input id="mUrl" placeholder="Source URL (https://...)" />
          <input id="mSource" placeholder="Source Name (e.g. NFL YouTube)" />
          <input id="mLicense" placeholder="License (e.g. Link-Only)" />
          <input id="mSeason" type="number" placeholder="Season" />
          <input id="mTeam" placeholder="Team (e.g. KC)" />
        </div>
        <button class="primary" onclick="registerLink()">Register Link</button>
      </div>
      <div class="card">
        <div class="form-row">
          <select id="fType" onchange="loadMedia()">
            <option value="">All types</option>
            <option value="image">image</option>
            <option value="audio">audio</option>
            <option value="video">video</option>
          </select>
          <input id="fTeam" placeholder="Filter by team (e.g. KC)" onchange="loadMedia()" />
          <button class="secondary" onclick="loadMedia()">Refresh</button>
        </div>
        <div id="mediaGrid" class="grid"></div>
      </div>
    </section>
  </main>

  <script>
    function showTab(id, btn) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      btn.classList.add('active');
      if (id === 'media') loadMedia();
    }
    function setSql(q) { document.getElementById('sqlInput').value = q; }
    function renderTable(el, rows) {
      if (!rows || !rows.length) { el.innerHTML = '<tr><td class="muted">No rows</td></tr>'; return; }
      const cols = Object.keys(rows[0]);
      el.innerHTML = '<thead><tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead>' +
        '<tbody>' + rows.map(r => '<tr>' + cols.map(c => `<td>${r[c] ?? ''}</td>`).join('') + '</tr>').join('') + '</tbody>';
    }
    async function loadOverview() {
      try {
        const h = await fetch('/health').then(r => r.json());
        const b = document.getElementById('healthBadge');
        b.textContent = h.postgres && h.duckdb ? 'Postgres + DuckDB OK' : 'Degraded';
        b.classList.toggle('err', !(h.postgres && h.duckdb));
      } catch { document.getElementById('healthBadge').textContent = 'Offline'; }
      const v = await fetch('/views').then(r => r.json());
      document.getElementById('viewsList').innerHTML = (v.views || []).map(x => `<span class="badge">${x}</span>`).join('') || '<span class="muted">No views yet</span>';
      const runs = await fetch('/runs?limit=15').then(r => r.json());
      renderTable(document.getElementById('runsTable'), runs);
    }
    function parseSeasonsInput() {
      const raw = document.getElementById('syncSeasons').value.trim();
      if (!raw) return null;
      const years = new Set();
      for (const part of raw.split(',')) {
        const s = part.trim();
        if (!s) continue;
        const range = s.match(/^(\d{4})\s*-\s*(\d{4})$/);
        if (range) {
          const a = Number(range[1]), b = Number(range[2]);
          for (let y = Math.min(a, b); y <= Math.max(a, b); y++) years.add(y);
        } else if (/^\d{4}$/.test(s)) {
          years.add(Number(s));
        } else {
          throw new Error(`Invalid season format: "${s}". Use YYYY or YYYY-YYYY.`);
        }
      }
      return Array.from(years).sort((a, b) => a - b);
    }
    async function runSync(path, btn) {
      let seasons = null;
      if (path === '/sync/nfl' || path === '/sync/cfb' || path === '/sync/weather') {
        try { seasons = parseSeasonsInput(); }
        catch (err) { alert(err.message); return; }
      }
      btn.disabled = true;
      const out = document.getElementById('syncOutput');
      out.style.display = 'block';
      out.textContent = 'Running ' + path + (seasons ? ` for [${seasons.join(', ')}]` : '') + '...';
      try {
        const opts = { method: 'POST' };
        if (seasons) {
          opts.headers = { 'Content-Type': 'application/json' };
          opts.body = JSON.stringify({ seasons });
        }
        const res = await fetch(path, opts);
        out.textContent = JSON.stringify(await res.json(), null, 2);
        await loadOverview();
      } finally { btn.disabled = false; }
    }
    async function runQuery() {
      const sql = document.getElementById('sqlInput').value;
      const res = await fetch('/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.detail || 'Query failed'); return; }
      renderTable(document.getElementById('sqlResults'), data.rows);
    }
    async function registerLink() {
      const payload = {
        title: document.getElementById('mTitle').value,
        media_type: document.getElementById('mType').value,
        is_local_file: false,
        source_url: document.getElementById('mUrl').value || null,
        source_name: document.getElementById('mSource').value || null,
        license_name: document.getElementById('mLicense').value || null,
        season: document.getElementById('mSeason').value ? Number(document.getElementById('mSeason').value) : null,
        team_abbr: document.getElementById('mTeam').value || null,
      };
      const res = await fetch('/media/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) { alert((await res.json()).detail); return; }
      document.getElementById('mTitle').value = '';
      document.getElementById('mUrl').value = '';
      loadMedia();
    }
    async function loadMedia() {
      const params = new URLSearchParams();
      const t = document.getElementById('fType').value;
      const tm = document.getElementById('fTeam').value.trim();
      if (t) params.set('media_type', t);
      if (tm) params.set('team_abbr', tm);
      const items = await fetch('/media?' + params.toString()).then(r => r.json());
      const grid = document.getElementById('mediaGrid');
      if (!items.length) { grid.innerHTML = '<p class="muted">No media assets registered yet.</p>'; return; }
      grid.innerHTML = items.map(item => {
        let preview = '';
        if (item.is_local_file) {
          const url = `/media/file/${item.id}`;
          if (item.media_type === 'image') preview = `<img src="${url}" alt="${item.title}" />`;
          else if (item.media_type === 'audio') preview = `<audio controls src="${url}"></audio>`;
          else if (item.media_type === 'video') preview = `<video controls src="${url}"></video>`;
        } else if (item.source_url) {
          preview = `<div style="margin-top:8px;"><a href="${item.source_url}" target="_blank" style="color:var(--accent)">Open External Link</a></div>`;
        }
        return `<div class="media-item"><strong>${item.title}</strong><div class="muted">${item.media_type} • ${item.source_name || ''} ${item.season || ''} ${item.team_abbr || ''}</div>${preview}</div>`;
      }).join('');
    }
    loadOverview();
  </script>
</body>
</html>
"""
