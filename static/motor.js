// Quiz Pacheco - motor del juego en el navegador (sin servidor).
// Reemplaza el backend: misma API (api(method, path, body)) pero todo corre local
// y se guarda en localStorage, así el sitio puede publicarse como estático (Vercel).
const Motor = (() => {
  const CAJAS_INICIALES = [0.2, 0.2, 0.2, 0.2, 0.3, 0.3, 0.3, 0.3, 0.4, 0.4, 0.4, 0.4, 0.5, 0.5, 0.5, 0.5];
  const KEY_DB = "quizpacheco.db.v1";
  const KEY_STATE = "quizpacheco.state.v1";

  class ErrorUsuario extends Error {}

  let PREGUNTAS = [];
  let db = null;
  const state = {};

  function leer(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function escribir(key, valor) {
    try { localStorage.setItem(key, JSON.stringify(valor)); } catch {}
  }
  const guardarDatos = () => escribir(KEY_DB, db);
  const guardarEstado = () => escribir(KEY_STATE, state);

  function resetState() {
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, {
      partida_id: null,
      seccion: null,
      fase: "idle",
      cajas: [],
      estudiantes_restantes: [],
      estudiante_actual: null,
      caja_actual: null,
      pregunta_actual: null,
      ultimo_resultado: null,
      preguntas_saltadas: [],
    });
  }

  const listo = (async () => {
    const [preguntas, semilla] = await Promise.all([
      fetch("/data/preguntas.json").then((r) => r.json()),
      fetch("/data/estudiantes.json").then((r) => r.json()),
    ]);
    PREGUNTAS = preguntas;
    db = leer(KEY_DB);
    if (!db || !Array.isArray(db.estudiantes)) {
      db = { seq: { est: 0, partida: 0, res: 0 }, estudiantes: [], partidas: [], resultados: [] };
      for (const e of semilla) db.estudiantes.push({ id: ++db.seq.est, ...e, activo: 1 });
      guardarDatos();
    }
    resetState();
    const previo = leer(KEY_STATE);
    if (previo && previo.fase) Object.assign(state, previo);
  })();

  const estudiantePorId = (id) => db.estudiantes.find((e) => e.id === id);
  const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function publicState() {
    return {
      partida_id: state.partida_id,
      seccion: state.seccion,
      fase: state.fase,
      cajas: state.cajas,
      estudiantes_restantes: state.estudiantes_restantes.length,
      candidatos: state.estudiantes_restantes
        .map(estudiantePorId)
        .filter(Boolean)
        .map(({ id, nombre, apellido }) => ({ id, nombre, apellido })),
      estudiante_actual: state.estudiante_actual,
      caja_actual: state.caja_actual,
      pregunta_actual: state.pregunta_actual
        ? { id: state.pregunta_actual.id, texto: state.pregunta_actual.texto }
        : null,
      ultimo_resultado: state.ultimo_resultado,
    };
  }

  function guardarResultado({ pregunta_id, presente, caja_valor, correcto, puntaje }) {
    db.resultados.push({
      id: ++db.seq.res,
      partida_id: state.partida_id,
      estudiante_id: state.estudiante_actual.id,
      pregunta_id,
      presente: presente ? 1 : 0,
      caja_valor,
      correcto: correcto == null ? null : correcto ? 1 : 0,
      puntaje,
      fecha: new Date().toISOString(),
    });
    guardarDatos();
  }

  function sacarPregunta() {
    const excluir = new Set(
      db.resultados
        .filter((r) => r.partida_id === state.partida_id && r.pregunta_id != null)
        .map((r) => r.pregunta_id)
        .concat(state.preguntas_saltadas)
    );
    const disponibles = PREGUNTAS.filter((p) => !excluir.has(p.id));
    if (!disponibles.length) throw new ErrorUsuario("No quedan preguntas disponibles en el banco de preguntas.");
    return azar(disponibles);
  }

  // ------------------------------------------------------------------ juego
  function apiSecciones() {
    const contar = (s) => db.estudiantes.filter((e) => e.seccion === s && e.activo).length;
    return { Sec1: contar("Sec1"), Sec2: contar("Sec2") };
  }

  function apiStart({ seccion }) {
    if (!["Sec1", "Sec2"].includes(seccion)) throw new ErrorUsuario("Sección inválida");
    const ids = db.estudiantes.filter((e) => e.seccion === seccion && e.activo).map((e) => e.id);
    if (!ids.length) throw new ErrorUsuario("La sección no tiene estudiantes activos. Agrega estudiantes primero.");
    const partida = { id: ++db.seq.partida, fecha: new Date().toISOString(), seccion, estado: "en_curso" };
    db.partidas.push(partida);
    guardarDatos();
    resetState();
    Object.assign(state, {
      partida_id: partida.id,
      seccion,
      fase: "esperando_spin",
      cajas: CAJAS_INICIALES.map((valor, i) => ({ id: i + 1, valor, usada: false })),
      estudiantes_restantes: ids,
    });
    return publicState();
  }

  function apiSpin() {
    if (state.fase !== "esperando_spin") throw new ErrorUsuario("No se puede girar la ruleta en esta fase.");
    if (!state.estudiantes_restantes.length) throw new ErrorUsuario("Ya no quedan estudiantes disponibles para elegir.");
    const id = azar(state.estudiantes_restantes);
    state.estudiantes_restantes = state.estudiantes_restantes.filter((x) => x !== id);
    const e = estudiantePorId(id);
    state.estudiante_actual = { id: e.id, nombre: e.nombre, apellido: e.apellido, codigo: e.codigo };
    state.fase = "esperando_presente";
    return publicState();
  }

  function apiPresente({ presente }) {
    if (state.fase !== "esperando_presente") throw new ErrorUsuario("No se esperaba esta acción en esta fase.");
    if (!presente) {
      const disponibles = state.cajas.filter((c) => !c.usada);
      if (!disponibles.length) throw new ErrorUsuario("No quedan casillas disponibles.");
      const caja = azar(disponibles);
      caja.usada = true;
      guardarResultado({ pregunta_id: null, presente: false, caja_valor: caja.valor, correcto: false, puntaje: -0.5 });
      state.ultimo_resultado = {
        estudiante: state.estudiante_actual,
        presente: false,
        caja_valor: caja.valor,
        pregunta: null,
        correcto: false,
        puntaje: -0.5,
        mensaje: "Ausente: -0.5 automático.",
      };
      state.caja_actual = null;
      state.pregunta_actual = null;
      state.fase = "ronda_completa";
    } else {
      state.fase = "esperando_caja";
    }
    return publicState();
  }

  function apiChooseBox({ caja_id }) {
    if (state.fase !== "esperando_caja") throw new ErrorUsuario("No se esperaba elegir casilla en esta fase.");
    const caja = state.cajas.find((c) => c.id === caja_id);
    if (!caja || caja.usada) throw new ErrorUsuario("Casilla inválida o ya usada.");
    const p = sacarPregunta();
    caja.usada = true;
    state.caja_actual = caja;
    state.pregunta_actual = p;
    state.fase = "esperando_respuesta";
    return publicState();
  }

  function apiSkip() {
    if (state.fase !== "esperando_respuesta")
      throw new ErrorUsuario("Solo se puede saltar una pregunta mientras se está respondiendo.");
    state.preguntas_saltadas.push(state.pregunta_actual.id);
    state.pregunta_actual = sacarPregunta();
    return publicState();
  }

  function apiAnswer({ respuesta }) {
    if (state.fase !== "esperando_respuesta") throw new ErrorUsuario("No se esperaba una respuesta en esta fase.");
    if (!["V", "F"].includes(respuesta)) throw new ErrorUsuario("Respuesta inválida.");
    const p = state.pregunta_actual;
    const caja = state.caja_actual;
    const correcto = respuesta === p.respuesta;
    const puntaje = correcto ? caja.valor : -caja.valor;
    guardarResultado({ pregunta_id: p.id, presente: true, caja_valor: caja.valor, correcto, puntaje });
    state.ultimo_resultado = {
      estudiante: state.estudiante_actual,
      presente: true,
      caja_valor: caja.valor,
      pregunta: { texto: p.texto, respuesta_correcta: p.respuesta },
      correcto,
      puntaje,
      mensaje: correcto ? "¡Correcto!" : "Incorrecto.",
    };
    state.caja_actual = null;
    state.pregunta_actual = null;
    state.fase = "ronda_completa";
    return publicState();
  }

  function apiNext() {
    if (state.fase !== "ronda_completa") throw new ErrorUsuario("No hay ronda completa pendiente.");
    state.estudiante_actual = null;
    state.ultimo_resultado = null;
    state.fase = "esperando_spin";
    return publicState();
  }

  function apiReset() {
    if (state.partida_id != null) {
      db.resultados = db.resultados.filter((r) => r.partida_id !== state.partida_id);
      db.partidas = db.partidas.filter((p) => p.id !== state.partida_id);
      guardarDatos();
    }
    resetState();
    return publicState();
  }

  function apiFinish() {
    if (state.partida_id == null) throw new ErrorUsuario("No hay partida activa.");
    const partida = db.partidas.find((p) => p.id === state.partida_id);
    partida.estado = "finalizada";
    guardarDatos();

    const res = db.resultados.filter((r) => r.partida_id === partida.id);
    const sinDatos = { nombre: "(eliminado)", apellido: "", codigo: "" };
    const resumen = new Map();
    for (const r of res) {
      const e = estudiantePorId(r.estudiante_id) || sinDatos;
      const fila = resumen.get(r.estudiante_id) || { e, total: 0, rondas: 0 };
      fila.total = Math.round((fila.total + r.puntaje) * 100) / 100;
      fila.rondas++;
      resumen.set(r.estudiante_id, fila);
    }
    const hojaResumen = [["Nombre", "Apellido", "Código", "Puntaje Total", "Rondas Jugadas"]].concat(
      [...resumen.values()]
        .sort((a, b) => b.total - a.total)
        .map((f) => [f.e.nombre, f.e.apellido, f.e.codigo, f.total, f.rondas])
    );
    const hojaDetalle = [["Nombre", "Apellido", "Código", "Presente", "Valor Casilla", "Correcto", "Puntaje", "Pregunta"]].concat(
      res.map((r) => {
        const e = estudiantePorId(r.estudiante_id) || sinDatos;
        const p = PREGUNTAS.find((q) => q.id === r.pregunta_id);
        return [
          e.nombre,
          e.apellido,
          e.codigo,
          r.presente ? "Sí" : "No",
          r.caja_valor,
          r.correcto == null ? "" : r.correcto ? "Sí" : "No",
          r.puntaje,
          p ? p.texto : "(ausente, sin pregunta)",
        ];
      })
    );

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(hojaResumen);
    ws1["!cols"] = [{ wch: 20 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 15 }];
    const ws2 = XLSX.utils.aoa_to_sheet(hojaDetalle);
    ws2["!cols"] = [{ wch: 20 }, { wch: 24 }, { wch: 12 }, { wch: 9 }, { wch: 13 }, { wch: 9 }, { wch: 9 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Resumen");
    XLSX.utils.book_append_sheet(wb, ws2, "Detalle");

    const d = new Date();
    const dos = (n) => String(n).padStart(2, "0");
    const ts = `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}_${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`;
    const nombre = `resultados_${partida.seccion}_${partida.id}_${ts}.xlsx`;
    XLSX.writeFile(wb, nombre); // descarga en el navegador
    resetState();
    return { ok: true, ruta: nombre };
  }

  // ------------------------------------------------------------- estudiantes
  function apiEstudiantesList(seccion) {
    return db.estudiantes
      .filter((e) => !seccion || e.seccion === seccion)
      .sort((a, b) => (a.apellido || "").localeCompare(b.apellido || "") || a.nombre.localeCompare(b.nombre));
  }

  function apiEstudiantesAdd(body) {
    const nombre = (body.nombre || "").trim();
    const apellido = (body.apellido || "").trim();
    const codigo = (body.codigo || "").trim();
    const seccion = body.seccion;
    if (!nombre || !codigo || !["Sec1", "Sec2"].includes(seccion))
      throw new ErrorUsuario("Nombre, código y sección son obligatorios.");
    if (db.estudiantes.some((e) => e.codigo === codigo)) throw new ErrorUsuario("Ya existe un estudiante con ese código.");
    const e = { id: ++db.seq.est, nombre, apellido, codigo, seccion, activo: 1 };
    db.estudiantes.push(e);
    guardarDatos();
    return { id: e.id };
  }

  function apiEstudiantesUpdate(id, body) {
    const e = estudiantePorId(id);
    if (!e) throw new ErrorUsuario("Estudiante no encontrado.");
    if (body.codigo && db.estudiantes.some((x) => x.codigo === body.codigo && x.id !== id))
      throw new ErrorUsuario("Ese código ya está en uso por otro estudiante.");
    for (const k of ["nombre", "apellido", "codigo", "seccion", "activo"]) if (k in body) e[k] = body[k];
    guardarDatos();
    return { ok: true };
  }

  function apiEstudiantesDelete(id) {
    db.estudiantes = db.estudiantes.filter((e) => e.id !== id);
    guardarDatos();
    return { ok: true };
  }

  // ------------------------------------------------------------------ router
  function rutear(method, ruta, body = {}) {
    const url = new URL(ruta, location.origin);
    const p = url.pathname;
    const idDe = () => parseInt(p.split("/").pop(), 10);

    if (p === "/api/secciones" && method === "GET") return apiSecciones();
    if (p === "/api/estudiantes" && method === "GET") return apiEstudiantesList(url.searchParams.get("seccion"));
    if (p === "/api/estudiantes" && method === "POST") return apiEstudiantesAdd(body);
    if (p.startsWith("/api/estudiantes/") && method === "PUT") return apiEstudiantesUpdate(idDe(), body);
    if (p.startsWith("/api/estudiantes/") && method === "DELETE") return apiEstudiantesDelete(idDe());

    if (method === "GET" && p === "/api/game/state") return publicState();
    if (method === "POST") {
      switch (p) {
        case "/api/game/start": return apiStart(body);
        case "/api/game/spin": return apiSpin();
        case "/api/game/presente": return apiPresente(body);
        case "/api/game/choose_box": return apiChooseBox(body);
        case "/api/game/skip": return apiSkip();
        case "/api/game/answer": return apiAnswer(body);
        case "/api/game/next": return apiNext();
        case "/api/game/reset": return apiReset();
        case "/api/game/finish": return apiFinish();
      }
    }
    throw new Error("Ruta no encontrada: " + p);
  }

  async function llamar(method, ruta, body) {
    await listo;
    const resultado = rutear(method, ruta, body || {});
    guardarEstado();
    // Copia profunda: la UI nunca toca el estado interno.
    return JSON.parse(JSON.stringify(resultado));
  }

  return { llamar, listo };
})();

// Misma firma que usaba la versión con servidor.
const api = (method, path, body) => Motor.llamar(method, path, body);
