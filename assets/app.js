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

function lastNDaysKeys(n) {
  const keys = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    keys.push(todayKeyBudapest(d));
  }
  return keys;
}

// How many day-bars fit the service card width without needing horizontal
// scroll — narrower (mobile) screens show fewer, most-recent days.
function computeVisibleDayCount() {
  const WRAP_MAX_WIDTH = 860;
  const WRAP_PADDING_X = 40; // .wrap left+right padding
  const CARD_PADDING_X = 36; // .service-card left+right padding
  const PX_PER_DAY = 2.2; // target bar+gap width in px
  const MIN_DAYS = 30;
  const MAX_DAYS = 365;

  const viewportWidth = Math.min(window.innerWidth, WRAP_MAX_WIDTH);
  const available = viewportWidth - WRAP_PADDING_X - CARD_PADDING_X;
  const count = Math.floor(available / PX_PER_DAY);
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, count));
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

function renderBars(days, dayCount) {
  const keys = lastNDaysKeys(dayCount);
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

const SEVERITY_RANK = { major_outage: 4, partial_outage: 3, offline: 2, maintenance: 1, online: 0 };

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function latestUpdate(incident) {
  return incident.updates[incident.updates.length - 1];
}

function isActiveIncident(incident) {
  return latestUpdate(incident)?.status !== "online";
}

function affectsService(incident, serviceId) {
  return !incident.serviceIds || incident.serviceIds.length === 0 || incident.serviceIds.includes(serviceId);
}

// Map of serviceId -> most severe active manual incident affecting it, if any.
function buildActiveIncidentByService(incidents, services) {
  const map = {};
  for (const svc of services) {
    let worst = null;
    for (const inc of incidents) {
      if (!isActiveIncident(inc) || !affectsService(inc, svc.id)) continue;
      const status = latestUpdate(inc).status;
      if (!worst || (SEVERITY_RANK[status] ?? 0) > (SEVERITY_RANK[latestUpdate(worst).status] ?? 0)) {
        worst = inc;
      }
    }
    if (worst) map[svc.id] = worst;
  }
  return map;
}

function statusBadgeHtml(statusKey, statusTypes) {
  const def = statusTypes[statusKey] ?? { label: statusKey, color: "#888888" };
  return `<span class="pill pill-color" style="--pill-color:${def.color}"><span class="dot"></span>${escapeHtml(def.label)}</span>`;
}

function renderService(svc, entry, manualIncident, statusTypes, dayCount) {
  const card = document.createElement("div");
  card.className = "service-card";

  const current = entry?.current ?? null;
  const status = current?.status ?? "unknown";
  const days = entry?.days ?? {};

  const uptime90 = uptimeOverWindow(days, 90);
  const uptime365 = uptimeOverWindow(days, 365);

  const pillHtml = manualIncident
    ? statusBadgeHtml(latestUpdate(manualIncident).status, statusTypes)
    : `<span class="pill status-${status}"><span class="dot"></span>${STATUS_LABEL[status] ?? "Ismeretlen"}</span>`;

  card.innerHTML = `
    <div class="service-top">
      <div class="service-name"><a href="${svc.url}" target="_blank" rel="noopener">${svc.name}</a></div>
      ${pillHtml}
    </div>
    ${
      manualIncident
        ? `<div class="manual-incident-note">${escapeHtml(latestUpdate(manualIncident).message)}</div>`
        : ""
    }
    <div class="bars"></div>
    <div class="bars-footer">
      <span>${dayCount} nappal ezelőtt</span>
      <span>ma</span>
    </div>
    <div class="meta-row">
      <span>Elérhetőség (90 nap): <strong>${uptime90 !== null ? uptime90 + "%" : "n/a"}</strong></span>
      <span>Elérhetőség (365 nap): <strong>${uptime365 !== null ? uptime365 + "%" : "n/a"}</strong></span>
      <span>Utolsó ellenőrzés: ${current ? relativeTime(current.lastCheck) : "n/a"}</span>
      ${current?.responseTimeMs != null ? `<span>Válaszidő: ${current.responseTimeMs} ms</span>` : ""}
    </div>
  `;

  card.querySelector(".bars").appendChild(renderBars(days, dayCount));
  return card;
}

function renderAnnouncementCard(inc, services, statusTypes) {
  const div = document.createElement("div");
  div.className = "incident-item announcement-item";
  const affected =
    inc.serviceIds && inc.serviceIds.length > 0
      ? inc.serviceIds.map((id) => services.find((s) => s.id === id)?.name ?? id).join(", ")
      : "Teljes oldal";

  const timelineHtml = [...inc.updates]
    .reverse()
    .map(
      (u) =>
        `<div class="announcement-update">
          <div class="when">${formatDateTime(u.at)} — ${statusBadgeHtml(u.status, statusTypes)}</div>
          <div class="msg">${escapeHtml(u.message)}</div>
        </div>`,
    )
    .join("");

  div.innerHTML = `
    <div class="svc">${escapeHtml(inc.title)}</div>
    <div class="when">Érintett: ${escapeHtml(affected)} · Kezdés: ${formatDateTime(inc.scheduledStart)}</div>
    <div class="announcement-timeline">${timelineHtml}</div>
  `;
  return div;
}

function renderAnnouncements(incidents, services, statusTypes) {
  const activeContainer = document.getElementById("active-announcements");
  const active = incidents.filter(isActiveIncident).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  activeContainer.innerHTML = "";
  if (active.length === 0) {
    activeContainer.hidden = true;
  } else {
    activeContainer.hidden = false;
    for (const inc of active) {
      const card = document.createElement("div");
      card.className = "announcement-banner";
      card.style.setProperty("--pill-color", statusTypes[latestUpdate(inc).status]?.color ?? "#888888");
      card.appendChild(renderAnnouncementCard(inc, services, statusTypes));
      activeContainer.appendChild(card);
    }
  }

  const allContainer = document.getElementById("announcements-list");
  allContainer.innerHTML = "";
  if (incidents.length === 0) {
    allContainer.innerHTML = '<p class="empty-note">Nincs rögzített bejelentés vagy tervezett karbantartás.</p>';
    return;
  }
  const sorted = [...incidents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const inc of sorted) {
    allContainer.appendChild(renderAnnouncementCard(inc, services, statusTypes));
  }
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
  const [services, statusData, incidentsData, statusTypes] = await Promise.all([
    fetch(`data/services.json${cacheBuster}`).then((r) => r.json()),
    fetch(`data/status.json${cacheBuster}`).then((r) => r.json()),
    fetch(`data/incidents.json${cacheBuster}`).then((r) => r.json()),
    fetch(`data/status-types.json${cacheBuster}`).then((r) => r.json()),
  ]);
  const incidents = incidentsData.incidents ?? [];

  const banner = document.getElementById("summary-banner");
  const overall = overallStatus(services, statusData);
  banner.className = `summary-banner status-${overall}`;
  banner.innerHTML = `<span class="dot"></span>${BANNER_LABEL[overall]}`;

  document.getElementById("updated-at").textContent = statusData.updatedAt
    ? `Frissítve: ${formatDateTime(statusData.updatedAt)} (${relativeTime(statusData.updatedAt)})`
    : "Még nem történt ellenőrzés";

  const activeByService = buildActiveIncidentByService(incidents, services);
  const dayCount = computeVisibleDayCount();

  const list = document.getElementById("services-list");
  list.innerHTML = "";
  for (const svc of services) {
    list.appendChild(renderService(svc, statusData.services[svc.id], activeByService[svc.id], statusTypes, dayCount));
  }

  renderIncidents(services, statusData);
  renderAnnouncements(incidents, services, statusTypes);
}

load().catch((err) => {
  console.error(err);
  document.getElementById("summary-banner").textContent = "Hiba történt az állapotadatok betöltésekor.";
});

// Refresh periodically so the page stays live without a manual reload.
setInterval(() => load().catch(console.error), 60000);

// Re-render the bar charts (with a different day count) on resize/rotation.
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => load().catch(console.error), 300);
});
