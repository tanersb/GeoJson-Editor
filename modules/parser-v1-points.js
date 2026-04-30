/**
 * NCZ v1 Parser — Nokta (Point) Modülü
 * ─────────────────────────────────────
 * Kaynak: Tutorial.NCZ.Reader (Türker Akbulut) + binary analiz
 *
 * NCZ v1 Binary Yapısı:
 *   Her geometri bloğu:
 *   [0x15][?][?][0x00][0x00][0x00][geomType] ← 7 byte header
 *   [payload]                                  ← geomType'a göre değişir
 *
 * Point (geomType=1) payload = 108 byte:
 *   base+0  : LC      (1 byte)  — Layer kodu
 *   base+1  : X       (8 byte)  — Northing (UTM Kuzey)
 *   base+9  : Y       (8 byte)  — Easting  (UTM Doğu)
 *   base+17 : Z       (4 byte)  — Yükseklik (Float32 olarak düzeltildi)
 *   base+21 : skip    (59 byte) — Font/stil bilgisi, atlanır
 *   base+80 : Name    (21 byte) — Null-terminated, Türkçe destekli
 *
 * Layer tablosu:
 *   offset=279, adım=219, LC index=sıra numarası
 *
 * Kullanım:
 *   <script src="modules/parser-v1.js"></script>
 *   (NCZViewer core'dan sonra yüklenmeli)
 */

(function () {
  'use strict';

  // ── Türkçe karakter tablosu ───────────────────────────────────
  const TR = {
    253: 'ı', 240: 'ğ', 254: 'ş',
    221: 'İ', 208: 'Ğ', 222: 'Ş',
    246: 'ö', 214: 'Ö', 252: 'ü',
    220: 'Ü', 231: 'ç', 199: 'Ç',
  };

  // ── Türkçe destekli string okuyucu ────────────────────────────
  // Non-printable karakterde DURUR (garbage eklememek için)
  function readStr(bytes, offset, maxLen) {
    let s = '';
    for (let i = 0; i < maxLen; i++) {
      const c = bytes[offset + i];
      if (c === 0) break;
      if (TR[c]) {
        s += TR[c];
      } else if (c >= 32 && c < 127) {
        s += String.fromCharCode(c);
      } else {
        break; // non-printable → layer adı bitti, dur
      }
    }
    return s.trim();
  }

  // ── Nokta isim okuyucu (font byte'larında dur) ─────────────────
  // NCZ name alanında gerçek isimden sonra font/stil byte'ları gelir.
  // Alfanümerik + [/ - _ . boşluk] + Türkçe dışında durunca kes.
  function readName(bytes, base) {
    let s = '';
    for (let i = 0; i < 21; i++) {
      const c = bytes[base + 80 + i];
      if (c === 0) break;
      if (TR[c]) {
        s += TR[c];
      } else if (
        (c >= 48 && c <= 57) ||   // 0-9
        (c >= 65 && c <= 90) ||   // A-Z
        (c >= 97 && c <= 122) ||  // a-z
        c === 47 || c === 45 ||   // / -
        c === 95 || c === 46 ||   // _ .
        c === 32                  // boşluk
      ) {
        s += String.fromCharCode(c);
      } else {
        break; // font byte'ı → isim bitti
      }
    }
    return s.trim();
  }

  // ── Koordinat geçerlilik kontrolü ─────────────────────────────
  // Türkiye ve çevresi için geniş UTM aralığı
  function isValidUTM(x, y) {
    return (
      Number.isFinite(x) && Number.isFinite(y) &&
      x > 3_500_000 && x < 5_500_000 &&  // Northing
      y > 10_000   && y < 990_000         // Easting
    );
  }

  // ── User Layer Table tespiti ──────────────────────────────────
  // NCZ, kullanıcı tanımlı katman isimlerini ayrı bir bölümde saklar.
  // Format: 29-byte sabit entry'ler, offset+4=0xfd marker
  // Sıra numarası = LC kodu, isim null-padded ASCII
  function findUserLayerTable(a) {
    const ENTRY = 29;
    // 2 ardışık entry pattern: her birinin offset+4 = 0xfd
    for (let i = 0; i < a.length - ENTRY * 2; i++) {
      if (a[i + 4] === 0xfd && a[i + 4 + ENTRY] === 0xfd) {
        const nl = a[i + 8];
        if (nl < 1 || nl > 20) continue;
        // İsim ASCII olmalı
        let ok = true;
        for (let k = 0; k < nl; k++) {
          if (a[i + 9 + k] < 32 || a[i + 9 + k] > 126) { ok = false; break; }
        }
        if (ok) return i; // user table başlangıcı
      }
    }
    return -1;
  }

  // ── Layer tablosu okuyucu ─────────────────────────────────────
  // Önce kullanıcı tanımlı tabloyu dene, yoksa standart tabloyu kullan.
  // Standart tablo: offset=279, adım=219, LC=sıra numarası
  // User tablo: 29-byte entry, sıra=LC
  function readLayerTable(buf) {
    const a  = new Uint8Array(buf);
    const lt = {};  // lc → isim

    // Önce user layer table'ı dene
    const userStart = findUserLayerTable(a);
    if (userStart >= 0) {
      const ENTRY = 29;
      for (let lc = 0; lc < 300; lc++) {
        const pos = userStart + lc * ENTRY;
        if (pos + 9 >= a.length) break;
        const nl = a[pos + 8];
        if (nl === 0) continue;
        if (nl > 20) break;  // geçersiz → tablo bitti
        const name = readStr(a, pos + 9, nl);
        if (name.length >= 1) lt[lc] = name;
      }
      if (Object.keys(lt).length > 0) return lt;
    }

    // Standart layer tablosu (offset=279, adım=219)
    const START = 279;
    const STEP  = 219;
    for (let i = 0; i < 300; i++) {
      const pos = START + i * STEP;
      if (pos + 5 >= a.length) break;
      const name = readStr(a, pos, 40);
      if (name.length >= 2) lt[i] = name;
    }
    return lt;
  }

  // ── v1 format tespiti ──────────────────────────────────────────
  // v1: header'da 'netcad' string YOK
  // v2: header'da 'netcad' string VAR (~131. byte'da)
  function isV1Format(buf) {
    const a = new Uint8Array(buf);
    const sig = [0x6E, 0x65, 0x74, 0x63, 0x61, 0x64]; // 'netcad'
    for (let i = 100; i < Math.min(300, a.length - 6); i++) {
      if (sig.every((b, k) => a[i + k] === b)) return false; // v2
    }
    return true; // v1
  }

  // ── Geometri header tespiti ────────────────────────────────────
  // Pattern: byte=21(0x15), [+3]=0, [+4]=0, [+5]=0
  function isGeomHeader(a, pos) {
    return (
      pos + 7 < a.length &&
      a[pos]     === 0x15 &&
      a[pos + 3] === 0x00 &&
      a[pos + 4] === 0x00 &&
      a[pos + 5] === 0x00
    );
  }

  // ── Nokta blokları tarayıcı ────────────────────────────────────
  // Tüm geomType=1 (Point) bloklarını bulur ve parse eder.
  function parsePoints(buf) {
    const v  = new DataView(buf);
    const a  = new Uint8Array(buf);
    const lt = readLayerTable(buf);
    const points = [];

    // Geometri tipine göre blok boyutları (skip için)
    const BLOCK_SIZE = {
      1: 108,  // Point
      2: 106,  // Line
      5: 98,   // Arc
      6: 97,   // Box
    };

    let pos = 0;
    while (pos < buf.byteLength - 8) {
      if (!isGeomHeader(a, pos)) { pos++; continue; }

      const geomType = a[pos + 6];
      const base     = pos + 7;  // payload başlangıcı

      if (geomType === 1) {
        // ── POINT ────────────────────────────────────────────────
        try {
          const lc   = a[base];
          const x    = v.getFloat64(base + 1,  true); // Northing
          const y    = v.getFloat64(base + 9,  true); // Easting
          // ── DÜZELTME: Z artık Float32 olarak okunuyor ──[cite: 1]
          const z    = v.getFloat32(base + 17, true); 
          const name = readName(a, base);

          if (isValidUTM(x, y)) {
            points.push({
              gt:   1,          // geomType
              lc,               // layer code
              name,             // nokta etiketi
              x,                // Northing (UTM Y)
              y,                // Easting  (UTM X)
              z,                // yükseklik[cite: 1]
              layerName: lt[lc] || `LC_${lc}`,
            });
          }
        } catch (e) {
          // Bozuk blok → atla
        }
        pos += 7 + 108;

      } else if (BLOCK_SIZE[geomType]) {
        // Bilinen başka tip → boyutu kadar atla
        pos += 7 + BLOCK_SIZE[geomType];

      } else if (geomType === 7) {
        // Polygon → dinamik boyutlu, sadece 1 pozisyon atla
        pos++;
      } else {
        pos++;
      }
    }

    return { points, layerTable: lt };
  }

  // ── Modülü kaydet ──────────────────────────────────────────────
  NCZViewer.registerModule({
    name: 'parser-v1-points',

    init(api) {
      console.log('[parser-v1-points] Yüklendi');
    },

    onFileLoaded({ buf, filename, epsg }) {
      // Sadece v1 formatını işle
      if (!isV1Format(buf)) {
        console.log('[parser-v1-points] Bu dosya v2 formatı, atlanıyor');
        return;
      }

      NCZViewer.ui.loading(true);

      // setTimeout ile UI'ın render etmesine izin ver
      setTimeout(() => {
        try {
          const { points, layerTable } = parsePoints(buf);

          if (points.length === 0) {
            console.warn('[parser-v1-points] Nokta geometrisi bulunamadı');
            NCZViewer.ui.loading(false);
            return;
          }

          console.log(`[parser-v1-points] ${points.length} nokta parse edildi`);

          // v1:points:parsed event'ini yayınla[cite: 3]
          NCZViewer.events.emit('v1:points:parsed', {
            points,
            layerTable,
            epsg,
            filename,
            buf,
          });

        } catch (err) {
          console.error('[parser-v1-points] Parse hatası:', err);
          NCZViewer.ui.toast('Parse hatası: ' + err.message, 'err', 5000);
        }

        NCZViewer.ui.loading(false);
      }, 50);
    },
  });

  // Parser yardımcılarını dışa aç (diğer modüller kullanabilir)[cite: 3]
  window.NCZParserV1 = {
    isV1Format,
    readLayerTable,
    readStr,
    readName,
    isValidUTM,
    isGeomHeader,
    BLOCK_SIZE: { 1: 108, 2: 106, 5: 98, 6: 97 },
  };

  console.log('[parser-v1-points] Modül hazır');
})();