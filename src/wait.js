import { evaluate } from './connection.js';

const DEFAULT_TIMEOUT = 10000;
const POLL_INTERVAL = 200;
const BARS_PATH = 'window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars()';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// previousBarSignature (opcional): "time:close" del último bar ANTES del
// cambio (ver setSymbol/setTimeframe en core/chart.js) — si se pasa, exige
// que el último bar sea REALMENTE distinto al de antes, no solo que exista.
//
// Bug real que esto reemplaza (encontrado en vivo 2026-09-05, reproducido
// con el agente trader-ict): la versión anterior medía "estabilidad" contando
// document.querySelectorAll('[class*="bar"]') — pero el chart de TradingView
// se dibuja en <canvas>, no hay un nodo DOM por vela, así que ese conteo
// siempre devolvía el mismo número fijo (129, verificado con distintos
// símbolos y temporalidades) sin relación alguna con si el chart realmente
// cargó datos nuevos. El resultado: setSymbol reportaba chart_ready
// aparentando funcionar, pero quote_get/data_get_ohlcv seguían devolviendo
// los datos del símbolo VIEJO — trader-ict lo detectó comparando los valores
// crudos, no vino de una suposición.
export async function waitForChartReady(expectedSymbol = null, expectedTf = null, timeout = DEFAULT_TIMEOUT, previousBarSignature = null) {
  const start = Date.now();
  let stableCount = 0;
  let lastBarSignature = null;

  while (Date.now() - start < timeout) {
    const state = await evaluate(`
      (function() {
        var spinner = document.querySelector('[class*="loader"]')
          || document.querySelector('[class*="loading"]')
          || document.querySelector('[data-name="loading"]');
        var isLoading = spinner && spinner.offsetParent !== null;

        var barSignature = null;
        try {
          var bars = ${BARS_PATH};
          if (bars && typeof bars.lastIndex === 'function') {
            var last = bars.valueAt(bars.lastIndex());
            if (last) barSignature = last[0] + ':' + last[4];
          }
        } catch(e) {}

        var symbolEl = document.querySelector('[data-name="legend-source-title"]')
          || document.querySelector('[class*="title"] [class*="apply-common-tooltip"]');
        var currentSymbol = symbolEl ? symbolEl.textContent.trim() : '';

        return { isLoading: !!isLoading, barSignature: barSignature, currentSymbol: currentSymbol };
      })()
    `);

    if (!state) {
      await sleep(POLL_INTERVAL);
      continue;
    }

    if (state.isLoading) {
      stableCount = 0;
      await sleep(POLL_INTERVAL);
      continue;
    }

    // Chequeo de símbolo visible (legítimo: lee el título real del chart).
    if (expectedSymbol && state.currentSymbol && !state.currentSymbol.toUpperCase().includes(expectedSymbol.toUpperCase())) {
      stableCount = 0;
      await sleep(POLL_INTERVAL);
      continue;
    }

    // Sin dato de bar todavía (chart recién arrancando a cargar).
    if (!state.barSignature) {
      stableCount = 0;
      await sleep(POLL_INTERVAL);
      continue;
    }

    // El punto central del fix: si nos dieron una foto de "antes", el último
    // bar tiene que haber cambiado de verdad — que EXISTA un bar no prueba
    // que sea del símbolo/temporalidad nuevo, podría ser el viejo todavía.
    if (previousBarSignature && state.barSignature === previousBarSignature) {
      stableCount = 0;
      await sleep(POLL_INTERVAL);
      continue;
    }

    // Ya cambió de verdad respecto a la foto de "antes" — no exigir además
    // que quede "estable" 2 vueltas seguidas: en un instrumento que tickea
    // constantemente (BTC/ETH perpetuos) el close cambia en cada poll, así
    // que esa estabilidad casi nunca se iba a cumplir y el chequeo terminaba
    // en timeout SIEMPRE, incluso cuando el cambio de símbolo ya había
    // funcionado perfecto (reproducido en vivo).
    if (previousBarSignature) {
      return true;
    }

    // Sin foto de "antes" (llamado sin comparación) — fallback al criterio
    // viejo de estabilidad, para no cambiarle el comportamiento a un caller
    // que no pasó previousBarSignature.
    if (state.barSignature === lastBarSignature) {
      stableCount++;
    } else {
      stableCount = 0;
    }
    lastBarSignature = state.barSignature;

    if (stableCount >= 2) {
      return true;
    }

    await sleep(POLL_INTERVAL);
  }

  return false;
}
