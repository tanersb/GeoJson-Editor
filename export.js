/**
 * GeoJSON Dışa Aktarma Modülü
 * ────────────────────────────
 * Yüklenen NCZ verilerini (nokta + çizgi) WGS84 GeoJSON olarak indirir.
 * Sidebar'daki GeoJSON butonlarını (ej-d, ej-m) aktive eder.
 *
 * Bağımlılık:
 *   - parser-v1-points.js (v1:points:parsed event + NCZParserV1.readLayerTable)
 *   - Leaflet + proj4 (WGS84 dönüşümü için)
 */

(function () {
  'use strict';

  // ── Parse edilmiş veriyi burada saklarız ──────────────────────
  // Her yeni dosya yüklenince sıfırlanır.
  const store = {
    points:   [],   // {lc, layerName, name, x(N), y(E), z}
    segments: [],   // {lc, layerName, gt, n, e, z, name, pos}
    epsg:     '5254',
    filename: '',
  };

  // ── WGS84 dönüşümü ────────────────────────────────────────────
  function toWGS(n, e, epsg) {
    try {
      const [lon, lat] = proj4('EPSG:' + epsg, 'EPSG:4326', [e, n]);
      return isFinite(lat) && isFinite(lon) ? { lat, lon } : null;
    } catch (_) { return null; }
  }

  // Her segment zaten 2 nokta içeriyor (başlangıç + bitiş)
  // Gruplama gerekmez, doğrudan kullan

  // ── GeoJSON üretici ───────────────────────────────────────────
  function buildGeoJSON() {
    const epsg    = store.epsg;
    const features = [];

    // Noktalar
    for (const pt of store.points) {
      const wgs = toWGS(pt.x, pt.y, epsg);
      if (!wgs) continue;
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [wgs.lon, wgs.lat, pt.z || 0],
        },
        properties: {
          layer:   pt.layerName,
          lc:      pt.lc,
          name:    pt.name || '',
          z:       pt.z || 0,
          epsg:    epsg,
        },
      });
    }

    // Çizgiler — her segment zaten start+end içeriyor
    for (const seg of store.segments) {
      const w1 = toWGS(seg.n1, seg.e1, epsg);
      const w2 = toWGS(seg.n2, seg.e2, epsg);
      if (!w1 || !w2) continue;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [w1.lon, w1.lat, seg.z1 || 0],
            [w2.lon, w2.lat, seg.z1 || 0],
          ],
        },
        properties: {
          layer:    seg.layerName,
          lc:       seg.lc,
          geomType: seg.gt === 2 ? 'Line' : 'Arc',
        },
      });
    }

    return {
      type: 'FeatureCollection',
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
      },
      features,
    };
  }

  // ── Dosya indir ───────────────────────────────────────────────
  function downloadJSON(obj, filename) {
    const blob = new Blob(
      [JSON.stringify(obj, null, 2)],
      { type: 'application/geo+json' }
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Export fonksiyonu ─────────────────────────────────────────
  function exportGeoJSON() {
    if (store.points.length === 0 && store.segments.length === 0) {
      NCZViewer.ui.toast('Dışa aktarılacak veri yok', 'err', 2000);
      return;
    }

    NCZViewer.ui.loading(true);
    setTimeout(() => {
      try {
        const gj       = buildGeoJSON();
        const ptCount  = gj.features.filter(f => f.geometry.type === 'Point').length;
        const lnCount  = gj.features.filter(f => f.geometry.type === 'LineString').length;
        const baseName = store.filename.replace(/\.ncz$/i, '') || 'ncz_export';
        downloadJSON(gj, `${baseName}.geojson`);
        NCZViewer.ui.toast(`✓ ${ptCount} nokta + ${lnCount} çizgi → GeoJSON`, 'ok', 3000);
      } catch (err) {
        console.error('[geojson-export] Hata:', err);
        NCZViewer.ui.toast('GeoJSON hatası: ' + err.message, 'err', 4000);
      }
      NCZViewer.ui.loading(false);
    }, 30);
  }

  // ── Buton handler'larını bağla ─────────────────────────────────
  function bindButtons() {
    ['ej-d', 'ej-m'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn && !btn.dataset.exportBound) {
        btn.addEventListener('click', exportGeoJSON);
        btn.dataset.exportBound = '1';
        // Aktif olmadan önce style ver
        btn.style.cursor = 'pointer';
      }
    });
  }

  // ── Modül kaydı ───────────────────────────────────────────────
  NCZViewer.registerModule({
    name: 'geojson-export',

    init(api) {
      console.log('[geojson-export] Yüklendi');
      // DOM hazır olunca butonları bağla
      bindButtons();
    },

    onDataCleared() {
      store.points   = [];
      store.segments = [];
      store.filename = '';
    },
  });

  // ── Veri toplama event'leri ────────────────────────────────────
  // Noktaları sakla
  NCZViewer.events.on('v1:points:parsed', ({ points, epsg, filename }) => {
    store.points  = points || [];
    store.epsg    = epsg || '5254';
    store.filename = filename || '';
    // Butonlar showLayerUI'dan sonra DOM'da görünür
    setTimeout(bindButtons, 200);
  });

  // Çizgi segmentlerini sakla
  // lines.js modülü parse ederken bu event'i emit eder
  NCZViewer.events.on('v1:lines:parsed', ({ segments, epsg }) => {
    store.segments = segments || [];
    if (epsg) store.epsg = epsg;
  });

  // lines.js kendi event'ini emit etmiyorsa, buf'tan biz parse ederiz
  // v1:points:parsed event'indeki buf'u kullan
  NCZViewer.events.on('v1:points:parsed', ({ buf, epsg }) => {
    if (!buf) return;
    // NCZParserV1 mevcut değilse atla
    if (!window.NCZParserV1) return;

    try {
      const a  = new Uint8Array(buf);
      const v  = new DataView(buf);
      const lt = NCZParserV1.readLayerTable(buf);
      const segs = [];
      const TR = {253:'ı',240:'ğ',254:'ş',221:'İ',208:'Ğ',222:'Ş',
                  246:'ö',214:'Ö',252:'ü',220:'Ü',231:'ç',199:'Ç'};

      const BLOCK_TOTAL = { 2: 106, 4: 101 };  // 5=Text skip
      let pos = 0;

      while (pos < buf.byteLength - 8) {
        if (a[pos] !== 0x15 || a[pos+3] !== 0 || a[pos+4] !== 0 || a[pos+5] !== 0) {
          pos++; continue;
        }
        const gt   = a[pos + 6];
        const base = pos + 7;

        if (gt === 2 || gt === 4) {  // 2=Line, 4=Arc (5=Text!)
          const lc = a[base];
          const n  = v.getFloat64(base + 1, true);  // n1
          const e  = v.getFloat64(base + 9, true);
          const z  = v.getFloat32(base + 17, true);

          if (Number.isFinite(n) && n > 3_500_000 && n < 5_500_000 &&
              Number.isFinite(e) && e > 10_000   && e < 990_000) {
            // Name oku
            let name = '';
            for (let i = 0; i < 21; i++) {
              const c = a[base + 80 + i];
              if (c === 0) break;
              if (TR[c]) { name += TR[c]; continue; }
              if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) ||
                  (c >= 97 && c <= 122) || c === 32 || c === 45 || c === 95) {
                name += String.fromCharCode(c);
              } else break;
            }
            const n2off = gt === 2 ? 79 : 59;  // gt=2→Line,gt=4→Arc
            const e2off = gt === 2 ? 87 : 67;
            const n2 = v.getFloat64(base + n2off, true);
            const e2 = v.getFloat64(base + e2off, true);
            if (!Number.isFinite(n2) || n2 < 3_500_000 || n2 > 5_500_000) continue;
            segs.push({ lc, layerName: lt[lc] || `LC_${lc}`, gt,
              n1: n, e1: e, z1: z, n2, e2, pos });
          }
          pos += BLOCK_TOTAL[gt] || 101;
        } else if (gt === 1) {
          pos += 109;
        } else {
          let found = -1;
          for (let i = pos + 1; i < Math.min(pos + 3000, a.length - 7); i++) {
            if (a[i] === 0x15 && a[i+3] === 0 && a[i+4] === 0 && a[i+5] === 0) {
              found = i; break;
            }
          }
          pos = found > pos ? found : pos + 1;
        }
      }

      store.segments = segs;
      console.log(`[geojson-export] ${segs.length} segment saklandı`);
    } catch (err) {
      console.warn('[geojson-export] Segment parse hatası:', err);
    }
  });

  console.log('[geojson-export] Modül hazır');
})();
