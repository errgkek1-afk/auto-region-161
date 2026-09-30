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
  var SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?/~';

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

  /* --- data-reveal: строки поднимаются из-под наклона по очереди --- */
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
      // После выезда возвращаем исходный текст — переносы строк снова живые
      last.onfinish = function () { el.innerHTML = original; };
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

  /* --- data-count: цифры-барабаны и перебор подписи --- */
  function count(el) {
    onEnter(el, 0.85, function () {
      var num = el.querySelector('[data-count-num]');
      var cap = el.querySelector('[data-count-text]');
      if (num) roll(num);
      if (cap) scramble(cap);
    });
  }

  // Каждая цифра — столбик из 11 цифр, который прокручивается на полный круг
  // и встаёт на ту же цифру. Размеры в em, чтобы не зависеть от размера шрифта.
  function roll(el) {
    var text = el.textContent;
    var cs = getComputedStyle(el);
    var fs = parseFloat(cs.fontSize);
    var lh = (parseFloat(cs.lineHeight) || fs * 1.2) / fs;
    var k = 0, last;
    el.textContent = '';
    el.style.display = 'inline-flex';
    text.split('').forEach(function (ch) {
      var s = document.createElement('span');
      if (!/\d/.test(ch)) {
        s.style.whiteSpace = 'pre';
        s.textContent = ch;
        el.appendChild(s);
        return;
      }
      s.textContent = ch; // замер ширины именно этой цифры
      el.appendChild(s);
      var w = s.getBoundingClientRect().width / fs;
      var col = document.createElement('span');
      col.className = 'dv-reel__col';
      col.style.lineHeight = lh + 'em';
      for (var i = 0; i <= 10; i++) {
        var c = document.createElement('span');
        c.style.height = lh + 'em';
        c.textContent = (+ch + i) % 10;
        col.appendChild(c);
      }
      s.className = 'dv-reel';
      s.style.height = lh + 'em';
      s.style.width = w + 'em';
      s.textContent = '';
      s.appendChild(col);
      last = col.animate([
        { transform: 'translateY(-' + 10 * lh + 'em)' },
        { transform: 'none' }
      ], { duration: 900, delay: k++ * 40, easing: EASE_REEL, fill: 'backwards' });
    });
    if (!last) { el.textContent = text; el.style.display = ''; return; }
    last.onfinish = function () { el.textContent = text; el.style.display = ''; };
  }

  // Буквы подписи перебирают случайные знаки акцентным цветом и встают
  // по одной слева направо; вся подпись собирается за 1,6 с
  function scramble(el) {
    var text = el.textContent;
    var chars = [];
    splitWords(el, function (word) {
      var w = document.createElement('span');
      w.className = 'dv-scramble';
      word.split('').forEach(function (ch) {
        var s = document.createElement('span');
        s.textContent = ch;
        w.appendChild(s);
        chars.push({ el: s, ch: ch });
      });
      return { outer: w };
    });
    // Ширину каждой буквы фиксируем, иначе строка дрожит от разных знаков
    chars.forEach(function (c) {
      c.el.style.width = c.el.getBoundingClientRect().width + 'px';
      c.el.style.color = 'var(--dv-accent)';
    });
    var step = 1600 / chars.length;
    var start = performance.now();
    (function tick(now) {
      var t = now - start, done = true;
      chars.forEach(function (c, i) {
        if (c.settled) return;
        if (t >= i * step) {
          c.el.textContent = c.ch;
          c.el.style.color = '';
          c.settled = true;
          return;
        }
        done = false;
        c.el.textContent = SYMBOLS[Math.random() * SYMBOLS.length | 0];
      });
      if (done) { el.textContent = text; return; }
      requestAnimationFrame(tick);
    })(start);
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
