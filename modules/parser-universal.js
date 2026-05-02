/**
 * NCZ Universal Parser (DLL Logic Based) - v1.0
 * ──────────────────────────────────────────────
 * Netcad.Data.NCZ.DLL mantığını temel alır.
 * Hem v1 Binary (0x15 header) hem de v8 XML-hibrit yapılarını tarar.
 */

(function () {
  'use strict';

  NCZViewer.registerModule({
    name: 'parser-universal',

    init(api) {
      console.log('[Universal Parser] DLL mantığı ile başlatıldı');
    },

    onFileLoaded({ buf, epsg, filename }) {
      const v = new DataView(buf);
      const a = new Uint8Array(buf);
      const points = [];
      const lines = []; // Gelecekteki çizgi desteği için
      const layerTable = window.NCZParserV1 ? NCZParserV1.readLayerTable(buf) : { 0: "ANA_KATMAN" };
      
      let pos = 0;
      const totalSize = buf.byteLength;

      // DLL'deki NczDataReader mantığı: Dosyayı bir akış (stream) olarak tara
      while (pos < totalSize - 32) {
        
        // 1. MANTIK: Klasik v1 Header Taraması (0x15...gt)[cite: 12]
        if (a[pos] === 0x15 && v.getUint32(pos + 3, true) === 0) {
          const gt = a[pos + 6];
          const lc = a[pos + 7];
          
          if (gt === 1) { // Nokta
            const x = v.getFloat64(pos + 8, true);
            const y = v.getFloat64(pos + 16, true);
            const z = v.getFloat64(pos + 24, true);
            if (this.isValidUTM(x, y)) {
              points.push({ gt, lc, x, y, z, layerName: layerTable[lc] || `LC_${lc}`, name: `P_${pos}` });
            }
          }
          else if (gt === 3) { // Daire (Önceki lines.js mantığı burada)[cite: 10]
            const nx = v.getFloat64(pos + 8, true);
            const ex = v.getFloat64(pos + 16, true);
            const rad = v.getFloat64(pos + 24, true);
            if (this.isValidUTM(nx, ex)) {
              // Daireleri de nokta listesine "Daire" tipiyle ekle
              points.push({ gt, lc, x: nx, y: ex, rad, isCircle: true, layerName: layerTable[lc] || `LC_${lc}` });
            }
          }
        }

        // 2. MANTIK: Modern v8 Koordinat Taraması (Raw Double Pattern)[cite: 13]
        // Netcad 8 dosyalarında koordinatlar bazen header olmadan ham double dizisi olarak gelir.
        const d1 = v.getFloat64(pos, true);
        const d2 = v.getFloat64(pos + 8, true);
        
        if (this.isValidUTM(d1, d2)) {
          // Eğer bu koordinat çifti zaten bir v1 objesi olarak yakalanmadıysa ekle
          if (!points.some(p => Math.abs(p.x - d1) < 0.001 && Math.abs(p.y - d2) < 0.001)) {
            points.push({
              gt: 1, lc: 0, x: d1, y: d2, z: 0,
              layerName: "MODERN_V8_VERISI",
              name: "V8_P"
            });
          }
          pos += 12; // Koordinat bloğunu atla
        }

        pos += 4; // 4 byte kaydırarak hassas tarama yap
      }

      // Sonuçları sisteme gönder
      if (points.length > 0) {
        NCZViewer.events.emit('v1:points:parsed', {
          points,
          layerTable,
          epsg,
          filename,
          buf
        });
        NCZViewer.ui.toast(`✓ Toplam ${points.length} evrensel obje yüklendi`, 'ok');
      }
    },

    isValidUTM(x, y) {
      // DLL'deki Envelope/World limitleri mantığı[cite: 13]
      return (x > 3500000 && x < 5500000 && y > 10000 && y < 990000);
    }
  });
})();