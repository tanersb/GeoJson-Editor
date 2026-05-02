/**
 * Yazı Objeleri Kontrol Modülü (v1.0)
 * ─────────────────────────────────────
 * gt=5 Text geometrilerini (ncz-text-obj) gösterir/gizler.
 * Standart olarak KAPALI başlar.
 */

(function () {
  'use strict';

  NCZViewer.registerModule({
    name: 'text-toggle',

    init(api) {
      let showText = true;
      const styleId = 'ncz-hide-text-style';
      // Varsayılan: açık — CSS kuralı eklenmez

      // Topbar butonu — "T" ikonu
      const btnHtml = `
        <button class="ibtn" id="textToggleBtn" title="Yazıları Göster/Gizle" style="color:var(--acc2)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 7 4 4 20 4 20 7"></polyline>
            <line x1="9" y1="20" x2="15" y2="20"></line>
            <line x1="12" y1="4" x2="12" y2="20"></line>
          </svg>
        </button>
      `;

      api.ui.addTopbarBtn(btnHtml);

      const btn = document.getElementById('textToggleBtn');

      btn.addEventListener('click', function () {
        showText = !showText;
        let styleEl = document.getElementById(styleId);

        if (showText) {
          if (styleEl) styleEl.remove();
          this.style.color = 'var(--acc2)';
          api.ui.toast('Yazılar açıldı', 'ok', 1500);
        } else {
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.innerHTML = '.ncz-text-obj { display: none !important; }';
            document.head.appendChild(styleEl);
          }
          this.style.color = 'var(--tx2)';
          api.ui.toast('Yazılar kapatıldı', 'info', 1500);
        }
      });

      console.log('[text-toggle] v1.0 hazır (Varsayılan: Gizli)');
    }
  });

})();
