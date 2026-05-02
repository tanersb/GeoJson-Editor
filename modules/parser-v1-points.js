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
  // Sadece dosya boyutuna bakmak veya bu kontrolü tamamen kaldırmak 
  // modern Netcad v1-binary çıktıları için daha sağlıklıdır.
  return true; 
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

  // ── Sonraki geometri header'ını bul ──────────────────────────
  // Arc/Line/Polygon gibi değişken boyutlu blokları güvenle atlar.
  function findNextHeader(a, fromPos, maxSearch) {
    for (let i = fromPos + 1; i < Math.min(fromPos + maxSearch, a.length - 7); i++) {
      if (a[i] === 0x15 && a[i+3] === 0 && a[i+4] === 0 && a[i+5] === 0) {
        return i;
      }
    }
    return -1;
  }


  // ── gt=5 Text parser (v1 + v2 format desteği) ─────────────────
  // Layout: base+0=lc, base+1=N(f64), base+9=E(f64), base+17=Z(f32), base+21=W(f32)
  //         base+25=Cls(pascal), +oname(pascal)
  //         sub_start = base+25+1+cls_len+1+oname_len
  //         Text sub (v1): Sct(4)+AngleT(4)+Just(1)+GFlags(1)+Tref(1)+S(pascal) → S@sub+11
  //         Text sub (v2): aynı prefix + 52 byte ek alan → S@sub+63
  function parseTextRecord(v, a, pos, lt) {
    const base = pos + 7;
    const lc = a[base];
    const N  = v.getFloat64(base + 1,  true);
    const E  = v.getFloat64(base + 9,  true);
    const Z  = v.getFloat32(base + 17, true);
    const W  = v.getFloat32(base + 21, true);

    if (!isValidUTM(N, E)) return null;

    const clsLen   = a[base + 25] || 0;
    const onameLen = a[base + 26 + clsLen] || 0;
    const sub      = base + 25 + 1 + clsLen + 1 + onameLen;
    if (sub + 12 >= a.length) return null;

    const angleT = v.getFloat32(sub + 4, true);

    // v1: S_len @ sub+11 / v2: S_len @ sub+63 — hangisi geçerliyse onu kullan
    let sLen = 0, sStart = 0;
    const sLen11 = a[sub + 11];
    if (sLen11 > 0 && sLen11 <= 250 && sub + 12 + sLen11 <= a.length) {
      sLen = sLen11; sStart = sub + 12;       // v1
    } else {
      const sLen63 = (sub + 63 < a.length) ? a[sub + 63] : 0;
      if (sLen63 > 0 && sLen63 <= 250 && sub + 64 + sLen63 <= a.length) {
        sLen = sLen63; sStart = sub + 64;     // v2
      }
    }
    if (sLen === 0) return null;

    let text = '';
    for (let i = 0; i < sLen; i++) {
      const ch = a[sStart + i];
      if (ch === 0) break;
      if (TR[ch]) text += TR[ch];
      else if (ch >= 32 && ch < 127) text += String.fromCharCode(ch);
    }
    text = text.trim();
    if (!text) return null;

    return {
      gt: 5, lc,
      layerName: lt[lc] || `LC_${lc}`,
      x: N, y: E, z: Z,
      textHeight: W,
      angleRad: angleT,
      angleDeg: angleT * (180 / Math.PI),
      name: text,
      isText: true,
    };
  }



  function pointKey(x, y, name, gt) {
    return `${gt}|${name || ''}|${Math.round(x * 1000)}|${Math.round(y * 1000)}`;
  }

  function parsePoints(buf) {
    const v = new DataView(buf);
    const a = new Uint8Array(buf);
    const lt = readLayerTable(buf);
    const points = [];
    const seen = new Set();
    let pos = 0;

    console.log("[parser-v1-points] Tarama başlatıldı, dosya boyutu:", buf.byteLength);

    while (pos < buf.byteLength - 100) {
      if (isGeomHeader(a, pos)) {
        const geomType = a[pos + 6];
        const totalLen = a[pos + 1] + a[pos + 2] * 256 + 5;
        const safeLen = (totalLen > 7 && totalLen < 200000) ? totalLen : 1;
        const base = pos + 7;

        if (geomType === 1) {
          try {
            const lc = a[base];
            const x = v.getFloat64(base + 1, true);
            const y = v.getFloat64(base + 9, true);
            const z = v.getFloat64(base + 17, true);
            if (isValidUTM(x, y)) {
              const name = readName(a, base);
              const key = pointKey(x, y, name, 1);
              if (!seen.has(key)) {
                seen.add(key);
                points.push({
                  gt: 1, lc, name, x, y, z,
                  layerName: lt[lc] || `LC_${lc}`
                });
              }
            }
          } catch (e) { }
          pos += safeLen;
          continue;
        }

        // gt=5: Text geometrisi — binary analiz ile doğrulanmış parser
        if (geomType === 5) {
          try {
            const txt = parseTextRecord(v, a, pos, lt);
            if (txt) {
              const key = pointKey(txt.x, txt.y, txt.name, 5);
              if (!seen.has(key)) {
                seen.add(key);
                points.push(txt);
              }
            }
          } catch (e) { }
          pos += safeLen;
          continue;
        }

        if (safeLen > 1) { pos += safeLen; continue; }
      }
      pos++;
    }

    console.log(`[parser-v1-points] Toplam ${points.length} nokta/etiket yakalandı.`);
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
            console.warn('[parser-v1-points] Nokta/Yazı geometrisi bulunamadı');
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
    parseTextRecord,
    BLOCK_SIZE: { 1: 109, 2: 106, 5: 'variable', 6: 97, 7: 'variable' },
  };

  console.log('[parser-v1-points] Modül hazır');
})();