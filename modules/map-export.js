/**
 * Harita Görüntüsü Dışa Aktarma Modülü (Gelişmiş v2.1)
 * ────────────────────────────────────────────────
 * Uydu ve Topo gibi altlıklar varken noktaların ve 
 * yazıların resimde çıkmasını garanti eder.
 */

(function () {
  'use strict';

  NCZViewer.registerModule({
    name: 'map-export',

    init(api) {
      const btnHtml = `
        <button class="ibtn" id="exportPngBtn" title="Görüntüyü Kaydet (PNG)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
        </button>
      `;
      api.ui.addTopbarBtn(btnHtml);

      const btn = document.getElementById('exportPngBtn');

      btn.onclick = async () => {
        api.ui.loading(true);
        api.ui.toast('Görüntü işleniyor...', 'info', 1500);

        try {
          const mapEl = document.getElementById('map');
          
          // Önemli: Uydu/Topo görüntüleri için CORS izni gerekir. 
          // Eğer tamamen çevrimdışıysanız bu resimler zaten boş çıkacaktır.
          const canvas = await html2canvas(mapEl, {
            useCORS: true, 
            allowTaint: false,
            logging: false,
            scale: 2, // Daha yüksek çözünürlük için
            backgroundColor: '#0a0d14',
            ignoreElements: (el) => {
              // Sadece butonları ve tabları gizle, verileri gizleme[cite: 3]
              return el.classList.contains('leaflet-control-container') || 
                     el.classList.contains('map-tabs');
            }
          });

          const link = document.createElement('a');
          const date = new Date().toISOString().slice(0,10);
          link.download = `NCZ_Cikti_${date}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();

          api.ui.toast('Görüntü başarıyla kaydedildi.', 'ok', 2000);
        } catch (err) {
          console.error('[map-export] Hata:', err);
          api.ui.toast('Görüntü oluşturulamadı.', 'err');
        } finally {
          api.ui.loading(false);
        }
      };
    }
  });
})();