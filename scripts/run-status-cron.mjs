#!/usr/bin/env node
import { spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const CHECK_SCRIPT = fileURLToPath(new URL("./check-status.mjs", import.meta.url));
const INTERVAL_CHOICES = [1, 5, 10, 15];

function now() {
  return new Date().toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
}

function runCheckOnce() {
  return new Promise((resolve) => {
    console.log(`\n[${now()}] check-status.mjs indítása…`);
    const child = spawn(process.execPath, [CHECK_SCRIPT], { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code !== 0) console.error(`[${now()}] check-status.mjs hibával lépett ki (kód: ${code})`);
      resolve();
    });
  });
}

function printMenu() {
  console.log("Milyen gyakorisággal fusson a check-status.mjs?");
  INTERVAL_CHOICES.forEach((minutes, i) => console.log(`  [${i + 1}] ${minutes} percenként`));
  process.stdout.write("Válassz (1-4), majd Enter: ");
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let timer = null;
  let running = false;
  let stopped = false;
  let awaitingChoice = true;
  let currentRun = null;

  const stop = async (reason) => {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    if (running && currentRun) {
      console.log(`\n[${now()}] Leállítás kérve, megvárom a folyamatban lévő ellenőrzés végét…`);
      await currentRun;
    }
    console.log(`\n[${now()}] Leállítva (${reason}).`);
    rl.close();
    process.exit(0);
  };

  const tick = () => {
    if (stopped || running) return;
    running = true;
    currentRun = runCheckOnce().finally(() => {
      running = false;
    });
  };

  const start = (minutes) => {
    awaitingChoice = false;
    console.log(
      `\nElindult a folyamatos ellenőrzés ${minutes} percenként. ` +
        `Leállítás: írd be, hogy "q" majd Enter, vagy nyomj Ctrl+C-t.\n`,
    );
    tick();
    timer = setInterval(tick, minutes * 60 * 1000);
  };

  printMenu();

  rl.on("line", (line) => {
    const value = line.trim().toLowerCase();
    if (awaitingChoice) {
      const minutes = INTERVAL_CHOICES[Number(value) - 1];
      if (!minutes) {
        console.log("Érvénytelen választás, próbáld újra.");
        printMenu();
        return;
      }
      start(minutes);
      return;
    }
    if (value === "q") stop("felhasználói kérésre");
  });

  process.on("SIGINT", () => stop("Ctrl+C"));
}

main();
