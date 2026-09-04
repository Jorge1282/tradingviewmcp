/**
 * Core alert logic.
 */
import { evaluate, evaluateAsync, getClient, safeString } from '../connection.js';

export async function create({ condition, price, message }) {
  // [data-name="alerts"] NO es el boton de crear alerta — es el toggle del
  // panel de alertas EXISTENTES (confirmado en vivo, aparece como aria-label
  // "Alertas" en .widgetbar-tabs). Clickearlo abre la lista, no el dialogo
  // de creacion, y por eso "inputs" quedaba vacio despues. El boton real
  // dice "Crear alerta" en español (o "Create Alert" en ingles) — buscamos
  // por texto visible ya que no tiene un aria-label/data-name fijo conocido.
  const opened = await evaluate(`
    (function() {
      var btn = document.querySelector('[aria-label="Create Alert"]');
      if (!btn) {
        var buttons = document.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          var txt = buttons[i].textContent.trim();
          if (/^(create alert|crear alerta)$/i.test(txt)) { btn = buttons[i]; break; }
        }
      }
      if (btn) { btn.click(); return true; }
      return false;
    })()
  `);

  if (!opened) {
    const client = await getClient();
    await client.Input.dispatchKeyEvent({ type: 'keyDown', modifiers: 1, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    await client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', code: 'KeyA' });
  }

  await new Promise(r => setTimeout(r, 1000));

  // [class*="alert"] nunca matcheaba nada real — confirmado en vivo via
  // DevTools: el input de precio usa clases generadas tipo
  // "input-H0xdCnFS size-small-H0xdCnFS" (CSS modules con hash), sin
  // "alert" en ningun lado. Con el dialogo de crear alerta abierto, ese
  // input de precio (ya viene precargado con el valor actual, formato
  // "4.471,72") es el UNICO input de texto/numero visible en toda la
  // pagina — por eso ahora buscamos sin scopear a [class*="alert"].
  const priceSet = await evaluate(`
    (function() {
      var inputs = document.querySelectorAll('input[type="text"]:not([readonly]), input[type="number"]');
      var visibles = [];
      for (var i = 0; i < inputs.length; i++) { if (inputs[i].offsetParent !== null) visibles.push(inputs[i]); }
      for (var i = 0; i < visibles.length; i++) {
        var label = visibles[i].closest('[class*="row"]')?.querySelector('[class*="label"]');
        if (label && /value|price|valor|precio/i.test(label.textContent)) {
          var nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          nativeSet.call(visibles[i], ${safeString(String(price))});
          visibles[i].dispatchEvent(new Event('input', { bubbles: true }));
          visibles[i].dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      if (visibles.length > 0) {
        var nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        nativeSet.call(visibles[0], ${safeString(String(price))});
        visibles[0].dispatchEvent(new Event('input', { bubbles: true }));
        visibles[0].dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    })()
  `);

  if (message) {
    // Mismo problema que el input de precio: [class*="alert"] no matchea
    // nada real. Buscamos el primer textarea visible sin scopear.
    await evaluate(`
      (function() {
        var textareas = document.querySelectorAll('textarea');
        var textarea = null;
        for (var i = 0; i < textareas.length; i++) { if (textareas[i].offsetParent !== null) { textarea = textareas[i]; break; } }
        if (textarea) {
          var nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          nativeSet.call(textarea, ${JSON.stringify(message)});
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
  }

  await new Promise(r => setTimeout(r, 500));
  // Boton real confirmado en vivo: "Crear" (español), no "Create".
  const created = await evaluate(`
    (function() {
      var btns = document.querySelectorAll('button[data-name="submit"], button');
      for (var i = 0; i < btns.length; i++) {
        if (/^(create|crear)$/i.test(btns[i].textContent.trim())) { btns[i].click(); return true; }
      }
      return false;
    })()
  `);

  return { success: !!created, price, condition, message: message || '(none)', price_set: !!priceSet, source: 'dom_fallback' };
}

export async function list() {
  // Use pricealerts REST API — returns structured data with alert_id, symbol, price, conditions
  const result = await evaluateAsync(`
    fetch('https://pricealerts.tradingview.com/list_alerts', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.s !== 'ok' || !Array.isArray(data.r)) return { alerts: [], error: data.errmsg || 'Unexpected response' };
        return {
          alerts: data.r.map(function(a) {
            var sym = '';
            try { sym = JSON.parse(a.symbol.replace(/^=/, '')).symbol || a.symbol; } catch(e) { sym = a.symbol; }
            return {
              alert_id: a.alert_id,
              symbol: sym,
              type: a.type,
              message: a.message,
              active: a.active,
              condition: a.condition,
              resolution: a.resolution,
              created: a.create_time,
              last_fired: a.last_fire_time,
              expiration: a.expiration,
            };
          })
        };
      })
      .catch(function(e) { return { alerts: [], error: e.message }; })
  `);
  return { success: true, alert_count: result?.alerts?.length || 0, source: 'internal_api', alerts: result?.alerts || [], error: result?.error };
}

export async function deleteAlerts({ delete_all }) {
  if (delete_all) {
    const result = await evaluate(`
      (function() {
        var alertBtn = document.querySelector('[data-name="alerts"]');
        if (alertBtn) alertBtn.click();
        var header = document.querySelector('[data-name="alerts"]');
        if (header) {
          header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
          return { context_menu_opened: true };
        }
        return { context_menu_opened: false };
      })()
    `);
    return { success: true, note: 'Alert deletion requires manual confirmation in the context menu.', context_menu_opened: result?.context_menu_opened || false, source: 'dom_fallback' };
  }
  throw new Error('Individual alert deletion not yet supported. Use delete_all: true.');
}
