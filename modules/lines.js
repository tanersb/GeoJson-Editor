/**
 * NCZ v1 Lines Renderer  v2.3 — Kesin Temiz Sürüm
 * ────────────────────────────────────────────────
 * Binary analiz sonuçlarına göre doğrulanmış offset'ler:
 *
 *   gt=2  (Line)     : blockLen=106, n2@base+79, e2@base+87  ✓
 *   gt=7  (Polyline) : değişken blockLen, vertex start=pos+113, stride=24  ✓
 *   gt=4  (Arc)      : ATLANIR — @59/@67 offset'leri yanlış koordinat üretir,
 *                      haritada km'lik ışın çizgilerine neden olur.
 *   gt=10 (Box)      : Bu dosyalarda görülmedi; şimdilik ATLANIR.
 *
 * Uzun çizgi koruması: Tek segment > MAX_SEGMENT_M ise çizilmez.
 */

(function () {
  'use strict';

  // Tek bir gt=2 segmentinin maksimum uzunluğu (metre).
  // Gerçek çizgi kayıtlarının tümü bu dosyalarda <300 m.
  // Güvenli üst sınır olarak 2000 m kullanıyoruz.
  const MAX_SEGMENT_M = Number(window.NCZ_LINE_MAX_SEGMENT_M || 2000);

  // ── Yardımcılar ───────────────────────────────────────────────
  function toWGS(n, e, epsg) {
    try {
      const [lon, lat] = proj4('EPSG:' + epsg, 'EPSG:4326', [e, n]);
      return (isFinite(lat) && isFinite(lon)) ? [lat, lon] : null;
    } catch (_) { return null; }
  }

  function isValidUTM(n, e) {
    return Number.isFinite(n) && Number.isFinite(e) &&
      n > 3_500_000 && n < 5_500_000 &&
      e > 10_000    && e < 990_000;
  }

  function isGeomHeader(a, pos) {
    return pos + 7 < a.length &&
      a[pos] === 0x15 &&
      a[pos + 3] === 0x00 &&
      a[pos + 4] === 0x00 &&
      a[pos + 5] === 0x00;
  }

  // blockLen: 2-byte little-endian uzunluk + 5 byte overhead
  function blockLen(a, pos) {
    const len = a[pos + 1] + a[pos + 2] * 256 + 5;
    return (len > 7 && len < 200_000 && pos + len <= a.length) ? len : 0;
  }

  function dist(n1, e1, n2, e2) {
    return Math.hypot(n2 - n1, e2 - e1);
  }

  // ── Katman yönetimi ────────────────────────────────────────────
  function ensureLayer(api, groups, lc, name) {
    if (!groups[lc]) {
      let info = api.layers.get(lc);
      if (!info) {
        const grp = L.layerGroup().addTo(api.map);
        info = api.layers.register(lc, name || `LC_${lc}`, grp);
      }
      groups[lc] = info;
    }
    return groups[lc];
  }

  // ── Popup HTML ─────────────────────────────────────────────────
  function makePopup(obj, epsg) {
    const first = obj.coords[0];
    const last  = obj.coords[obj.coords.length - 1];
    const copyStr = `Y: ${first[0].toFixed(3)}, X: ${first[1].toFixed(3)} (EPSG:${epsg})`;
    const copyB64 = btoa(unescape(encodeURIComponent(copyStr)));

    const rows = [
      ['Katman',    obj.layerName],
      ['Geometri',  `${obj.type} (gt=${obj.gt})`],
      ['Vertex',    String(obj.coords.length)],
      ['Y başl.',   first[0].toFixed(3)],
      ['X başl.',   first[1].toFixed(3)],
      ['Y son',     last[0].toFixed(3)],
      ['X son',     last[1].toFixed(3)],
    ];
    const tbl = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
    return `<div>
      <div class="pop-hd">Öznitelikler</div>
      <table class="pop-tbl"><tbody>${tbl}</tbody></table>
      <div class="pop-actions">
        <button class="pop-btn" title="Tüm katmanı göster"
          onclick="NCZViewer._zoomToLayer(${obj.lc})">🔍</button>
        <button class="pop-btn" title="Y/X kopyala"
          onclick="NCZViewer._copyB64(this,'${copyB64}')">📋</button>
        <button class="pop-btn" title="Katmanı gizle"
          onclick="NCZViewer.layers.setVisible(${obj.lc},false);
                   NCZViewer.ui.refreshLayerLists();
                   NCZViewer.map.closePopup();">👁</button>
      </div>
    </div>`;
  }

  const _bounds = {};

  // ── gt=2 Line: binary analiz ile doğrulanmış offset'ler ───────
  // blockLen=106, base=pos+7
  //   lc    = base+0   (1 byte)
  //   n1    = base+1   (float64 LE)
  //   e1    = base+9   (float64 LE)
  //   z1    = base+17  (float32 LE)
  //   n2    = base+79  (float64 LE)  ← doğrulandı
  //   e2    = base+87  (float64 LE)  ← doğrulandı
  function parseLine(v, a, pos, lt) {
    const base = pos + 7;
    const lc = a[base];
    const n1 = v.getFloat64(base + 1,  true);
    const e1 = v.getFloat64(base + 9,  true);
    const z1 = v.getFloat32(base + 17, true);
    const n2 = v.getFloat64(base + 79, true);
    const e2 = v.getFloat64(base + 87, true);

    if (!isValidUTM(n1, e1) || !isValidUTM(n2, e2)) return null;

    const d = dist(n1, e1, n2, e2);
    if (d < 0.001 || d > MAX_SEGMENT_M) {
      if (d > MAX_SEGMENT_M) {
        console.warn(`[lines-renderer] gt=2 segment çok uzun (${d.toFixed(0)} m), atlandı. pos=${pos}`);
      }
      return null;
    }

    return {
      type: 'Çizgi', gt: 2, lc,
      layerName: lt[lc] || `LC_${lc}`,
      coords: [[n1, e1], [n2, e2]],
      z1: Number.isFinite(z1) ? z1 : 0,
    };
  }

  // ── gt=7 Polyline: start=pos+113, stride=24 ───────────────────
  // Binary analiz ile stride=24 ve start_off=113 doğrulandı.
  function parsePolyline(v, a, pos, len, lt) {
    const base  = pos + 7;
    const lc    = a[base];
    const start = pos + 113;
    const maxVerts = Math.floor((len - 113) / 24);

    if (maxVerts < 2 || maxVerts > 5000) return null;

    const coords = [];
    for (let i = 0; i < maxVerts; i++) {
      const off = start + i * 24;
      if (off + 16 > pos + len) break;
      try {
        const n = v.getFloat64(off,     true);
        const e = v.getFloat64(off + 8, true);
        if (!isValidUTM(n, e)) continue;

        // Art arda tekrar eden vertex'i atla
        const prev = coords[coords.length - 1];
        if (prev && dist(prev[0], prev[1], n, e) < 0.001) continue;

        // Önceki vertex ile aradaki mesafe kontrol
        if (prev) {
          const d = dist(prev[0], prev[1], n, e);
          if (d > MAX_SEGMENT_M) {
            console.warn(`[lines-renderer] gt=7 polyline vertex atlandı: segment ${d.toFixed(0)} m. pos=${pos} i=${i}`);
            continue;
          }
        }

        coords.push([n, e]);
      } catch (_) { /* geçersiz float → atla */ }
    }

    if (coords.length < 2) return null;

    return {
      type: 'Polyline', gt: 7, lc,
      layerName: lt[lc] || `LC_${lc}`,
      coords,
    };
  }

  // ── Leaflet'e çiz ─────────────────────────────────────────────
  function renderObject(obj, epsg, api, groups) {
    const info   = ensureLayer(api, groups, obj.lc, obj.layerName);
    const col    = info.color;
    const latlngs = [];

    for (const [n, e] of obj.coords) {
      const ll = toWGS(n, e, epsg);
      if (ll) latlngs.push(ll);
    }

    if (latlngs.length < 2) return false;

    if (!_bounds[obj.lc]) _bounds[obj.lc] = [];
    _bounds[obj.lc].push(...latlngs);

    const line = L.polyline(latlngs, { color: col, weight: 2, opacity: 0.88 });
    line.on('click', ev => {
      L.popup({ maxWidth: 300 })
        .setLatLng(ev.latlng)
        .setContent(makePopup(obj, epsg))
        .openOn(api.map);
    });
    info.group.addLayer(line);
    return true;
  }

  // ── Ana parse döngüsü ─────────────────────────────────────────
  function parseAndRender(buf, epsg, api) {
    const v  = new DataView(buf);
    const a  = new Uint8Array(buf);
    const lt = window.NCZParserV1 ? NCZParserV1.readLayerTable(buf) : {};
    const groups = {};
    let rendered = 0;
    let skippedArc = 0;
    let pos = 0;

    while (pos < buf.byteLength - 8) {
      if (!isGeomHeader(a, pos)) { pos++; continue; }

      const gt  = a[pos + 6];
      const len = blockLen(a, pos);
      if (!len) { pos++; continue; }

      let obj = null;
      try {
        if (gt === 2) {
          // Gerçek çizgi — binary analiz ile doğrulanmış offset
          obj = parseLine(v, a, pos, lt);
        } else if (gt === 4) {
          // Arc kayıtları: @59/@67 offset'leri yanlış koordinat üretir.
          // Uzun ışın çizgileri bu gt'den kaynaklanıyor. Kesinlikle atla.
          skippedArc++;
        } else if (gt === 7) {
          // Polyline — stride=24, start=pos+113 doğrulandı
          obj = parsePolyline(v, a, pos, len, lt);
        }
        // gt=0,1,5,10 ve diğerleri: nokta parser'ı veya ilgisiz → atla
      } catch (_) { obj = null; }

      if (obj && renderObject(obj, epsg, api, groups)) rendered++;
      pos += len;
    }

    // _zoomToLayer'ı çizgi bounds'larıyla güncelle
    const prevZoom = NCZViewer._zoomToLayer;
    NCZViewer._zoomToLayer = function (lc) {
      const pts = _bounds[lc] || [];
      if (pts.length === 0) { if (prevZoom) prevZoom(lc); return; }
      NCZViewer.map.closePopup();
      pts.length === 1
        ? NCZViewer.map.setView(pts[0], 18, { animate: true })
        : NCZViewer.map.fitBounds(L.latLngBounds(pts).pad(0.1), { animate: true });
    };

    if (skippedArc > 0) {
      console.log(`[lines-renderer] ${skippedArc} Arc (gt=4) kaydı atlandı (uzun ışın önleme).`);
    }

    return rendered;
  }

  // ── Modül kaydı ───────────────────────────────────────────────
  NCZViewer.registerModule({
    name: 'lines-renderer',
    init(api)  { console.log('[lines-renderer] v2.3 Yüklendi'); },
    onDataCleared() {
      Object.keys(_bounds).forEach(k => delete _bounds[k]);
    },
  });

  // ── v1:points:parsed event'ini dinle ──────────────────────────
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
          console.log(`[lines-renderer] ${count} geometri render edildi`);
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

  console.log('[lines-renderer] v2.3 Modül hazır');
})();
