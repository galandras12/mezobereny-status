import { ADMIN_PASSWORD } from "../auth-config.js";

const SESSION_KEY = "mb-admin-authed";
const SETTINGS_KEY = "mb-admin-gh-settings";
const TOKEN_KEY = "mb-admin-gh-token";
const DEFAULT_SETTINGS = { owner: "galandras12", repo: "mezobereny-status", branch: "main" };
const DEFAULT_WARNING =
  'Nincs beállítva (érvényes) GitHub token, ezért a módosítások csak ebben a böngészőben, ideiglenesen érvényesülnek — nem kerülnek fel a publikus oldalra. Állítsd be a Beállítások fülön, vagy használd a „JSON letöltése” gombot és commitold kézzel.';

const state = {
  services: [],
  statusTypes: {},
  incidents: [],
};

// ---------- storage helpers ----------
function isAuthed() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}
function login(password) {
  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem(SESSION_KEY, "1");
    return true;
  }
  return false;
}
function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}
function getSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function setSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ---------- encoding helpers ----------
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}
function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ---------- formatting ----------
function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("hu-HU", { timeZone: "Europe/Budapest", dateStyle: "medium", timeStyle: "short" });
}
function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- GitHub API ----------
async function ghRequest(path, opts = {}) {
  const { owner, repo } = getSettings();
  const token = getToken();
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
}

async function fetchIncidentsFromGitHub() {
  const { branch } = getSettings();
  const res = await ghRequest(`/contents/data/incidents.json?ref=${encodeURIComponent(branch)}`);
  if (!res.ok) throw new Error(`olvasási hiba (${res.status})`);
  const json = await res.json();
  const parsed = JSON.parse(base64ToUtf8(json.content));
  return { incidents: parsed.incidents ?? [], sha: json.sha };
}

async function writeIncidentsToGitHub(incidents, sha, message) {
  const { branch } = getSettings();
  const res = await ghRequest(`/contents/data/incidents.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: utf8ToBase64(`${JSON.stringify({ incidents }, null, 2)}\n`),
      branch,
      sha,
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(`írási hiba (${res.status}: ${errBody?.message ?? "ismeretlen"})`);
  }
  return res.json();
}

// ---------- data loading ----------
async function loadStaticData() {
  const [services, statusTypes] = await Promise.all([
    fetch("../data/services.json").then((r) => r.json()),
    fetch("../data/status-types.json").then((r) => r.json()),
  ]);
  state.services = services;
  state.statusTypes = statusTypes;
}

async function loadIncidents() {
  const token = getToken();
  if (token) {
    try {
      const { incidents } = await fetchIncidentsFromGitHub();
      state.incidents = incidents;
      setPublishWarning(false);
      return;
    } catch (err) {
      console.error(err);
      setPublishWarning(true, `Nem sikerült beolvasni a GitHub-ról (${err.message}) — statikus adat betöltve, csak olvasható.`);
    }
  } else {
    setPublishWarning(true);
  }
  try {
    const res = await fetch(`../data/incidents.json?t=${Date.now()}`);
    const data = await res.json();
    state.incidents = data.incidents ?? [];
  } catch {
    state.incidents = [];
  }
}

async function mutateIncidents(transformFn, commitMessage) {
  const token = getToken();
  if (token) {
    try {
      const { incidents, sha } = await fetchIncidentsFromGitHub();
      const next = transformFn(incidents);
      await writeIncidentsToGitHub(next, sha, commitMessage);
      state.incidents = next;
      setPublishWarning(false);
    } catch (err) {
      console.error(err);
      state.incidents = transformFn(state.incidents);
      setPublishWarning(true, `Publikálás sikertelen (${err.message}). A változás csak ideiglenesen, ebben a böngészőben érvényesül.`);
    }
  } else {
    state.incidents = transformFn(state.incidents);
    setPublishWarning(true);
  }
  renderIncidents();
}

// ---------- mutations ----------
async function createIncident({ title, start, status, message, serviceIds }) {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const scheduledStart = new Date(start).toISOString();
  const incident = {
    id,
    title,
    serviceIds,
    createdAt: nowIso,
    updatedAt: nowIso,
    scheduledStart,
    updates: [{ at: nowIso, status, message }],
  };
  await mutateIncidents((list) => [incident, ...list], `Új bejelentés: ${title}`);
}

async function addUpdate(incidentId, status, message) {
  const nowIso = new Date().toISOString();
  const existing = state.incidents.find((i) => i.id === incidentId);
  await mutateIncidents(
    (list) =>
      list.map((inc) =>
        inc.id === incidentId
          ? { ...inc, updatedAt: nowIso, updates: [...inc.updates, { at: nowIso, status, message }] }
          : inc,
      ),
    `Bejelentés frissítve: ${existing?.title ?? incidentId}`,
  );
}

async function deleteIncident(incidentId) {
  const existing = state.incidents.find((i) => i.id === incidentId);
  if (!confirm(`Biztosan törlöd: "${existing?.title ?? incidentId}"? Ez végleges.`)) return;
  await mutateIncidents((list) => list.filter((i) => i.id !== incidentId), `Bejelentés törölve: ${existing?.title ?? incidentId}`);
}

// ---------- rendering ----------
function setPublishWarning(show, message) {
  const el = document.getElementById("publish-warning");
  el.hidden = !show;
  el.textContent = message || DEFAULT_WARNING;
}

function statusBadge(statusKey) {
  const def = state.statusTypes[statusKey] ?? { label: statusKey, color: "#888888" };
  const span = document.createElement("span");
  span.className = "badge";
  span.style.setProperty("--badge-color", def.color);
  const dot = document.createElement("span");
  dot.className = "dot";
  span.append(dot, document.createTextNode(def.label));
  return span;
}

function buildStatusSelect(selected) {
  const select = document.createElement("select");
  for (const [key, def] of Object.entries(state.statusTypes)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = def.label;
    if (key === selected) opt.selected = true;
    select.appendChild(opt);
  }
  return select;
}

function renderStatusOptions() {
  const mainSelect = document.getElementById("inc-status");
  mainSelect.innerHTML = "";
  for (const [key, def] of Object.entries(state.statusTypes)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = def.label;
    mainSelect.appendChild(opt);
  }
}

function renderServiceCheckboxes() {
  const container = document.getElementById("inc-services");
  container.innerHTML = "";

  const allLabel = document.createElement("label");
  const allCheckbox = document.createElement("input");
  allCheckbox.type = "checkbox";
  allCheckbox.id = "svc-all";
  allLabel.append(allCheckbox, document.createTextNode(" Összes szolgáltatás (teljes oldal)"));
  container.appendChild(allLabel);

  const individual = [];
  for (const svc of state.services) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = svc.id;
    label.append(cb, document.createTextNode(` ${svc.name}`));
    container.appendChild(label);
    individual.push(cb);
  }

  allCheckbox.addEventListener("change", () => {
    for (const cb of individual) {
      cb.disabled = allCheckbox.checked;
      if (allCheckbox.checked) cb.checked = false;
    }
  });
}

function getSelectedServiceIds() {
  const allCheckbox = document.getElementById("svc-all");
  if (allCheckbox.checked) return [];
  return Array.from(document.querySelectorAll("#inc-services input[type=checkbox]:not(#svc-all)"))
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

function setDefaultStartValue() {
  document.getElementById("inc-start").value = toDatetimeLocalValue(new Date());
}

function buildIncidentCard(inc) {
  const card = document.createElement("div");
  card.className = "incident-card";

  const latest = inc.updates[inc.updates.length - 1];
  const affected =
    inc.serviceIds && inc.serviceIds.length > 0
      ? inc.serviceIds.map((id) => state.services.find((s) => s.id === id)?.name ?? id).join(", ")
      : "Teljes oldal";

  const top = document.createElement("div");
  top.className = "incident-card-top";
  const titleWrap = document.createElement("div");
  titleWrap.innerHTML = `<h3>${escapeHtml(inc.title)}</h3><div class="incident-meta">Érintett: ${escapeHtml(
    affected,
  )} · Kezdés: ${formatDateTime(inc.scheduledStart)}</div>`;
  top.appendChild(titleWrap);
  top.appendChild(statusBadge(latest.status));
  card.appendChild(top);

  const timeline = document.createElement("div");
  timeline.className = "timeline";
  [...inc.updates]
    .reverse()
    .forEach((u) => {
      const item = document.createElement("div");
      item.className = "timeline-item";
      const when = document.createElement("div");
      when.className = "when";
      when.textContent = formatDateTime(u.at);
      item.appendChild(when);
      item.appendChild(statusBadge(u.status));
      const msg = document.createElement("div");
      msg.className = "msg";
      msg.textContent = u.message;
      item.appendChild(msg);
      timeline.appendChild(item);
    });
  card.appendChild(timeline);

  const updateForm = document.createElement("form");
  updateForm.className = "update-form";
  const select = buildStatusSelect(latest.status);
  const textarea = document.createElement("textarea");
  textarea.rows = 2;
  textarea.required = true;
  textarea.placeholder = "Új státusz-üzenet…";
  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "btn btn-primary";
  submitBtn.textContent = "Frissítés hozzáadása";
  updateForm.append(select, textarea, submitBtn);
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = textarea.value.trim();
    if (!message) return;
    submitBtn.disabled = true;
    await addUpdate(inc.id, select.value, message);
    submitBtn.disabled = false;
  });
  card.appendChild(updateForm);

  const actions = document.createElement("div");
  actions.className = "card-actions";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn";
  delBtn.textContent = "Bejelentés törlése";
  delBtn.addEventListener("click", () => deleteIncident(inc.id));
  actions.appendChild(delBtn);
  card.appendChild(actions);

  return card;
}

function renderIncidents() {
  const container = document.getElementById("incidents-list");
  container.innerHTML = "";
  if (state.incidents.length === 0) {
    container.innerHTML = '<p class="empty-note">Még nincs rögzített bejelentés.</p>';
    return;
  }
  const sorted = [...state.incidents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const inc of sorted) {
    container.appendChild(buildIncidentCard(inc));
  }
}

function populateSettingsForm() {
  const settings = getSettings();
  document.getElementById("gh-owner").value = settings.owner;
  document.getElementById("gh-repo").value = settings.repo;
  document.getElementById("gh-branch").value = settings.branch;
  document.getElementById("gh-token").placeholder = getToken() ? "•••• (token beállítva)" : "github_pat_…";
}

// ---------- init ----------
async function showDashboard() {
  document.getElementById("login-screen").hidden = true;
  document.getElementById("dashboard").hidden = false;

  await loadStaticData();
  renderServiceCheckboxes();
  renderStatusOptions();
  setDefaultStartValue();
  populateSettingsForm();

  await loadIncidents();
  renderIncidents();
}

function init() {
  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const password = document.getElementById("login-password").value;
    if (login(password)) {
      document.getElementById("login-error").hidden = true;
      showDashboard();
    } else {
      document.getElementById("login-error").hidden = false;
    }
  });

  document.getElementById("logout-btn").addEventListener("click", logout);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });

  document.getElementById("incident-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const title = form.title.value.trim();
    const start = form.start.value;
    const status = form.status.value;
    const message = form.message.value.trim();
    const serviceIds = getSelectedServiceIds();
    if (!title || !start || !message) return;
    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    await createIncident({ title, start, status, message, serviceIds });
    submitBtn.disabled = false;
    form.reset();
    setDefaultStartValue();
  });

  document.getElementById("download-json-btn").addEventListener("click", () => {
    const blob = new Blob([`${JSON.stringify({ incidents: state.incidents }, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "incidents.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const owner = document.getElementById("gh-owner").value.trim() || DEFAULT_SETTINGS.owner;
    const repo = document.getElementById("gh-repo").value.trim() || DEFAULT_SETTINGS.repo;
    const branch = document.getElementById("gh-branch").value.trim() || DEFAULT_SETTINGS.branch;
    setSettings({ owner, repo, branch });
    const tokenInput = document.getElementById("gh-token");
    if (tokenInput.value.trim()) {
      setToken(tokenInput.value.trim());
      tokenInput.value = "";
    }
    populateSettingsForm();
    document.getElementById("gh-test-result").textContent = "Mentve.";
    await loadIncidents();
    renderIncidents();
  });

  document.getElementById("gh-clear-btn").addEventListener("click", async () => {
    clearToken();
    populateSettingsForm();
    document.getElementById("gh-test-result").textContent = "Token törölve.";
    await loadIncidents();
    renderIncidents();
  });

  document.getElementById("gh-test-btn").addEventListener("click", async () => {
    const resultEl = document.getElementById("gh-test-result");
    resultEl.textContent = "Tesztelés…";
    try {
      const res = await ghRequest("");
      resultEl.textContent = res.ok
        ? "✓ Sikeres kapcsolat, a repó elérhető."
        : `✗ Hiba (${res.status}) — ellenőrizd a tokent és a repó nevét.`;
    } catch (err) {
      resultEl.textContent = `✗ Hálózati hiba: ${err.message}`;
    }
  });

  if (isAuthed()) {
    showDashboard();
  }
}

init();
