/**
 * Core watchlist logic.
 * Uses TradingView's internal widget API with DOM fallback.
 */
import { evaluate, evaluateAsync, getClient } from '../connection.js';

export async function get() {
  // Try internal API first — reads from the active watchlist widget
  const symbols = await evaluate(`
    (function() {
      // Method 1: Try the watchlist widget's internal data
      try {
        var rightArea = document.querySelector('[class*="layout__area--right"]');
        if (!rightArea || rightArea.offsetWidth < 50) return { symbols: [], source: 'panel_closed' };
      } catch(e) {}

      // Method 2: Read data-symbol-full attributes from watchlist rows
      var results = [];
      var seen = {};
      var container = document.querySelector('[class*="layout__area--right"]');
      if (!container) return { symbols: [], source: 'no_container' };

      // Find all elements with symbol data attributes
      var symbolEls = container.querySelectorAll('[data-symbol-full]');
      for (var i = 0; i < symbolEls.length; i++) {
        var sym = symbolEls[i].getAttribute('data-symbol-full');
        if (!sym || seen[sym]) continue;
        seen[sym] = true;

        // Find the row and extract price data
        var row = symbolEls[i].closest('[class*="row"]') || symbolEls[i].parentElement;
        var cells = row ? row.querySelectorAll('[class*="cell"], [class*="column"]') : [];
        var nums = [];
        for (var j = 0; j < cells.length; j++) {
          var t = cells[j].textContent.trim();
          if (t && /^[\\-+]?[\\d,]+\\.?\\d*%?$/.test(t.replace(/[\\s,]/g, ''))) nums.push(t);
        }
        results.push({ symbol: sym, last: nums[0] || null, change: nums[1] || null, change_percent: nums[2] || null });
      }

      if (results.length > 0) return { symbols: results, source: 'data_attributes' };

      // Method 3: Scan for ticker-like text in the right panel
      var items = container.querySelectorAll('[class*="symbolName"], [class*="tickerName"], [class*="symbol-"]');
      for (var k = 0; k < items.length; k++) {
        var text = items[k].textContent.trim();
        if (text && /^[A-Z][A-Z0-9.:!]{0,20}$/.test(text) && !seen[text]) {
          seen[text] = true;
          results.push({ symbol: text, last: null, change: null, change_percent: null });
        }
      }

      return { symbols: results, source: results.length > 0 ? 'text_scan' : 'empty' };
    })()
  `);

  return {
    success: true,
    count: symbols?.symbols?.length || 0,
    source: symbols?.source || 'unknown',
    symbols: symbols?.symbols || [],
  };
}

export async function add({ symbol }) {
  // Use keyboard shortcut to open symbol search in watchlist, type symbol, press Enter
  const c = await getClient();

  // Buscamos el boton "Agregar simbolo" DIRECTO primero, antes de tocar
  // ningun toggle de panel. Confirmado en vivo via DevTools (2026-09):
  // aria-label="Agregar símbolo", data-name="add-symbol-button" — este
  // selector YA era correcto en el codigo original, el bug real estaba en
  // el paso de "abrir el panel" de abajo: cuando el panel ya estaba
  // abierto, ese paso lo detectaba como "cerrado" (heuristica de
  // aria-pressed/clase "active" poco confiable con clases de CSS modules
  // hasheadas) y le hacia click al toggle — CERRANDOLO sin querer. Buscar
  // el boton real primero evita esa ambiguedad por completo: si ya esta
  // visible, ni siquiera tocamos el toggle.
  const ADD_SELECTORS = `
    var selectors = [
      '[data-name="add-symbol-button"]',
      '[aria-label="Add symbol"]',
      '[aria-label*="Add symbol"]',
      '[aria-label="Agregar símbolo"]',
      '[aria-label*="Agregar símbolo"]',
      'button[class*="addSymbol"]',
    ];
    var _btnEncontrado = null;
    for (var s = 0; s < selectors.length; s++) {
      var btn = document.querySelector(selectors[s]);
      if (btn && btn.offsetParent !== null) { _btnEncontrado = btn; break; }
    }
  `;

  const yaVisible = await evaluate(`(function() { ${ADD_SELECTORS} return { found: !!_btnEncontrado }; })()`);

  if (!yaVisible?.found) {
    // No estaba visible: recien aca intentamos abrir el panel con el
    // toggle (data-name="base" del primer tab del widgetbar, ver comentario
    // en la version anterior de este archivo para el detalle de por que ese
    // selector es el mas robusto entre idiomas).
    const panelState = await evaluate(`
      (function() {
        var btn = document.querySelector('[data-name="base-watchlist-widget-button"]')
          || document.querySelector('.widgetbar-tabs [data-name="base"]')
          || document.querySelector('[aria-label*="Watchlist"]')
          || document.querySelector('[aria-label*="Lista de seguimiento"]');
        if (!btn) return { error: 'Watchlist button not found' };
        btn.click();
        return { clicked: true };
      })()
    `);
    if (panelState?.error) throw new Error(panelState.error);
    await new Promise(r => setTimeout(r, 500));
  }

  // Click the "Add symbol" button (mismos selectores, ahora sí deberia estar visible)
  const addClicked = await evaluate(`
    (function() {
      ${ADD_SELECTORS}
      if (_btnEncontrado) { _btnEncontrado.click(); return { found: true }; }
      // Fallback: find + button in right panel
      var container = document.querySelector('[class*="layout__area--right"]');
      if (container) {
        var buttons = container.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          var ariaLabel = buttons[i].getAttribute('aria-label') || '';
          if (/add.*symbol/i.test(ariaLabel) || buttons[i].textContent.trim() === '+') {
            buttons[i].click();
            return { found: true, method: 'fallback' };
          }
        }
      }
      return { found: false };
    })()
  `);

  if (!addClicked?.found) throw new Error('Add symbol button not found in watchlist panel');
  await new Promise(r => setTimeout(r, 300));

  // Type the symbol into the search input
  await c.Input.insertText({ text: symbol });
  await new Promise(r => setTimeout(r, 500));

  // Press Enter to select the first result
  await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter' });
  await new Promise(r => setTimeout(r, 300));

  // Press Escape to close search
  await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape' });

  return { success: true, symbol, action: 'added' };
}
