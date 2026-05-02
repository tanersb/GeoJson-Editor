/**
 * NCZ v1 Lines Renderer  v2.3 — kontrollü nokta/çizgi/daire tamamlayıcı
 * ───────────────────────────────────────────────────────────────
 * Bu sürüm gönderilen mevcut viewer yapısını bozmaz; sadece bazı projelerde
 * eksik kalan gerçek çizgi/polyline/daire geometrilerini kontrollü şekilde ekler.
 * 
 * Okunan geometri tipleri:
 *   gt=2  : gerçek çizgi segmenti
 *   gt=3  : DAİRE (CIRCLE) - YENİ EKLENDİ[cite: 10]
 *   gt=4  : kısa ark/yardımcı segment
 *   gt=7  : polyline; vertex listesi offset +113'ten, 24 byte adımla okunur[cite: 10]
 *   gt=10 : kutu/çerçeve; bbox köşelerinden dikdörtgen oluşturulur
 */

(function () {
  'use strict';

  // Türkçe karakter tablosu[cite: 10]
  const TR = {
    253:'ı', 240:'ğ', 254:'ş', 221:'İ', 208:'Ğ', 222:'Ş',
    246:'ö', 214:'Ö', 252:'ü', 220:'Ü', 231:'ç', 199:'Ç',
  };
  window._NCZ_TR = TR;

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

  function parseSegment(v, a, pos, lt, gt) {
    const base = pos + 7;
    const lc = a[base];
    const n1 = v.getFloat64(base + 1, true);
    const e1 = v.getFloat64(base + 9, true);
    const z1 = v.getFloat32(base + 17, true);
    const n2off = gt === 2 ? 79 : 59;
    const e2off = gt === 2 ? 87 : 67;
    const n2 = v.getFloat64(base + n2off, true);
    const e2 = v.getFloat64(base + e2off, true);
    if (!isValidUTM(n1, e1) || !isValidUTM(n2, e2)) return null;
    return { type: gt === 2 ? 'Çizgi' : 'Ark', gt, lc, layerName: lt[lc] || `LC_${lc}`, z1, coords: [[n1, e1], [n2, e2]] };
  }

  function readPLineSub(a, v, base) {
    const clsLen   = a[base + 25] || 0;
    const onameLen = a[base + 26 + clsLen] || 0;
    let p = base + 25 + 1 + clsLen + 1 + onameLen;
    const pnLen = a[p] || 0; p++;
    let polyName = '';
    const TR = window._NCZ_TR || {};
    for (let i = 0; i < pnLen; i++) {
      const ch = a[p + i];
      if (TR[ch]) polyName += TR[ch];
      else if (ch >= 32 && ch < 127) polyName += String.fromCharCode(ch);
    }
    p += pnLen;
    const pflags = v.getInt32(p, true); p += 4;
    const tarea  = v.getFloat64(p, true);
    return { polyName: polyName.trim(), pflags, tarea };
  }



  function parsePolyline(v, a, pos, len, lt) {
    const base  = pos + 7;
    const lc    = a[base];
    const start = pos + 113;
    const count = Math.floor((len - 113) / 24);
    if (count < 2 || count > 5000) return null;

    const coords = [];
    for (let i = 0; i < count; i++) {
      const off = start + i * 24;
      if (off + 16 > pos + len) break;
      const n = v.getFloat64(off,     true);
      const e = v.getFloat64(off + 8, true);
      if (!isValidUTM(n, e)) continue;
      const last = coords[coords.length - 1];
      if (!last || Math.abs(last[0] - n) > 0.0005 || Math.abs(last[1] - e) > 0.0005) {
        coords.push([n, e]);
      }
    }
    if (coords.length < 2) return null;

    const sub = readPLineSub(a, v, base);
    const first = coords[0], last2 = coords[coords.length - 1];
    const isClosed = coords.length >= 3 &&
      Math.abs(first[0] - last2[0]) < 0.01 &&
      Math.abs(first[1] - last2[1]) < 0.01;
    const isFilled = isClosed && !!(sub.pflags & 4);

    return {
      type: isClosed ? 'Kapalı Alan' : 'Polyline',
      gt: 7, lc,
      layerName: lt[lc] || `LC_${lc}`,
      coords,
      polyName: sub.polyName,
      pflags:   sub.pflags,
      tarea:    sub.tarea,
      isClosed,
      isFilled,
    };
  }

  function parseRectangle(v, a, pos, lt) {
    const base = pos + 7;
    const lc   = a[base];
    const N1   = v.getFloat64(base + 1,  true);
    const E1   = v.getFloat64(base + 9,  true);
    if (!isValidUTM(N1, E1)) return null;

    const clsLen   = a[base + 25] || 0;
    const onameLen = a[base + 26 + clsLen] || 0;
    const sub      = base + 25 + 1 + clsLen + 1 + onameLen;

    let PA_N, PA_E, angleB = 0;
    const nameLen = a[sub] || 0;
    const pV1     = sub + 1 + nameLen;
    const paN_v1  = (pV1 + 8 <= v.buffer.byteLength) ? v.getFloat64(pV1, true) : 0;
    const paE_v1  = (pV1 + 16 <= v.buffer.byteLength) ? v.getFloat64(pV1 + 8, true) : 0;

    if (isValidUTM(paN_v1, paE_v1)) {
      PA_N   = paN_v1;
      PA_E   = paE_v1;
      angleB = (pV1 + 20 <= v.buffer.byteLength) ? v.getFloat32(pV1 + 16, true) : 0;
    } else {
      const paN_v2 = (sub + 40 <= v.buffer.byteLength) ? v.getFloat64(sub + 32, true) : 0;
      const paE_v2 = (sub + 48 <= v.buffer.byteLength) ? v.getFloat64(sub + 40, true) : 0;
      if (!isValidUTM(paN_v2, paE_v2)) return null;
      PA_N   = paN_v2;
      PA_E   = paE_v2;
      angleB = (sub + 52 <= v.buffer.byteLength) ? v.getFloat32(sub + 48, true) : 0;
    }

    const width  = Math.abs(E1 - PA_E);
    const height = Math.abs(N1 - PA_N);
    if (width < 0.001 || height < 0.001) return null;

    const coords = [
      [N1,   E1],
      [N1,   PA_E],
      [PA_N, PA_E],
      [PA_N, E1],
      [N1,   E1],
    ];

    return {
      type: 'Dikdörtgen', gt: 10, lc,
      layerName: lt[lc] || `LC_${lc}`,
      coords,
      width, height,
      angleB,
      isClosed: true,
      isFilled: false,
    };
  }

  function makePopup(obj, epsg) {
    // Daire veya koordinatlı objeler için güvenli koordinat alımı[cite: 10]
    const yVal = obj.coords ? obj.coords[0][0] : 0;
    const xVal = obj.coords ? obj.coords[0][1] : 0;
    
    const copyStr = `Y: ${yVal.toFixed(3)}, X: ${xVal.toFixed(3)} (EPSG:${epsg})`;
    const copyB64 = btoa(unescape(encodeURIComponent(copyStr)));

    const rows = [['Katman', obj.layerName], ['Geometri', obj.type]];
    if (obj.gt === 10 && obj.width) {
      rows.push(['Genişlik', `${obj.width.toFixed(3)} m`], ['Yükseklik', `${obj.height.toFixed(3)} m`], ['Alan', `${(obj.width * obj.height).toFixed(2)} m²`]);
    } else if (obj.gt === 7) {
      if (obj.polyName) rows.push(['Ad', obj.polyName]);
      rows.push(['Kapalı', obj.isClosed ? 'Evet' : 'Hayır'], ['Vertex', String(obj.coords.length)]);
      if (obj.tarea && Math.abs(obj.tarea) > 0.001) rows.push(['Alan', `${obj.tarea.toFixed(2)} m²`]);
    } else if (obj.gt === 2 || obj.gt === 4) {
      if (obj.len) rows.push(['Uzunluk', `${obj.len.toFixed(2)} m`]);
    }

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



    // --- ÇİZGİ/POLYLINE ÇİZİMİ ---[cite: 10]
    if (!obj.coords || obj.coords.length < 2) return false;
    const latlngs = [];
    for (const [n, e] of obj.coords) {
      const ll = toWGS(n, e, epsg);
      if (ll) latlngs.push(ll);
    }
    
    if (latlngs.length < 2) return false;
    if (!_bounds[obj.lc]) _bounds[obj.lc] = [];
    _bounds[obj.lc].push(...latlngs);

    let shape;
    if (obj.gt === 7 && obj.isClosed && latlngs.length >= 3) {
      shape = L.polygon(latlngs, {
        color: col, weight: 2, opacity: 0.9,
        fillColor: col, fillOpacity: obj.isFilled ? 0.18 : 0.06,
      });
    } else {
      shape = L.polyline(latlngs, { color: col, weight: 2, opacity: 0.88 });
    }

    shape.on('click', ev => {
      L.popup({ maxWidth: 300 }).setLatLng(ev.latlng).setContent(makePopup(obj, epsg)).openOn(api.map);
    });
    layerInfo.group.addLayer(shape);
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

      let obj = null;
      try {
        if (gt === 2 || gt === 4) obj = parseSegment(v, a, pos, lt, gt);
        else if (gt === 7)  obj = parsePolyline(v, a, pos, len, lt);
        else if (gt === 10) obj = parseRectangle(v, a, pos, lt);
      } catch (_) { obj = null; }

      if (obj && renderObject(obj, epsg, api, groups)) rendered++;
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
    name: 'lines-renderer',
    init(api) { console.log('[lines-renderer] Yüklendi'); },
    onDataCleared() { Object.keys(_bounds).forEach(k => delete _bounds[k]); },
  });

  NCZViewer.events.on('v1:points:parsed', ({ buf, epsg, filename }) => {
    if (!buf) return;
    NCZViewer.ui.loading(true);
    setTimeout(() => {
      try {
        Object.keys(_bounds).forEach(k => delete _bounds[k]);
        const count = parseAndRender(buf, epsg, NCZViewer);
        if (count > 0) {
          NCZViewer.ui.refreshLayerLists();
          NCZViewer.ui.toast(`✓ ${count} geometri yüklendi`, 'ok', 2000);
        }
      } catch (err) {
        console.error('[lines-renderer] Hata:', err);
      }
      NCZViewer.ui.loading(false);
    }, 60);
  });
})();