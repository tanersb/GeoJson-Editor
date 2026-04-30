/**
 * Manuel Nokta Ekleme Modülü (v1.9)
 * ────────────────────────────────────────────────
 * - Akıllı isimlendirme (P1, P2...) destekli.
 * - Aktif katman seçimi için api.setActiveLayer sunar.
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

      // İsim artırma fonksiyonu
      function getNextAutoName(currentName) {
        const match = currentName.match(/(.*?)(\d+)$/);
        if (match) {
          const prefix = match[1];
          const num = parseInt(match[2], 10);
          return prefix + (num + 1);
        }
        return currentName + "1";
      }

      // 1. Yan Menü Arayüzü
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

      const btn = document.getElementById('addPointBtn');
      const layerSelect = document.getElementById('activeLayerSelect');

      // 3. KRİTİK: Dış modüllerin (layer-zoom gibi) kullanacağı fonksiyon
      api.setActiveLayer = (lc) => {
        if (!layerSelect) return;
        layerSelect.value = lc;
        // Görsel güncellemeyi tetikle
        api.events.emit('ui:active-layer-changed', lc);
        const selectedName = layerSelect.options[layerSelect.selectedIndex]?.text || "Bilinmiyor";
        api.ui.toast(`Aktif Katman: ${selectedName}`, 'ok', 1000);
      };

      // 4. Katman Listesi Güncelleme
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
      btn.addEventListener('click', () => {
        isAdding = !isAdding;
        btn.style.color = isAdding ? 'var(--acc)' : '';
        btn.style.borderColor = isAdding ? 'var(--acc)' : '';
        api.map.getContainer().style.cursor = isAdding ? 'crosshair' : '';
        api.ui.toast(isAdding ? 'Nokta ekleme aktif' : 'Nokta ekleme kapalı', 'info');
      });

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
          api.ui.refreshLayerLists();
        }

        const marker = L.circleMarker(latlng, {
          radius: 4, color: layerInfo.color, fillColor: layerInfo.color,
          fillOpacity: 0.85, weight: 1.2
        }).addTo(layerInfo.group);

        let labelHtml = `<div class="ncz-lbl-wrapper">
          <div class="ncz-pname">${pt.name}</div>
          ${Math.abs(pt.z) > 0.001 ? `<div class="ncz-pz">${pt.z.toFixed(2)}</div>` : ''}
        </div>`;

        marker.bindTooltip(labelHtml, { permanent: true, direction: 'center', className: 'ncz-lbl-transparent', opacity: 1 });
        
        marker.bindPopup(`
          <div class="pop-hd">Manuel Nokta</div>
          <table class="pop-tbl">
            <tr><td>Katman</td><td>${pt.layerName}</td></tr>
            <tr><td>Ad</td><td>${pt.name}</td></tr>
            <tr><td>Y (N)</td><td>${pt.x.toFixed(3)}</td></tr>
            <tr><td>X (E)</td><td>${pt.y.toFixed(3)}</td></tr>
            <tr><td>Z</td><td>${pt.z.toFixed(3)}</td></tr>
          </table>
        `);
      }
    }
  });
})();