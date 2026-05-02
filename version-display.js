/**
 * Netcad Dosya Sürümü Gösterici Modülü (v1.3)
 * ─────────────────────────────────────
 * Yazıyı sağ taraftan alıp, sol taraftaki Viewer sürümünün yanına taşır.
 */

(function () {
  'use strict';

  NCZViewer.registerModule({
    name: 'version-display',

    init(api) {
      // Yazıyı sağdaki butonlara değil, soldaki brand (marka) kısmına ekliyoruz
      const target = document.querySelector('.brand-sub');
      if (!target) return;

      // Viewer sürümünün yanına ayraç ve NCZ versiyon alanını ekle
      const versionHtml = `
        <span id="nczVersionContainer" style="margin-left:8px; padding-left:8px; border-left:1px solid var(--bd); display:inline-flex; align-items:center;">
          <span style="opacity:0.5; font-size:9px; margin-right:4px;">NCZ:</span>
          <span id="nczVersionText" style="font-weight:700; color:var(--acc2); font-size:9px;">—</span>
        </span>
      `;
      
      target.insertAdjacentHTML('beforeend', versionHtml);
    },

    onFileLoaded({ buf }) {
      try {
        const view = new Uint8Array(buf.slice(0, 2000)); 
        const content = new TextDecoder('latin1').decode(view);
        const match = content.match(/\d+\.\d+\.\d+\.\d+/); // Netcad versiyon formatı[cite: 1, 2]

        const textEl = document.getElementById('nczVersionText');
        if (textEl) {
          textEl.textContent = match ? match[0] : "v1/Legacy";
          textEl.style.color = match ? 'var(--acc2)' : 'var(--mt)';
        }
      } catch (err) {
        console.error('[version-display] Hata:', err);
      }
    },

    onDataCleared() {
      const textEl = document.getElementById('nczVersionText');
      if (textEl) textEl.textContent = '—';
    }
  });

  console.log('[version-display] Modülü sol tarafa yerleştirildi');
})();