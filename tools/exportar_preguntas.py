"""Exporta la tabla `preguntas` de una base SQLite a data/preguntas.json.

Uso:  python3 tools/exportar_preguntas.py ../pacheco2.db
"""
import json
import sqlite3
import sys
from datetime import date
from pathlib import Path

db = sys.argv[1] if len(sys.argv) > 1 else "../pacheco2.db"
salida = Path(__file__).resolve().parent.parent / "data" / "preguntas.json"

con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
filas = con.execute(
    "SELECT id, numero_original, texto, respuesta, justificacion, dificultad, tema, usada_en_partida "
    "FROM preguntas ORDER BY id"
).fetchall()

preguntas = [
    {
        "id": f["id"],
        "numero_original": f["numero_original"],
        "texto": f["texto"].strip(),
        "respuesta": f["respuesta"],
        "justificacion": (f["justificacion"] or "").strip(),
        "dificultad": f["dificultad"] or 2,
        "tema": f["tema"] or "",
        "usada_en_partida": f["usada_en_partida"] or 0,
    }
    for f in filas
]

salida.write_text(
    json.dumps({"version": date.today().isoformat(), "preguntas": preguntas}, ensure_ascii=False, indent=1),
    encoding="utf-8",
)
print(f"{len(preguntas)} preguntas -> {salida}")
