# Quiz Pacheco

Juego de bonos en clase (IIND-3400), con tema SAW y finanzas. Es un sitio 100% estático: toda la lógica corre en el navegador, sin servidor.

## Cómo se juega
1. Escoge la sección (Sec1 / Sec2) y empieza.
2. La ruleta elige un estudiante al azar.
   - **Presente**: escoge una de las 16 casillas (4×0.2, 4×0.3, 4×0.4, 4×0.5) y responde Verdadero/Falso. Si acierta, gana el bono; si falla, lo pierde.
   - **Ausente**: −0.5 automático.
3. La dificultad de la pregunta (1 fácil, 2 media, 3 difícil) se sortea según la casilla: las casillas bajas tienden a preguntas fáciles y las altas a difíciles (ver **Ajustes**).
4. Al responder aparece la **justificación** de la respuesta.
5. Si acertó pero no supo justificar, el botón **No justificó** deja el bono en +0.0 (se puede deshacer antes de pasar al siguiente).
6. **Saltar pregunta** cambia la pregunta, mantiene el bono, y la pregunta saltada no vuelve a salir.
7. **Finalizar y exportar Excel** descarga un `.xlsx` con dos hojas: Resumen y Detalle (incluye si justificó, dificultad y tema).

## Pestañas
- **Preguntas**: ver, buscar, filtrar, editar, agregar y eliminar preguntas (texto, V/F, justificación, dificultad, tema). Muestra cuántas veces ha salido cada una; dentro de un nivel se priorizan las que menos han salido. Las ediciones quedan en ese navegador; para compartirlas usa **Exportar JSON** y reemplaza `data/preguntas.json`.
- **Ajustes**: probabilidad de cada dificultad por casilla. Por defecto:

  | Casilla | Fácil | Media | Difícil |
  |---|---|---|---|
  | 0.2 | 70% | 20% | 10% |
  | 0.3 | 45% | 40% | 15% |
  | 0.4 | 20% | 45% | 35% |
  | 0.5 | 10% | 30% | 60% |

  Cada nivel debe tener al menos 10% y cada fila debe sumar 100%. Si un nivel se agota en la partida, su probabilidad se reparte entre los otros.

## Sonido
- **Música de fondo** (`static/sounds/musica-fondo.mp3`): arranca con el primer clic, porque los navegadores no permiten reproducir audio antes. Se silencia durante las preguntas, donde suena el latido, y mientras suenan las risas y los efectos grabados.
- **Menú de volumen** (🔊 arriba a la derecha): tres sliders, General, Música y Efectos, más un botón para silenciar todo. Los niveles se guardan en cada navegador.

## Estructura
| Ruta | Contenido |
|---|---|
| `index.html` | Interfaz |
| `static/app.js` | UI, ruleta, animaciones y sonidos |
| `static/motor.js` | Motor del juego (reglas, sorteos, persistencia y exportación) |
| `static/vendor/xlsx.full.min.js` | SheetJS 0.18.5, para generar el Excel |
| `data/preguntas.json` | Banco de 50 preguntas V/F con justificación, dificultad y tema |
| `tools/exportar_preguntas.py` | Regenera `data/preguntas.json` desde una base SQLite (`python3 tools/exportar_preguntas.py ../pacheco2.db`) |
| `data/estudiantes.json` | Lista inicial de estudiantes |

## Datos
- La lista de estudiantes y las partidas se guardan en el `localStorage` de cada navegador.
- Los cambios hechos en "Editar secciones" quedan solo en ese computador y navegador.
- Para cambiar la lista inicial para todos, edita `data/estudiantes.json`. Ojo: un navegador que ya abrió el juego sigue usando su copia guardada; para que tome la lista nueva hay que borrar los datos del sitio.

## Correr local
```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Deploy en Vercel
En vercel.com: Add New → Project → importa este repo.
- Framework Preset: **Other**
- Build Command: vacío
- Output Directory: `.`

Cada push a `main` se publica solo.
