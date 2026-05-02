/**
 * NCZ v1 Circle Renderer
 * ───────────────────────────────────────────────────────────────
 * Sadece daire (GeomType=3) geometrilerini işler ve haritaya çizer.
 */

(function () {
  'use strict';

  function toWGS(n, e, epsg) {
    try {
      const [lon, lat] = proj4('EPSG:' + epsg, 'EPSG:4326', [e, n]);
      return isFinite(lat) && isFinite(lon) ? [lat, lon] : null;
    } catch (_) { return null; }
  }

  function isValidUTM(n, e) {
    return Number.isFinite(n) && Number.isFinite(e) &&
      n > 3_500_000 && n < 5_500_000 &&
      e > 10_000 && e < 990_000;
  }

  function isGeomHeader(a, pos) {
    return pos + 7 < a.length &&
      a[pos] === 0x15 && a[pos + 3] === 0 && a[pos + 4] === 0 && a[pos + 5] === 0;
  }

  function blockLen(a, pos) {
    const len = a[pos + 1] + a[pos + 2] * 256 + 5;
    return (len > 7 && len < 200000 && pos + len <= a.length) ? len : 0;
  }

  function layerInfoFor(api, groups, lc, name) {
    if (!groups[lc]) {
      let layerInfo = api.layers.get(lc);
      if (!layerInfo) {
        const grp = L.layerGroup().addTo(api.map);
        layerInfo = api.layers.register(lc, name || `LC_${lc}`, grp);
      }
      groups[lc] = layerInfo;
    }
    return groups[lc];
  }

  function parseCircle(v, a, pos, lt, len) {
    const base = pos + 7;
    const lc   = a[base];
    const N    = v.getFloat64(base + 1,  true);
    const E    = v.getFloat64(base + 9,  true);
    const Z    = v.getFloat32(base + 17, true);
    if (!isValidUTM(N, E)) return null;

    // Daire yarıçapı bounding box'tan (Max N) çıkarılır.
    // Max N, GeomType 3 için bloğun başlangıcından itibaren 66. byte'ta başlar (pos + 66)
    const maxNPos = pos + 66;
    let rad = 0;
    if (maxNPos > pos && maxNPos + 8 <= v.buffer.byteLength) {
        rad = Math.abs(v.getFloat64(maxNPos, true) - N);
    }

    if (!Number.isFinite(rad) || rad <= 0 || rad > 100000) return null;

    return { type: 'Daire', gt: 3, lc, layerName: lt[lc] || `LC_${lc}`, N, E, Z, rad };
  }

  function makePopup(obj, epsg) {
    const copyStr = `Y: ${obj.N.toFixed(3)}, X: ${obj.E.toFixed(3)} (EPSG:${epsg})`;
    const copyB64 = btoa(unescape(encodeURIComponent(copyStr)));

    const rows = [
      ['Katman', obj.layerName], 
      ['Geometri', obj.type],
      ['Merkez Y', obj.N.toFixed(3)], 
      ['Merkez X', obj.E.toFixed(3)], 
      ['Yarıçap', `${obj.rad.toFixed(3)} m`], 
      ['Alan', `${(Math.PI * obj.rad * obj.rad).toFixed(2)} m²`]
    ];

    const tbl = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
    return `<div>
      <div class="pop-hd">Öznitelikler</div>
      <table class="pop-tbl"><tbody>${tbl}</tbody></table>
      <div class="pop-actions">
        <button class="pop-btn" title="Tüm katmanı göster" onclick="NCZViewer._zoomToLayer(${obj.lc})">🔍</button>
        <button class="pop-btn" title="Y/X kopyala" onclick="NCZViewer._copyB64(this,'${copyB64}')">📋</button>
      </div>
    </div>`;
  }

  const _bounds = {};

  function renderObject(obj, epsg, api, groups) {
    const layerInfo = layerInfoFor(api, groups, obj.lc, obj.layerName);
    const col = layerInfo.color;

    const centerLl = toWGS(obj.N, obj.E, epsg);
    if (!centerLl) return false;
    
    // Kırıklı görünümü engellemek için 144 segment
    const latlngs = [];
    const segments = 144;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const n = obj.N + obj.rad * Math.sin(a);
      const e = obj.E + obj.rad * Math.cos(a);
      const ll = toWGS(n, e, epsg);
      if (ll) latlngs.push(ll);
    }

    if (!_bounds[obj.lc]) _bounds[obj.lc] = [];
    _bounds[obj.lc].push(centerLl); // zoom için merkez yeterli

    const circle = L.polygon(latlngs, {
      color:       col,
      weight:      2,
      opacity:     0.9,
      fillColor:   col,
      fillOpacity: 0.12,
      smoothFactor: 0,
      noClip: true
    });
    
    circle.on('click', ev => {
      L.popup({ maxWidth: 300 }).setLatLng(ev.latlng).setContent(makePopup(obj, epsg)).openOn(api.map);
    });
    layerInfo.group.addLayer(circle);
    return true;
  }

  function parseAndRender(buf, epsg, api) {
    const v = new DataView(buf);
    const a = new Uint8Array(buf);
    const lt = window.NCZParserV1 ? NCZParserV1.readLayerTable(buf) : {};
    const groups = {};
    let rendered = 0;
    let pos = 0;

    while (pos < buf.byteLength - 8) {
      if (!isGeomHeader(a, pos)) { pos++; continue; }
      const gt = a[pos + 6];
      const len = blockLen(a, pos);
      if (!len) { pos++; continue; }

      if (gt === 3) {
        let obj = null;
        try {
          obj = parseCircle(v, a, pos, lt, len);
        } catch (_) { obj = null; }

        if (obj && renderObject(obj, epsg, api, groups)) rendered++;
      }
      pos += len;
    }

    const prevZoom = NCZViewer._zoomToLayer;
    NCZViewer._zoomToLayer = function (lc) {
      const pts = _bounds[lc] || [];
      if (pts.length === 0) { if (prevZoom) prevZoom(lc); return; }
      NCZViewer.map.closePopup();
      pts.length === 1
        ? NCZViewer.map.setView(pts[0], 18, { animate: true })
        : NCZViewer.map.fitBounds(L.latLngBounds(pts).pad(0.1), { animate: true });
    };

    return rendered;
  }

  NCZViewer.registerModule({
    name: 'circle-renderer',
    init(api) { console.log('[circle-renderer] Daire modülü yüklendi'); },
    onDataCleared() { Object.keys(_bounds).forEach(k => delete _bounds[k]); },
  });

  NCZViewer.events.on('v1:points:parsed', ({ buf, epsg, filename }) => {
    if (!buf) return;
    setTimeout(() => {
      try {
        Object.keys(_bounds).forEach(k => delete _bounds[k]);
        const count = parseAndRender(buf, epsg, NCZViewer);
        if (count > 0) {
          NCZViewer.ui.refreshLayerLists();
          NCZViewer.ui.toast(`✓ ${count} daire yüklendi`, 'ok', 2000);
        }
      } catch (err) {
        console.error('[circle-renderer] Hata:', err);
      }
    }, 80);
  });
})();
