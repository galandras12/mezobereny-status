import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SERVICES_PATH = fileURLToPath(new URL("../data/services.json", import.meta.url));
const STATUS_PATH = fileURLToPath(new URL("../data/status.json", import.meta.url));

const TIMEOUT_MS = 15000;
const MAX_HISTORY_DAYS = 365;
const MAX_INCIDENTS_PER_SERVICE = 200;

function dayKey(date) {
  // YYYY-MM-DD in the Europe/Budapest timezone.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(date);
}

async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "mezobereny-status-bot/1.0 (+https://github.com/galandras12/mezobereny-status)",
      },
    });
    return {
      up: res.status >= 200 && res.status < 400,
      statusCode: res.status,
      responseTimeMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    return {
      up: false,
      statusCode: null,
      responseTimeMs: Date.now() - start,
      error: err.name === "AbortError" ? "timeout" : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function pruneOldDays(days) {
  const keys = Object.keys(days).sort();
  if (keys.length > MAX_HISTORY_DAYS) {
    for (const key of keys.slice(0, keys.length - MAX_HISTORY_DAYS)) {
      delete days[key];
    }
  }
}

async function main() {
  const services = await loadJson(SERVICES_PATH, []);
  const status = await loadJson(STATUS_PATH, { updatedAt: null, services: {} });

  const now = new Date();
  const nowIso = now.toISOString();
  const today = dayKey(now);

  for (const svc of services) {
    const result = await checkUrl(svc.url);
    const newStatus = result.up ? "up" : "down";

    const entry = status.services[svc.id] ?? { current: null, days: {}, incidents: [] };
    const prevStatus = entry.current?.status ?? null;

    if (prevStatus && prevStatus !== newStatus) {
      if (newStatus === "down") {
        entry.incidents.push({
          start: nowIso,
          end: null,
          durationMin: null,
          statusCode: result.statusCode,
          error: result.error,
        });
      } else {
        const open = [...entry.incidents].reverse().find((i) => i.end === null);
        if (open) {
          open.end = nowIso;
          open.durationMin = Math.round((new Date(open.end) - new Date(open.start)) / 60000);
        }
      }
      if (entry.incidents.length > MAX_INCIDENTS_PER_SERVICE) {
        entry.incidents = entry.incidents.slice(-MAX_INCIDENTS_PER_SERVICE);
      }
    }

    entry.current = {
      status: newStatus,
      statusCode: result.statusCode,
      responseTimeMs: result.responseTimeMs,
      error: result.error,
      lastCheck: nowIso,
      since: prevStatus === newStatus && entry.current?.since ? entry.current.since : nowIso,
    };

    const day = entry.days[today] ?? { checks: 0, up: 0, down: 0, avgResponseMs: 0 };
    const totalResponse = day.avgResponseMs * day.checks + result.responseTimeMs;
    day.checks += 1;
    if (newStatus === "up") day.up += 1;
    else day.down += 1;
    day.avgResponseMs = Math.round(totalResponse / day.checks);
    day.uptimePct = Math.round((day.up / day.checks) * 10000) / 100;
    entry.days[today] = day;

    pruneOldDays(entry.days);
    status.services[svc.id] = entry;

    console.log(
      `[${svc.id}] ${newStatus.toUpperCase()} status=${result.statusCode ?? "ERR"} ${result.responseTimeMs}ms ${
        result.error ? `(${result.error})` : ""
      }`,
    );
  }

  status.updatedAt = nowIso;
  await writeFile(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
