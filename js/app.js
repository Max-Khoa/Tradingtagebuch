const $ = (id) => document.getElementById(id);
const storeKey = "northstar-journal-v1";
const defaults = {
  trades: [],
  history: [],
  settings: {
    configName: "Beispiel Prop Firm",
    currentBalance: 10000,
    leverage: 30,
    dailyLimit: 5,
    drawdownLimit: 10,
    profitTarget: 10,
    stopDistance: 0.003,
    trailing: false,
  },
};
let state = JSON.parse(localStorage.getItem(storeKey) || "null") || defaults;
state.history = Array.isArray(state.history)
  ? state.history
  : state.trades.filter((trade) => trade.status === "CLOSED");
const save = () => {
  localStorage.setItem(storeKey, JSON.stringify(state));
  $("storageState").textContent = "saved locally";
};
const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => `${Number(value || 0).toFixed(2)} EUR`;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const todayTrades = () =>
  state.trades.filter((t) => t.timestamp.slice(0, 10) === today());
function metrics(trades) {
  const pnl = trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
  const wins = trades.filter((t) => t.outcome === "WIN").length;
  const rs = trades
    .filter((t) => Number.isFinite(Number(t.rMultiple)))
    .map((t) => Number(t.rMultiple));
  return {
    pnl,
    wins,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0,
    compliance: trades.length
      ? (trades.filter((t) => t.strategyFollowed).length / trades.length) * 100
      : 0,
  };
}
function metricMarkup(data) {
  return `<div class="metric"><small>Trades</small><strong>${data.trades ?? 0}</strong></div><div class="metric"><small>Win-Rate</small><strong>${data.winRate.toFixed(1)}%</strong></div><div class="metric"><small>PnL</small><strong>${money(data.pnl)}</strong></div><div class="metric"><small>Average R</small><strong>${data.avgR.toFixed(2)}R</strong></div>`;
}
async function copyValue(value, button) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement("textarea");
      input.value = value;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    const original = button.textContent;
    button.textContent = "Kopiert";
    setTimeout(() => (button.textContent = original), 1200);
  } catch {
    button.textContent = "Fehler";
    setTimeout(() => (button.textContent = "Kopieren"), 1200);
  }
}
function renderMini() {
  const trades = todayTrades(),
    closed = trades.filter((t) => t.status !== "OPEN"),
    m = metrics(closed);
  $("todayMini").innerHTML = metricMarkup({
    ...m,
    trades: closed.length,
  });
  $("todayMiniList").innerHTML =
    trades
      .slice(-3)
      .reverse()
      .map(
        (t) =>
          `<div class="trade-row"><div><div class="trade-symbol">${esc(t.instrument)} <span class="muted">${esc(t.direction)}</span></div><div class="trade-meta">${t.status === "OPEN" ? "Offene Position" : "Geschlossen"} · ${esc(t.notes || "")}</div></div><strong class="${t.status === "OPEN" ? "be" : t.pnl >= 0 ? "win" : "loss"}">${t.status === "OPEN" ? "OPEN" : `${t.pnl >= 0 ? "+" : ""}${Number(t.pnl).toFixed(2)}`}</strong></div>`,
      )
      .join("") || '<p class="empty">Noch keine Trades heute.</p>';
}
function openTrade(saveTrade = true) {
  const entry = Number($("entry").value),
    rr = Number($("rr").value),
    balance = state.settings.currentBalance,
    riskPct = Number($("riskPct").value),
    distance = Number(state.settings.stopDistance),
    leverage = Number(state.settings.leverage);
  if (
    !entry ||
    !rr ||
    !balance ||
    !riskPct ||
    !distance ||
    !leverage ||
    rr < 0
  ) {
    $("calcResult").innerHTML =
      '<div class="notice danger">Bitte pruefe Entry, R:R, Risiko, Hebel und Stop-Distanz in den Settings.</div>';
    return;
  }
  const riskAmount = (balance * riskPct) / 100,
    contractSize = 100000,
    volumeStep = 0.01,
    riskBasedLots = (riskAmount * entry) / (distance * contractSize),
    maxNotional = balance * leverage,
    maxLots = maxNotional / contractSize,
    volume =
      Math.floor(Math.min(riskBasedLots, maxLots) / volumeStep) * volumeStep,
    positionValue = volume * contractSize,
    requiredMargin = positionValue / leverage,
    direction = $("direction").value,
    sl = entry + (direction === "LONG" ? -1 : 1) * distance,
    tp = entry + (direction === "LONG" ? 1 : -1) * distance * rr,
    trade = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      status: "OPEN",
      instrument: $("instrument").value.trim().toUpperCase(),
      direction,
      entry,
      stopLoss: sl,
      takeProfit: tp,
      riskReward: rr,
      riskPct,
      riskAmount,
      positionSize: volume * contractSize,
      volume,
      contractSize,
      volumeStep,
      positionValue,
      leverage,
      requiredMargin,
      strategyFollowed: true,
    };
  if (volume < volumeStep) {
    $("calcResult").innerHTML =
      '<div class="notice danger">Das Risiko ist bei dieser Stop-Distanz kleiner als das kleinste MT5-Volumen von 0.01 Lots.</div>';
    return;
  }
  if (saveTrade) {
    state.trades.push(trade);
    save();
  }
  const statusMarkup = saveTrade
    ? `<div class="notice">Trade offen. Trage bei MetaTrader 5 exakt ${volume.toFixed(2)} Lots ein. Der Kontostand bleibt bei ${money(balance)}, bis du die Position schliesst.</div>`
    : '<div class="notice">Alle Werte wurden berechnet. Moechtest du diesen Trade jetzt eroeffnen?</div><div class="actions"><button class="primary" id="confirmOpen">Trade jetzt eroeffnen</button><button class="secondary" id="cancelOpen">Nicht eroeffnen / Zurueck</button></div>';
  $("calcResult").innerHTML =
    `<div class="result"><div class="result-grid"><div class="metric"><small>Stop-Loss</small><strong>${sl.toFixed(5)}</strong><button class="copy-value" data-copy-value="${sl.toFixed(5)}">Kopieren</button></div><div class="metric"><small>Take-Profit</small><strong>${tp.toFixed(5)}</strong><button class="copy-value" data-copy-value="${tp.toFixed(5)}">Kopieren</button></div><div class="metric"><small>Risiko</small><strong>${money(riskAmount)}</strong></div><div class="metric"><small>MT5 Volumen</small><strong>${volume.toFixed(2)} Lots</strong><button class="copy-value" data-copy-value="${volume.toFixed(2)}">Kopieren</button></div><div class="metric"><small>Positionswert</small><strong>${money(positionValue)}</strong></div><div class="metric"><small>Hebel aus Config</small><strong>1 : ${leverage}</strong></div><div class="metric"><small>Gebundene Margin</small><strong>${money(requiredMargin)}</strong></div></div>${statusMarkup}${volume < riskBasedLots ? '<div class="notice warn">Das MT5-Volumen wurde durch Hebel oder den MT5-Volumenschritt begrenzt.</div>' : ""}</div>`;
  document.querySelectorAll(".copy-value").forEach((button) => {
    button.onclick = () => copyValue(button.dataset.copyValue, button);
  });
  if (saveTrade) {
    renderMini();
    renderActive();
  } else {
    $("confirmOpen").onclick = openTrade;
    $("cancelOpen").onclick = () => ($("calcResult").innerHTML = "");
  }
}
function calculate() {
  openTrade(false);
}
function renderToday() {
  const trades = todayTrades().filter((t) => t.status !== "OPEN"),
    m = metrics(trades);
  $("todayMetrics").innerHTML = metricMarkup({
    ...m,
    trades: trades.length,
  });
  const limit = Number(state.settings.dailyLimit),
    used = Math.max(0, -m.pnl),
    percent = limit
      ? (used / ((Number(state.settings.currentBalance) * limit) / 100)) * 100
      : 0;
  const compliance = m.compliance;
  $("compliancePanel").innerHTML =
    `<div class="metric"><small>Strategie eingehalten</small><strong>${compliance.toFixed(0)}%</strong></div><div class="bar ${percent > 80 ? "danger" : percent > 60 ? "warn" : ""}"><span style="width:${Math.min(percent, 100)}%"></span></div><p class="hint">Daily-Loss genutzt: ${percent.toFixed(0)}% · ${money(m.pnl)}</p><div class="notice ${percent > 80 ? "danger" : percent > 60 ? "warn" : ""}">${percent > 80 ? "Daily-Loss fast erreicht. Session pausieren." : percent > 60 ? "Verlustzone beobachten und Risiko reduzieren." : "Tagesrahmen ist unter Kontrolle."}</div>`;
  drawChart(trades);
  renderProp();
}
function renderActive() {
  const open = state.trades.filter((t) => t.status === "OPEN");
  $("activeCount").textContent = `${open.length} active`;
  $("activeTrades").innerHTML =
    open
      .map(
        (t) =>
          `<div class="trade-row"><div><div class="trade-symbol">${esc(t.instrument)} · ${esc(t.direction)}</div><div class="trade-meta">Entry ${Number(t.entry).toFixed(5)} · SL ${Number(t.stopLoss).toFixed(5)} · TP ${Number(t.takeProfit).toFixed(5)} · MT5 Volumen ${t.volume ? Number(t.volume).toFixed(2) + " Lots" : Number(t.positionSize).toFixed(0) + " Einheiten"} · Risiko ${money(t.riskAmount)}</div></div><div class="actions" style="margin:0"><input id="exit-${t.id}" type="number" step="0.00001" placeholder="Exit" style="width:125px"><button class="danger" data-close="${t.id}">Schliessen</button></div></div>`,
      )
      .join("") || '<p class="empty">Keine offenen Trades.</p>';
  document
    .querySelectorAll("[data-close]")
    .forEach(
      (button) => (button.onclick = () => closeTrade(button.dataset.close)),
    );
}
function closeTrade(id) {
  const trade = state.trades.find((item) => item.id === id),
    exit = Number($(`exit-${id}`).value);
  if (!trade || !exit) {
    alert("Bitte einen gueltigen Exit-Wert eingeben.");
    return;
  }
  const sign = trade.direction === "LONG" ? 1 : -1;
  trade.exit = exit;
  const contractSize = Number(trade.contractSize) || 100000,
    volume = Number(trade.volume) || Number(trade.positionSize) / contractSize;
  trade.pnl = trade.volume
    ? ((exit - trade.entry) * sign * volume * contractSize) / trade.entry
    : (exit - trade.entry) * sign * Number(trade.positionSize);
  trade.rMultiple = trade.riskAmount ? trade.pnl / trade.riskAmount : 0;
  trade.outcome = trade.pnl > 0 ? "WIN" : trade.pnl < 0 ? "LOSS" : "BE";
  trade.status = "CLOSED";
  trade.closedAt = new Date().toISOString();
  state.history.push({ ...trade });
  state.settings.currentBalance += trade.pnl;
  save();
  renderActive();
  renderMini();
  renderToday();
  alert(
    `Trade geschlossen: ${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)} EUR. Neuer Kontostand: ${state.settings.currentBalance.toFixed(2)} EUR.`,
  );
}
function renderProp() {
  const trades = state.trades,
    allPnl = trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0),
    dayPnl = metrics(todayTrades()).pnl,
    start = Number(state.settings.currentBalance),
    dailyCap = (start * Number(state.settings.dailyLimit)) / 100,
    ddCap = (start * Number(state.settings.drawdownLimit)) / 100,
    target = (start * Number(state.settings.profitTarget)) / 100,
    dailyUsed = Math.max(0, -dayPnl),
    drawdown = Math.max(0, -allPnl),
    dailyPercent = dailyCap ? (dailyUsed / dailyCap) * 100 : 0,
    ddPercent = ddCap ? (drawdown / ddCap) * 100 : 0,
    targetPercent = target ? (Math.max(0, allPnl) / target) * 100 : 0;
  const bar = (label, value, percent, detail, kind = "") =>
    `<div class="metric"><small>${label}</small><strong>${detail}</strong></div><div class="bar ${kind}"><span style="width:${Math.min(percent, 100)}%"></span></div>`;
  $("propMetrics").innerHTML =
    `<div class="metric"><small>Account PnL</small><strong>${money(allPnl)}</strong></div><div class="metric"><small>Modus</small><strong>${state.settings.trailing ? "TRAILING" : "STATIC"}</strong></div>`;
  $("propPanel").innerHTML =
    bar(
      "Daily Loss",
      dailyUsed,
      dailyPercent,
      `${dailyPercent.toFixed(0)}% genutzt`,
      dailyPercent > 80 ? "danger" : dailyPercent > 60 ? "warn" : "",
    ) +
    bar(
      "Max Drawdown",
      drawdown,
      ddPercent,
      `${money(drawdown)} / ${money(ddCap)}`,
      ddPercent > 80 ? "danger" : ddPercent > 60 ? "warn" : "",
    ) +
    bar(
      "Profit Target",
      Math.max(0, allPnl),
      targetPercent,
      `${targetPercent.toFixed(0)}% erreicht`,
      targetPercent >= 100 ? "" : "",
    ) +
    `<div class="notice ${dailyPercent > 80 || ddPercent > 80 ? "danger" : dailyPercent > 60 || ddPercent > 60 ? "warn" : ""}">${dailyPercent > 80 || ddPercent > 80 ? "Limit kritisch: kein weiteres Risiko eingehen." : dailyPercent > 60 || ddPercent > 60 ? "Limit zu mehr als 60% genutzt. Risiko beobachten." : targetPercent >= 100 ? "Profit Target erreicht." : "Alle Limits im Rahmen."}</div>`;
}
function drawChart(trades) {
  const canvas = $("equityChart"),
    ctx = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#dfe6e3";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (i * h) / 4);
    ctx.lineTo(w, (i * h) / 4);
    ctx.stroke();
  }
  if (!trades.length) return;
  let running = 0,
    values = trades.map((t) => (running += Number(t.pnl || 0))),
    min = Math.min(0, ...values),
    max = Math.max(0, ...values),
    range = max - min || 1;
  ctx.strokeStyle = "#126b67";
  ctx.lineWidth = 3;
  ctx.beginPath();
  values.forEach((value, i) => {
    const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w,
      y = h - ((value - min) / range) * (h - 24) - 12;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}
function renderHistory() {
  const query = $("historySearch").value.toLowerCase(),
    filter = $("historyFilter").value,
    rows = state.history
      .filter(
        (t) =>
          (filter === "ALL" ||
            (t.outcome === "SCRATCH" ? "BE" : t.outcome) === filter) &&
          `${t.instrument} ${t.outcome} ${t.notes}`
            .toLowerCase()
            .includes(query),
      )
      .slice()
      .reverse();
  $("historyCount").textContent = `${rows.length} records`;
  $("historyBody").innerHTML =
    rows
      .map(
        (t) =>
          `<tr><td>${new Date(t.timestamp).toLocaleDateString("de-DE")}</td><td><strong>${esc(t.instrument)}</strong></td><td>${esc(t.direction)}</td><td>${Number(t.entry || 0).toFixed(5)}</td><td class="${t.outcome === "WIN" ? "win" : t.outcome === "LOSS" ? "loss" : "be"}">${esc(t.outcome === "SCRATCH" ? "BE" : t.outcome)}</td><td class="${t.pnl >= 0 ? "win" : "loss"}">${t.pnl >= 0 ? "+" : ""}${Number(t.pnl || 0).toFixed(2)} EUR</td><td>${Number(t.rMultiple || 0).toFixed(2)}R</td><td>${t.strategyFollowed ? "Ja" : "Nein"}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="8" class="empty">Keine geschlossenen Trades.</td></tr>';
}
function switchView(name) {
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  document
    .querySelectorAll("nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("pageTitle").textContent = {
    new: "New Trade",
    today: "Today",
    active: "Active Trades",
    history: "History",
    settings: "Settings",
  }[name];
  if (name === "today") renderToday();
  if (name === "active") renderActive();
  if (name === "history") renderHistory();
}
document
  .querySelectorAll("nav button")
  .forEach((b) => (b.onclick = () => switchView(b.dataset.view)));
$("quickLog").onclick = () => switchView("active");
$("calculate").onclick = calculate;
$("currentDate").textContent = new Date().toLocaleDateString("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
$("historySearch").oninput = renderHistory;
$("historyFilter").onchange = renderHistory;
$("saveSettings").onclick = () => {
  state.settings = {
    ...state.settings,
    configName: $("configName").value.trim() || "Eigene Konfiguration",
    currentBalance:
      Number($("currentBalance").value) || state.settings.currentBalance,
    dailyLimit: Number($("dailyLimit").value) || 5,
    drawdownLimit: Number($("drawdownLimit").value) || 10,
    profitTarget: Number($("profitTarget").value) || 10,
    stopDistance: Number($("stopDistance").value) || 0.003,
    leverage: Number($("leverage").value) || 30,
    trailing: $("trailing").checked,
  };
  save();
  $("newBalance").value = money(state.settings.currentBalance);
  $("configStatus").textContent = `Aktiv: ${state.settings.configName}`;
  renderMini();
  renderToday();
  renderProp();
  saveConfigFile();
};
function getConfigFile() {
  const s = state.settings,
    config = {
      name: s.configName,
      description: "Eigene Trading-Konfiguration",
      currency: "EUR",
      accountBalance: s.currentBalance,
      risk: {
        perTradePercent: s.riskPct || 0.5,
        leverage: s.leverage,
        stopDistance: s.stopDistance,
        defaultRiskReward: 2,
      },
      limits: {
        dailyDrawdownPercent: s.dailyLimit,
        maxDrawdownPercent: s.drawdownLimit,
        profitTargetPercent: s.profitTarget,
        trailingDrawdown: s.trailing,
      },
      history: state.history,
    };
  return {
    config,
    fileName: `${(s.configName || "trading-config")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}.json`,
  };
}
const configHandleDb = "northstar-config-file";
function openConfigHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(configHandleDb, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function getConfigHandle() {
  const db = await openConfigHandleDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("handles", "readonly")
      .objectStore("handles")
      .get("active");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function setConfigHandle(handle) {
  const db = await openConfigHandleDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("handles", "readwrite")
      .objectStore("handles")
      .put(handle, "active");
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}
async function writeConfig(handle, content) {
  let permission = await handle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    permission = await handle.requestPermission({ mode: "readwrite" });
  }
  if (permission !== "granted") throw new Error("Schreibzugriff verweigert");
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}
async function saveConfigFile({ choose = false } = {}) {
  const { config, fileName } = getConfigFile();
  const content = JSON.stringify(config, null, 2);
  try {
    let handle = choose ? null : await getConfigHandle();
    if (!handle && window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "JSON-Konfiguration",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      await setConfigHandle(handle);
      await writeConfig(handle, content);
      $("configStatus").textContent = `Gespeichert: ${handle.name}`;
      return;
    }
    if (handle) {
      await writeConfig(handle, content);
      $("configStatus").textContent = `Automatisch gespeichert: ${handle.name}`;
      return;
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    $("configStatus").textContent =
      `Speichern fehlgeschlagen: ${error.message}`;
    return;
  }
  const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
  $("configStatus").textContent =
    `Datei erstellt: ${fileName} (bitte nach configs verschieben)`;
}
$("exportConfig").onclick = () => saveConfigFile({ choose: true });
$("importConfigButton").onclick = () => $("configFile").click();
$("configFile").onchange = (e) => {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const config = JSON.parse(reader.result),
        valid =
          config &&
          typeof config.name === "string" &&
          Number(config.accountBalance) > 0 &&
          Number(config.risk?.stopDistance) > 0 &&
          Number(config.risk?.leverage) >= 1 &&
          Number(config.limits?.dailyDrawdownPercent) > 0 &&
          Number(config.limits?.maxDrawdownPercent) > 0 &&
          Number(config.limits?.profitTargetPercent) > 0;
      if (!valid) throw Error();
      state.settings = {
        ...state.settings,
        configName: config.name,
        currentBalance: Number(config.accountBalance),
        dailyLimit: Number(config.limits.dailyDrawdownPercent),
        drawdownLimit: Number(config.limits.maxDrawdownPercent),
        profitTarget: Number(config.limits.profitTargetPercent),
        stopDistance: Number(config.risk.stopDistance),
        leverage: Number(config.risk.leverage),
        trailing: Boolean(config.limits.trailingDrawdown),
      };
      if (Array.isArray(config.history)) state.history = config.history;
      save();
      location.reload();
    } catch {
      alert("Konfiguration ungueltig. Bitte das Beispiel-Format verwenden.");
    }
  };
  if (e.target.files[0]) reader.readAsText(e.target.files[0]);
};
function init() {
  state.settings = { ...defaults.settings, ...state.settings };
  const s = state.settings;
  [
    "currentBalance",
    "dailyLimit",
    "drawdownLimit",
    "profitTarget",
    "stopDistance",
    "leverage",
  ].forEach((id) => ($(id).value = s[id]));
  $("configName").value = s.configName;
  $("configStatus").textContent = `Aktiv: ${s.configName}`;
  $("newBalance").value = money(s.currentBalance);
  $("trailing").checked = s.trailing;
  renderMini();
  renderToday();
  renderActive();
}
init();
