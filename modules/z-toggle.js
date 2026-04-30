/**
 * Kot (Z) Değerleri Kontrol Modülü
 * ─────────────────────────────────────
 * - Standart olarak KAPALI başlar.
 * - İkon Kot/Yükseklik sembolüdür.
 */

(function () {
  'use strict';

  NCZViewer.registerModule({
    name: 'z-toggle',

    init(api) {
      const styleId = 'ncz-hide-z-style';
      let showZ = false;

      // 1. Varsayılan olarak kotları gizle
      const hideStyle = document.createElement('style');
      hideStyle.id = styleId;
      hideStyle.innerHTML = `
        .ncz-pz { display: none !important; }
        .ncz-lbl { text-align: center; line-height: 1.2; }
      `;
      document.head.appendChild(hideStyle);

      // 2. Topbar Butonu (Z/Yükseklik İkonu)
      const btnHtml = `
        <button class="ibtn" id="zToggleBtn" title="Kotları Göster/Gizle" style="color:var(--tx2)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10h-8m8 4h-8m8 4h-8M3 6v14m0 0h4m-4 0l7-14v14h4"></path>
          </svg>
        </button>
      `;
      
      api.ui.addTopbarBtn(btnHtml);

      // 3. Tıklama Mantığı
      const btn = document.getElementById('zToggleBtn');
      btn.addEventListener('click', function() {
        showZ = !showZ;
        let styleEl = document.getElementById(styleId);

        if (showZ) {
          if (styleEl) styleEl.remove();
          this.style.color = 'var(--warn)'; // Kotlar için sarımtırak vurgu
          api.ui.toast('Kot değerleri açıldı', 'ok', 1500);
        } else {
          if (!styleEl) {
            const s = document.createElement('style');
            s.id = styleId;
            s.innerHTML = '.ncz-pz { display: none !important; }';
            document.head.appendChild(s);
          }
          this.style.color = 'var(--tx2)';
          api.ui.toast('Kot değerleri kapatıldı', 'info', 1500);
        }
      });
    }
  });
})();