/**
 * KML ve CSV Dışa Aktarma Modülü
 * ────────────────────────────────────────────
 * Sidebar'daki KML (ek-d, ek-m) ve CSV (ec-d, ec-m) 
 * butonlarını işlevsel hale getirir.
 */

(function () {
  'use strict';

  const store = {
    points: [],
    segments: [],
    epsg: '5254',
    filename: 'ncz_export'
  };

  // Koordinat Dönüştürücü (WGS84)
  function toWGS(n, e, epsg) {
    try {
      const [lon, lat] = proj4('EPSG:' + epsg, 'EPSG:4326', [e, n]);
      return isFinite(lat) && isFinite(lon) ? { lat, lon } : null;
    } catch (_) { return null; }
  }

  // --- KML ÜRETİCİ ---
  function buildKML() {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${store.filename}</name>
    <open>1</open>`;

    // Noktaları Ekle
    store.points.forEach(pt => {
      const wgs = toWGS(pt.x, pt.y, store.epsg);
      if (!wgs) return;
      kml += `
    <Placemark>
      <name>${pt.name || ''}</name>
      <description>Katman: ${pt.layerName}\nZ: ${pt.z || 0}</description>
      <Point>
        <coordinates>${wgs.lon},${wgs.lat},${pt.z || 0}</coordinates>
      </Point>
    </Placemark>`;
    });

    // Çizgileri Ekle
    store.segments.forEach(seg => {
      const w1 = toWGS(seg.n1, seg.e1, store.epsg);
      const w2 = toWGS(seg.n2, seg.e2, store.epsg);
      if (!w1 || !w2) return;
      kml += `
    <Placemark>
      <name>${seg.layerName}</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${w1.lon},${w1.lat},${seg.z1 || 0}
          ${w2.lon},${w2.lat},${seg.z1 || 0}
        </coordinates>
      </LineString>
    </Placemark>`;
    });

    kml += `\n  </Document>\n</kml>`;
    return kml;
  }

  // --- CSV ÜRETİCİ (Nokta Listesi) ---
  function buildCSV() {
    let csv = "\uFEFF"; // Excel Türkçe karakter desteği (BOM)
    csv += "Nokta Adi;Y(Kuzey);X(Dogu);Z(Kot);Katman\n";

    store.points.forEach(pt => {
      csv += `${pt.name || ''};${pt.x.toFixed(3)};${pt.y.toFixed(3)};${(pt.z || 0).toFixed(3)};${pt.layerName}\n`;
    });
    return csv;
  }

  // Dosya İndirme Fonksiyonu
  function downloadFile(content, ext, type) {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.filename.replace(/\.[^/.]+$/, "")}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Modül Kaydı
  NCZViewer.registerModule({
    name: 'kml-csv-export',
    init(api) {
      // Butonları Bağla
      const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.onclick = fn;
      };

      bind('ek-d', () => downloadFile(buildKML(), 'kml', 'application/vnd.google-earth.kml+xml'));
      bind('ek-m', () => downloadFile(buildKML(), 'kml', 'application/vnd.google-earth.kml+xml'));
      bind('ec-d', () => downloadFile(buildCSV(), 'csv', 'text/csv;charset=utf-8'));
      bind('ec-m', () => downloadFile(buildCSV(), 'csv', 'text/csv;charset=utf-8'));
    },
    onDataCleared() {
      store.points = [];
      store.segments = [];
    }
  });

  // Veri Dinleyicileri
  NCZViewer.events.on('v1:points:parsed', (data) => {
    store.points = data.points || [];
    store.epsg = data.epsg || '5254';
    store.filename = data.filename || 'export';
    // Çizgiler ayrı event ile gelir; burada sıfırlayarak eski dosyadan kalanları temizle.
    store.segments = [];
  });

  NCZViewer.events.on('v1:lines:parsed', (data) => {
    store.segments = data.segments || [];
    if (data.epsg) store.epsg = data.epsg;
    if (data.filename) store.filename = data.filename;
  });

})();