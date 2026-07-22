const HU_MONTHS = ["jan", "feb", "márc", "ápr", "máj", "jún", "júl", "aug", "szept", "okt", "nov", "dec"];

function formatDate(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${y}. ${HU_MONTHS[m - 1]} ${d}.`;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("hu-HU", { timeZone: "Europe/Budapest", dateStyle: "medium", timeStyle: "short" });
}

function relativeTime(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "most";
  if (mins < 60) return `${mins} perce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} órája`;
  const days = Math.floor(hours / 24);
  return `${days} napja`;
}

function todayKeyBudapest(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(date);
}

function last365Keys() {
  const keys = [];
  const base = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    keys.push(todayKeyBudapest(d));
  }
  return keys;
}

function uptimeOverWindow(days, windowDays) {
  const keys = Object.keys(days).sort().slice(-windowDays);
  let up = 0;
  let total = 0;
  for (const k of keys) {
    up += days[k].up;
    total += days[k].checks;
  }
  if (total === 0) return null;
  return Math.round((up / total) * 10000) / 100;
}

function levelForDay(day) {
  if (!day || day.checks === 0) return "unknown";
  if (day.uptimePct >= 99.9) return "up";
  if (day.uptimePct <= 0) return "down";
  return "degraded";
}

function overallStatus(services, statusData) {
  const states = services.map((s) => statusData.services[s.id]?.current?.status ?? null);
  if (states.every((s) => s === null)) return "unknown";
  if (states.every((s) => s === "up")) return "up";
  if (states.every((s) => s === "down")) return "down";
  return "degraded";
}

const STATUS_LABEL = {
  up: "Elérhető",
  down: "Nem elérhető",
  unknown: "Ismeretlen",
};

const BANNER_LABEL = {
  up: "Minden rendszer működik",
  degraded: "Részleges kimaradás",
  down: "Teljes kimaradás",
  unknown: "Állapot ismeretlen — még nem történt ellenőrzés",
};

function renderBars(days) {
  const keys = last365Keys();
  const frag = document.createDocumentFragment();
  for (const key of keys) {
    const day = days[key];
    const level = levelForDay(day);
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.dataset.level = level;
    const label = day
      ? `${formatDate(key)}: ${day.uptimePct}% elérhetőség (${day.checks} ellenőrzésből ${day.up} sikeres)`
      : `${formatDate(key)}: nincs adat`;
    bar.title = label;
    frag.appendChild(bar);
  }
  return frag;
}

function renderService(svc, entry) {
  const card = document.createElement("div");
  card.className = "service-card";

  const current = entry?.current ?? null;
  const status = current?.status ?? "unknown";
  const days = entry?.days ?? {};

  const uptime90 = uptimeOverWindow(days, 90);
  const uptime365 = uptimeOverWindow(days, 365);

  card.innerHTML = `
    <div class="service-top">
      <div class="service-name"><a href="${svc.url}" target="_blank" rel="noopener">${svc.name}</a></div>
      <span class="pill status-${status}">
        <span class="dot"></span>${STATUS_LABEL[status] ?? "Ismeretlen"}
      </span>
    </div>
    <div class="bars"></div>
    <div class="bars-footer">
      <span>365 nappal ezelőtt</span>
      <span>ma</span>
    </div>
    <div class="meta-row">
      <span>Elérhetőség (90 nap): <strong>${uptime90 !== null ? uptime90 + "%" : "n/a"}</strong></span>
      <span>Elérhetőség (365 nap): <strong>${uptime365 !== null ? uptime365 + "%" : "n/a"}</strong></span>
      <span>Utolsó ellenőrzés: ${current ? relativeTime(current.lastCheck) : "n/a"}</span>
      ${current?.responseTimeMs != null ? `<span>Válaszidő: ${current.responseTimeMs} ms</span>` : ""}
    </div>
  `;

  card.querySelector(".bars").appendChild(renderBars(days));
  return card;
}

function renderIncidents(services, statusData) {
  const items = [];
  for (const svc of services) {
    const entry = statusData.services[svc.id];
    if (!entry) continue;
    for (const inc of entry.incidents ?? []) {
      items.push({ svc, inc });
    }
  }
  items.sort((a, b) => new Date(b.inc.start) - new Date(a.inc.start));

  const container = document.getElementById("incidents-list");
  container.innerHTML = "";

  if (items.length === 0) {
    container.innerHTML = '<p class="empty-note">Nem történt még rögzített kimaradás.</p>';
    return;
  }

  for (const { svc, inc } of items.slice(0, 20)) {
    const div = document.createElement("div");
    div.className = "incident-item";
    const durationText = inc.durationMin != null ? `${inc.durationMin} percig tartott` : "jelenleg is tart";
    div.innerHTML = `
      <div class="svc">${svc.name}</div>
      <div class="when">${formatDateTime(inc.start)} – ${inc.end ? formatDateTime(inc.end) : "most"} (${durationText})</div>
    `;
    container.appendChild(div);
  }
}

async function load() {
  const cacheBuster = `?t=${Date.now()}`;
  const [services, statusData] = await Promise.all([
    fetch(`data/services.json${cacheBuster}`).then((r) => r.json()),
    fetch(`data/status.json${cacheBuster}`).then((r) => r.json()),
  ]);

  const banner = document.getElementById("summary-banner");
  const overall = overallStatus(services, statusData);
  banner.className = `summary-banner status-${overall}`;
  banner.innerHTML = `<span class="dot"></span>${BANNER_LABEL[overall]}`;

  document.getElementById("updated-at").textContent = statusData.updatedAt
    ? `Frissítve: ${formatDateTime(statusData.updatedAt)} (${relativeTime(statusData.updatedAt)})`
    : "Még nem történt ellenőrzés";

  const list = document.getElementById("services-list");
  list.innerHTML = "";
  for (const svc of services) {
    list.appendChild(renderService(svc, statusData.services[svc.id]));
  }

  renderIncidents(services, statusData);
}

load().catch((err) => {
  console.error(err);
  document.getElementById("summary-banner").textContent = "Hiba történt az állapotadatok betöltésekor.";
});

// Refresh periodically so the page stays live without a manual reload.
setInterval(() => load().catch(console.error), 60000);
