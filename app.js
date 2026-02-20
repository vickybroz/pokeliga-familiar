function makeTable(columns, rows) {
  const head = `<tr>${columns.map(c => `<th>${c}</th>`).join("")}</tr>`;
  const body = rows.map(r => `<tr>${r.map(c => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function topBadge(i) {
  if (i === 0) return '<span class="badge gold">1</span>';
  if (i === 1) return '<span class="badge silver">2</span>';
  if (i === 2) return '<span class="badge bronze">3</span>';
  return `${i + 1}`;
}

function denseRankByScore(items, scoreKey) {
  let rank = 0;
  let prevScore = null;
  return items.map(item => {
    const score = item[scoreKey];
    if (prevScore === null || score !== prevScore) {
      rank += 1;
      prevScore = score;
    }
    return { item, rank };
  });
}

function teamKey(teamName) {
  return String(teamName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function teamPill(teamName) {
  const key = teamKey(teamName);
  return `<span class="team-pill team-${key}">${teamName ?? ""}</span>`;
}

function formatHoursMinutes(hoursValue) {
  const totalMinutes = Math.round(Number(hoursValue || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${minutes.toString().padStart(2, "0")} min`;
}

function formatHoursDisplay(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatHoursMinutes(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  return "-";
}

function explainWeekLabel(weekLabel) {
  const parts = String(weekLabel || "").split("/");
  if (parts.length === 2) {
    return `Es la competencia de la semana ${parts[0]} del mes ${parts[1]}.`;
  }
  return "Es la competencia correspondiente a esta semana.";
}

function buildMetaCards(metaRows) {
  return metaRows
    .map(([k, v, help]) => `<article class="meta-item" title="${help}"><b>${k}</b><span>${v}</span></article>`)
    .join("");
}

async function decoratePanelsWithPokemon() {
  const panels = Array.from(document.querySelectorAll(".layout .panel"));
  if (!panels.length) return;
  const usedIds = new Set();
  const maxPokemonId = 1025;

  const randomUniqueId = () => {
    let id = 1 + Math.floor(Math.random() * maxPokemonId);
    while (usedIds.has(id) && usedIds.size < maxPokemonId) {
      id = 1 + Math.floor(Math.random() * maxPokemonId);
    }
    usedIds.add(id);
    return id;
  };

  const requests = panels.map(async () => {
    const id = randomUniqueId();
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const sprite =
        data?.sprites?.other?.["official-artwork"]?.front_default ||
        data?.sprites?.front_default ||
        "";
      if (!sprite) return null;
      return { id, sprite, name: data?.name || `pokemon-${id}` };
    } catch (_) {
      return null;
    }
  });

  const pokemons = await Promise.all(requests);
  panels.forEach((panel, idx) => {
    const poke = pokemons[idx];
    if (!poke) return;
    const img = document.createElement("img");
    img.className = "panel-pokemon";
    img.src = poke.sprite;
    img.alt = poke.name;
    img.loading = "lazy";
    panel.appendChild(img);
  });
}

function resolveChallengeText(rawChallenge) {
  const text = String(rawChallenge || "").trim();
  return text || "Pendiente (definir desde Cargar puntos del equipo)";
}

function parseMaybeDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    const d = new Date(text.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTimestamp(dateValue) {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(dateValue);
  const get = type => parts.find(p => p.type === type)?.value || "00";
  const yyyy = get("year");
  const mm = get("month");
  const dd = get("day");
  const hh = get("hour");
  const min = get("minute");
  const ss = get("second");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function resolveLastUpdatedLabel(baseGeneratedAt, weekUpdatedAt) {
  const week = parseMaybeDate(weekUpdatedAt);
  if (week) return formatTimestamp(week);
  const base = parseMaybeDate(baseGeneratedAt);
  if (base) return formatTimestamp(base);
  return String(baseGeneratedAt || "-");
}

const WEEK_DATA_API = "/api/week-data";
const WEEK_AUTH_API = "https://script.google.com/macros/s/AKfycbzwxbU936UpfylvgFtMNJWCWbUOhFbGn4RpYSkl9kLdICW0CGNm7u8VsJQ59LTlqe17/exec"; // Google Apps Script URL
const IS_GITHUB_PAGES = window.location.hostname.endsWith("github.io");
const CAN_USE_LOCAL_WEEK_API = !IS_GITHUB_PAGES;
const PUBLIC_WEEK_DATA_FILE = "week-data.json";
const REMOTE_WEEK_API = WEEK_AUTH_API; // mismo Apps Script, acciones distintas

async function callRemoteWeekApi(action, extraParams = {}) {
  if (!REMOTE_WEEK_API) return null;
  try {
    const body = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ action, ...extraParams }).map(([k, v]) => [k, String(v ?? "")])
      )
    );
    const res = await fetch(REMOTE_WEEK_API, {
      method: "POST",
      body
    });
    if (!res.ok) return null;
    const payload = await res.json();
    return payload;
  } catch (_) {
    return null;
  }
}

async function verifyTeamPassword(team, password) {
  const payload = await callRemoteWeekApi("verifyTeamPassword", { team, password });
  return Boolean(payload?.ok);
}

function formatDateTimeLabel(dateValue) {
  const dd = String(dateValue.getDate()).padStart(2, "0");
  const mm = String(dateValue.getMonth() + 1).padStart(2, "0");
  const yyyy = dateValue.getFullYear();
  const hh = String(dateValue.getHours()).padStart(2, "0");
  const min = String(dateValue.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function getCurrentWeekStartDate() {
  const now = new Date();
  const start = new Date(now);
  const daysSinceTuesday = (now.getDay() - 2 + 7) % 7;
  start.setDate(now.getDate() - daysSinceTuesday);
  start.setHours(10, 0, 0, 0);
  if (now < start) {
    start.setDate(start.getDate() - 7);
  }
  return start;
}

function getDefaultEndDate(startDate) {
  const end = new Date(startDate);
  end.setDate(end.getDate() + 6);
  end.setHours(22, 0, 0, 0);
  return end;
}

function isCompetitionActive(now, startDate, endDate) {
  return now >= startDate && now <= endDate;
}

function getNextDrawDate(startDate) {
  const next = new Date(startDate);
  next.setDate(next.getDate() + 7);
  next.setHours(10, 0, 0, 0);
  return next;
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seedText) {
  const arr = items.slice();
  const rand = mulberry32(hashString(seedText));
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildWeeklyTeams(players, startDate) {
  const teamNames = ["Naranja", "Amarillo", "Celeste"];
  const seedKey = `${startDate.getFullYear()}-${startDate.getMonth() + 1}-${startDate.getDate()}-${startDate.getHours()}`;
  const shuffled = seededShuffle(players, seedKey);
  const teams = teamNames.map(name => ({ team: name, players: [] }));
  shuffled.forEach((player, idx) => {
    teams[idx % teams.length].players.push(player);
  });
  teams.forEach(t => t.players.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })));
  return teams;
}

function getMockTeamsForCurrentWeek() {
  return [
    { team: "Naranja", players: ["Gio", "Samy", "Estela", "Facu"] },
    { team: "Amarillo", players: ["Lu", "Maru M", "Chiqui", "Vicky"] },
    { team: "Celeste", players: ["Nico", "Abi", "Maru C", "Edu"] }
  ];
}

function formatCountdown(deltaMs) {
  const totalSeconds = Math.max(0, Math.floor(deltaMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function startNextDrawCountdown(targetDate) {
  const el = document.getElementById("nextDrawCountdown");
  if (!el) return;
  const tick = () => {
    const now = new Date();
    const left = targetDate.getTime() - now.getTime();
    el.textContent = `Proximo sorteo en: ${formatCountdown(left)}`;
  };
  tick();
  window.setInterval(tick, 1000);
}

function formatDateTimeLocalValue(dateText) {
  if (!dateText) return "";
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return "";
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  const hh = String(parsed.getHours()).padStart(2, "0");
  const min = String(parsed.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function getWeekStorageKey(startDate) {
  return `pokeliga.week.${startDate.getFullYear()}-${startDate.getMonth() + 1}-${startDate.getDate()}-${startDate.getHours()}`;
}

function getWeekLabelFromStartDate(startDate) {
  const month = startDate.getMonth() + 1;
  const firstDayOfMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const firstTuesdayOffset = (2 - firstDayOfMonth.getDay() + 7) % 7;
  const firstTuesdayDay = 1 + firstTuesdayOffset;
  const rawWeek = Math.floor((startDate.getDate() - firstTuesdayDay) / 7) + 1;
  const week = Math.max(1, rawWeek);
  return `${week}/${month}`;
}

function createDefaultWeekCapture(teams) {
  const byTeam = {};
  teams.forEach(t => {
    byTeam[t.team] = {
      finishTime: "",
      playerPoints: Object.fromEntries(t.players.map(p => [p, 0]))
    };
  });
  return {
    challenge: "",
    targetTotal: "",
    updatedAt: "",
    byTeam
  };
}

function normalizeWeekCapture(parsed, teams) {
  const fallback = createDefaultWeekCapture(teams);
  if (!parsed || typeof parsed !== "object") return fallback;
  teams.forEach(t => {
    if (!parsed.byTeam?.[t.team]) {
      parsed.byTeam = parsed.byTeam || {};
      parsed.byTeam[t.team] = { finishTime: "", playerPoints: {} };
    }
    const teamData = parsed.byTeam[t.team];
    teamData.playerPoints = teamData.playerPoints || {};
    t.players.forEach(player => {
      if (typeof teamData.playerPoints[player] !== "number") {
        teamData.playerPoints[player] = 0;
      }
    });
  });
  parsed.challenge = parsed.challenge || "";
  parsed.targetTotal = parsed.targetTotal ?? "";
  parsed.updatedAt = parsed.updatedAt || "";
  return parsed;
}

async function loadWeekCapture(storageKey, teams) {
  const fallback = createDefaultWeekCapture(teams);
  if (REMOTE_WEEK_API) {
    const payload = await callRemoteWeekApi("loadWeekData", { weekKey: storageKey });
    if (payload?.ok && payload.data) {
      return normalizeWeekCapture(payload.data, teams);
    }
  }
  if (CAN_USE_LOCAL_WEEK_API) {
    try {
      const res = await fetch(`${WEEK_DATA_API}?weekKey=${encodeURIComponent(storageKey)}`);
      if (res.ok) {
        const payload = await res.json();
        if (payload?.data) {
          return normalizeWeekCapture(payload.data, teams);
        }
      }
    } catch (_) {
      // Fallback below
    }
  } else {
    try {
      const res = await fetch(PUBLIC_WEEK_DATA_FILE, { cache: "no-store" });
      if (res.ok) {
        const published = await res.json();
        if (published && typeof published === "object" && published[storageKey]) {
          return normalizeWeekCapture(published[storageKey], teams);
        }
      }
    } catch (_) {
      // Fallback below
    }
  }
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return fallback;
  try {
    return normalizeWeekCapture(JSON.parse(raw), teams);
  } catch (_) {
    return fallback;
  }
}

async function saveWeekCapture(storageKey, payload) {
  let apiSaved = false;
  if (REMOTE_WEEK_API) {
    const remote = await callRemoteWeekApi("saveWeekData", {
      weekKey: storageKey,
      data: JSON.stringify(payload)
    });
    apiSaved = Boolean(remote?.ok);
  }
  if (!apiSaved && CAN_USE_LOCAL_WEEK_API) {
    try {
      const res = await fetch(WEEK_DATA_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekKey: storageKey, data: payload })
      });
      apiSaved = res.ok;
    } catch (_) {
      apiSaved = false;
    }
  }
  if (!apiSaved) {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    return false;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(payload));
  return true;
}

function rankToPoints(rank, scoreMap, fallback = 0) {
  return scoreMap[rank] ?? fallback;
}

function denseRankBy(getValue, sortedItems) {
  let rank = 0;
  let prev = null;
  return sortedItems.map(item => {
    const value = getValue(item);
    if (prev === null || value !== prev) {
      rank += 1;
      prev = value;
    }
    return { item, rank };
  });
}

function sanitizeNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function distributeExcessToTeammates(excess, teammateNames, pointsByPlayer, maxPerPlayer) {
  let remaining = excess;
  const distributed = {};
  while (remaining > 0) {
    const eligible = teammateNames.filter(name => pointsByPlayer[name] < maxPerPlayer);
    if (eligible.length === 0) break;
    const minValue = Math.min(...eligible.map(name => pointsByPlayer[name]));
    const minGroup = eligible
      .filter(name => pointsByPlayer[name] === minValue)
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    const canGive = Math.min(remaining, minGroup.length);
    for (let i = 0; i < canGive; i += 1) {
      const receiver = minGroup[i];
      pointsByPlayer[receiver] += 1;
      distributed[receiver] = (distributed[receiver] || 0) + 1;
    }
    remaining -= canGive;
  }
  return { distributed, remaining };
}

function applyTeamSanctions(teamPlayers, rawPointsByPlayer, targetTotal) {
  const objective = sanitizeNonNegativeInt(targetTotal);
  const points = Object.fromEntries(teamPlayers.map(name => [name, sanitizeNonNegativeInt(rawPointsByPlayer[name] ?? 0)]));
  const sanctions = Object.fromEntries(teamPlayers.map(name => [name, { removed: 0, added: 0, messages: [] }]));
  if (objective <= 0 || teamPlayers.length < 2) return { points, sanctions };

  // Regla especial: si una persona completa sola el objetivo y el resto hace 0.
  const scorers = teamPlayers.filter(name => points[name] > 0);
  if (scorers.length === 1) {
    const solo = scorers[0];
    if (points[solo] >= objective) {
      const teammates = teamPlayers.filter(name => name !== solo);
      const split = Math.floor(objective / teammates.length);
      const leftover = objective % teammates.length;
      const removed = points[solo];
      points[solo] = 0;
      sanctions[solo].removed += removed;
      sanctions[solo].messages.push(`Descalificado por completar solo el desafio: -${removed} puntos.`);
      teammates.forEach(name => {
        points[name] = split;
        sanctions[name].added += split;
        sanctions[name].messages.push(`Beneficiado por sancion de ${solo}: +${split} puntos.`);
      });
      if (leftover > 0) {
        sanctions[solo].messages.push(`Se perdieron ${leftover} puntos por no ser divisible entre 3.`);
      }
      return { points, sanctions };
    }
  }

  // Regla general: nadie puede superar la mitad del objetivo.
  const maxPerPlayer = Math.floor(objective / 2);
  const offenders = teamPlayers
    .map(name => ({ name, original: points[name] }))
    .filter(x => x.original > maxPerPlayer);

  offenders.forEach(({ name, original }) => {
    const excess = original - maxPerPlayer;
    points[name] = maxPerPlayer;
    sanctions[name].removed += excess;
    sanctions[name].messages.push(`Supero la mitad del objetivo (${maxPerPlayer}): -${excess} puntos.`);
    const teammates = teamPlayers.filter(player => player !== name);
    const distribution = distributeExcessToTeammates(excess, teammates, points, maxPerPlayer);
    Object.entries(distribution.distributed).forEach(([receiver, amount]) => {
      sanctions[receiver].added += amount;
      sanctions[receiver].messages.push(`Beneficiado por exceso de ${name}: +${amount} puntos.`);
    });
    if (distribution.remaining > 0) {
      sanctions[name].messages.push(`No se pudieron reasignar ${distribution.remaining} puntos por limite de mitad.`);
    }
  });

  return { points, sanctions };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function playerLabelWithSanction(name, sanction) {
  const hasSanction = sanction && (sanction.removed > 0 || sanction.added > 0);
  if (!hasSanction) return escapeHtml(name);
  const details = [
    sanction.removed > 0 ? `Quitados: ${sanction.removed}` : "",
    sanction.added > 0 ? `Agregados: ${sanction.added}` : "",
    ...(sanction.messages || [])
  ].filter(Boolean).join(" | ");
  return `<span class="sanctioned-name" title="${escapeHtml(details)}">${escapeHtml(name)}*</span>`;
}

function calculateLiveCompetition(currentWeekTeams, weekCapture, currentWeekStart, currentWeekEnd) {
  const objective = sanitizeNonNegativeInt(weekCapture.targetTotal || 0);
  const sanctionedResultsByTeam = Object.fromEntries(
    currentWeekTeams.map(t => [t.team, applyTeamSanctions(t.players, weekCapture.byTeam[t.team]?.playerPoints || {}, objective)])
  );
  const sanctionedByTeam = Object.fromEntries(currentWeekTeams.map(t => [t.team, sanctionedResultsByTeam[t.team].points]));
  const sanctionsByTeam = Object.fromEntries(currentWeekTeams.map(t => [t.team, sanctionedResultsByTeam[t.team].sanctions]));

  const participants = currentWeekTeams.flatMap(t => {
    const teamData = weekCapture.byTeam[t.team];
    return t.players.map(name => ({
      name,
      team: t.team,
      quantity: sanctionedByTeam[t.team][name] ?? 0,
      sanction: sanctionsByTeam[t.team][name] || { removed: 0, added: 0, messages: [] }
    }));
  });
  const playersCount = participants.length;
  const targetTotal = objective;
  const durationHours = Math.max(1, (currentWeekEnd.getTime() - currentWeekStart.getTime()) / 36e5);
  const officialRate = targetTotal > 0 ? targetTotal / durationHours : 0;
  const mediaQuantity = playersCount > 0 ? targetTotal / playersCount : 0;

  const teamTotals = currentWeekTeams.map(t => {
    const teamData = weekCapture.byTeam[t.team];
    const total = t.players.reduce((acc, p) => acc + Number(sanctionedByTeam[t.team][p] ?? 0), 0);
    return { team: t.team, total, finishTime: teamData?.finishTime || "" };
  });

  const rankedTeams = teamTotals
    .slice()
    .sort((a, b) => {
      const aHasFinish = Boolean(a.finishTime);
      const bHasFinish = Boolean(b.finishTime);
      if (aHasFinish && bHasFinish) {
        const diff = new Date(a.finishTime).getTime() - new Date(b.finishTime).getTime();
        if (diff !== 0) return diff;
      } else if (aHasFinish !== bHasFinish) {
        return aHasFinish ? -1 : 1;
      }
      if (b.total !== a.total) return b.total - a.total;
      return a.team.localeCompare(b.team, "es", { sensitivity: "base" });
    })
    .map((item, idx) => ({ item, rank: idx + 1 }));
  const teamPointsByName = Object.fromEntries(rankedTeams.map(({ item, rank }) => [item.team, rankToPoints(rank, { 1: 4, 2: 3, 3: 2 }, 0)]));

  const finishedTeams = teamTotals
    .filter(t => t.finishTime)
    .sort((a, b) => new Date(a.finishTime).getTime() - new Date(b.finishTime).getTime());
  const finishRankByTeam = Object.fromEntries(finishedTeams.map((item, idx) => [item.team, idx + 1]));

  const quantityRankByPlayer = Object.fromEntries(
    denseRankBy(
      x => x.quantity,
      participants.slice().sort((a, b) => {
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      })
    ).map(({ item, rank }) => [item.name, rank])
  );

  const withSpeed = participants.map(p => {
    const finishRank = finishRankByTeam[p.team] || 0;
    const speedBonus = finishRank > 0 ? rankToPoints(finishRank, { 1: 3, 2: 2, 3: 1 }, 0) : 0;
    return { ...p, speedBonus };
  });

  const speedRankByPlayer = Object.fromEntries(
    denseRankBy(x => x.speedBonus, withSpeed.slice().sort((a, b) => b.speedBonus - a.speedBonus))
      .map(({ item, rank }) => [item.name, rank])
  );

  const participantsCalculated = withSpeed.map(p => {
    const qRank = quantityRankByPlayer[p.name] || 99;
    const quantityPoints = qRank <= 3 ? rankToPoints(qRank, { 1: 4, 2: 3, 3: 2 }, 0) : (p.quantity >= mediaQuantity && mediaQuantity > 0 ? 1 : 0);
    const sRank = speedRankByPlayer[p.name] || 99;
    const speedPoints = p.speedBonus > 0 ? rankToPoints(sRank, { 1: 4, 2: 3, 3: 2 }, 0) : 0;
    const teamPoints = teamPointsByName[p.team] || 0;
    return { ...p, teamPoints, quantityPoints, speedPoints, totalPoints: teamPoints + quantityPoints + speedPoints };
  });

  const participantsSorted = participantsCalculated
    .slice()
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    });

  const teamsView = rankedTeams
    .map(({ item, rank }) => ({
      team: item.team,
      place: rank,
      finishTime: item.finishTime ? formatDateTimeLabel(new Date(item.finishTime)) : "-",
      hours: item.finishTime ? formatHoursMinutes((new Date(item.finishTime).getTime() - currentWeekStart.getTime()) / 36e5) : "-",
      points: teamPointsByName[item.team] || 0
    }))
    .sort((a, b) => a.place - b.place);

  return {
    meta: {
      week: "Actual",
      challenge: resolveChallengeText(weekCapture.challenge),
      start: formatDateTimeLabel(currentWeekStart),
      end: formatDateTimeLabel(currentWeekEnd),
      durationHours,
      officialRate,
      mediaQuantity
    },
    teams: teamsView,
    participants: participantsSorted
  };
}

function hasWeekCaptureData(capture) {
  if (!capture) return false;
  if (String(capture.challenge || "").trim()) return true;
  if (Number(capture.targetTotal || 0) > 0) return true;
  return Object.values(capture.byTeam || {}).some(teamData => {
    if (teamData?.finishTime) return true;
    return Object.values(teamData?.playerPoints || {}).some(v => Number(v || 0) > 0);
  });
}

function buildCompetitionFromCapture(capture, weekStart, teams, weekLabel) {
  const weekEnd = getDefaultEndDate(weekStart);
  const computed = calculateLiveCompetition(teams, capture, weekStart, weekEnd);
  return {
    week: weekLabel || "Anterior",
    sheet: "",
    challenge: computed.meta.challenge,
    start: computed.meta.start,
    end: computed.meta.end,
    durationHours: computed.meta.durationHours,
    officialRate: computed.meta.officialRate,
    mediaQuantity: computed.meta.mediaQuantity,
    teams: computed.teams,
    participants: denseRankByScore(computed.participants, "totalPoints").map(({ item: p, rank }) => ({
      position: rank,
      name: p.name,
      team: p.team,
      quantity: p.quantity,
      speedBonus: p.speedBonus,
      teamPoints: p.teamPoints,
      quantityPoints: p.quantityPoints,
      speedPoints: p.speedPoints,
      totalPoints: p.totalPoints
    }))
  };
}

function buildEmptyCompetition(weekLabel, weekStart, weekEnd) {
  return {
    week: weekLabel,
    sheet: "",
    challenge: null,
    start: formatDateTimeLabel(weekStart),
    end: formatDateTimeLabel(weekEnd),
    durationHours: (weekEnd.getTime() - weekStart.getTime()) / 36e5,
    officialRate: null,
    mediaQuantity: null,
    teams: [],
    participants: []
  };
}

function addPlayerIfMissing(players, weekLabels, playerName) {
  if (players.some(p => p.player === playerName)) return players;
  const zeroWeeks = Object.fromEntries(weekLabels.map(w => [w, 0]));
  return [...players, { player: playerName, weeks: zeroWeeks, total: 0 }];
}

async function load() {
  const data = window.POKELIGA_DATA || await (await fetch("data.json")).json();
  let weekLabels = data.annual.weekLabels.slice();
  if (!weekLabels.includes("2/2")) {
    weekLabels.push("2/2");
  }
  const annualPlayers = addPlayerIfMissing(data.annual.players.slice(), weekLabels, "Edu");
  let annualPlayersWithWeeks = annualPlayers.map(p => ({
    ...p,
    weeks: Object.fromEntries(weekLabels.map(w => [w, Number(p.weeks?.[w] ?? 0)])),
    total: Number(p.total ?? 0)
  }));

  const currentWeekStart = getCurrentWeekStartDate();
  const currentWeekEnd = getDefaultEndDate(currentWeekStart);
  const nextDrawDate = getNextDrawDate(currentWeekStart);
  const competitionActive = isCompetitionActive(new Date(), currentWeekStart, currentWeekEnd);
  const currentWeekTeams = getMockTeamsForCurrentWeek();
  const weekStorageKey = getWeekStorageKey(currentWeekStart);
  const weekCapture = await loadWeekCapture(weekStorageKey, currentWeekTeams);
  const currentWeekLabel = getWeekLabelFromStartDate(currentWeekStart);
  if (!String(weekCapture.weekLabel || "").trim()) {
    weekCapture.weekLabel = currentWeekLabel;
  }

  const prevWeekStart = new Date(currentWeekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = getDefaultEndDate(prevWeekStart);
  const prevWeekLabel = getWeekLabelFromStartDate(prevWeekStart);
  const prevWeekCapture = await loadWeekCapture(getWeekStorageKey(prevWeekStart), currentWeekTeams);
  const latestFromCapture = hasWeekCaptureData(prevWeekCapture)
    ? buildCompetitionFromCapture(prevWeekCapture, prevWeekStart, currentWeekTeams, prevWeekCapture.weekLabel || prevWeekLabel)
    : null;

  const prev2WeekStart = new Date(currentWeekStart);
  prev2WeekStart.setDate(prev2WeekStart.getDate() - 14);
  const prev2WeekCapture = await loadWeekCapture(getWeekStorageKey(prev2WeekStart), currentWeekTeams);
  const historyFromCapture = hasWeekCaptureData(prev2WeekCapture)
    ? [buildCompetitionFromCapture(prev2WeekCapture, prev2WeekStart, currentWeekTeams, prev2WeekCapture.weekLabel || "Hace 2 semanas")]
    : [];

  if (latestFromCapture) {
    const label = latestFromCapture.week;
    if (!weekLabels.includes(label)) {
      weekLabels = [...weekLabels, label];
      annualPlayersWithWeeks = annualPlayersWithWeeks.map(p => ({
        ...p,
        weeks: { ...p.weeks, [label]: 0 }
      }));
    }
    latestFromCapture.participants.forEach(participant => {
      const idx = annualPlayersWithWeeks.findIndex(p => p.player === participant.name);
      if (idx === -1) {
        const weeks = Object.fromEntries(weekLabels.map(w => [w, 0]));
        weeks[label] = participant.totalPoints;
        annualPlayersWithWeeks.push({
          player: participant.name,
          weeks,
          total: participant.totalPoints
        });
      } else {
        const prevValue = Number(annualPlayersWithWeeks[idx].weeks[label] || 0);
        annualPlayersWithWeeks[idx].weeks[label] = participant.totalPoints;
        annualPlayersWithWeeks[idx].total += (participant.totalPoints - prevValue);
      }
    });
  }
  document.getElementById("generatedAt").textContent = `Actualizado: ${resolveLastUpdatedLabel(data.generatedAt, weekCapture.updatedAt)}`;

  const renderCurrentWeekMeta = () => {
    const currentWeekMeta = [
      ["Semana", "Actual", "Configuracion mock de la semana en curso."],
      ["Estado", competitionActive ? "Vigente" : "Fuera de ventana", "Solo se puede cargar/editar mientras la competencia esta vigente."],
      ["Desafio", resolveChallengeText(weekCapture.challenge), "Lo define el primer equipo que guarda."],
      ["Inicio", formatDateTimeLabel(currentWeekStart), "La competencia arranca todos los martes a las 10:00."],
      ["Fin", formatDateTimeLabel(currentWeekEnd), "Finaliza todos los lunes a las 22:00."]
    ];
    document.getElementById("currentWeekMeta").innerHTML = buildMetaCards(currentWeekMeta);
  };

  const renderCurrentWeekTeams = () => {
    document.getElementById("currentWeekTeams").innerHTML = currentWeekTeams
      .map(group => {
        return `
          <article class="team-group team-group-${teamKey(group.team)}">
            <div class="team-group-title">${teamPill(group.team)}</div>
            <div class="player-chips">${group.players.map(name => `<span class="player-chip">${name}</span>`).join("")}</div>
          </article>
        `;
      })
      .join("");
  };

  const renderLiveCompetition = () => {
    const hasAnyPoints = Object.values(weekCapture.byTeam || {}).some(teamData =>
      Object.values(teamData?.playerPoints || {}).some(value => Number(value || 0) > 0)
    );
    const hasAnyFinish = Object.values(weekCapture.byTeam || {}).some(teamData => Boolean(teamData?.finishTime));
    const hasChallenge = Boolean(String(weekCapture.challenge || "").trim());
    const hasTarget = Number(weekCapture.targetTotal || 0) > 0;
    const hasLiveData = hasChallenge || hasTarget || hasAnyFinish || hasAnyPoints;

    const liveTeamsTitle = document.getElementById("liveTeamsTitle");
    const liveParticipantsTitle = document.getElementById("liveParticipantsTitle");
    const liveMetaEl = document.getElementById("liveMeta");
    const liveTeamsEl = document.getElementById("liveTeams");
    const liveParticipantsEl = document.getElementById("liveParticipants");

    if (!hasLiveData) {
      liveMetaEl.classList.remove("meta-grid");
      liveMetaEl.innerHTML = `<p class="muted">todavia sin datos</p>`;
      liveTeamsTitle.classList.add("is-hidden");
      liveParticipantsTitle.classList.add("is-hidden");
      liveTeamsEl.innerHTML = "";
      liveParticipantsEl.innerHTML = "";
      return;
    }

    liveMetaEl.classList.add("meta-grid");
    liveTeamsTitle.classList.remove("is-hidden");
    liveParticipantsTitle.classList.remove("is-hidden");

    const live = calculateLiveCompetition(currentWeekTeams, weekCapture, currentWeekStart, currentWeekEnd);
    const liveMeta = [
      ["Semana", live.meta.week, "Competencia actual en curso."],
      ["Desafio", live.meta.challenge, "Desafio cargado para la semana."],
      ["Inicio", live.meta.start, "Fecha de inicio de esta competencia."],
      ["Fin", live.meta.end, "Fecha de finalizacion de esta competencia."],
      ["Duracion", formatHoursMinutes(live.meta.durationHours), "Duracion total de la ventana semanal."],
      ["Ritmo oficial", Number(live.meta.officialRate).toFixed(2), "Objetivo de cantidad por hora segun el total configurado."],
      ["Media", Number(live.meta.mediaQuantity).toFixed(2), "Cantidad promedio objetivo por participante."]
    ];
    liveMetaEl.innerHTML = buildMetaCards(liveMeta);
    liveTeamsEl.innerHTML = makeTable(
      ["Equipo", "Puesto", "Hora final", "Horas", "Puntos"],
      live.teams.map(t => [teamPill(t.team), t.place <= 3 ? topBadge(t.place - 1) : String(t.place), t.finishTime, t.hours, t.points])
    );
    liveParticipantsEl.innerHTML = makeTable(
      ["Pos", "Nombre", "Equipo", "Cantidad", "Plus Vel", "Pts Equipo", "Pts Cantidad", "Pts Velocidad", "Total"],
      denseRankByScore(live.participants, "totalPoints").map(({ item: p, rank }) => [
        rank <= 3 ? topBadge(rank - 1) : String(rank),
        playerLabelWithSanction(p.name, p.sanction),
        teamPill(p.team),
        p.quantity,
        p.speedBonus,
        p.teamPoints,
        p.quantityPoints,
        p.speedPoints,
        p.totalPoints
      ])
    );
  };

  renderCurrentWeekMeta();
  renderCurrentWeekTeams();
  renderLiveCompetition();
  startNextDrawCountdown(nextDrawDate);

  const weekModal = document.getElementById("weekModal");
  const openWeekAdmin = document.getElementById("openWeekAdmin");
  const closeWeekModal = document.getElementById("closeWeekModal");
  const weekAuthForm = document.getElementById("weekAuthForm");
  const weekDataForm = document.getElementById("weekDataForm");
  const authTeam = document.getElementById("authTeam");
  const authPassword = document.getElementById("authPassword");
  const authError = document.getElementById("authError");
  const challengeInput = document.getElementById("weekChallengeInput");
  const weekDataError = document.getElementById("weekDataError");
  const targetInput = document.getElementById("weekTargetInput");
  const teamReadOnly = document.getElementById("weekTeamReadOnly");
  const finishInput = document.getElementById("weekFinishInput");
  const playersInputs = document.getElementById("weekPlayersInputs");
  let authorizedTeam = null;

  if (!competitionActive) {
    openWeekAdmin.disabled = true;
    openWeekAdmin.textContent = "Carga cerrada (fuera de la semana vigente)";
    openWeekAdmin.title = "La carga se habilita desde el martes 10:00 hasta el lunes 22:00.";
  }

  const closeModal = () => {
    weekModal.classList.add("is-hidden");
    weekModal.setAttribute("aria-hidden", "true");
    authError.classList.add("is-hidden");
    weekDataForm.classList.add("is-hidden");
    weekAuthForm.classList.remove("is-hidden");
    authPassword.value = "";
    weekDataError.classList.add("is-hidden");
    weekDataError.textContent = "";
  };

  const openModal = () => {
    if (!competitionActive) return;
    weekModal.classList.remove("is-hidden");
    weekModal.setAttribute("aria-hidden", "false");
  };

  const populateTeamForm = (teamName) => {
    authorizedTeam = teamName;
    const teamConfig = currentWeekTeams.find(t => t.team === teamName);
    const teamData = weekCapture.byTeam[teamName];
    const challengeLocked = Boolean((weekCapture.challenge || "").trim());
    challengeInput.value = String(weekCapture.challenge || "").trim();
    challengeInput.readOnly = challengeLocked;
    challengeInput.required = !challengeLocked;
    challengeInput.title = challengeLocked
      ? "El desafio ya fue definido por el primer equipo que cargo."
      : "Defini el desafio inicial de la competencia.";
    targetInput.value = weekCapture.targetTotal === "" ? "" : String(weekCapture.targetTotal);
    teamReadOnly.value = teamName;
    finishInput.value = formatDateTimeLocalValue(teamData.finishTime);
    playersInputs.innerHTML = teamConfig.players
      .map(player => `
        <label>
          ${player}
          <input type="number" min="0" step="1" data-player="${player}" value="${teamData.playerPoints[player] ?? 0}" />
        </label>
      `)
      .join("");
  };

  openWeekAdmin.addEventListener("click", openModal);
  closeWeekModal.addEventListener("click", closeModal);

  weekAuthForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const team = authTeam.value;
    const password = authPassword.value;
    const allowed = team ? await verifyTeamPassword(team, password) : false;
    if (!allowed) {
      authError.textContent = WEEK_AUTH_API
        ? "No se pudo validar password. Revisa Apps Script (deploy en Anyone y doPost habilitado)."
        : "Falta configurar WEEK_AUTH_API (Google Apps Script).";
      authError.classList.remove("is-hidden");
      return;
    }
    authError.textContent = "Password incorrecta.";
    authError.classList.add("is-hidden");
    weekAuthForm.classList.add("is-hidden");
    weekDataForm.classList.remove("is-hidden");
    populateTeamForm(team);
  });

  weekDataForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!authorizedTeam) return;
    const lockedChallenge = (weekCapture.challenge || "").trim();
    const enteredChallenge = challengeInput.value.trim();
    if (!lockedChallenge && !enteredChallenge) {
      weekDataError.textContent = "El primer equipo debe definir el desafio para continuar.";
      weekDataError.classList.remove("is-hidden");
      challengeInput.focus();
      return;
    }
    const enteredTarget = Number(targetInput.value);
    if (!Number.isFinite(enteredTarget) || enteredTarget <= 0) {
      weekDataError.textContent = "Ingresa un numero total a conseguir mayor que 0.";
      weekDataError.classList.remove("is-hidden");
      targetInput.focus();
      return;
    }
    weekDataError.classList.add("is-hidden");
    weekDataError.textContent = "";
    if (!lockedChallenge) {
      weekCapture.challenge = enteredChallenge;
    }
    if (!String(weekCapture.weekLabel || "").trim()) {
      weekCapture.weekLabel = weekLabels[weekLabels.length - 1] || "Actual";
    }
    weekCapture.targetTotal = enteredTarget;
    weekCapture.updatedAt = new Date().toISOString();
    weekCapture.byTeam[authorizedTeam].finishTime = finishInput.value ? new Date(finishInput.value).toISOString() : "";
    playersInputs.querySelectorAll("input[data-player]").forEach(input => {
      const player = input.getAttribute("data-player");
      const value = input.value === "" ? 0 : Number(input.value);
      weekCapture.byTeam[authorizedTeam].playerPoints[player] = Number.isFinite(value) ? value : 0;
    });
    await saveWeekCapture(weekStorageKey, weekCapture);
    document.getElementById("generatedAt").textContent = `Actualizado: ${resolveLastUpdatedLabel(data.generatedAt, weekCapture.updatedAt)}`;
    renderCurrentWeekMeta();
    renderCurrentWeekTeams();
    renderLiveCompetition();
    closeModal();
  });

  const playersByTotal = annualPlayersWithWeeks
    .slice()
    .sort((a, b) => b.total - a.total);

  const rankingRows = denseRankByScore(playersByTotal, "total").map(({ item: p, rank }) => [
    rank <= 3 ? topBadge(rank - 1) : String(rank),
    p.player,
    p.total
  ]);
  document.getElementById("annualRanking").innerHTML = `<div class="table-wrap">${makeTable(["Puesto", "Jugador", "Total"], rankingRows)}</div>`;

  const annualColumns = ["Jugador", ...weekLabels, "Total"];
  const annualRows = annualPlayersWithWeeks
    .slice()
    .sort((a, b) => a.player.localeCompare(b.player, "es", { sensitivity: "base" }))
    .map(p => [
      p.player,
      ...weekLabels.map(w => p.weeks[w]),
      p.total
    ]);
  document.getElementById("annualTable").innerHTML = makeTable(annualColumns, annualRows);
  const annualTableEl = document.querySelector("#annualTable table");
  if (annualTableEl) {
    annualTableEl.classList.add("annual-weekly-table");
  }

  const weeklyToggle = document.getElementById("weeklyToggle");
  const weeklyTableContainer = document.getElementById("weeklyTableContainer");
  weeklyToggle.addEventListener("click", () => {
    const willExpand = weeklyTableContainer.classList.contains("is-hidden");
    weeklyTableContainer.classList.toggle("is-hidden");
    weeklyToggle.setAttribute("aria-expanded", String(willExpand));
  });

  const latest = latestFromCapture || buildEmptyCompetition(prevWeekLabel, prevWeekStart, prevWeekEnd);
  const hasLatestData = Boolean(latest?.participants?.length || latest?.teams?.length);
  const latestTeamsSorted = latest.teams
    .slice()
    .sort((a, b) => a.place - b.place);
  const latestParticipantsSorted = latest.participants
    .slice()
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.position - b.position;
    });

  const latestMeta = [
    ["Semana", latest.week, explainWeekLabel(latest.week)],
    ["Desafio", latest.challenge || "-", "Es el desafio de la semana."],
    ["Inicio", latest.start || "-", "Fecha y hora de inicio de la competencia."],
    ["Fin", latest.end || "-", "Fecha y hora de finalizacion oficial de la competencia."],
    ["Duracion", latest.durationHours == null ? "-" : formatHoursMinutes(latest.durationHours), "Duracion total entre el inicio y el fin."],
    ["Ritmo oficial", latest.officialRate == null ? "-" : Number(latest.officialRate).toFixed(2), "Es la velocidad objetivo: cantidad esperada por hora para completar el desafio en el tiempo oficial."],
    ["Media", latest.mediaQuantity == null ? "-" : Number(latest.mediaQuantity).toFixed(2), "Es la cantidad promedio por participante (cantidad total dividida por participantes)."]
  ];
  document.getElementById("latestMeta").innerHTML = buildMetaCards(latestMeta);

  if (!hasLatestData) {
    const placeholder = `<p class="muted">No hay datos cargados.</p>`;
    document.getElementById("latestTeams").innerHTML = placeholder;
    document.getElementById("latestParticipants").innerHTML = placeholder;
  } else {
    document.getElementById("latestTeams").innerHTML = makeTable(
      ["Equipo", "Puesto", "Hora final", "Horas", "Puntos"],
      latestTeamsSorted.map(t => [teamPill(t.team), topBadge(t.place - 1), t.finishTime, formatHoursDisplay(t.hours), t.points])
    );

    document.getElementById("latestParticipants").innerHTML = makeTable(
      ["Pos", "Nombre", "Equipo", "Cantidad", "Plus Vel", "Pts Equipo", "Pts Cantidad", "Pts Velocidad", "Total"],
      denseRankByScore(latestParticipantsSorted, "totalPoints").map(({ item: p, rank }) => [
        rank <= 3 ? topBadge(rank - 1) : String(rank),
        p.name,
        teamPill(p.team),
        p.quantity,
        p.speedBonus,
        p.teamPoints,
        p.quantityPoints,
        p.speedPoints,
        p.totalPoints
      ])
    );
  }

  const historySource = data.history.slice();
  if (latestFromCapture && data.latestCompetition) {
    const prevLatest = data.latestCompetition;
    const alreadyInHistory = historySource.some(w => w.week === prevLatest.week && w.challenge === prevLatest.challenge);
    if (!alreadyInHistory) historySource.unshift(prevLatest);
  }
  historyFromCapture.forEach(dynamicWeek => {
    const alreadyInHistory = historySource.some(w => w.week === dynamicWeek.week && w.start === dynamicWeek.start);
    if (!alreadyInHistory) historySource.unshift(dynamicWeek);
  });

  const historyHtml = historySource
    .reverse()
    .map(week => {
      const teamsSorted = week.teams
        .slice()
        .sort((a, b) => a.place - b.place);
      const participantsSorted = week.participants
        .slice()
        .sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
          return a.position - b.position;
        });
      const weekMeta = [
        ["Semana", week.week, explainWeekLabel(week.week)],
        ["Desafio", week.challenge, "Es el desafio de la semana."],
        ["Inicio", week.start, "Fecha y hora de inicio de la competencia."],
        ["Fin", week.end, "Fecha y hora de finalizacion oficial de la competencia."],
        ["Duracion", formatHoursMinutes(week.durationHours), "Duracion total entre el inicio y el fin."],
        ["Ritmo oficial", Number(week.officialRate).toFixed(2), "Es la velocidad objetivo: cantidad esperada por hora para completar el desafio en el tiempo oficial."],
        ["Media", Number(week.mediaQuantity).toFixed(2), "Es la cantidad promedio por participante (cantidad total dividida por participantes)."]
      ];
      const teamsTable = makeTable(
        ["Equipo", "Puesto", "Hora final", "Horas", "Puntos"],
        teamsSorted.map(t => [teamPill(t.team), topBadge(t.place - 1), t.finishTime, formatHoursDisplay(t.hours), t.points])
      );

      const participantRows = denseRankByScore(participantsSorted, "totalPoints").map(({ item: p, rank }) => [
        rank <= 3 ? topBadge(rank - 1) : String(rank),
        p.name,
        teamPill(p.team),
        p.quantity,
        p.speedBonus,
        p.teamPoints,
        p.quantityPoints,
        p.speedPoints,
        p.totalPoints
      ]);

      return `
        <details>
          <summary>
            <strong>Semana ${week.week}</strong>
            <span>${week.challenge}</span>
          </summary>
          <div class="history-content">
            <div class="meta-grid">${buildMetaCards(weekMeta)}</div>
            <h3>Equipos</h3>
            <div class="table-wrap">${teamsTable}</div>
            <h3>Calculos por Participante</h3>
            <div class="table-wrap">${makeTable(["Pos", "Nombre", "Equipo", "Cantidad", "Plus Vel", "Pts Equipo", "Pts Cantidad", "Pts Velocidad", "Total"], participantRows)}</div>
          </div>
        </details>
      `;
    })
    .join("");

  document.getElementById("historyList").innerHTML = historyHtml;

  decoratePanelsWithPokemon();
}

load().catch(err => {
  document.body.innerHTML = `<main class="layout"><section class="panel"><h2>Error</h2><p>No se pudo cargar data.json</p><pre>${err.message}</pre></section></main>`;
});



