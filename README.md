# Quiz Pacheco

Juego de bonos en clase (IIND-3400), con tema SAW y finanzas. Es un sitio 100% estático: toda la lógica corre en el navegador, sin servidor.

## Cómo se juega
1. Escoge la sección (Sec1 / Sec2) y empieza.
2. La ruleta elige un estudiante al azar.
   - **Presente**: escoge una de las 16 casillas (4×0.2, 4×0.3, 4×0.4, 4×0.5) y responde Verdadero/Falso. Si acierta, gana el bono; si falla, lo pierde.
   - **Ausente**: −0.5 automático.
3. **Saltar pregunta** cambia la pregunta, mantiene el bono, y la pregunta saltada no vuelve a salir.
4. **Finalizar y exportar Excel** descarga un `.xlsx` con dos hojas: Resumen y Detalle.

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
| `data/preguntas.json` | Banco de 81 preguntas V/F |
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
