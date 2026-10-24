const $ = (id) => document.getElementById(id);
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const KEY = "bna-medir-v4";
const PHOTO_DB = "bna-photos";
const PHOTO_STORE = "receipts";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
const pad = (n) => String(n).padStart(2, "0");
const cop = (n) => "$ " + Number(n).toLocaleString("es-CO");
const mname = (k) => {
  const [y, m] = k.split("-");
  return new Date(+y, m - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
};
const mshort = (k) => {
  const [y, m] = k.split("-");
  return new Date(+y, m - 1, 1).toLocaleDateString("es-CO", { month: "short" });
};
const keyOf = (y, m) => {
  const x = new Date(y, m, 1);
  return x.getFullYear() + "-" + pad(x.getMonth() + 1);
};
const cycleOf = (d) => keyOf(d.getFullYear(), d.getMonth() - 1);
const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
const D = () => {
  const v = $("dd") ? $("dd").value : today();
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const NAMES = {
  Micro: [
    "Panadería La Esquina",
    "Ferretería El Puerto",
    "Café Bocas de Ceniza",
    "Papelería Don Lucho",
    "Peluquería Estilo Caribe",
    "Tienda Naturista Verde",
    "Lavandería Ola Limpia",
  ],
  Pequeña: [
    "Clínica Dental Sonrisa",
    "Restaurante Muelle 13",
    "Gimnasio Fuerza Costeña",
    "Imprenta Barranquilla",
    "Colegio Los Almendros",
    "Farmacia Salud Total",
    "Estudio Contable Marea",
  ],
  Mediana: [
    "Hotel Brisa Caribe",
    "Textiles del Atlántico",
    "Supermercado El Gran Ahorro",
    "Clínica del Norte",
    "Bodegas Frío Costa",
    "Universidad Técnica del Mar",
  ],
  Grande: [
    "Centro Comercial Alameda",
    "Logística Río Magdalena",
    "Puerto Carga Sur",
    "Embotelladora Caribe",
  ],
};
const SZ = {
  Micro: [3, 10, 25, 60],
  Pequeña: [11, 40, 90, 200],
  Mediana: [41, 200, 500, 1000],
  Grande: [201, 600, 2000, 4000],
};

function rng(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gen(seed) {
  const r = rng(seed);
  const out = [];
  const now = new Date();
  let ci = 0;
  for (const t in NAMES) {
    for (const n of NAMES[t]) {
      const z = SZ[t];
      const emp = Math.round(z[0] + (z[1] - z[0]) * r());
      const m = z[2] + (z[3] - z[2]) * r();
      const r0 = 0.93 + 0.2 * r();
      const dr = -0.04 + 0.05 * r();
      const tf = 820 + r() * 80;
      for (let k = 0; k < 6; k++) {
        const cy = keyOf(now.getFullYear(), now.getMonth() - (6 - k));
        const mm = Math.round(m * (1 + (r() - 0.5) * 0.03));
        const c = Math.round(mm * clamp(r0 + dr * k + (r() - 0.5) * 0.07, 0.62, 1.4) * 10) / 10;
        out.push({
          id: `s${ci}-${cy}`,
          n,
          t,
          emp,
          m: mm,
          c,
          pe: Math.round((c * 30 * tf) / 1000) * 1000,
          email: "contacto@" + n.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "") + ".co",
          cy,
        });
      }
      ci++;
    }
  }
  return out;
}

let data = [];
let logs = [];
let seed = 7;
let filter = "Todas";
let zone = "all";
let q = "";
let sort = "sav";
let cyc = "";
let goal = 10;
let live = null;
let lastLead = null;
let sig = "";
let lastRank = {};
let view0 = "rank";
const photos = {};

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(PHOTO_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePhoto(id, dataUrl) {
  photos[id] = dataUrl;
  try {
    const db = await openPhotoDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readwrite");
      tx.objectStore(PHOTO_STORE).put(dataUrl, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (_) {}
}

async function loadPhotos() {
  try {
    const db = await openPhotoDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const req = tx.objectStore(PHOTO_STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          photos[cursor.key] = cursor.value;
          cursor.continue();
        } else resolve();
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch (_) {}
}

async function clearPhotos() {
  Object.keys(photos).forEach((k) => delete photos[k]);
  try {
    const db = await openPhotoDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readwrite");
      tx.objectStore(PHOTO_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (_) {}
}

try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s && Array.isArray(s.d)) {
    data = s.d;
    logs = s.l || [];
    seed = s.s || 7;
    goal = s.g || 10;
  }
} catch (_) {}
if (!data.length) data = gen(seed);

function save() {
  try {
    const slim = data.map(({ p, ...rest }) => rest);
    localStorage.setItem(KEY, JSON.stringify({ d: slim, l: logs, s: seed, g: goal }));
    return true;
  } catch (_) {
    return false;
  }
}

const calc = (e) => {
  const r = e.c / e.m * 100;
  return { pct: r, sav: 100 - r, z: r < 90 ? "a" : r <= 110 ? "s" : "r" };
};
const ZN = { a: "Ahorro", s: "Zona segura", r: "Recargo" };
const ZC = { a: "var(--g2)", s: "var(--warn)", r: "var(--bad)" };
const seal = (cl) =>
  `<svg class="${cl || ""}" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="37" fill="#f1faf5" stroke="#0b5d3b" stroke-width="3"/><circle cx="40" cy="40" r="29" fill="none" stroke="#1f9d55" stroke-width="1.5" stroke-dasharray="3 3"/><path d="M40 62C24 56 20 38 28 24c14 4 22 18 12 38z" fill="#1f9d55"/><path d="M44 18 34 40h8l-3 16 14-24h-9z" fill="#0b5d3b"/></svg>`;
const medal = (i) =>
  `<svg viewBox="0 0 40 40" aria-label="Puesto ${i}"><polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="url(#${["gd", "sv", "br"][i - 1]})"/><text x="20" y="26" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="17" fill="#fff">${i}</text></svg>`;
const initials = (n) =>
  n.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || n[0];
const hue = (n) => {
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 60;
  return `hsl(${130 + h},55%,${32 + h % 12}%)`;
};
const avatar = (n) => `<span class="av" style="background:${hue(n)}">${esc(initials(n))}</span>`;

function toast(t) {
  const e = $("toast");
  e.textContent = t;
  e.style.display = "block";
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (e.style.display = "none"), 5000);
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Barranquilla No Se Apaga", { body: t });
    }
  } catch (_) {}
}

function confetti() {
  if (RM) return;
  const cs = ["#1f9d55", "#7ccf9a", "#0b5d3b", "#c98a12", "#fff"];
  for (let i = 0; i < 30; i++) {
    const s = document.createElement("span");
    s.className = "cf";
    s.style.cssText = `background:${cs[i % 5]};--dx:${(Math.random() - 0.5) * 420}px;--dy:${120 + Math.random() * 260}px;--r:${Math.random() * 720}deg`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1600);
  }
}

const cycles = () => [...new Set(data.map((r) => r.cy))].sort();
function win() {
  const d = D();
  const day = d.getDate();
  const next = new Date(d.getFullYear(), d.getMonth() + (day <= 3 ? 0 : 1), 1);
  return {
    day,
    cy: cycleOf(d),
    open: day <= 3,
    left: 4 - day,
    next,
    dias: Math.round((next - new Date(d.getFullYear(), d.getMonth(), day)) / 864e5),
  };
}
const names = () => [...new Set(data.map((r) => r.n))];
const pending = (cy) => names().filter((n) => !data.some((r) => r.n === n && r.cy === cy));
function curCycle() {
  const cs = cycles();
  if (!cs.includes(cyc)) cyc = cs.includes(win().cy) ? win().cy : cs[cs.length - 1];
  return cs;
}
const recs0 = (cy, sz) =>
  data.filter((e) => e.cy === cy && (!sz || sz === "Todas" || e.t === sz)).map((e) => ({ ...e, ...calc(e) }));
const cyRecs = () => recs0(cyc);
const leaderOf = (cy) => recs0(cy).sort((a, b) => b.sav - a.sav)[0];
const prevCy = () => {
  const cs = cycles();
  const i = cs.indexOf(cyc);
  return i > 0 ? cs[i - 1] : null;
};
function view() {
  const sorter = {
    sav: (a, b) => b.sav - a.sav,
    kwh: (a, b) => b.m - b.c - (a.m - a.c),
    per: (a, b) => a.c / a.emp - b.c / b.emp,
  }[sort];
  return cyRecs()
    .filter((e) => (filter === "Todas" || e.t === filter) && (zone === "all" || e.z === zone) && (!q || e.n.toLowerCase().includes(q)))
    .sort(sorter);
}

const NAV = [
  ["rank", "🏆", "Ranking", "Ranking"],
  ["reg", "📝", "Registrar", "Registrar ciclo"],
  ["mine", "🏢", "Mi empresa", "Mi empresa"],
  ["rem", "🔔", "Avisos", "Recordatorios"],
  ["ds", "📊", "Datos", "Dataset simulado"],
];

function renderNav() {
  const pn = pending(win().cy).length;
  $("nav").innerHTML =
    `<div class="logo"><svg viewBox="0 0 40 40" aria-hidden="true"><polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#1f9d55"/><path d="M20 30c-7-3-9-10-5-16 6 2 9 8 5 16z" fill="#fff"/></svg>Barranquilla<br>No Se Apaga</div>` +
    NAV.map(
      (n, i) =>
        `${i === 0 ? '<div class="grp">Explorar</div>' : i === 1 ? '<div class="grp">Participa</div>' : ""}<button type="button" data-v="${n[0]}" ${n[0] === view0 ? 'aria-current="page"' : ""}><span class="ic">${n[1]}</span>${n[2]}${n[0] === "rem" && pn ? `<span class="nb">${pn}</span>` : ""}</button>`
    ).join("");
}

function setView(v) {
  view0 = v;
  NAV.forEach((n) => {
    $("v-" + n[0]).hidden = n[0] !== v;
    if (n[0] === v) $("vt").textContent = n[3];
  });
  renderNav();
  scrollTo({ top: 0 });
}

function renderBanner() {
  const w = win();
  const p = pending(w.cy).length;
  const mes = mname(w.cy);
  const nm = w.next.toLocaleDateString("es-CO", { day: "numeric", month: "long" });
  const demo = `<label class="demo">Fecha de la demo<input type="date" id="dd" value="${$("dd") ? $("dd").value : today()}"></label>`;
  $("bn").className = "banner" + (w.open ? " open" : "");
  $("bn").innerHTML =
    (w.open
      ? `<div><b>Ventana abierta: reporta ${esc(mes)}</b><br>Del 1 al 3 de cada mes. Quedan ${w.left} día${w.left > 1 ? "s" : ""}. Faltan ${p} empresa${p === 1 ? "" : "s"}.</div>`
      : `<div><b>Ventana cerrada</b><br>La próxima abre el ${esc(nm)} (en ${w.dias} días). Los envíos ahora se marcan como tardíos.</div>`) + demo;
  $("dd").onchange = () => {
    cyc = "";
    renderAll();
  };
  $("cyl").textContent = "Ciclo que reportas: " + mname(w.cy) + (w.open ? "" : " · fuera de plazo (tardío)");
}

function renderCards() {
  const all = cyRecs();
  const pc = prevCy();
  const lead = [...all].sort((a, b) => b.sav - a.sav)[0];
  const earned = lead && lead.sav >= goal;
  const p = lead ? clamp((lead.sav / goal) * 100, 2, 100) : 0;
  let star = null;
  if (pc)
    all.forEach((e) => {
      const o = data.find((x) => x.n === e.n && x.cy === pc);
      if (o) {
        const d = e.sav - calc(o).sav;
        if (!star || d > star.d) star = { e, d };
      }
    });
  const kwh = all.reduce((a, b) => a + (b.m - b.c), 0);
  const avg = all.length ? all.reduce((a, b) => a + b.sav, 0) / all.length : 0;
  $("cards").innerHTML = `<div class="cd"><h3>Estrella en ascenso</h3>${
    star
      ? `<div class="who">${avatar(star.e.n)}<div><b>${esc(star.e.n)}</b><small>${star.e.t} · ${star.e.emp} empleados</small></div><span class="${star.d >= 0 ? "up" : "dn"}" style="margin-left:auto">${star.d >= 0 ? "↗ +" : "↘ "}${star.d.toFixed(1)} pts</span></div>`
      : '<p class="sub">Aparece desde el segundo ciclo.</p>'
  }</div>
<button class="cd btn2" id="bc" type="button" aria-haspopup="dialog"><h3>Sello Cámara de Comercio</h3><div class="who">${seal("")}<div style="flex:1"><div class="big" style="font-size:1.5rem">${earned ? "Conseguido" : "En juego"}</div><small class="sub">${lead ? esc(lead.n) + " · " + lead.sav.toFixed(1) + "% de " + goal + "%" : "Sin datos"}</small></div></div><div class="pr"><i style="width:${p}%"></i></div></button>
<div class="cd"><h3>Ahorro total del ciclo</h3><div class="who"><span class="av" style="background:var(--g2);font-size:20px">⚡</span><div><div class="big">${Math.round(kwh).toLocaleString("es-CO")}</div><small>kWh/día · ${avg.toFixed(1)}% promedio · ${all.length} empresas</small></div></div></div>`;
  $("bc").querySelector("svg").style.cssText = "width:44px;height:44px;flex:none";
  if (earned && lead.n !== lastLead && lastLead !== null) {
    confetti();
    toast(`${lead.n} gana el Sello de la Cámara con ${lead.sav.toFixed(1)}% de ahorro.`);
  }
  lastLead = earned ? lead.n : "";
  if ($("bd").open) renderBadge();
}

function spark(n) {
  const rs = data
    .filter((r) => r.n === n && r.cy <= cyc)
    .sort((a, b) => a.cy.localeCompare(b.cy))
    .map((r) => calc(r).pct);
  return `<svg width="${rs.length * 9}" height="24" viewBox="0 0 ${rs.length * 9} 24" aria-hidden="true">${rs
    .map((p, i) => {
      const h = 3 + clamp((130 - p) / 60, 0, 1) * 20;
      return `<rect x="${i * 9}" y="${24 - h}" width="6" height="${h}" rx="2" fill="${i === rs.length - 1 ? "#1f9d55" : "#7ccf9a"}"/>`;
    })
    .join("")}</svg>`;
}

function renderRank() {
  const cs = curCycle();
  $("cs").innerHTML = cs.map((c) => `<option value="${c}" ${c === cyc ? "selected" : ""}>${mname(c)}</option>`).join("");
  $("fs").value = filter;
  $("fz").value = zone;
  const v = view();
  const lead = cyRecs().sort((a, b) => b.sav - a.sav)[0];
  const nsig = [filter, zone, q, sort, cyc].join("|");
  const tops = {};
  $("list").querySelectorAll(".tr").forEach((r) => (tops[r.dataset.n] = r.getBoundingClientRect().top));
  let prev = nsig === sig ? lastRank : null;
  const pc = prevCy();
  if (!prev && pc && sort === "sav") {
    prev = {};
    recs0(pc, filter)
      .filter((e) => zone === "all" || e.z === zone)
      .sort((a, b) => b.sav - a.sav)
      .forEach((e, i) => (prev[e.n] = i));
  }
  const rk = {};
  $("list").innerHTML = v.length
    ? v
        .map((e, i) => {
          rk[e.n] = i;
          const d = prev && prev[e.n] != null ? prev[e.n] - i : 0;
          const o = data.find((x) => x.n === e.n && x.cy === pc);
          const dl = o ? e.sav - calc(o).sav : null;
          return `<div class="tr ${i < 3 ? "r" + (i + 1) : ""} ${e.fl ? "fl" : ""}" data-n="${esc(e.n)}" data-id="${esc(e.id)}" role="button" tabindex="0" aria-label="Ver historial de ${esc(e.n)}">
<div class="c-pos">${i < 3 ? medal(i + 1) : i + 1}<small class="${d > 0 ? "up" : "dn"}">${d ? (d > 0 ? "▲" : "▼") + Math.abs(d) : ""}</small></div>
<div class="c-who"><div class="who">${avatar(e.n)}<div><b>${esc(e.n)}</b>${lead && e.n === lead.n && lead.sav >= goal ? seal("sl") : ""}${e.late ? '<span class="late">tardío</span>' : ""}<small>${e.t} · ${e.emp} empleados</small></div></div></div>
<div class="c-sav"><b style="color:${e.sav >= 0 ? "var(--g1)" : "var(--bad)"}">${e.sav >= 0 ? "−" : "+"}${Math.abs(e.sav).toFixed(1)}%</b><small>${e.pct.toFixed(0)}% de la meta</small></div>
<div class="c-use"><span>${e.c} / ${e.m} kWh/día</span><div class="bar" aria-hidden="true"><i class="z-${e.z}" style="width:${clamp(e.pct / 1.5, 2, 100)}%"></i></div></div>
<div class="c-tr">${spark(e.n)}${dl != null ? `<span class="${dl >= 0 ? "up" : "dn"}">${dl >= 0 ? "↗ +" : "↘ "}${dl.toFixed(1)} pts</span>` : ""}</div>
<div class="c-zn"><span class="pill z-${e.z}">${ZN[e.z]}</span></div></div>`;
        })
        .join("")
    : '<div class="empty">Ninguna empresa coincide con estos filtros.</div>';
  sig = nsig;
  lastRank = rk;
  if (!RM)
    $("list").querySelectorAll(".tr").forEach((r) => {
      const o = tops[r.dataset.n];
      if (o == null) return;
      const dl = o - r.getBoundingClientRect().top;
      if (Math.abs(dl) > 1) {
        r.style.transition = "none";
        r.style.transform = `translateY(${dl}px)`;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            r.style.transition = "transform .5s cubic-bezier(.2,.8,.2,1)";
            r.style.transform = "";
          })
        );
      }
    });
}

function renderCharts() {
  const cs = cycles();
  const pts = cs
    .map((c) => {
      const a = recs0(c, filter);
      return a.length ? { c, avg: a.reduce((s, x) => s + x.pct, 0) / a.length, best: Math.min(...a.map((x) => x.pct)) } : null;
    })
    .filter(Boolean);
  const y = (v) => 10 + ((130 - clamp(v, 70, 130)) / 60) * 130;
  const x = (i) => 36 + (pts.length > 1 ? i * (540 / (pts.length - 1)) : 270);
  const line = (k) => pts.map((p, i) => `${x(i)},${y(p[k])}`).join(" ");
  $("tr").innerHTML = pts.length
    ? `<svg viewBox="0 0 600 175" style="width:100%" role="img" aria-label="Tendencia del porcentaje de la meta"><rect x="36" y="${y(90)}" width="540" height="${y(70) - y(90)}" fill="#f1faf5"/>${[
        [90, "#1f9d55"],
        [100, "#5a7567"],
        [110, "#c0392b"],
      ]
        .map(
          (l) =>
            `<line x1="36" x2="576" y1="${y(l[0])}" y2="${y(l[0])}" stroke="${l[1]}" stroke-dasharray="4 4" opacity=".6"/><text x="580" y="${y(l[0]) + 4}" font-size="10" fill="${l[1]}">${l[0]}%</text>`
        )
        .join("")}
<polyline points="${line("best")}" fill="none" stroke="#7ccf9a" stroke-width="3"/><polyline points="${line("avg")}" fill="none" stroke="#0b5d3b" stroke-width="3"/>
${pts
  .map(
    (p, i) =>
      `<circle cx="${x(i)}" cy="${y(p.avg)}" r="4.5" fill="#0b5d3b"><title>${mname(p.c)}: promedio ${p.avg.toFixed(1)}% de la meta</title></circle><circle cx="${x(i)}" cy="${y(p.best)}" r="4" fill="#7ccf9a"><title>${mname(p.c)}: mejor ${p.best.toFixed(1)}%</title></circle><text x="${x(i)}" y="168" font-size="11" text-anchor="middle" fill="#5a7567">${mshort(p.c)}</text>`
  )
  .join("")}</svg><div class="legend"><span style="color:#0b5d3b">●</span> Promedio &nbsp; <span style="color:#7ccf9a">●</span> Mejor empresa. Más abajo es mejor.</div>`
    : "";
  const a = cyRecs().filter((e) => filter === "Todas" || e.t === filter);
  const n = { a: 0, s: 0, r: 0 };
  a.forEach((e) => n[e.z]++);
  $("zn").innerHTML = `<div class="zb">${["a", "s", "r"]
    .map((z) => `<button type="button" data-z="${z}" class="z-${z} ${zone !== "all" && zone !== z ? "dim" : ""}" style="flex:${n[z] || 0.001}" title="${ZN[z]}">${n[z] || ""}</button>`)
    .join("")}</div><div class="lg">${["a", "s", "r"]
    .map((z) => `<span><b style="color:${ZC[z]}">●</b> ${ZN[z]}: ${n[z]}</span>`)
    .join("")}<span class="sub">Toca una zona para filtrar el ranking.</span></div>`;
}

function renderMine() {
  const mine = [...new Set(data.filter((r) => r.mine).map((r) => r.n))];
  if (!mine.length) {
    $("mn").innerHTML =
      '<h2 style="font-size:1.3rem">Mi empresa <span class="priv">Privado</span></h2><p class="empty">Registra tu empresa para ver aquí tu historial y el valor de tus facturas. Solo se ve en este navegador.</p><button class="btn" data-go="reg">Registrar mi empresa</button>';
    return;
  }
  const sel = $("ms") ? $("ms").value : mine[0];
  const n = mine.includes(sel) ? sel : mine[0];
  const rs = data.filter((r) => r.n === n).sort((a, b) => b.cy.localeCompare(a.cy));
  $("mn").innerHTML = `<h2 style="font-size:1.3rem">Mi empresa <span class="priv">Privado</span></h2><select id="ms" aria-label="Empresa" style="margin-top:10px">${mine
    .map((x) => `<option ${x === n ? "selected" : ""}>${esc(x)}</option>`)
    .join("")}</select><table><tr><th>Ciclo</th><th>% de meta</th><th>Zona</th><th>Factura</th></tr>${rs
    .map((r) => {
      const c = calc(r);
      return `<tr><td>${mname(r.cy)}${r.late ? '<span class="late">tardío</span>' : ""}</td><td>${c.pct.toFixed(0)}%</td><td>${ZN[c.z]}</td><td>${r.pe != null ? cop(r.pe) : "—"}</td></tr>`;
    })
    .join("")}</table>`;
  $("ms").onchange = renderMine;
}

function mailtoRemind(ns, msg) {
  const emails = ns.map((n) => data.find((x) => x.n === n)?.email).filter(Boolean);
  const unique = [...new Set(emails)];
  const subject = encodeURIComponent("Barranquilla No Se Apaga — recordatorio de ciclo");
  const body = encodeURIComponent("Hola,\n\nDesde la Cámara de Comercio: " + msg + "\n\nEntra a Medir y competir y registra tu consumo vs. meta.\n");
  const href =
    unique.length === 1
      ? `mailto:${unique[0]}?subject=${subject}&body=${body}`
      : `mailto:?bcc=${unique.join(",")}&subject=${subject}&body=${body}`;
  location.href = href;
}

function remind(ns, msg) {
  ns.forEach((n) => {
    const r = data.find((x) => x.n === n);
    logs.push({
      n,
      e: r ? r.email : "",
      t: new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    });
  });
  logs = logs.slice(-30);
  save();
  mailtoRemind(ns, msg);
  toast(`Recordatorio listo para ${ns.length} empresa${ns.length > 1 ? "s" : ""}: ${msg}`);
  renderRem();
}

function renderRem() {
  const w = win();
  const p = pending(w.cy);
  const msg = w.open
    ? `envía tu porcentaje de ${mname(w.cy)} antes del día 3.`
    : `falta el porcentaje de ${mname(w.cy)}; la ventana ya cerró.`;
  $("rm").innerHTML =
    `<h2 style="font-size:1.3rem;margin-bottom:8px">Recordatorios del mes</h2>` +
    (p.length
      ? `<p class="sub" style="margin:0 0 6px">Aún no reportan ${esc(mname(w.cy))}:</p>` +
        p
          .slice(0, 8)
          .map((n) => `<div class="pend">${avatar(n)}<span><b>${esc(n)}</b></span><button class="btn s" data-r="${esc(n)}">Recordar</button></div>`)
          .join("") +
        (p.length > 8 ? `<p class="sub">y ${p.length - 8} más…</p>` : "") +
        `<button class="btn" id="ra">Recordar a todas (${p.length})</button>`
      : '<p class="empty">Todas las empresas ya reportaron este ciclo. Cambia la fecha de la demo al 2 del mes siguiente para ver los recordatorios.</p>') +
    `<button class="btn g" id="np" type="button">Activar avisos del navegador</button><div class="log">${logs
      .slice(-4)
      .reverse()
      .map((l) => `<div>✉ ${esc(l.t)} → ${esc(l.n)} (${esc(l.e)})</div>`)
      .join("")}</div>`;
  $("rm").onclick = (e) => {
    const r = e.target.dataset.r;
    if (r) remind([r], msg);
    if (e.target.id === "ra") remind(p, msg);
    if (e.target.id === "np") {
      try {
        Notification.requestPermission().then((x) =>
          toast(x === "granted" ? "Avisos activados." : "El navegador no permitió los avisos.")
        );
      } catch (_) {
        toast("Tu navegador no admite avisos. Verás los recordatorios en la página.");
      }
    }
  };
}

const csv = () =>
  "empresa,tamano,empleados,ciclo,meta_kwh_dia,consumo_kwh_dia,pct_meta,zona,factura_cop\n" +
  data
    .map((r) => {
      const c = calc(r);
      return [`"${r.n}"`, r.t, r.emp, r.cy, r.m, r.c, c.pct.toFixed(1), ZN[c.z], r.mine ? r.pe : ""].join(",");
    })
    .join("\n");

function renderDs() {
  $("dsb").innerHTML = `<h2 style="font-size:1.3rem">Dataset simulado</h2><p class="sub" style="margin:6px 0 0">${names().length} empresas × ${cycles().length} ciclos = ${data.length} registros (semilla ${seed}). El consumo sigue una tendencia por empresa más ruido; la factura usa una tarifa cercana a $850/kWh.</p><textarea id="csv" readonly aria-label="Dataset en CSV">${esc(csv())}</textarea>
<div class="btns"><button class="btn" id="cp" type="button">Copiar CSV</button><button class="btn g" id="nm" type="button">Simular próximo mes</button><button class="btn g" id="rg" type="button">Generar otro dataset</button></div>`;
  $("cp").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("csv").value);
      toast("CSV copiado.");
    } catch (_) {
      $("csv").select();
      toast("Selecciona y copia con Ctrl+C.");
    }
  };
  $("nm").onclick = () => {
    const cs = cycles();
    const l = cs[cs.length - 1];
    const [y, m] = l.split("-").map(Number);
    const nk = keyOf(y, m);
    names().forEach((n) => {
      const rs = data.filter((r) => r.n === n).sort((a, b) => a.cy.localeCompare(b.cy));
      const la = rs[rs.length - 1];
      if (la.mine || data.some((r) => r.n === n && r.cy === nk)) return;
      const mm = Math.round(la.m * (1 + (Math.random() - 0.5) * 0.02));
      const c = Math.round(mm * clamp(la.c / la.m + (Math.random() - 0.58) * 0.08, 0.6, 1.4) * 10) / 10;
      data.push({
        id: `s-${n}-${nk}`,
        n,
        t: la.t,
        emp: la.emp,
        m: mm,
        c,
        pe: Math.round((c * 30 * 850) / 1000) * 1000,
        email: la.email,
        cy: nk,
      });
    });
    cyc = nk;
    save();
    renderAll();
    toast("Se simuló " + mname(nk) + " para todas las empresas de muestra.");
  };
  $("rg").onclick = async () => {
    if (!confirm("Se reemplazan los datos de muestra y se borran tus registros.")) return;
    seed = Math.floor(Math.random() * 9999) + 1;
    data = gen(seed);
    logs = [];
    cyc = "";
    await clearPhotos();
    save();
    renderAll();
    toast("Nuevo dataset generado.");
  };
}

function renderBadge() {
  const all = cyRecs().sort((a, b) => b.sav - a.sav);
  const lead = all[0];
  if (!lead) return;
  const e = lead.sav >= goal;
  const cs = cycles().slice().reverse();
  $("fsl").innerHTML = seal();
  $("gr").value = goal;
  $("gv").textContent = goal + "%";
  $("bdyn").innerHTML = `<p style="text-align:center;margin:6px 0">${
    e
      ? `<b>${esc(lead.n)}</b> lo tiene en ${mname(cyc)} con ${lead.sav.toFixed(1)}% de ahorro.`
      : `El líder (${esc(lead.n)}) lleva ${lead.sav.toFixed(1)}%. Le faltan ${(goal - lead.sav).toFixed(1)} puntos.`
  }</p>
<div class="pr"><i style="width:${clamp((lead.sav / goal) * 100, 2, 100)}%"></i></div>
<div class="hall"><b>Salón de insignias</b>${cs
    .map((c) => {
      const l = leaderOf(c);
      return `<div><span>${mname(c)}</span>${l && l.sav >= goal ? seal("sl") + `<span>${esc(l.n)} · ${l.sav.toFixed(1)}%</span>` : "<span>Nadie alcanzó la meta</span>"}</div>`;
    })
    .join("")}</div>`;
}

function openDetail(id) {
  const r = data.find((x) => x.id === id);
  if (!r) return;
  const rs = data.filter((x) => x.n === r.n).sort((a, b) => a.cy.localeCompare(b.cy));
  const y = (v) => 8 + ((140 - clamp(v, 60, 140)) / 80) * 70;
  const x = (i) => 20 + (rs.length > 1 ? i * (260 / (rs.length - 1)) : 130);
  const ps = rs.map((z) => calc(z).pct);
  const c = calc(r);
  const photo = photos[r.id] || r.p;
  $("dbody").innerHTML = `<div class="who">${avatar(r.n)}<div><h3>${esc(r.n)}</h3><small>${r.t} · ${r.emp} empleados · ${mname(r.cy)}</small></div></div>
<p style="margin:10px 0"><b>${r.c}</b> de ${r.m} kWh/día → ${c.pct.toFixed(1)}% de la meta · <span class="pill z-${c.z}">${ZN[c.z]}</span>${r.mine ? ` · Factura ${cop(r.pe)}` : ""}</p>
<svg viewBox="0 0 300 95" style="width:100%"><rect x="20" y="${y(90)}" width="260" height="${y(60) - y(90)}" fill="#f1faf5"/><rect x="20" y="${y(140)}" width="260" height="${y(110) - y(140)}" fill="#fdecea"/><polyline fill="none" stroke="#0b5d3b" stroke-width="2.5" points="${ps.map((p, i) => x(i) + "," + y(p)).join(" ")}"/>${ps
    .map(
      (p, i) =>
        `<circle cx="${x(i)}" cy="${y(p)}" r="3.5" fill="#0b5d3b"><title>${mname(rs[i].cy)}: ${p.toFixed(1)}%</title></circle><text x="${x(i)}" y="92" font-size="9" text-anchor="middle" fill="#5a7567">${mshort(rs[i].cy)}</text>`
    )
    .join("")}</svg>
${photo ? `<img class="rc" src="${photo}" alt="Recibo enviado como evidencia">` : '<p class="sub">Registro de muestra, sin foto de recibo.</p>'}`;
  $("dd2").showModal();
}

function renderAll() {
  curCycle();
  renderBanner();
  renderNav();
  renderCards();
  renderRank();
  renderCharts();
  renderMine();
  renderRem();
  renderDs();
}

function shrink(file) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onerror = no;
    r.onload = () => {
      const im = new Image();
      im.onerror = no;
      im.onload = () => {
        const k = Math.min(1, 720 / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = im.width * k;
        c.height = im.height * k;
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/jpeg", 0.6));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

function bind() {
  $("nav").onclick = (e) => {
    const b = e.target.closest("button");
    if (b) setView(b.dataset.v);
  };
  $("fs").onchange = (e) => {
    filter = e.target.value;
    renderRank();
    renderCharts();
  };
  $("fz").onchange = (e) => {
    zone = e.target.value;
    renderRank();
    renderCharts();
  };
  $("zn").onclick = (e) => {
    const z = e.target.closest("button");
    if (z) {
      zone = zone === z.dataset.z ? "all" : z.dataset.z;
      renderRank();
      renderCharts();
    }
  };
  $("q").oninput = (e) => {
    q = e.target.value.trim().toLowerCase();
    renderRank();
  };
  $("so").onchange = (e) => {
    sort = e.target.value;
    renderRank();
  };
  $("cs").onchange = (e) => {
    cyc = e.target.value;
    renderCards();
    renderRank();
    renderCharts();
  };
  $("list").onclick = (e) => {
    const r = e.target.closest(".tr");
    if (r) openDetail(r.dataset.id);
  };
  $("list").onkeydown = (e) => {
    if (e.key === "Enter") {
      const r = e.target.closest(".tr");
      if (r) openDetail(r.dataset.id);
    }
  };
  $("cards").onclick = (e) => {
    if (e.target.closest("#bc")) {
      renderBadge();
      $("bd").showModal();
    }
  };
  $("mn").onclick = (e) => {
    if (e.target.dataset.go) setView(e.target.dataset.go);
  };
  $("fl").onclick = () => {
    $("fl").classList.toggle("f");
    confetti();
  };
  $("gr").oninput = (e) => {
    goal = +e.target.value;
    save();
    renderCards();
    renderRank();
    if ($("bd").open) renderBadge();
  };
  $("close-detail").onclick = () => $("dd2").close();
  $("close-badge").onclick = () => $("bd").close();
  $("lv").onclick = () => {
    if (live) {
      clearInterval(live);
      live = null;
    } else {
      live = setInterval(() => {
        const pool = data.filter((r) => r.cy === cyc && !r.mine);
        if (!pool.length) return;
        const r = pool[Math.floor(Math.random() * pool.length)];
        r.c = Math.max(1, Math.round((r.c + (Math.random() - 0.56) * 0.09 * r.m) * 10) / 10);
        r.fl = true;
        renderCards();
        renderRank();
        renderCharts();
        r.fl = false;
      }, 2200);
    }
    $("lv").classList.toggle("on", !!live);
    $("lv").setAttribute("aria-pressed", !!live);
    if (live && view0 !== "rank") setView("rank");
  };
  $("p").onchange = () => {
    const f = $("p").files[0];
    const p = $("prev");
    if (f) {
      p.src = URL.createObjectURL(f);
      p.style.display = "block";
    } else p.style.display = "none";
  };
  const say = (t, c) => {
    $("msg").textContent = t;
    $("msg").className = "msg " + c;
  };
  $("f").onsubmit = async (ev) => {
    ev.preventDefault();
    const n = $("n").value.trim();
    const em = $("e").value.trim();
    const emp = parseInt($("emp").value, 10);
    const m = parseFloat($("m").value);
    const c = parseFloat($("c").value);
    const pe = parseFloat($("pe").value);
    const f = $("p").files[0];
    if (!n) return say("Escribe el nombre de la empresa.", "err");
    if (!/^\S+@\S+\.\S+$/.test(em)) return say("Escribe un correo válido para los recordatorios.", "err");
    if (!(emp > 0)) return say("Escribe el número de empleados.", "err");
    if (!(m > 0)) return say("La meta debe ser mayor que 0 kWh/día.", "err");
    if (!(c >= 0)) return say("Escribe el consumo en kWh/día.", "err");
    if (!(pe >= 0)) return say("Escribe el valor de la factura en pesos.", "err");
    if (!f) return say("Adjunta la foto del recibo como evidencia.", "err");
    say("Procesando el recibo…", "");
    let p;
    try {
      p = await shrink(f);
    } catch (_) {
      return say("No se pudo leer la imagen. Prueba con otra foto.", "err");
    }
    const w = win();
    const rec = {
      id: "u" + Date.now(),
      n,
      t: $("t").value,
      emp,
      m,
      c,
      pe,
      email: em,
      cy: w.cy,
      late: !w.open,
      mine: true,
    };
    const i = data.findIndex((d) => d.n.toLowerCase() === n.toLowerCase() && d.cy === w.cy);
    if (i >= 0) data[i] = rec;
    else data.push(rec);
    await savePhoto(rec.id, p);
    const ok = save();
    filter = "Todas";
    zone = "all";
    q = "";
    $("q").value = "";
    cyc = w.cy;
    renderAll();
    const r = calc(rec);
    $("f").reset();
    $("prev").style.display = "none";
    toast(
      `${n} entró al ranking con ${r.sav >= 0 ? r.sav.toFixed(1) + "% de ahorro" : Math.abs(r.sav).toFixed(1) + "% sobre la meta"}.${w.open ? "" : " Se marcó como tardío."}${ok ? "" : " No se pudo guardar en este navegador."}`
    );
    say("", "");
    setView("rank");
  };
}

async function boot() {
  await loadPhotos();
  bind();
  renderAll();
  setView("rank");
  const w0 = win();
  if (w0.open && pending(w0.cy).length) {
    setTimeout(() => toast(`Ventana abierta: faltan ${pending(w0.cy).length} empresas por reportar ${mname(w0.cy)}.`), 800);
  }
}

boot();
