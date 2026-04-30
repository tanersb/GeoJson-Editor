/**
 * Manuel Nokta Ekleme Modülü (v2.3 - Kesin Çözüm)
 * ────────────────────────────────────────────────
 * - image_ba7878.jpg'deki "btn is not defined" hatası giderildi.
 * - Nokta sayısı dinamik olarak artar.
 * - Popup yapısı orijinal NCZ ile tam uyumludur.
 */

(function () {
  'use strict';

  NCZViewer.registerModule({
    name: 'add-point',

    init(api) {
      let isAdding = false;
      let nextPointName = "P1";
      const DEFAULT_LC = 999;
      const DEFAULT_NAME = 'Yeni Noktalar';

      // İsim artırma mantığı
      function getNextAutoName(currentName) {
        const match = currentName.match(/(.*?)(\d+)$/);
        if (match) {
          const prefix = match[1];
          const num = parseInt(match[2], 10);
          return prefix + (num + 1);
        }
        return currentName + "1";
      }

      // 1. Sidebar ve Dropdown Hazırlığı
      api.ui.addSidebarSection(`
        <div class="sec">
          <div class="sec-t">Düzenleme Ayarları</div>
          <label style="font-size:10px; color:var(--mt); margin-bottom:4px; display:block;">Aktif Katman:</label>
          <select id="activeLayerSelect" style="margin-bottom: 8px; width: 100%;">
            <option value="${DEFAULT_LC}">${DEFAULT_NAME}</option>
          </select>
        </div>
      `);

      // 2. Topbar Butonu
      const btnHtml = `
        <button class="ibtn" id="addPointBtn" title="Aktif Katmana Nokta Ekle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14"></path>
            <circle cx="12" cy="12" r="1" fill="currentColor"></circle>
          </svg>
        </button>
      `;
      api.ui.addTopbarBtn(btnHtml);

      // --- DÜZELTME: Değişkenleri butonu ekledikten hemen sonra tanımlıyoruz ---
      const btn = document.getElementById('addPointBtn');
      const layerSelect = document.getElementById('activeLayerSelect');

      // 3. Aktif Katman Değiştirme Fonksiyonu
      api.setActiveLayer = (lc) => {
        if (!layerSelect) return;
        layerSelect.value = lc;
        api.events.emit('ui:active-layer-changed', lc);
        const selectedName = layerSelect.options[layerSelect.selectedIndex]?.text || "Bilinmiyor";
        api.ui.toast(`Aktif Katman: ${selectedName}`, 'ok', 1000);
      };

      // 4. Katman Listesini Doldur
      api.events.on('v1:points:parsed', ({ layerTable }) => {
        layerSelect.innerHTML = `<option value="${DEFAULT_LC}">${DEFAULT_NAME}</option>`;
        Object.entries(layerTable)
          .sort((a, b) => a[1].localeCompare(b[1]))
          .forEach(([lc, name]) => {
            const opt = document.createElement('option');
            opt.value = lc;
            opt.textContent = name;
            layerSelect.appendChild(opt);
          });
      });

      // 5. Modu Aç/Kapat
      if (btn) {
        btn.addEventListener('click', () => {
          isAdding = !isAdding;
          btn.style.color = isAdding ? 'var(--acc)' : '';
          btn.style.borderColor = isAdding ? 'var(--acc)' : '';
          api.map.getContainer().style.cursor = isAdding ? 'crosshair' : '';
          api.ui.toast(isAdding ? 'Nokta ekleme aktif' : 'Nokta ekleme kapalı', 'info');
        });
      }

      // 6. Haritaya Tıklama
      api.map.on('click', (e) => {
        if (!isAdding) return;

        const name = prompt("Nokta Adı:", nextPointName);
        if (name === null) return;

        const zStr = prompt("Kot (Z):", "0.00");
        const z = parseFloat(zStr) || 0;

        const utm = api.calcUTM(e.latlng);
        if (!utm) return;

        const pt = {
          gt: 1,
          lc: parseInt(layerSelect.value),
          name: name,
          x: utm.N, y: utm.E, z: z,
          layerName: layerSelect.options[layerSelect.selectedIndex].text
        };

        addPointToLayer(pt, e.latlng);
        nextPointName = getNextAutoName(name);
      });

      function addPointToLayer(pt, latlng) {
        let layerInfo = api.layers.get(pt.lc);
        if (!layerInfo) {
          layerInfo = api.layers.register(pt.lc, pt.layerName, L.layerGroup().addTo(api.map));
          layerInfo.count = 0; // Yeni katman için sayaç başlat
        }

        // Dinamik Sayaç Artışı
        layerInfo.count = (layerInfo.count || 0) + 1;

        const marker = L.circleMarker(latlng, {
          radius: 4, color: layerInfo.color, fillColor: layerInfo.color,
          fillOpacity: 0.85, weight: 1.2
        }).addTo(layerInfo.group);

        // Etiket Yapısı
        const labelHtml = `<div class="ncz-lbl-wrapper">
          <div class="ncz-pname">${pt.name}</div>
          ${Math.abs(pt.z) > 0.001 ? `<div class="ncz-pz">${pt.z.toFixed(2)}</div>` : ''}
        </div>`;

        marker.bindTooltip(labelHtml, { permanent: true, direction: 'center', className: 'ncz-lbl-transparent', opacity: 1 });
        
        // Popup ve Butonlar (image_ba7c8e.png ile tam uyumlu)
        const copyStr = `Y: ${pt.x.toFixed(3)}, X: ${pt.y.toFixed(3)} (EPSG:${api.getEpsg()})`;
        const copyB64 = btoa(unescape(encodeURIComponent(copyStr)));

        const rows = `
          <tr><td>Katman</td><td>${pt.layerName}</td></tr>
          <tr><td>Geometri</td><td>Nokta</td></tr>
          <tr><td>Metin</td><td>${pt.name}</td></tr>
          <tr><td>Y (Kuzey)</td><td>${pt.x.toFixed(3)}</td></tr>
          <tr><td>X (Doğu)</td><td>${pt.y.toFixed(3)}</td></tr>
          ${Math.abs(pt.z) > 0.001 ? `<tr><td>Z</td><td>${pt.z.toFixed(3)}</td></tr>` : ''}
        `;

        marker.bindPopup(`<div>
          <div class="pop-hd">Öznitelikler</div>
          <table class="pop-tbl"><tbody>${rows}</tbody></table>
          <div class="pop-actions">
            <button class="pop-btn" title="Katmana git" onclick="NCZViewer._zoomToLayer(${pt.lc})">🔍</button>
            <button class="pop-btn" title="Kopyala" onclick="NCZViewer._copyB64(this,'${copyB64}')">📋</button>
            <button class="pop-btn" title="Gizle" onclick="NCZViewer.layers.setVisible(${pt.lc},false);NCZViewer.ui.refreshLayerLists();NCZViewer.map.closePopup();">👁</button>
          </div>
        </div>`, { maxWidth: 280 });

        // Listeyi anlık güncelle
        api.ui.refreshLayerLists();
      }
    }
  });
})();