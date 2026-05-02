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
      ['Geometri', point.isText ? 'Yazı' : 'Nokta'],
    ];
    if (point.name) rows.push([point.isText ? 'Metin' : 'İsim', point.name]);
    if (point.isText && point.angleDeg && Math.abs(point.angleDeg) > 0.1)
      rows.push(['Dönüş', `${point.angleDeg.toFixed(1)}° (${point.angleRad.toFixed(4)} rad)`]);
    if (point.isText && point.textHeight && point.textHeight > 0)
      rows.push(['Yükseklik', point.textHeight.toFixed(2)]);
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

// Nokta render (Z-Destekli)
  function renderPoint(point, epsg, group, api) {
    const wgs = toWGS(point.x, point.y, epsg);
    if (!wgs) return;
    const { lat, lon } = wgs;
    const col = api.layers.color(point.lc);

    if (!_bounds[point.lc]) _bounds[point.lc] = [];
    _bounds[point.lc].push([lat, lon]);

    // gt=5 TEXT geometrisi — Netcad yazı objesi
    if (point.isText) {
      const esc = (point.name || '').replace(/[<>&"]/g, ch =>
        ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[ch]));
      // Netcad açısı: matematik CCW radyan → CSS rotate: CW derece → negatife çevir
      const rot = point.angleDeg ? `rotate(${(-point.angleDeg).toFixed(1)}deg)` : '';
      const fsize = Math.max(9, Math.min(16, (point.textHeight || 3) * 0.8));
      const marker = L.marker([lat, lon], {
        interactive: true,
        icon: L.divIcon({
          className: 'ncz-text-obj-icon',
          html: `<div class="ncz-text-obj" style="color:${col};transform:${rot};font-size:${fsize}px">${esc}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        })
      });
      marker.on('click', () => {
        const ll = L.latLng(lat, lon);
        L.popup({ maxWidth: 280 })
          .setLatLng(ll)
          .setContent(makePopup(point, ll, epsg))
          .openOn(api.map);
      });
      group.addLayer(marker);
      return;
    }

    const marker = L.circleMarker([lat, lon], {
      radius: 4, color: col, fillColor: col,
      fillOpacity: 0.85, weight: 1.2, opacity: 0.9,
    });

    // --- ETİKET GÜNCELLEMESİ (Merkez Kapsayıcı) ---
    let labelHtml = '<div class="ncz-lbl-wrapper">';
    if (point.name) {
      labelHtml += `<div class="ncz-pname">${point.name}</div>`;
    }
    if (point.z !== undefined && Math.abs(point.z) > 0.0001) {
      labelHtml += `<div class="ncz-pz">${point.z.toFixed(2)}</div>`;
    }
    labelHtml += '</div>';

    if (point.name || (point.z !== undefined && Math.abs(point.z) > 0.0001)) {
      marker.bindTooltip(labelHtml, {
        permanent: true,
        direction: 'center', // Etiketi noktanın tam ortasına koy
        className: 'ncz-lbl-transparent', // Leaflet'in varsayılan arkaplanını sil
        opacity: 1
      });
    }
    // ----------------------------------------------

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
    init(api) {
      console.log('[points-renderer] Yüklendi');
      // Text nesneleri için CSS
      const style = document.createElement('style');
      style.innerHTML = `
        .ncz-text-obj-icon { overflow: visible; }
        .ncz-text-obj {
          white-space: nowrap;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 600;
          line-height: 1;
          pointer-events: auto;
          text-shadow: 0 0 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6);
          transform-origin: left bottom;
        }
      `;
      document.head.appendChild(style);
    },
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
