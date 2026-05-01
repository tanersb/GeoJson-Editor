/**
 * NCZ v1 Lines Renderer  v2.0
 * ────────────────────────────
 * Her gt=2 (Line) veya gt=5 (Arc) bloğu, başlangıç + bitiş noktası
 * içeren tam bir çizgi segmentidir. Birleştirme gerekmez.
 *
 * Blok yapısı (gt=2 veya gt=5):
 *   [header 7 byte][LC(1)][N_start(8)][E_start(8)][Z_start(4)][skip 38b]
 *   [N_end(8)][E_end(8)][trailing...]
 *
 *   Toplam: gt=2 → 106 byte, gt=5 → 101 byte
 *   Offsetler: +1=N1, +9=E1, +17=Z1(f32), +59=N2, +67=E2
 *
 * Bağımlılık: parser-v1-points.js (NCZParserV1 API için)
 */

(function () {
  'use strict';

  // ── WGS84 dönüşümü ────────────────────────────────────────────
  function toWGS(n, e, epsg) {
    try {
      const [lon, lat] = proj4('EPSG:' + epsg, 'EPSG:4326', [e, n]);
      return isFinite(lat) && isFinite(lon) ? [lat, lon] : null;
    } catch (_) { return null; }
  }

  // UTM geçerlilik (Türkiye bölgesi)
  function isValidUTM(n, e) {
    return Number.isFinite(n) && Number.isFinite(e) &&
      n > 3_500_000 && n < 5_500_000 &&
      e > 10_000   && e < 990_000;
  }

  // ── Tek segmenti parse et ─────────────────────────────────────
  // Her gt=2 / gt=5 bloğu = başlangıç + bitiş noktası olan bir segment
  // gt=2 (Line): N2=base+79, E2=base+87
  // gt=4 (Arc):   N2=base+59, E2=base+67
  // gt=5 = TEXT objesi → çizgi değil, atla!
  function parseSegment(v, a, base, lt, gt) {
    const lc    = a[base];
    const n1    = v.getFloat64(base + 1,  true); // Northing başlangıç
    const e1    = v.getFloat64(base + 9,  true); // Easting başlangıç
    const z1    = v.getFloat32(base + 17, true); // Z başlangıç (float32)
    const n2off = gt === 2 ? 79 : 59;  // gt=2→Line(+79), gt=4→Arc(+59)
    const e2off = gt === 2 ? 87 : 67;  // gt=2→Line(+87), gt=4→Arc(+67)
    const n2    = v.getFloat64(base + n2off, true); // Northing bitiş
    const e2    = v.getFloat64(base + e2off, true); // Easting bitiş

    if (!isValidUTM(n1, e1)) return null;
    if (!isValidUTM(n2, e2)) return null;

    return {
      lc,
      layerName: lt[lc] || `LC_${lc}`,
      n1, e1, z1,
      n2, e2,
    };
  }

  // ── Popup HTML ─────────────────────────────────────────────────
  function makePopup(seg, epsg, gt) {
    const copyStr = `Y: ${seg.n1.toFixed(3)}, X: ${seg.e1.toFixed(3)} (EPSG:${epsg})`;
    const copyB64 = btoa(unescape(encodeURIComponent(copyStr)));
    const geomLabel = gt === 2 ? 'Çizgi' : 'Ark';

    const rows = [
      ['Katman',   seg.layerName],
      ['Geometri', geomLabel],
      ['Y başl.',  seg.n1.toFixed(3)],
      ['X başl.',  seg.e1.toFixed(3)],
      ['Y bitiş',  seg.n2.toFixed(3)],
      ['X bitiş',  seg.e2.toFixed(3)],
    ];
    if (seg.z1 && Math.abs(seg.z1) > 0.001) rows.push(['Z', seg.z1.toFixed(3)]);

    const tbl = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
    return `<div>
      <div class="pop-hd">Öznitelikler</div>
      <table class="pop-tbl"><tbody>${tbl}</tbody></table>
      <div class="pop-actions">
        <button class="pop-btn" title="Tüm katmanı göster"
          onclick="NCZViewer._zoomToLayer(${seg.lc})">🔍</button>
        <button class="pop-btn" title="Y/X kopyala"
          onclick="NCZViewer._copyB64(this,'${copyB64}')">📋</button>
        <button class="pop-btn" title="Katmanı gizle"
          onclick="NCZViewer.layers.setVisible(${seg.lc},false);
                   NCZViewer.ui.refreshLayerLists();
                   NCZViewer.map.closePopup();">👁</button>
      </div>
    </div>`;
  }

  // ── Katman sınırları (zoom to layer için) ─────────────────────
  const _bounds = {};

  // ── Tüm Line/Arc segmentlerini parse et ve çiz ────────────────
  function parseAndRender(buf, epsg, api) {
    const v  = new DataView(buf);
    const a  = new Uint8Array(buf);
    const lt = window.NCZParserV1 ? NCZParserV1.readLayerTable(buf) : {};

    // Cases: 2=Line(106B), 4=Arc(~101B), 5=TEXT(skip!), 7=PLine(POLY ayrı)
    const BLOCK_TOTAL = { 2: 106, 4: 101 };
    let rendered  = 0;
    let pos       = 0;

    // Katman grupları (LC → group)
    const groups = {};

    while (pos < buf.byteLength - 8) {
      if (a[pos] !== 0x15 || a[pos+3] !== 0 || a[pos+4] !== 0 || a[pos+5] !== 0) {
        pos++; continue;
      }
      const gt   = a[pos + 6];
      const base = pos + 7;

      if (gt === 2 || gt === 4) {  // gt=2=Line, gt=4=Arc (5=Text değil!)
        try {
          const seg = parseSegment(v, a, base, lt, gt);
          if (seg) {
            // LayerGroup al veya oluştur
            if (!groups[seg.lc]) {
              let layerInfo = api.layers.get(seg.lc);
              if (!layerInfo) {
                const grp = L.layerGroup().addTo(api.map);
                layerInfo = api.layers.register(seg.lc, seg.layerName, grp);
              }
              groups[seg.lc] = layerInfo;
            }
            const layerInfo = groups[seg.lc];
            const col = layerInfo.color;

            // WGS84 koordinatlar
            const ll1 = toWGS(seg.n1, seg.e1, epsg);
            const ll2 = toWGS(seg.n2, seg.e2, epsg);
            if (!ll1 || !ll2) { pos += BLOCK_TOTAL[gt]; continue; }

            // Bounds güncelle
            if (!_bounds[seg.lc]) _bounds[seg.lc] = [];
            _bounds[seg.lc].push(ll1, ll2);

            // Polyline (2 nokta = segment)
            const line = L.polyline([ll1, ll2], {
              color:   col,
              weight:  2,
              opacity: 0.85,
            });

            // Tıklanınca popup
            const _seg = seg; const _gt = gt;
            line.on('click', (ev) => {
              L.popup({ maxWidth: 280 })
                .setLatLng(ev.latlng)
                .setContent(makePopup(_seg, epsg, _gt))
                .openOn(api.map);
            });

            layerInfo.group.addLayer(line);
            rendered++;
          }
        } catch (_) {}
        pos += BLOCK_TOTAL[gt] || 101;  // bilinmeyen tip → 101 default

      } else if (gt === 1) {
        pos += 109; // Point bloğunu atla
      } else {
        // Dinamik atla
        let found = -1;
        for (let i = pos + 1; i < Math.min(pos + 3000, a.length - 7); i++) {
          if (a[i] === 0x15 && a[i+3] === 0 && a[i+4] === 0 && a[i+5] === 0) {
            found = i; break;
          }
        }
        pos = found > pos ? found : pos + 1;
      }
    }

    // _zoomToLayer'ı güncelle (bounds'a çizgileri de ekle)
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

  // ── Modül kaydı ───────────────────────────────────────────────
  NCZViewer.registerModule({
    name: 'lines-renderer',
    init(api)  { console.log('[lines-renderer] Yüklendi'); },
    onDataCleared() {
      Object.keys(_bounds).forEach(k => delete _bounds[k]);
    },
  });

  // ── v1:points:parsed event ─────────────────────────────────────
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
          api.ui.toast(`✓ ${count} çizgi yüklendi`, 'ok', 2000);
          console.log(`[lines-renderer] ${count} segment render edildi`);
        } else {
          console.log('[lines-renderer] Çizgi bulunamadı');
        }
      } catch (err) {
        console.error('[lines-renderer] Hata:', err);
        api.ui.toast('Çizgi hatası: ' + err.message, 'err', 4000);
      }
      api.ui.loading(false);
    }, 80);
  });

  console.log('[lines-renderer] Modül hazır');
})();
