# ADR — tradingviewmcp

## Contexto
Fork de `deonmenezes/tradingviewmcp` (upstream, remote `origin`; el fork del usuario queda como referencia adicional). Servidor MCP con 68 herramientas para leer y controlar un chart de TradingView Desktop en vivo vía Chrome DevTools Protocol (puerto 9222). El `CLAUDE.md` ya existente en la raíz es la guía completa de uso de las herramientas — no duplicar acá, es la fuente de verdad para "qué tool usar cuándo".

## Relación con otros repos
Este fork es usado como **submódulo git** dentro de `Jarvis` (apunta a `Jorge1282/tradingviewmcp`, no al upstream). Cambios acá pueden requerir actualizar el puntero de submódulo en `Jarvis` para propagarse.

## Estructura
- `src/connection.js` — capa base de conexión CDP (mayor fan-in del proyecto: 126 llamadores). Punto único de acceso al chart/replay/bottom-bar APIs.
- `src/core/*.js` (16 módulos) — lógica de dominio por área: alerts, batch, capture, chart, data, drawing, health, indicators, pane, pine, replay, stream, tab, ui, watchlist.
- `src/tools/*.js` (15 módulos) — capa MCP: registra cada grupo de herramientas (`register*Tools`) envolviendo `core/`.
- `src/cli/` — CLI standalone (`router.js` + `commands/`) que expone las mismas capacidades fuera de MCP.
- `tests/` — cli, e2e, pine_analyze, replay, sanitization.
- `skills/` — SKILL.md por flujo (chart-analysis, multi-symbol-scan, pine-develop, replay-practice, strategy-report).
- `AGENTS.md`, `RESEARCH.md`, `SETUP_GUIDE.md`, `SECURITY.md` — documentación adicional ya presente, revisar antes de asumir que falta contexto.

## Capas (según el grafo)
`cli` → `core` → `connection` (fan-out descendente); `tools` también depende de `core`. `evaluate()` en connection.js es el hotspot central (71 llamadores) — cualquier cambio ahí impacta prácticamente todo el proyecto.

## Implicación práctica
- Antes de tocar `src/connection.js`, medir impacto: es el nodo con más fan-in del grafo.
- Si se modifica algo acá, revisar si `Jarvis` necesita actualizar su puntero de submódulo.
- Usar el `CLAUDE.md` existente como guía operativa de las 68 tools; este ADR es solo mapa estructural del código fuente.
