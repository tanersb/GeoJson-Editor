/**
 * Katman Renk Değiştirme Modülü (Özel Renk Destekli v3.0)
 * ────────────────────────────────────────────────
 * Hazır paletin yanı sıra Hex kodu ve görsel seçici ile 
 * özel renk tanımlama imkanı sunar.
 */

(function () {
  'use strict';

  NCZViewer.registerModule({
    name: 'layer-color-picker',

    init(api) {
      // 1. Stil Ayarları: Modal, Inputlar ve Genişletilmiş Tasarım
      const style = document.createElement('style');
      style.innerHTML = `
        .l-dot { cursor: pointer; transition: transform 0.1s; border: 1px solid rgba(255,255,255,0.2); }
        .l-dot:hover { transform: scale(1.2); }

        #ncz-color-modal-overlay {
          position: fixed; inset: 0; z-index: 10000;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
          display: none; align-items: center; justify-content: center;
        }
        .ncz-color-card {
          background: var(--s1); border: 1px solid var(--bd2); border-radius: 12px;
          width: 300px; padding: 16px; box-shadow: 0 20px 50px var(--shadow);
        }
        .ncz-color-hd { font-size: 11px; font-weight: 700; color: var(--mt); display: flex; justify-content: space-between; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .ncz-color-close { cursor: pointer; font-size: 16px; line-height: 1; }
        
        .ncz-color-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
        .ncz-color-opt { aspect-ratio: 1; border-radius: 6px; cursor: pointer; border: 2px solid transparent; transition: 0.15s; }
        .ncz-color-opt:hover { transform: scale(1.1); border-color: #fff; }

        /* Özel Renk Bölümü */
        .ncz-custom-section { border-top: 1px solid var(--bd); pt: 16px; margin-top: 8px; padding-top: 16px; }
        .ncz-custom-row { display: flex; gap: 8px; align-items: center; }
        .ncz-hex-input { 
          flex: 1; background: var(--s2); border: 1px solid var(--bd); color: var(--tx);
          padding: 8px 10px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 12px;
        }
        .ncz-color-trigger {
          width: 36px; height: 36px; border-radius: 6px; border: 1px solid var(--bd);
          cursor: pointer; padding: 0; overflow: hidden; background: none;
        }
        .ncz-color-trigger::-webkit-color-swatch-wrapper { padding: 0; }
        .ncz-color-trigger::-webkit-color-swatch { border: none; }
        .ncz-apply-btn {
          width: 100%; margin-top: 12px; background: var(--acc2); color: #fff;
          padding: 8px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer;
        }
      `;
      document.head.appendChild(style);

      // 2. Modal Yapısı
      const modalHtml = `
        <div id="ncz-color-modal-overlay">
          <div class="ncz-color-card">
            <div class="ncz-color-hd">
              <span>Renk Paleti</span>
              <span class="ncz-color-close" id="ncz-color-close">✕</span>
            </div>
            <div class="ncz-color-grid" id="ncz-color-grid"></div>
            
            <div class="ncz-custom-section">
              <div class="ncz-color-hd">Özel Renk (Hex)</div>
              <div class="ncz-custom-row">
                <input type="color" class="ncz-color-trigger" id="ncz-custom-picker">
                <input type="text" class="ncz-hex-input" id="ncz-hex-val" placeholder="#FFFFFF" maxlength="7">
              </div>
              <button class="ncz-apply-btn" id="ncz-color-apply">Rengi Uygula</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);

      const overlay = document.getElementById('ncz-color-modal-overlay');
      const grid = document.getElementById('ncz-color-grid');
      const hexInput = document.getElementById('ncz-hex-val');
      const customPicker = document.getElementById('ncz-custom-picker');
      const applyBtn = document.getElementById('ncz-color-apply');
      let currentActiveLC = null;

      const PALETTE = [
        '#4ade80', '#22c55e', '#60a5fa', '#3b82f6', '#2563eb', 
        '#fbbf24', '#f59e0b', '#f87171', '#ef4444', '#dc2626', 
        '#a78bfa', '#8b5cf6', '#f472b6', '#db2777', '#06b6d4'
      ];

      // 3. Renk Güncelleme
      const updateLayerColor = (lc, newColor) => {
        if (!/^#[0-9A-F]{6}$/i.test(newColor)) {
            api.ui.toast('Geçersiz Hex kodu!', 'err');
            return;
        }
        const layerInfo = api.layers.get(lc);
        if (!layerInfo) return;

        layerInfo.color = newColor;
        if (layerInfo.group) {
          layerInfo.group.eachLayer(ly => {
            if (ly.setStyle) ly.setStyle({ color: newColor, fillColor: newColor });
          });
        }
        // Sidebar güncelleme
        document.querySelectorAll('.litem').forEach(item => {
            const layerName = item.querySelector('.lname').textContent;
            if(layerName === layerInfo.name) item.querySelector('.l-dot').style.background = newColor;
        });
        api.ui.toast(`${layerInfo.name} güncellendi`, 'ok', 800);
      };

      // 4. Etkileşimler
      customPicker.oninput = (e) => hexInput.value = e.target.value.toUpperCase();
      hexInput.oninput = (e) => customPicker.value = e.target.value;

      applyBtn.onclick = () => {
        updateLayerColor(currentActiveLC, hexInput.value);
        overlay.style.display = 'none';
      };

      const openModal = (lc) => {
        currentActiveLC = lc;
        const currentField = api.layers.get(lc);
        const startCol = currentField ? currentField.color : '#FFFFFF';
        
        hexInput.value = startCol.toUpperCase();
        customPicker.value = startCol;
        grid.innerHTML = '';
        
        PALETTE.forEach(color => {
          const opt = document.createElement('div');
          opt.className = 'ncz-color-opt';
          opt.style.background = color;
          opt.onclick = () => {
            updateLayerColor(currentActiveLC, color);
            overlay.style.display = 'none';
          };
          grid.appendChild(opt);
        });
        overlay.style.display = 'flex';
      };

      document.getElementById('ncz-color-close').onclick = () => overlay.style.display = 'none';
      overlay.onclick = (e) => { if(e.target === overlay) overlay.style.display = 'none'; };

      const bindClicks = () => {
        document.querySelectorAll('.litem').forEach(item => {
          const dot = item.querySelector('.l-dot');
          if (!dot || dot.dataset.bound) return;
          dot.onclick = (e) => {
            e.stopPropagation();
            const layerName = item.querySelector('.lname').textContent;
            const entry = api.layers.all().find(en => en[1].name === layerName);
            if (entry) openModal(entry[0]);
          };
          dot.dataset.bound = "true";
        });
      };

      const observer = new MutationObserver(bindClicks);
      ['ll-d', 'll-m'].forEach(id => {
        const el = document.getElementById(id);
        if (el) observer.observe(el, { childList: true });
      });

      bindClicks();
    }
  });
})();