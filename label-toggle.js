/**
 * Nokta İsimleri Kontrol Modülü (v1.1)
 * ─────────────────────────────────────
 * - Standart olarak KAPALI başlar.
 * - İkon bir nokta ve etiketi temsil eder.
 */

(function () {
  'use strict';

  NCZViewer.registerModule({
    name: 'label-toggle',

    init(api) {
      // 1. Durum Takibi (Varsayılan: Kapalı)
      let showLabels = false;
      const styleId = 'ncz-hide-labels-style';
      
      // 2. Varsayılan olarak etiketleri gizle (CSS enjekte et)
      const hideStyle = document.createElement('style');
      hideStyle.id = styleId;
      hideStyle.innerHTML = '.ncz-pname { display: none !important; }';
      document.head.appendChild(hideStyle);

      // 3. Topbar Butonu (Nokta ve Etiket İkonu)
      const btnHtml = `
        <button class="ibtn" id="labelToggleBtn" title="Nokta İsimlerini Göster/Gizle" style="color:var(--tx2)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="12" r="3" fill="currentColor"></circle>
            <line x1="12" y1="9" x2="20" y2="9"></line>
            <line x1="12" y1="15" x2="18" y2="15"></line>
          </svg>
        </button>
      `;
      
      api.ui.addTopbarBtn(btnHtml);

      // 4. Buton Tıklama Mantığı
      const btn = document.getElementById('labelToggleBtn');
      
      btn.addEventListener('click', function() {
        showLabels = !showLabels;
        
        let styleEl = document.getElementById(styleId);
        
        if (showLabels) {
          // GÖSTER: CSS kuralını kaldır
          if (styleEl) styleEl.remove();
          this.style.color = 'var(--acc2)'; // Aktif (Mavi/Vurgulu) renk
          api.ui.toast('Nokta isimleri açıldı', 'ok', 1500);
        } else {
          // GİZLE: CSS kuralını geri ekle
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.innerHTML = '.ncz-pname { display: none !important; }';
            document.head.appendChild(styleEl);
          }
          this.style.color = 'var(--tx2)'; // Pasif (Gri) renk
          api.ui.toast('Nokta isimleri kapatıldı', 'info', 1500);
        }
      });

      console.log('[label-toggle] Modülü hazır (Varsayılan: Gizli)');
    }
  });

})();