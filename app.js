:root {
  --bg: #0d1117;
  --card-bg: #161b22;
  --border: #30363d;
  --text: #c9d1d9;
  --text-muted: #8b949e;
  --accent: #238636;
  --accent-hover: #2ea043;
  --danger: #da3633;
}

* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

body {
  background-color: var(--bg);
  color: var(--text);
  padding: 20px;
  display: flex;
  justify-content: center;
}

.app-container {
  width: 100%;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding-bottom: 15px;
}

.card {
  background-color: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

h2 { font-size: 1.1rem; color: var(--text); font-weight: 600; }

.inline-form {
  display: flex;
  gap: 10px;
}

input[type="number"], input[type="text"], input[type="password"] {
  background-color: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 10px;
  font-size: 1rem;
  flex: 1;
}

.btn {
  background-color: var(--border);
  color: var(--text);
  border: none;
  border-radius: 6px;
  padding: 10px 16px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
}
.btn-primary { background-color: var(--accent); color: #fff; }
.btn-primary:hover { background-color: var(--accent-hover); }
.btn-danger { background-color: var(--danger); color: #fff; }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 1.2rem; }

/* Heatmap Grid Style GitHub */
.heatmap-container {
  overflow-x: auto;
  padding-bottom: 5px;
}
.heatmap {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  grid-auto-flow: column;
  gap: 4px;
}
.heat-box {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background-color: #161b22;
  border: 1px solid rgba(27, 31, 35, 0.06);
}
.level-0 { background-color: #161b22; border-color: #30363d; }
.level-1 { background-color: #0e4429; }
.level-2 { background-color: #006d32; }
.level-3 { background-color: #26a641; }
.level-4 { background-color: #39d353; }

/* Table Historique */
.table-responsive { max-height: 250px; overflow-y: auto; }
table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
th, td { padding: 10px; border-bottom: 1px solid var(--border); }
th { color: var(--text-muted); }

.app-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

/* Modals */
.modal {
  display: none;
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.7);
  justify-content: center;
  align-items: center;
}
.modal.is-open { display: flex; }
.modal-content {
  background: var(--card-bg);
  border: 1px solid var(--border);
  padding: 20px;
  border-radius: 6px;
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
