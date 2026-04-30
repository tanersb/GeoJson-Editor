/**
 * Points Renderer  v1.1
 * ─────────────────────
 * Düzeltmeler:
 *  - 🔍 Büyüteç → seçili nokta değil tüm katmana sığdır
 *  - 📋 Kopyala → "Y: xxx, X: yyy" UTM formatında
 *  - Popup → sadece Y / X UTM göster, Z sadece 0 değilse
 */

(function () {
  'use strict';

  // WGS84 dönüşümü
  function toWGS(x, y, epsg) {
    try {
      const [lon, lat] = proj4('EPSG:' + epsg, 'EPSG:4326', [y, x]);
      return isFinite(lat) && isFinite(lon) ? { lat, lon } : null;
    } catch (e) { return null; }
  }

  // WGS84 → UTM
  function toUTM(lat, lon, epsg) {
    try {
      const [E, N] = proj4('EPSG:4326', 'EPSG:' + epsg, [lon, lat]);
      return isFinite(E) && isFinite(N) ? { E, N } : null;
    } catch (e) { return null; }
  }

  // Katman sınırları (zoom to layer için)
  const _bounds = {};

  // Popup HTML
  function makePopup(point, ll, epsg) {
    const utm = toUTM(ll.lat, ll.lng, epsg);
    const lc  = point.lc;
    const copyStr = utm
      ? `Y: ${utm.N.toFixed(3)}, X: ${utm.E.toFixed(3)} (EPSG:${epsg})`
      : `Lat: ${ll.lat.toFixed(6)}, Lon: ${ll.lng.toFixed(6)}`;

    const rows = [
      ['Katman',   point.layerName],
      ['Geometri', 'Nokta'],
    ];
    if (point.name) rows.push(['Metin', point.name]);
    if (utm) {
      rows.push(
        ['Y (Kuzey)', utm.N.toFixed(3)],
        ['X (Doğu)',  utm.E.toFixed(3)],
      );
    }
    if (point.z && Math.abs(point.z) > 0.001) {
      rows.push(['Z', point.z.toFixed(3)]);
    }

    const tbl = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');

    // copy metnini base64 ile encode et (özel karakterlerden kaçınmak için)
    const copyB64 = btoa(unescape(encodeURIComponent(copyStr)));

    return `<div>
      <div class="pop-hd">Öznitelikler</div>
      <table class="pop-tbl"><tbody>${tbl}</tbody></table>
      <div class="pop-actions">
        <button class="pop-btn" title="Tüm katmanı göster"
          onclick="NCZViewer._zoomToLayer(${lc})">🔍</button>
        <button class="pop-btn" title="Y/X kopyala"
          onclick="NCZViewer._copyB64(this,'${copyB64}')">📋</button>
        <button class="pop-btn" title="Katmanı gizle"
          onclick="NCZViewer.layers.setVisible(${lc},false);NCZViewer.ui.refreshLayerLists();NCZViewer.map.closePopup();">👁</button>
      </div>
    </div>`;
  }

  // Nokta render
  function renderPoint(point, epsg, group, api) {
    const wgs = toWGS(point.x, point.y, epsg);
    if (!wgs) return;
    const { lat, lon } = wgs;
    const col = api.layers.color(point.lc);

    if (!_bounds[point.lc]) _bounds[point.lc] = [];
    _bounds[point.lc].push([lat, lon]);

    const marker = L.circleMarker([lat, lon], {
      radius: 5, color: col, fillColor: col,
      fillOpacity: 0.85, weight: 1.2, opacity: 0.9,
    });

    if (point.name) {
      marker.bindTooltip(point.name, {
        permanent: true, direction: 'top',
        className: 'ncz-lbl', opacity: 1, offset: [0, -6],
      });
    }

    marker.on('click', () => {
      const ll = L.latLng(lat, lon);
      L.popup({ maxWidth: 280 })
        .setLatLng(ll)
        .setContent(makePopup(point, ll, epsg))
        .openOn(api.map);
    });

    group.addLayer(marker);
  }

  // Global yardımcılar — popup onclick'ten çağrılır
  NCZViewer._zoomToLayer = function (lc) {
    const pts = _bounds[lc];
    if (!pts || pts.length === 0) return;
    NCZViewer.map.closePopup();
    pts.length === 1
      ? NCZViewer.map.setView(pts[0], 18, { animate: true })
      : NCZViewer.map.fitBounds(L.latLngBounds(pts).pad(0.1), { animate: true });
  };

  NCZViewer._copyB64 = function (btn, b64) {
    const text = decodeURIComponent(escape(atob(b64)));
    navigator.clipboard?.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
    });
    const orig = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = orig, 1500);
  };

  // Modül kaydı
  NCZViewer.registerModule({
    name: 'points-renderer',
    init(api) { console.log('[points-renderer] Yüklendi'); },
    onDataCleared() { Object.keys(_bounds).forEach(k => delete _bounds[k]); },
  });

  // Event dinleyici
  NCZViewer.events.on('v1:points:parsed', ({ points, layerTable, epsg, filename }) => {
    const api = NCZViewer;
    if (!points || points.length === 0) return;
    api.ui.loading(true);

    setTimeout(() => {
      try {
        Object.keys(_bounds).forEach(k => delete _bounds[k]);

        const byLC = {};
        for (const pt of points) (byLC[pt.lc] = byLC[pt.lc] || []).push(pt);

        let total = 0;
        for (const [lc, pts] of Object.entries(byLC)) {
          const lcInt = parseInt(lc);
          const name  = layerTable[lcInt] || `LC_${lcInt}`;
          const group = L.layerGroup().addTo(api.map);
          api.layers.register(lcInt, name, group);
          for (const pt of pts) renderPoint(pt, epsg, group, api);
          total += pts.length;
          console.log(`[points-renderer] ${name} (LC=${lcInt}): ${pts.length} nokta`);
        }

        api.ui.updateStats(
          total.toLocaleString('tr'),
          Object.keys(byLC).length,
          filename || '—',
          'EPSG:' + epsg,
        );
        api.ui.showLayerUI();
        api.ui.refreshLayerLists();

        const allPts = Object.values(_bounds).flat();
        if (allPts.length > 0) api.map.fitBounds(L.latLngBounds(allPts).pad(0.08));

        api.ui.toast(`✓ ${total.toLocaleString('tr')} nokta yüklendi`, 'ok', 2500);
        console.log(`[points-renderer] Toplam ${total} nokta`);
      } catch (err) {
        console.error('[points-renderer] Hata:', err);
        api.ui.toast('Render hatası: ' + err.message, 'err', 5000);
      }
      api.ui.loading(false);
    }, 30);
  });

  console.log('[points-renderer] Modül hazır');
})();
