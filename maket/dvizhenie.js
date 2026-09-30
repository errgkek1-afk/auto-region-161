/* =====================================================================
   ГОЛУБАЯ ТЯЖЕСТЬ — движение. Четыре приёма с deepbook.tech без библиотек.
   Каждый включается пометкой в разметке:
     data-reveal   — заголовок выезжает строками с лёгким наклоном
     data-stagger  — дети блока появляются по очереди снизу
     data-count    — цифры прокручиваются барабаном, подпись перебирается
     data-divider  — два квадратика разъезжаются по линии за прокруткой
   Разметка каждого — в INDEX.md рядом. Стили — в dvizhenie.css.
   ===================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var STILL = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Человек выключил анимации в системе — показываем страницу как есть
  if (STILL || !('IntersectionObserver' in window) || !Element.prototype.animate) {
    root.classList.remove('dv');
    return;
  }

  var EASE_HEAVY = 'cubic-bezier(.65, 0, .35, 1)';
  var EASE_EXHALE = 'cubic-bezier(.19, 1, .22, 1)';
  var EASE_REEL = 'cubic-bezier(.215, .61, .355, 1)';

  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // Один раз, когда верх элемента поднялся выше доли экрана `at` (0.85 = 85% сверху).
  // Элементы, которые уже проскочили выше экрана (открыли страницу с середины), тоже запускаются.
  function onEnter(el, at, fn) {
    var io = new IntersectionObserver(function (entries) {
      var e = entries[0];
      if (!e.isIntersecting && e.boundingClientRect.bottom > 0) return;
      io.disconnect();
      fn(el);
    }, { rootMargin: '0px 0px -' + Math.round((1 - at) * 100) + '% 0px' });
    io.observe(el);
  }

  // Режет текст на слова, не ломая вложенную разметку (<br>, <span class="accent">).
  // Неразрывный пробел слова не делит: «в&nbsp;день» остаётся одним куском.
  function splitWords(el, make) {
    var words = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 1 && n.tagName !== 'BR') { walk(n); return; }
        if (n.nodeType !== 3) return;
        var frag = document.createDocumentFragment();
        n.textContent.split(/([ \t\r\n\f]+)/).forEach(function (part) {
          if (!part) return;
          if (/^[ \t\r\n\f]+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var w = make(part);
          words.push(w);
          frag.appendChild(w.outer);
        });
        node.replaceChild(frag, n);
      });
    })(el);
    return words;
  }

  /* --- data-reveal: строки поднимаются из-под наклона по очереди ---
     Слова кладутся в отдельные блоки, и это чуть меняет ширину строки (у
     каждого слова свой трекинг). Но происходит это в момент, когда заголовок
     ещё невидим (его прячет правило .dv [data-reveal]:not(.is-in)), поэтому
     перестроения никто не видит. А вот возвращать сплошной текст в конце
     нельзя: там заголовок уже на виду, и он сдвигается на доли точки -
     на широком экране до четырёх. Поэтому разметку после выезда не трогаем,
     а исходный текст возвращаем только при смене ширины окна, когда переносы
     всё равно считаются заново. */
  function reveal(el) {
    onEnter(el, 0.85, function () {
      var original = el.innerHTML;
      var words = splitWords(el, function (text) {
        var s = document.createElement('span');
        s.className = 'dv-w';
        s.textContent = text;
        return { outer: s, inner: s };
      });
      if (!words.length) { el.classList.add('is-in'); return; }
      // Номер строки считаем по высоте слова на экране: так работает при любой ширине
      var line = -1, lastTop = -Infinity, last;
      words.forEach(function (w) {
        var top = w.inner.getBoundingClientRect().top;
        if (top > lastTop + 2) { line++; lastTop = top; }
        last = w.inner.animate([
          { transform: 'perspective(600px) translateY(100%) rotateX(-45deg)', opacity: 0 },
          { transform: 'none', opacity: 1 }
        ], { duration: 940, delay: line * 80, easing: EASE_EXHALE, fill: 'backwards' });
      });
      el.classList.add('is-in');
      last.onfinish = function () {
        var vernut = function () {
          window.removeEventListener('resize', vernut);
          window.removeEventListener('orientationchange', vernut);
          el.innerHTML = original;
        };
        window.addEventListener('resize', vernut);
        window.addEventListener('orientationchange', vernut);
      };
    });
  }

  /* --- data-stagger: дети блока встают по очереди, шаг 0,1 с --- */
  function stagger(el) {
    onEnter(el, 0.8, function () {
      Array.prototype.forEach.call(el.children, function (child, i) {
        child.animate([
          { opacity: 0, transform: 'translateY(24px)' },
          { opacity: 1, transform: 'none' }
        ], { duration: 400, delay: i * 100, easing: EASE_HEAVY, fill: 'backwards' });
      });
      el.classList.add('is-in');
    });
  }

  /* --- data-count: цифра просто появляется ---
     Раньше здесь крутился барабан из цифр, а подпись перебирала случайные
     знаки. Оба приёма подменяли разметку: барабан выше и шире обычного текста,
     у букв подписи фиксировалась ширина. Строка со счётчиком прыгала на
     полтора десятка точек вбок, карточка гарантии дёргалась на четыре сотни
     вниз. Решение Eugene 30.09: пусть цифра просто появляется. Разметку
     не трогаем вообще - двигать нечему, прыгать нечему. */
  function count(el) {
    onEnter(el, 0.85, function () {
      el.classList.add('is-in');
      var deti = [el.querySelector('[data-count-num]'), el.querySelector('[data-count-text]')];
      deti.forEach(function (x, i) {
        if (!x) return;
        x.animate([
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'none' }
        ], { duration: 560, delay: i * 120, easing: EASE_HEAVY, fill: 'backwards' });
      });
    });
  }

  /* --- data-divider: квадратики из центра к краям, с запаздыванием --- */
  // Путь — пока линия поднимается от низа экрана до 30% сверху. Квадратики
  // догоняют прокрутку примерно за секунду: отсюда ощущение тяжести.
  var dividers = [];
  var running = false, lastT = 0;

  function divider(el) {
    var sq = el.querySelectorAll('i');
    if (sq.length < 2) return;
    dividers.push({ el: el, a: sq[0], b: sq[1], shown: 0 });
  }

  function frame(now) {
    var dt = Math.min((now - lastT) / 1000, 0.1);
    var ease = 1 - Math.exp(-dt / 0.35);
    var vh = window.innerHeight;
    var busy = false;
    lastT = now;
    dividers.forEach(function (d) {
      var target = clamp((vh - d.el.getBoundingClientRect().top) / (vh * 0.7));
      d.shown += (target - d.shown) * ease;
      if (Math.abs(target - d.shown) > 0.001) busy = true; else d.shown = target;
      var x = (d.el.clientWidth - d.a.offsetWidth) / 2 * (1 - d.shown);
      d.a.style.transform = 'translateX(' + x + 'px)';
      d.b.style.transform = 'translateX(' + (-x) + 'px)';
    });
    if (busy) requestAnimationFrame(frame); else running = false;
  }

  function wakeDividers() {
    if (running || !dividers.length) return;
    running = true;
    lastT = performance.now();
    requestAnimationFrame(frame);
  }

  /* --- запуск --- */
  all('[data-stagger]').forEach(stagger);
  all('[data-count]').forEach(count);
  all('[data-divider]').forEach(divider);
  // Строки заголовка считаются по готовому шрифту, иначе перенос съедет
  document.fonts.ready.then(function () { all('[data-reveal]').forEach(reveal); });

  window.addEventListener('scroll', wakeDividers, { passive: true });
  window.addEventListener('resize', wakeDividers);
  wakeDividers();
})();
