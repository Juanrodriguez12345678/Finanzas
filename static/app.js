const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// api() viene de motor.js (todo corre en el navegador).

function showError(msg) {
  const el = $("#mensaje-error");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 5000);
}

// =====================================================================
// SONIDO: archivos originales del juego + efectos sintetizados
// =====================================================================
const Sonido = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  let volumen = 0.6;
  let latidoTimer = null;
  const cache = {};
  try {
    const v = parseFloat(localStorage.getItem("volumen"));
    if (!isNaN(v)) volumen = v;
  } catch (e) {}

  function ac() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = volumen;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // maxMs: corta el audio con un fade-out (para clips largos como los aplausos)
  function archivo(nombre, vol = 1, maxMs = 0) {
    if (muted) return;
    const a = (cache[nombre] ||= new Audio("/static/sounds/" + nombre)).cloneNode();
    const base = Math.min(1, vol * volumen);
    a.volume = base;
    a.play().catch(() => {});
    if (maxMs) {
      setTimeout(() => {
        const pasos = 10;
        let i = 0;
        const t = setInterval(() => {
          i++;
          a.volume = Math.max(0, base * (1 - i / pasos));
          if (i >= pasos) { clearInterval(t); a.pause(); }
        }, 40);
      }, maxMs);
    }
  }

  function ruido(dur, vol, filtroHz, tipo = "lowpass") {
    if (muted) return;
    const c = ac();
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = tipo;
    f.frequency.value = filtroHz;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start();
  }

  function tono(freq, dur, vol, tipo = "sine", freqFin) {
    if (muted) return;
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (freqFin) o.frequency.exponentialRampToValueAtTime(freqFin, c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(master);
    o.start();
    o.stop(c.currentTime + dur);
  }

  return {
    archivo,
    // ticks suaves y graves (antes eran clics agudos muy fuertes)
    tick() { tono(900, 0.025, 0.044, "triangle"); },
    hover() { tono(600, 0.02, 0.019, "triangle"); },
    sierra() {
      // sierra eléctrica: diente de sierra con vibrato + ruido metálico
      if (muted) return;
      const c = ac();
      const o = c.createOscillator();
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.value = 95;
      lfo.frequency.value = 28;
      lfoGain.gain.value = 25;
      lfo.connect(lfoGain).connect(o.frequency);
      o.frequency.linearRampToValueAtTime(180, c.currentTime + 0.5);
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.22, c.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.9);
      o.connect(g).connect(master);
      o.start(); lfo.start();
      o.stop(c.currentTime + 0.9); lfo.stop(c.currentTime + 0.9);
      ruido(0.8, 0.15, 2500, "bandpass");
    },
    golpe() { tono(70, 0.6, 0.6, "sine", 30); ruido(0.4, 0.5, 400); },
    reja() { tono(140, 0.15, 0.3, "square", 60); ruido(0.5, 0.4, 1200, "bandpass"); },
    revelacion() {
      // acorde disonante
      [110, 116.5, 155.6, 233].forEach((f) => tono(f, 2.2, 0.09, "sawtooth"));
      ruido(1.2, 0.2, 600);
    },
    tecla() { tono(1200 + Math.random() * 300, 0.012, 0.015, "triangle"); },
    setVolumen(v) {
      volumen = v;
      if (master) master.gain.value = v;
      try { localStorage.setItem("volumen", String(v)); } catch (e) {}
    },
    get volumen() { return volumen; },
    latido(on) {
      clearInterval(latidoTimer);
      latidoTimer = null;
      if (!on) return;
      const beat = () => { tono(55, 0.18, 0.7, "sine", 35); setTimeout(() => tono(50, 0.15, 0.5, "sine", 30), 220); };
      beat();
      latidoTimer = setInterval(beat, 1100);
    },
    toggle() { muted = !muted; if (muted) this.latido(false); return muted; },
    get muted() { return muted; },
  };
})();

$("#volumen").value = Sonido.volumen;
$("#volumen").addEventListener("input", (e) => Sonido.setVolumen(parseFloat(e.target.value)));

$("#btn-mute").addEventListener("click", () => {
  $("#btn-mute").textContent = Sonido.toggle() ? "🔇" : "🔊";
});

// =====================================================================
// FONDO: mercado en movimiento browniano (geometric Brownian motion)
// =====================================================================
const Mercado = (() => {
  const cv = $("#market");
  const g = cv.getContext("2d");
  let W, H;
  const series = [];

  function resize() {
    W = cv.width = innerWidth;
    H = cv.height = innerHeight;
  }

  function nuevaSerie(i) {
    return {
      y: H * (0.25 + 0.5 * Math.random()),
      mu: (Math.random() - 0.5) * 0.002,
      sigma: 0.012 + Math.random() * 0.01,
      pts: [],
      offset: i * 37,
    };
  }

  function init() {
    resize();
    series.length = 0;
    for (let i = 0; i < 4; i++) series.push(nuevaSerie(i));
  }

  function gauss() {
    return Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
  }

  let t = 0;
  function frame() {
    t++;
    g.clearRect(0, 0, W, H);
    const paso = 6;
    series.forEach((s) => {
      if (t % 2 === 0) {
        // dS = mu*S*dt + sigma*S*dW
        const S = s.y;
        let next = S - (s.mu * S + s.sigma * S * gauss()) * 1;
        next = Math.min(H * 0.92, Math.max(H * 0.08, next));
        s.pts.push(next);
        s.y = next;
        if (s.pts.length * paso > W + 40) s.pts.shift();
      }
      const n = s.pts.length;
      if (n < 2) return;
      const subiendo = s.pts[n - 1] < s.pts[Math.max(0, n - 30)];
      g.strokeStyle = subiendo ? "rgba(43,255,106,0.28)" : "rgba(255,31,61,0.30)";
      g.lineWidth = 2;
      g.beginPath();
      s.pts.forEach((y, i) => {
        const x = W - (n - i) * paso;
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      });
      g.stroke();
      // velas cada 5 puntos
      for (let i = 5; i < n; i += 5) {
        const a = s.pts[i - 5], b = s.pts[i];
        const x = W - (n - i) * paso;
        const hi = Math.min(...s.pts.slice(i - 5, i + 1));
        const lo = Math.max(...s.pts.slice(i - 5, i + 1));
        g.fillStyle = b < a ? "rgba(43,255,106,0.16)" : "rgba(255,31,61,0.18)";
        g.fillRect(x - 6, Math.min(a, b), 10, Math.max(2, Math.abs(a - b)));
        g.fillRect(x - 1.5, hi, 2, lo - hi);
      }
    });
    requestAnimationFrame(frame);
  }

  addEventListener("resize", init);
  init();
  requestAnimationFrame(frame);
})();

// =====================================================================
// FX: rally alcista / crash bajista sobre toda la pantalla
// =====================================================================
const FX = (() => {
  const cv = $("#fx");
  const g = cv.getContext("2d");

  function resize() { cv.width = innerWidth; cv.height = innerHeight; }
  addEventListener("resize", resize);
  resize();

  function correr(alcista) {
    const W = cv.width, H = cv.height;
    const color = alcista ? "43,255,106" : "255,31,61";
    const velas = [];
    let y = alcista ? H * 0.85 : H * 0.15;
    const puntos = [];
    const pasos = 70;
    for (let i = 0; i <= pasos; i++) {
      const tendencia = (alcista ? -1 : 1) * (H * 0.7) / pasos;
      y += tendencia + (Math.random() - 0.5) * 40;
      puntos.push({ x: (W / pasos) * i, y });
    }
    for (let i = 0; i < 40; i++) {
      velas.push({
        x: Math.random() * W,
        y: alcista ? H + Math.random() * H * 0.5 : -Math.random() * H * 0.5,
        h: 30 + Math.random() * 90,
        v: (alcista ? -1 : 1) * (6 + Math.random() * 10),
      });
    }
    const inicio = performance.now();
    const dur = 2200;
    function frame(now) {
      const p = Math.min(1, (now - inicio) / dur);
      g.clearRect(0, 0, W, H);
      const alpha = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
      velas.forEach((v) => {
        v.y += v.v;
        g.fillStyle = `rgba(${color},${0.55 * alpha})`;
        g.fillRect(v.x, v.y, 14, v.h);
        g.fillRect(v.x + 6, v.y - 20, 2, v.h + 40);
      });
      const hasta = Math.floor(puntos.length * Math.min(1, p * 1.6));
      g.strokeStyle = `rgba(${color},${alpha})`;
      g.lineWidth = 6;
      g.shadowColor = `rgb(${color})`;
      g.shadowBlur = 25;
      g.beginPath();
      for (let i = 0; i < hasta; i++) i === 0 ? g.moveTo(puntos[i].x, puntos[i].y) : g.lineTo(puntos[i].x, puntos[i].y);
      g.stroke();
      g.shadowBlur = 0;
      if (p < 1) requestAnimationFrame(frame);
      else g.clearRect(0, 0, W, H);
    }
    requestAnimationFrame(frame);
  }

  return { correr };
})();

// =====================================================================
// TICKER inferior
// =====================================================================
(function ticker() {
  const items = [
    ["WACC", "▼", "-0.42%"], ["β EQUITY", "▲", "+1.22"], ["M&M I: V_L = V_U", "", ""],
    ["TAX SHIELD", "▲", "+T·D"], ["CML", "▲", "+(E[Rm]−rf)/σm"], ["SPOT 10Y", "▲", "4.36%"],
    ["PVGO", "▼", "-3.10%"], ["GORDON g", "▲", "+4.00%"], ["dS = μSdt + σSdW", "", ""],
    ["FRONTERA EFICIENTE", "▲", "+σ²"], ["FCF", "▼", "-12.8%"], ["BONO CUPÓN 0", "▲", "+0.85%"],
    ["RANDOM WALK", "▼", "-2.71%"], ["CAPM", "▲", "rf + β(Rm−rf)"], ["FINANCIAL DISTRESS", "▼", "-66.6%"],
    ["EBITDA", "▲", "+5.90%"], ["DURATION", "▲", "+7.2y"], ["SML", "▼", "-0.33%"],
  ];
  const html = items
    .map(([s, d, v]) => `<span class="sym">${s}</span> <span class="${d === "▲" ? "up" : "down"}">${d} ${v}</span>`)
    .join("");
  $("#ticker").innerHTML = html + html;
})();

// =====================================================================
// RULETA (con dientes de sierra)
// =====================================================================
const Ruleta = (() => {
  const cv = $("#ruleta");
  const g = cv.getContext("2d");
  const R = cv.width / 2;
  let rot = 0;
  let nombres = [];

  function dibujar() {
    const n = nombres.length;
    const a = (2 * Math.PI) / n;
    g.clearRect(0, 0, cv.width, cv.height);
    g.save();
    g.translate(R, R);
    g.rotate(rot);

    // dientes de sierra
    const dientes = 64;
    g.beginPath();
    for (let i = 0; i < dientes; i++) {
      const t0 = (i / dientes) * 2 * Math.PI;
      const t1 = ((i + 0.65) / dientes) * 2 * Math.PI;
      g.lineTo(Math.cos(t0) * (R - 34), Math.sin(t0) * (R - 34));
      g.lineTo(Math.cos(t1) * (R - 2), Math.sin(t1) * (R - 2));
    }
    g.closePath();
    const metal = g.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
    metal.addColorStop(0, "#6d6f72");
    metal.addColorStop(1, "#2a2b2d");
    g.fillStyle = metal;
    g.fill();

    // gajos
    const r = R - 40;
    for (let i = 0; i < n; i++) {
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, r, i * a, (i + 1) * a);
      g.closePath();
      g.fillStyle = i % 2 === 0 ? "#2a0a08" : "#4a1c0e";
      if (n % 2 === 1 && i === n - 1) g.fillStyle = "#3a1410";
      g.fill();
      g.strokeStyle = "rgba(232,220,192,0.15)";
      g.lineWidth = 1;
      g.stroke();

      g.save();
      g.rotate(i * a + a / 2);
      g.textAlign = "right";
      g.textBaseline = "middle";
      const fs = Math.max(10, Math.min(22, (a * r) * 0.55));
      g.font = `${fs}px "Special Elite", monospace`;
      g.fillStyle = "#e8dcc0";
      const txt = nombres[i].length > 26 ? nombres[i].slice(0, 25) + "…" : nombres[i];
      g.fillText(txt, r - 12, 0);
      g.restore();
    }

    // centro: tornillo + símbolo
    g.beginPath();
    g.arc(0, 0, 62, 0, 2 * Math.PI);
    g.fillStyle = "#111";
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = "#7a3b1a";
    g.stroke();
    g.rotate(-rot);
    g.fillStyle = "#ff1f3d";
    g.font = '54px "Creepster", cursive';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("$", 0, 4);
    g.restore();
  }

  function girar(lista, indiceGanador) {
    nombres = lista;
    const n = nombres.length;
    const a = (2 * Math.PI) / n;
    const jitter = (Math.random() - 0.5) * a * 0.6;
    const objetivoBase = -Math.PI / 2 - (indiceGanador * a + a / 2) + jitter;
    const vueltas = 7 + Math.floor(Math.random() * 3);
    let destino = objetivoBase;
    while (destino < rot + vueltas * 2 * Math.PI) destino += 2 * Math.PI;

    const inicio = rot;
    const dur = 8000 + Math.random() * 1500;
    const t0 = performance.now();
    let ultimoSector = Math.floor(rot / a);
    const ease = (t) => 1 - Math.pow(1 - t, 4);

    return new Promise((resolve) => {
      function frame(now) {
        const p = Math.min(1, (now - t0) / dur);
        rot = inicio + (destino - inicio) * ease(p);
        const sector = Math.floor(rot / a);
        if (sector !== ultimoSector) {
          ultimoSector = sector;
          Sonido.tick();
        }
        dibujar();
        if (p < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  return { girar, preparar(lista) { nombres = lista; dibujar(); } };
})();

// =====================================================================
// Tabs
// =====================================================================
$$(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    $$(".tab").forEach((t) => t.classList.add("hidden"));
    $("#tab-" + btn.dataset.tab).classList.remove("hidden");
    if (btn.dataset.tab === "editar") cargarEstudiantes();
  });
});

// =====================================================================
// Juego
// =====================================================================
let estado = null;
let faseAnterior = null;
let ocupado = false;

async function accion(fn) {
  if (ocupado) return;
  ocupado = true;
  try {
    await fn();
  } catch (e) {
    showError(e.message);
  } finally {
    ocupado = false;
  }
}

async function cargarConteoSecciones() {
  const data = await api("GET", "/api/secciones");
  const sec = $("#select-seccion").value;
  $("#conteo-seccion").textContent = `(${data[sec]} estudiantes)`;
}
$("#select-seccion").addEventListener("change", cargarConteoSecciones);

$("#btn-iniciar").addEventListener("click", () => accion(async () => {
  Sonido.archivo("Let-the-games-begin.mp3");
  const s = await api("POST", "/api/game/start", { seccion: $("#select-seccion").value });
  render(s);
}));

$("#btn-spin").addEventListener("click", () => accion(async () => {
  const lista = estado.candidatos;
  const s = await api("POST", "/api/game/spin");
  const idx = lista.findIndex((c) => c.id === s.estudiante_actual.id);
  const nombres = lista.map((c) => `${c.nombre} ${c.apellido}`);

  $("#ruleta-overlay").classList.remove("hidden");
  Ruleta.preparar(nombres);
  Sonido.sierra();
  await Ruleta.girar(nombres, idx);
  Sonido.golpe();
  await sleep(1100);
  $("#ruleta-overlay").classList.add("hidden");
  render(s);
}));

$("#btn-presente-si").addEventListener("click", () => accion(async () => {
  Sonido.reja();
  render(await api("POST", "/api/game/presente", { presente: true }));
}));
$("#btn-presente-no").addEventListener("click", () => accion(async () => {
  render(await api("POST", "/api/game/presente", { presente: false }));
}));

$("#btn-resp-v").addEventListener("click", () => accion(async () => {
  render(await api("POST", "/api/game/answer", { respuesta: "V" }));
}));
$("#btn-resp-f").addEventListener("click", () => accion(async () => {
  render(await api("POST", "/api/game/answer", { respuesta: "F" }));
}));

$("#btn-saltar").addEventListener("click", () => accion(async () => {
  const s = await api("POST", "/api/game/skip");
  render(s);
  Sonido.reja();
  escribir($("#texto-pregunta"), s.pregunta_actual.texto);
}));

$("#btn-siguiente").addEventListener("click", () => accion(async () => {
  render(await api("POST", "/api/game/next"));
}));

$("#btn-reset").addEventListener("click", () => accion(async () => {
  if (!confirm("¿Reiniciar el juego? Se perderán los puntajes de esta partida.")) return;
  Sonido.latido(false);
  render(await api("POST", "/api/game/reset"));
}));

$("#btn-finalizar").addEventListener("click", () => accion(async () => {
  if (!confirm("¿Finalizar el juego y exportar los resultados a Excel?")) return;
  Sonido.latido(false);
  Sonido.archivo("gameover.wav");
  const res = await api("POST", "/api/game/finish");
  mostrarBanner("neutral", "GAME OVER", "");
  render(await api("GET", "/api/game/state"));
  await sleep(2700);
  alert("Excel descargado: " + res.ruta + "\n(revisa tu carpeta de Descargas)");
}));

// ---------------------------------------------------------------------
function mostrarBanner(tipo, texto, puntos) {
  const b = $("#banner");
  b.className = tipo;
  $("#banner-texto").textContent = texto;
  $("#banner-puntos").textContent = puntos;
  // reinicia animaciones
  $("#banner-texto").style.animation = "none";
  $("#banner-puntos").style.animation = "none";
  void b.offsetWidth;
  $("#banner-texto").style.animation = "";
  $("#banner-puntos").style.animation = "";
  b.classList.remove("hidden");
  setTimeout(() => b.classList.add("hidden"), 2600);
}

function efectoPantalla(clase, ms) {
  document.body.classList.remove(clase);
  void document.body.offsetWidth;
  document.body.classList.add(clase);
  setTimeout(() => document.body.classList.remove(clase), ms);
}

function sacudirTitere() {
  const t = $("#titere");
  t.classList.remove("sacudir");
  void t.offsetWidth;
  t.classList.add("sacudir");
  setTimeout(() => t.classList.remove("sacudir"), 700);
}

let escribiendo = 0;
async function escribir(el, texto) {
  const id = ++escribiendo;
  el.classList.remove("lista");
  el.textContent = "";
  for (let i = 0; i < texto.length; i++) {
    if (id !== escribiendo) return;
    el.textContent += texto[i];
    if (i % 4 === 0) Sonido.tecla();
    await sleep(texto.length > 300 ? 8 : 16);
  }
  el.classList.add("lista");
}

const fmt = (x) => (x > 0 ? "+" : "") + Number(x).toFixed(1);

function alEntrarEnFase(s) {
  if (s.fase === "esperando_presente") {
    const h = $("#nombre-elegido");
    h.classList.remove("revelar");
    void h.offsetWidth;
    h.classList.add("revelar");
    Sonido.revelacion();
    Sonido.archivo("JigsawLaugh.mp3", 0.9);
    sacudirTitere();
  }

  if (s.fase === "esperando_caja") {
    Sonido.archivo("Saw-Live-or-Die-Make-Your-Choice.mp3");
  }

  if (s.fase === "esperando_respuesta") {
    Sonido.sierra();
    Sonido.latido(true);
    escribir($("#texto-pregunta"), s.pregunta_actual ? s.pregunta_actual.texto : "");
  }

  if (s.fase === "ronda_completa" && s.ultimo_resultado) {
    Sonido.latido(false);
    escribiendo++;
    const r = s.ultimo_resultado;
    sacudirTitere();
    if (!r.presente) {
      Sonido.golpe();
      Sonido.archivo("mal" + (1 + Math.floor(Math.random() * 5)) + ".wav", 0.8, 3000);
      mostrarBanner("neutral", "AUSENTE", fmt(r.puntaje));
      efectoPantalla("temblor-pantalla", 500);
    } else if (r.correcto) {
      Sonido.archivo("bien" + (1 + Math.floor(Math.random() * 5)) + ".wav", 1, 2200);
      mostrarBanner("ok", "CORRECTO", fmt(r.puntaje));
      efectoPantalla("flash-verde", 700);
      FX.correr(true);
    } else {
      Sonido.golpe();
      Sonido.archivo("mal" + (1 + Math.floor(Math.random() * 5)) + ".wav", 1, 3000);
      mostrarBanner("bad", "INCORRECTO", fmt(r.puntaje));
      efectoPantalla("flash-rojo", 700);
      efectoPantalla("temblor-pantalla", 500);
      FX.correr(false);
    }
  }
}

function render(s) {
  estado = s;
  const show = (id, visible) => $(id).classList.toggle("hidden", !visible);

  show("#panel-inicio", s.fase === "idle");
  show("#panel-juego", s.fase !== "idle");
  show("#paso-spin", s.fase === "esperando_spin");
  show("#paso-presente", s.fase === "esperando_presente");
  show("#paso-caja", s.fase === "esperando_caja");
  show("#paso-pregunta", s.fase === "esperando_respuesta");
  show("#paso-resultado", s.fase === "ronda_completa");

  if (s.fase !== faseAnterior) {
    faseAnterior = s.fase;
    if (s.fase === "idle") cargarConteoSecciones().catch(() => {});
    setTimeout(() => alEntrarEnFase(s), 0);
  }
  if (s.fase === "idle") return;

  $("#info-seccion").textContent = "Sección " + (s.seccion === "Sec1" ? "1" : "2");
  $("#info-restantes").textContent = "Quedan " + s.estudiantes_restantes + " por elegir";

  const e = s.estudiante_actual;
  const nombre = e ? `${e.nombre} ${e.apellido}` : "";

  if (s.fase === "esperando_presente" && e) {
    $("#nombre-elegido").textContent = nombre;
    $("#codigo-elegido").textContent = e.codigo;
  }
  if (s.fase === "esperando_caja") {
    $("#nombre-caja").textContent = nombre;
    renderGridCajas(s.cajas);
  }
  if (s.fase === "esperando_respuesta") {
    $("#nombre-pregunta").textContent = nombre;
    $("#valor-caja-actual").textContent = s.caja_actual ? s.caja_actual.valor : "";
  }
  if (s.fase === "ronda_completa" && s.ultimo_resultado) {
    const r = s.ultimo_resultado;
    const n = `${r.estudiante.nombre} ${r.estudiante.apellido}`;
    $("#resultado-titulo").textContent = n;
    $("#resultado-detalle").textContent = !r.presente
      ? `No estaba en el salón. ${fmt(r.puntaje)} automático.`
      : `Respuesta correcta: ${r.pregunta.respuesta_correcta === "V" ? "VERDADERO" : "FALSO"} · ${fmt(r.puntaje)} puntos`;
  }

  const mini = $("#grid-cajas-estado");
  mini.innerHTML = "";
  s.cajas.forEach((c) => {
    const d = document.createElement("div");
    d.textContent = c.valor;
    if (c.usada) d.className = "usada";
    mini.appendChild(d);
  });
}

function renderGridCajas(cajas) {
  const cont = $("#grid-cajas");
  cont.innerHTML = "";
  cajas.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "caja-btn" + (c.usada ? " usada" : "");
    btn.textContent = c.valor;
    btn.disabled = c.usada;
    if (!c.usada) {
      btn.addEventListener("mouseenter", () => Sonido.hover());
      btn.addEventListener("click", () => accion(async () => {
        render(await api("POST", "/api/game/choose_box", { caja_id: c.id }));
      }));
    }
    cont.appendChild(btn);
  });
}

// =====================================================================
// Editar secciones
// =====================================================================
async function cargarEstudiantes() {
  const sec1 = await api("GET", "/api/estudiantes?seccion=Sec1");
  const sec2 = await api("GET", "/api/estudiantes?seccion=Sec2");
  pintarTabla("#tabla-sec1", sec1);
  pintarTabla("#tabla-sec2", sec2);
}

function pintarTabla(selector, lista) {
  const tbody = $(selector + " tbody");
  tbody.innerHTML = "";
  lista.forEach((est) => {
    const tr = document.createElement("tr");
    const celda = (valor) => {
      const td = document.createElement("td");
      const inp = document.createElement("input");
      inp.value = valor;
      td.appendChild(inp);
      tr.appendChild(td);
      return inp;
    };
    const inNombre = celda(est.nombre);
    const inApellido = celda(est.apellido || "");
    const inCodigo = celda(est.codigo);

    const tdActivo = document.createElement("td");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = !!est.activo;
    tdActivo.appendChild(chk);
    tr.appendChild(tdActivo);

    const tdAcc = document.createElement("td");
    const btnG = document.createElement("button");
    btnG.textContent = "Guardar";
    btnG.addEventListener("click", async () => {
      try {
        await api("PUT", "/api/estudiantes/" + est.id, {
          nombre: inNombre.value.trim(),
          apellido: inApellido.value.trim(),
          codigo: inCodigo.value.trim(),
          activo: chk.checked ? 1 : 0,
        });
        btnG.textContent = "✓";
        setTimeout(() => (btnG.textContent = "Guardar"), 1200);
        cargarConteoSecciones();
      } catch (e) { showError(e.message); }
    });
    const btnB = document.createElement("button");
    btnB.textContent = "Eliminar";
    btnB.className = "btn-sangre";
    btnB.addEventListener("click", async () => {
      if (!confirm("¿Eliminar a " + est.nombre + "?")) return;
      try {
        await api("DELETE", "/api/estudiantes/" + est.id);
        cargarEstudiantes();
        cargarConteoSecciones();
      } catch (e) { showError(e.message); }
    });
    tdAcc.append(btnG, btnB);
    tr.appendChild(tdAcc);
    tbody.appendChild(tr);
  });
}

$("#btn-agregar-estudiante").addEventListener("click", async () => {
  try {
    await api("POST", "/api/estudiantes", {
      nombre: $("#nuevo-nombre").value.trim(),
      apellido: $("#nuevo-apellido").value.trim(),
      codigo: $("#nuevo-codigo").value.trim(),
      seccion: $("#nuevo-seccion").value,
    });
    $("#nuevo-nombre").value = "";
    $("#nuevo-apellido").value = "";
    $("#nuevo-codigo").value = "";
    cargarEstudiantes();
    cargarConteoSecciones();
  } catch (e) { showError(e.message); }
});

// =====================================================================
(async function init() {
  try {
    await cargarConteoSecciones();
    render(await api("GET", "/api/game/state"));
  } catch (e) {
    showError(e.message);
  }
})();
