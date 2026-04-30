/**
 * Katman Listesi Etkileşim Modülü
 */

(function () {
  'use strict';

  NCZViewer.registerModule({
    name: 'layer-zoom',
    init(api) {
      const style = document.createElement('style');
      style.innerHTML = `
        .lname { cursor: pointer !important; }
        .lname:hover { color: var(--acc2) !important; text-decoration: underline; }
        .l-active-btn {
          margin-left: 6px; width: 20px; height: 20px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--mt); opacity: 0.1; transition: 0.2s;
        }
        .litem:hover .l-active-btn { opacity: 0.5; }
        .litem.is-active-row .l-active-btn { opacity: 1; color: var(--acc) !important; }
        .litem.is-active-row { background: rgba(74, 222, 128, 0.05); }
      `;
      document.head.appendChild(style);

      const injectTickButtons = () => {
        document.querySelectorAll('.litem').forEach(item => {
          if (item.querySelector('.l-active-btn')) return;
          
          const tick = document.createElement('div');
          tick.className = 'l-active-btn';
          tick.title = 'Aktif katman yap';
          tick.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="3" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          
          tick.addEventListener('click', (e) => {
            e.stopPropagation();
            const layerName = item.querySelector('.lname').textContent;
            const entry = api.layers.all().find(en => en[1].name === layerName);
            // add-point modülündeki fonksiyonu çağır
            if (entry && typeof api.setActiveLayer === 'function') {
              api.setActiveLayer(entry[0]);
            }
          });

          item.appendChild(tick);
        });
      };

      api.events.on('ui:active-layer-changed', (activeLc) => {
        document.querySelectorAll('.litem').forEach(item => {
          const layerName = item.querySelector('.lname').textContent;
          const entry = api.layers.all().find(en => en[1].name === layerName);
          item.classList.toggle('is-active-row', entry && entry[0] === activeLc.toString());
        });
      });

      const handleNameClick = (e) => {
        const nameEl = e.target.closest('.lname');
        if (!nameEl) return;
        const entry = api.layers.all().find(en => en[1].name === nameEl.textContent);
        if (entry && typeof api._zoomToLayer === 'function') api._zoomToLayer(entry[0]);
      };

      const observer = new MutationObserver(injectTickButtons);
      ['ll-d', 'll-m'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          observer.observe(el, { childList: true });
          el.addEventListener('click', handleNameClick);
        }
      });

      injectTickButtons();
    }
  });
})();