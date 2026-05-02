/**
 * NCZ v1 Lines Renderer  v2.2 — kontrollü nokta/çizgi tamamlayıcı
 * ───────────────────────────────────────────────────────────────
 * Bu sürüm gönderilen mevcut viewer yapısını bozmaz; sadece bazı projelerde
 * eksik kalan gerçek çizgi/polyline geometrilerini kontrollü şekilde ekler.
 *
 * Okunan geometri tipleri:
 *   gt=2  : gerçek çizgi segmenti
 *   gt=4  : kısa ark/yardımcı segment (mevcut destek korunur)
 *   gt=7  : polyline; vertex listesi offset +113'ten, 24 byte adımla okunur
 *   gt=10 : kutu/çerçeve; bbox köşelerinden dikdörtgen oluşturulur
 *
 * Özellikle yapılmayan şey:
 *   gt=5 TEXT objeleri çizgi gibi yorumlanmaz. Bunlar parser-v1-points.js
 *   içinde kısa nokta etiketi olarak ayrıca gösterilir.
 */

(function () {
  'use strict';

  // Türkçe karakter tablosu
  const TR = {
    253:'ı', 240:'ğ', 254:'ş', 221:'İ', 208:'Ğ', 222:'Ş',
    246:'ö', 214:'Ö', 252:'ü', 220:'Ü', 231:'ç', 199:'Ç',
  };
  // readPLineSub'ın erişebilmesi için global'e aç
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

  // ── PLine sub struct okuyucu ─────────────────────────────────
  // sub = base+25+1+cls_len+1+oname_len (cls=0, oname=0 → sub=base+27)
  // PLine.Read: PolyName(pascal) + PFlags(int32) + TArea(double)
  // PFlags: bit1=Closed(2), bit2=Filled(4)
  function readPLineSub(a, v, base) {
    const clsLen   = a[base + 25] || 0;
    const onameLen = a[base + 26 + clsLen] || 0;
    let p = base + 25 + 1 + clsLen + 1 + onameLen;
    // PolyName (pascal string)
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

    // PLine sub struct: PolyName, PFlags, TArea
    const sub = readPLineSub(a, v, base);

    // IsClosed: sadece geometrik kapanış (ilk≈son vertex).
    // PFlags.Closed güvenilir değil — bu dosyalarda tüm PLine'larda set edilmiş.
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

  function parseBox(v, a, pos, len, lt) {
    const base = pos + 7;
    const lc = a[base];
    const validPairs = [];
    for (let off = pos + 7; off <= pos + len - 16; off++) {
      const n = v.getFloat64(off, true);
      const e = v.getFloat64(off + 8, true);
      if (isValidUTM(n, e)) validPairs.push([n, e]);
    }
    if (validPairs.length < 2) return null;
    const ns = validPairs.map(p => p[0]);
    const es = validPairs.map(p => p[1]);
    const minN = Math.min(...ns), maxN = Math.max(...ns);
    const minE = Math.min(...es), maxE = Math.max(...es);
    if (Math.abs(maxN - minN) < 0.001 || Math.abs(maxE - minE) < 0.001) return null;
    const coords = [[minN, minE], [minN, maxE], [maxN, maxE], [maxN, minE], [minN, minE]];
    return { type: 'Kutu/Çerçeve', gt: 10, lc, layerName: lt[lc] || `LC_${lc}`, coords };
  }

  function makePopup(obj, epsg) {
    const first = obj.coords[0];
    const copyStr = `Y: ${first[0].toFixed(3)}, X: ${first[1].toFixed(3)} (EPSG:${epsg})`;
    const copyB64 = btoa(unescape(encodeURIComponent(copyStr)));

    const rows = [['Katman', obj.layerName], ['Geometri', obj.type]];
    if (obj.gt === 7) {
      if (obj.polyName) rows.push(['Ad', obj.polyName]);
      rows.push(['Kapalı', obj.isClosed ? 'Evet' : 'Hayır']);
      rows.push(['Vertex', String(obj.coords.length)]);
      if (obj.tarea && Math.abs(obj.tarea) > 0.001)
        rows.push(['Alan', `${obj.tarea.toFixed(2)} m²`]);
    } else {
      const last = obj.coords[obj.coords.length - 1];
      rows.push(
        ['Vertex',   String(obj.coords.length)],
        ['Y başl.',  first[0].toFixed(3)],
        ['X başl.',  first[1].toFixed(3)],
        ['Y son',    last[0].toFixed(3)],
        ['X son',    last[1].toFixed(3)],
      );
    }

    const tbl = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
    return `<div>
      <div class="pop-hd">Öznitelikler</div>
      <table class="pop-tbl"><tbody>${tbl}</tbody></table>
      <div class="pop-actions">
        <button class="pop-btn" title="Tüm katmanı göster" onclick="NCZViewer._zoomToLayer(${obj.lc})">🔍</button>
        <button class="pop-btn" title="Y/X kopyala" onclick="NCZViewer._copyB64(this,'${copyB64}')">📋</button>
        <button class="pop-btn" title="Katmanı gizle" onclick="NCZViewer.layers.setVisible(${obj.lc},false);NCZViewer.ui.refreshLayerLists();NCZViewer.map.closePopup();">👁</button>
      </div>
    </div>`;
  }

  const _bounds = {};

  function renderObject(obj, epsg, api, groups) {
    const layerInfo = layerInfoFor(api, groups, obj.lc, obj.layerName);
    const col = layerInfo.color;
    const latlngs = [];
    for (const [n, e] of obj.coords) {
      const ll = toWGS(n, e, epsg);
      if (ll) latlngs.push(ll);
    }
    if (latlngs.length < 2) return false;
    if (!_bounds[obj.lc]) _bounds[obj.lc] = [];
    _bounds[obj.lc].push(...latlngs);

    let shape;
    // gt=7 kapalı alan → Leaflet polygon
    if (obj.gt === 7 && obj.isClosed && latlngs.length >= 3) {
      shape = L.polygon(latlngs, {
        color:       col,
        weight:      2,
        opacity:     0.9,
        fillColor:   col,
        fillOpacity: obj.isFilled ? 0.18 : 0.06,
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
        else if (gt === 7) obj = parsePolyline(v, a, pos, len, lt);
        else if (gt === 10) obj = parseBox(v, a, pos, len, lt);
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
    const api = NCZViewer;
    if (!buf) return;
    api.ui.loading(true);
    setTimeout(() => {
      try {
        Object.keys(_bounds).forEach(k => delete _bounds[k]);
        const count = parseAndRender(buf, epsg, api);
        if (count > 0) {
          api.ui.refreshLayerLists();
          api.ui.toast(`✓ ${count} çizgi/polyline yüklendi`, 'ok', 2000);
          console.log(`[lines-renderer] ${count} çizgi/polyline render edildi`);
        } else {
          console.log('[lines-renderer] Çizgi bulunamadı');
        }
      } catch (err) {
        console.error('[lines-renderer] Hata:', err);
        api.ui.toast('Çizgi hatası: ' + err.message, 'err', 4000);
      }
      api.ui.loading(false);
    }, 60);
  });

  console.log('[lines-renderer] Modül hazır');
})();
