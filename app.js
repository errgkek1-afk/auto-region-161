/* =====================================================================
   РЕНДЕР И ИНТЕРАКТИВ. Растёт по мере согласования блоков.
   Тексты — в content.js, параметры — в config.js.
   ===================================================================== */
(function () {
  'use strict';

  var S = window.SITE;
  var C = window.CFG;
  var ic = window.icon;
  var PREFERS_STILL = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- утилиты ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(n) { return Math.round(n).toLocaleString('ru-RU'); }

  /* Ссылки в мессенджеры. Без номера в конфиге — «мёртвая» ссылка,
     чтобы это было заметно, а не вело в никуда. */
  function waLink(text) {
    if (!C.contacts.phone) return '#';
    var t = text || C.contacts.waText;
    return 'https://wa.me/' + C.contacts.phone + (t ? '?text=' + encodeURIComponent(t) : '');
  }
  function tgLink() { return C.contacts.telegram ? 'https://t.me/' + C.contacts.telegram : '#'; }
  function maxLink() { return C.contacts.max || '#'; }
  /* Кнопка записи: открывает окно заявки. source — откуда нажали (видно в заявке). */
  function leadBtn(cls, label, source, arrow, note) {
    return '<a class="btn ' + cls + '" href="#zapis" data-lead="' + esc(source) + '"' +
      (note ? ' data-lead-note="' + esc(note) + '"' : '') + '>' +
      esc(label) + (arrow ? ic('arrow', { size: arrow }) : '') + '</a>';
  }
  function deadAttr(href) { return href === '#' ? ' data-no-phone aria-disabled="true"' : ' target="_blank" rel="noopener"'; }

  /* {фигурные скобки} -> ярко-белым, остальной текст приглушённый.
     Так сделаны заголовки подблоков (блок 3). */
  function accent(text) {
    return esc(text).replace(/\{([^}]+)\}/g, '<span class="text-accent">$1</span>');
  }

  function lede(text) {
    return term(esc(text)
      .replace(/\{([^}]+)\}/g, '<b>$1</b>')
      .replace(/\n/g, '<br>'));         /* перенос строки внутри абзаца */
  }

  /* [[ТНВД|расшифровка]] -> термин с всплывающей подсказкой.
     На компьютере открывается наведением, на телефоне — тапом (wireTerms).
     Без модальных окон и библиотек — ТЗ §3.3. */
  function term(html) {
    return html.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, function (_, word, tip) {
      return '<button class="term" type="button" aria-expanded="false">' +
        word + '<span class="term__tip" role="tooltip">' + tip + '</span></button>';
    });
  }

  /* Картинка в двух форматах: WebP (легче примерно на треть) и запасной
     JPEG для старых браузеров. Для первого экрана есть ещё крупный кадр
     @2x — его берут только большие плотные экраны, телефон качает лёгкий.
     В CSS у <picture> стоит display: contents, поэтому вся вёрстка,
     написанная под <img>, продолжает работать как раньше. */
  function pic(src, alt, w, h, opt) {
    opt = opt || {};
    var base = esc(String(src).replace(/\.jpg$/, ''));
    var srcset = opt.x2
      ? base + '.webp 800w, ' + base + '@2x.webp 1600w'
      : base + '.webp';
    return '<picture>' +
      '<source type="image/webp" srcset="' + srcset + '"' +
        (opt.x2 ? ' sizes="(max-width: 1023px) 96vw, 50vw"' : '') + '>' +
      '<img src="' + esc(src) + '" alt="' + esc(alt || '') + '"' +
        (w && h ? ' width="' + w + '" height="' + h + '"' : '') +
        (opt.eager ? ' fetchpriority="high"' : ' loading="lazy"') +
        ' decoding="async">' +
    '</picture>';
  }

  /* Реальное фото машины или размеченная заглушка (ТЗ §3.1) */
  function photo(state, eager) {
    if (state.photo) {
      return pic(state.photo, state.photoNeed, state.w, state.h,
                 { eager: eager, x2: state.x2 });
    }
    return '<div class="photo-stub">' +
             '<span class="photo-stub__tag">' + esc(state.photoKind || 'Фото') + '</span>' +
             '<p class="photo-stub__text">' + esc(state.photoNeed) + '</p>' +
           '</div>';
  }

  /* Фото в скруглённых плашках справа от текста (блок 3).
     Одно фото — одна плашка, два — рядом. cap рисует подпись под кадром. */
  function shotsHtml(items) {
    if (!items || !items.length) return '';
    return '<div class="shots shots--' + items.length + '">' + items.map(function (x) {
      return '<figure class="shot">' +
        '<span class="shot__frame">' +
          pic(x.src, x.alt, x.w, x.h) +
        '</span>' +
        (x.cap ? '<figcaption class="shot__cap">' + esc(x.cap) + '</figcaption>' : '') +
      '</figure>';
    }).join('') + '</div>';
  }

  /* Лента фото: листается влево-вправо (свайп на телефоне, стрелки на
     десктопе). Кадры одного размера — object-fit: cover в CSS их подрежет.
     variant задаёт пропорции плитки (см. .strip--* в blocks.css). */
  function photoStrip(photos, variant) {
    if (!photos || !photos.length) return '';
    var slides = photos.map(function (ph) {
      return '<figure class="strip__item">' +
        (ph.src
          ? pic(ph.src, ph.need, ph.w, ph.h)
          : '<div class="photo-stub"><span class="photo-stub__tag">Фото</span>' +
              '<p class="photo-stub__text">' + esc(ph.need || '') + '</p></div>') +
      '</figure>';
    }).join('');
    return '<div class="strip strip--' + esc(variant) + '" data-strip>' +
      '<button class="strip__nav strip__nav--prev" type="button" aria-label="Предыдущее фото" hidden>' +
        ic('chevronL', { size: 20 }) + '</button>' +
      '<div class="strip__track">' + slides + '</div>' +
      '<button class="strip__nav strip__nav--next" type="button" aria-label="Следующее фото" hidden>' +
        ic('chevronR', { size: 20 }) + '</button>' +
    '</div>';
  }

  /* Счётчик установок: базовое + floor(прошло_суток × прирост) — ТЗ блок 1 */
  function installCount() {
    var c = C.counter;
    var since = new Date(c.since + 'T00:00:00');
    var days = Math.max(0, Math.floor((Date.now() - since.getTime()) / 86400000));
    return c.base + Math.floor(days * c.perDay);
  }

  /* Срок и подпись к фото для состояния первого экрана */
  function termHtml(st) {
    var t = esc(st.term);
    return st.termHref ? '<a href="' + esc(st.termHref) + '">' + t + '</a>' : t;
  }
  function capHtml(st) {
    return '<span class="hero__caption-title">' + esc(st.caption) + '</span>' +
           '<span class="hero__caption-sub">' + esc(st.sub) + '</span>';
  }

  /* Смена текста «роликом»: старая строка уезжает вверх, новая приходит снизу.
     Обе строки лежат в одной ячейке grid, поэтому вёрстка не дёргается. */
  function roll(box, html) {
    var cur = box.querySelector('.roll__line');
    if (!cur) { box.innerHTML = '<span class="roll__line">' + html + '</span>'; return; }
    if (cur.innerHTML === html || box.dataset.busy === '1') return;

    /* вкладка скрыта или анимации выключены — меняем сразу, без езды */
    if (document.hidden || PREFERS_STILL.matches) {
      box.innerHTML = '<span class="roll__line">' + html + '</span>';
      return;
    }

    box.dataset.busy = '1';

    var next = document.createElement('span');
    next.className = 'roll__line roll__line--enter';
    next.innerHTML = html;
    box.appendChild(next);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        cur.classList.add('roll__line--leave');
        next.classList.remove('roll__line--enter');
      });
    });

    /* Таймер — главный: даже если rAF не сработал, новая строка
       гарантированно останется видимой. */
    setTimeout(function () {
      cur.remove();
      next.classList.remove('roll__line--enter', 'roll__line--leave');
      box.dataset.busy = '0';
    }, 600);
  }

  /* Резервируем высоту под самый высокий из вариантов — тогда при смене
     строки блок не меняет размер и текст не «прыгает». */
  function reserveHeight(box, variants) {
    var probe = document.createElement('span');
    probe.className = 'roll__line';
    probe.style.cssText = 'position:absolute;left:0;top:0;width:100%;visibility:hidden;pointer-events:none';
    box.appendChild(probe);
    var max = 0;
    variants.forEach(function (html) { probe.innerHTML = html; max = Math.max(max, probe.offsetHeight); });
    probe.remove();
    box.style.minHeight = max + 'px';
  }

  /* Открыто ли сейчас — по графику из конфига, в часовом поясе сервиса */
  function isOpenNow() {
    var sc = C.schedule;
    if (!sc) return null;
    var d = new Date(new Date().toLocaleString('en-US', { timeZone: sc.tz }));
    if (sc.days.indexOf(d.getDay()) === -1) return false;
    var mins = d.getHours() * 60 + d.getMinutes();
    return mins >= sc.from && mins < sc.to;
  }

  /* =====================  ШАПКА  ===================== */
  function renderHeader() {
    var links = S.nav.map(function (l) {
      return '<li><a href="' + esc(l.href) + '">' + esc(l.label) + '</a></li>';
    }).join('');
    var mobileLinks = S.nav.map(function (l) {
      return '<a href="' + esc(l.href) + '" data-close-menu>' + esc(l.label) + '</a>';
    }).join('');

    var phone = C.contacts.phoneDisplay
      ? '<a class="header__phone" href="tel:+' + esc(C.contacts.phone) + '">' +
          ic('phone', { size: 15 }) + esc(C.contacts.phoneDisplay) + '</a>'
      : '';

    return '' +
    '<header class="header" id="site-header">' +
      '<div class="wrap header__inner">' +
        '<a class="logo" href="#top" aria-label="' + esc(S.brand.name) + '">' +
          '<picture>' +
            '<source type="image/webp" srcset="img/logo.webp?v=2 320w, img/logo@2x.webp?v=2 640w" sizes="200px">' +
            '<img class="logo__img" src="img/logo.png?v=2" alt="' + esc(S.brand.name) + '" ' +
              'width="1673" height="840" fetchpriority="high" decoding="async">' +
          '</picture>' +
          '<span class="logo__sub">' + esc(S.brand.tagline) + '</span>' +
        '</a>' +
        '<nav class="nav"><ul style="display:flex;gap:24px">' + links + '</ul></nav>' +
        '<div class="header__side">' +
          '<span class="header__hours" id="work-status"><span class="header__dot"></span>' + esc(S.hours) + '</span>' +
          phone +
          leadBtn('btn--soft btn--sm header__cta', S.headerCta, 'шапка') +
          '<button class="burger" id="burger" aria-label="Меню" aria-expanded="false" aria-controls="mobile-menu">' + ic('menu', { size: 20 }) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="mobile-menu" id="mobile-menu">' +
        mobileLinks +
        leadBtn('btn--cta mobile-menu__cta', S.hero.cta, 'меню', 18) +
      '</div>' +
    '</header>';
  }

  /* =====================  БЛОК 1 — Первый экран  ===================== */
  function renderHero() {
    var h = S.hero;

    var hooks = h.hooks.map(function (x) {
      return '<li class="hero__hook' + (x.split ? ' hero__hook--split' : '') + '">' + ic(x.icon, { size: 18 }) +
        '<p><b>' + esc(x.title) + '</b> <span>' + esc(x.text) + '</span></p></li>';
    }).join('');

    var slides = h.states.map(function (st, i) {
      return '<div class="hero__slide' + (i === 0 ? ' is-active' : '') +
        '" data-slide="' + esc(st.key) + '">' + photo(st, i === 0) + '</div>';
    }).join('');

    return '' +
    '<section class="hero" id="top">' +

      /* слой 1 — кирпичная стена гаража */
      '<div class="hero__scene" aria-hidden="true">' +
        '<div class="scene__wall"></div>' +
        '<div class="scene__shade"></div>' +
      '</div>' +

      /* слой 2 — контент, две симметричные колонки */
      '<div class="wrap hero__inner">' +

        '<div class="hero__text">' +
          '<h1 class="hero__title">' + esc(h.title) +
            '<span class="hero__engines">' + esc(h.engines) + '</span>' +
          '</h1>' +
          '<p class="hero__term roll" id="hero-term" aria-live="polite">' +
            '<span class="roll__line">' + termHtml(h.states[0]) + '</span></p>' +
          '<ul class="hero__hooks">' + hooks + '</ul>' +
          '<div class="hero__actions">' +
            leadBtn('btn--cta', h.cta, 'первый экран', 18) +
            '<p class="hero__counter">' +
              '<b id="hero-counter">' + fmt(installCount()) + '</b>' +
              '<span>' + esc(h.counterLabel) + '</span>' +
            '</p>' +
          '</div>' +
        '</div>' +

        '<div class="hero__media">' +
          '<div class="roll" id="hero-caption" aria-live="polite">' +
            '<span class="roll__line">' + capHtml(h.states[0]) + '</span></div>' +
          '<figure class="hero__photo">' + slides + '</figure>' +
        '</div>' +

      '</div>' +
    '</section>';
  }

  /* =====================  БЛОК 2 — Бегущая строка  ===================== */
  function renderClients() {
    var c = S.clients;
    var row = c.names.map(function (n) {
      return '<span class="clients__item">' + esc(n) + '</span>';
    }).join('');
    /* Список повторяем, чтобы группа была заведомо шире экрана,
       и делаем две одинаковые группы — тогда лента идёт по кругу
       без разрыва и без пустого хвоста. */
    var group = '<div class="clients__group">' + row + row + row + '</div>';
    return '<section class="clients">' +
      '<div class="clients__strip">' +
        '<div class="clients__track" id="clients-track">' + group + group + '</div>' +
      '</div>' +
      '<p class="clients__note wrap">' + esc(c.note) + '</p>' +
    '</section>';
  }

  /* =====================  БЛОК 3 — Настройка ГБО  ===================== */
  function panelHtml(i) {
    var b = S.tuning.subblocks[i];

    var groups = (b.blocks || []).map(function (g) {
      return '<div class="panel__group">' +
        (g.h ? '<span class="panel__h">' + esc(g.h) + '</span>' : '') +
        '<p class="panel__text">' + lede(g.text) + '</p>' +
      '</div>';
    }).join('');

    /* Две панели вместо сплошных абзацев: слева тип впрыска, справа второй,
       под каждой — счётчик машин. Читается взглядом, а не абзацами. */
    var cards = '';
    if (b.cards && b.cards.length) {
      cards = '<div class="panel__cards-wrap">' +
        (b.cardsLead ? '<span class="panel__cards-lead">' + esc(b.cardsLead) + '</span>' : '') +
        '<div class="panel__cards">' + b.cards.map(function (c) {
          return '<div class="panel__card">' +
            '<span class="panel__card-h">' + esc(c.h) + '</span>' +
            (c.sub ? '<span class="panel__card-sub">' + esc(c.sub) + '</span>' : '') +
            '<p class="panel__card-text">' + lede(c.text) + '</p>' +
            (c.note ? '<p class="panel__card-note">' + esc(c.note) + '</p>' : '') +
            (c.count ? '<span class="panel__count">' + esc(c.count) + '</span>' : '') +
          '</div>';
        }).join('') + '</div>' +
        (b.cardsOut ? '<p class="panel__cards-out">' + esc(b.cardsOut) + '</p>' : '') +
      '</div>';
    }

    var revUrl = (C.yandex && C.yandex.reviews) || '';
    var revTag = (b.review && b.review.link && revUrl) ? 'a' : 'div';
    var revAttr = revTag === 'a'
      ? ' href="' + revUrl + '" target="_blank" rel="noopener" title="Открыть отзыв на Яндекс.Картах"'
      : '';
    var review = b.review ? '<' + revTag + ' class="panel__review' + (revTag === 'a' ? ' is-link' : '') + '"' + revAttr + '>' +
        '<div class="review__stars">' + [0,1,2,3,4].map(function(){return ic('star',{size:14});}).join('') + '</div>' +
        '<p class="review__text">«' + esc(b.review.text) + '»</p>' +
        '<div class="review__who">' +
          '<span class="review__avatar">' + esc(b.review.name.charAt(0)) + '</span>' +
          '<span><b class="review__name">' + esc(b.review.name) + '</b>' +
          '<span class="review__meta">' + esc(b.review.meta) + '</span></span>' +
          (revTag === 'a' ? '<span class="review__go">' + ic('arrow', { size: 15 }) + '</span>' : '') +
        '</div>' +
      '</' + revTag + '>' : '';

    var ctas = b.ctas.map(function (x) {
      return leadBtn('btn--cta', x.label, 'блок «' + b.tab + '»', 16);
    }).join('');

    /* Строка-вывод и сноска лежат отдельно от колонки — во всю ширину,
       чтобы влезали в одну строку и не жались в половину экрана. */
    /* Строка-вывод, сноска и кнопки идут во всю ширину под колонками:
       так они влезают в одну строку, а человек читает вывод и сноску
       прямо перед тем, как нажать кнопку. */
    var foot = '<div class="panel__foot">' +
        (b.accentLine ? '<p class="panel__accent">' + esc(b.accentLine) + '</p>' : '') +
        (b.note ? '<p class="panel__note">' + esc(b.note) + '</p>' : '') +
        '<div class="panel__ctas">' + ctas + '</div>' +
      '</div>';

    /* Подблок с панелями идёт в одну колонку во всю ширину: две панели
       рядом внутри половины экрана были бы слишком узкими для чтения. */
    var body = (groups || review || b.heading)
      ? '<div class="panel__body">' +
          (b.heading ? '<h3 class="panel__heading">' + esc(b.heading) + '</h3>' : '') +
          groups +
          review +
        '</div>'
      : '';

    var hasShots = !!(b.shots && b.shots.length);
    return '<div class="panel' + (cards ? ' panel--cards' : '') +
      (hasShots ? ' panel--shots' : '') + '" data-panel="' + esc(b.key) + '">' +
      body +
      cards +
      '<div class="panel__media">' +
        (b.shots && b.shots.length
          ? shotsHtml(b.shots)
          : '<figure class="panel__figure">' + photo(b, false) + '</figure>') +
      '</div>' +
      foot +
    '</div>';
  }

  function renderTuning() {
    var t = S.tuning;
    var tabs = t.subblocks.map(function (b, i) {
      return '<button class="tab' + (i === 0 ? ' is-active' : '') +
        '" data-tab="' + i + '" id="tuning-' + esc(b.key) + '">' + esc(b.tab) + '</button>';
    }).join('');

    return '<section class="tuning" id="tuning"><div class="wrap">' +
      '<h2 class="tuning__title">' + accent(t.title) + '</h2>' +
      '<div class="tabs" role="tablist">' + tabs + '</div>' +
      '<div class="tuning__stage">' +
        '<button class="tuning__arrow tuning__arrow--prev" id="tuning-prev" aria-label="Предыдущий">' + ic('chevronL', { size: 30 }) + '</button>' +
        '<div id="tuning-panel">' + panelHtml(0) + '</div>' +
        '<button class="tuning__arrow tuning__arrow--next" id="tuning-next" aria-label="Следующий">' + ic('chevronR', { size: 30 }) + '</button>' +
      '</div>' +
    '</div></section>';
  }

  /* =====================  БЛОК 4 — Сравнение подходов  ===================== */
  function renderCompare() {
    var c = S.compare;

    var rows = c.rows.map(function (r) {
      return '<div class="compare__row">' +
        '<span class="compare__them" data-label="' + esc(c.headThem) + '">' + ic('cross', { size: 15 }) + '<span>' + esc(r.them) + '</span></span>' +
        '<span class="compare__us" data-label="' + esc(c.headUs) + '">' + ic('check', { size: 15 }) + '<span>' + lede(r.us) + '</span></span>' +
      '</div>';
    }).join('');

    var photos = c.photos.map(function (ph) {
      return '<figure class="compare__figure">' +
        photo({ photo: ph.src || null, photoKind: ph.kind, photoNeed: ph.need, w: ph.w, h: ph.h }, false) +
      '</figure>';
    }).join('');

    return '<section class="compare" id="compare"><div class="wrap">' +
      '<h2 class="compare__title">' + accent(c.title) + '</h2>' +
      (c.sub ? '<p class="compare__sub">' + esc(c.sub) + '</p>' : '') +
      '<div class="compare__grid">' +
        '<div class="compare__table">' +
          '<div class="compare__head"><span>' + esc(c.headThem) + '</span><span>' + esc(c.headUs) + '</span></div>' +
          rows +
          '<p class="compare__closing">' + esc(c.closing) + '</p>' +
        '</div>' +
        '<div class="compare__photos">' + photos + '</div>' +
      '</div>' +
    '</div></section>';
  }

  /* =====================  БЛОК 5 — Калькулятор  ===================== */
  /* Поле-ползунок: печатать ничего не надо, значение видно сразу */
  function slider(id, f, cfg) {
    return '<div class="slider">' +
      '<div class="slider__top">' +
        '<span class="slider__label">' + esc(f.label) + '</span>' +
        '<span class="slider__value"><b id="' + id + '-val">' + fmt(cfg.value) + '</b> ' + esc(f.unit) + '</span>' +
      '</div>' +
      '<input id="' + id + '" class="range" type="range" min="' + cfg.min + '" max="' + cfg.max +
        '" step="' + cfg.step + '" value="' + cfg.value + '" aria-label="' + esc(f.label) + '">' +
    '</div>';
  }

  /* заливка пройденной части ползунка */
  function paintRange(el) {
    var min = +el.min, max = +el.max;
    var pct = max > min ? ((+el.value - min) / (max - min)) * 100 : 0;
    el.style.background = 'linear-gradient(to right, var(--accent) 0 ' + pct + '%, #241a1c ' + pct + '% 100%)';
  }

  function renderCalc() {
    var c = S.calc, w = S.warranty, R = c.results;

    var acc = c.accordion.map(function (a, i) {
      var body = a.items
        ? '<ul class="acc__list">' + a.items.map(function (it) {
            return '<li>' + ic('check', { size: 15 }) + '<span><b>' + esc(it.b) + '</b>' +
              (it.t ? ' — ' + esc(it.t) : '') + '</span></li>';
          }).join('') + '</ul>'
        : '<p class="acc__text">' + esc(a.text) + '</p>';
      return '<div class="acc__item" data-acc="' + i + '">' +
        '<button class="acc__head" aria-expanded="false">' + esc(a.title) + ic('chevronDown', { size: 18 }) + '</button>' +
        '<div class="acc__panel"><div class="acc__inner">' + body +
          (a.closing ? '<p class="acc__closing">' + esc(a.closing) + '</p>' : '') +
        '</div></div>' +
      '</div>';
    }).join('');

    var cards = w.cards.map(function (x) {
      return '<div class="warranty__card' + (x.good ? ' is-good' : '') + '">' +
        '<span class="warranty__type">' + esc(x.type) + '</span>' +
        '<span class="warranty__km">' + esc(x.km) + '</span>' +
        '<span class="warranty__or">' + esc(x.or) + '</span>' +
      '</div>';
    }).join('');

    return '<section class="calc" id="calc"><div class="wrap">' +
      '<h2 class="calc__title">' + esc(c.title) + '</h2>' +

      '<div class="calc__grid">' +
        '<div class="calc__inputs">' +
          slider('calc-km', c.fields.mileage, C.calc.mileage) +
          slider('calc-cons', c.fields.consumption, C.calc.consumption) +
          slider('calc-petrol', c.fields.petrolPrice, C.calc.petrol) +
        '</div>' +

        '<div class="calc__side">' +
          '<div class="calc__out" id="calc-out"></div>' +
          (c.disclaimer ? '<p class="calc__disclaimer">' + esc(c.disclaimer) + '</p>' : '') +
        '</div>' +
      '</div>' +

      '<div class="acc">' + acc + '</div>' +

      '<div class="warranty">' +
        '<h3 class="warranty__title">' + esc(w.title) + '</h3>' +
        '<div class="warranty__cards">' + cards + '</div>' +
        (w.note ? '<p class="warranty__note">' + esc(w.note) + '</p>' : '') +
      '</div>' +
    '</div></section>';
  }

  /* Расчёт по формуле из ТЗ. Срок окупаемости не выводим: он считается
     от стоимости оборудования, а её на сайте нет. */
  function calcResult() {
    var km = parseFloat(document.getElementById('calc-km').value);
    var cons = parseFloat(document.getElementById('calc-cons').value);
    var petrolPrice = parseFloat(document.getElementById('calc-petrol').value);
    var litres = km * cons / 100;
    var petrol = litres * petrolPrice;
    var gas = litres * C.calc.K_RASHOD * C.calc.GAS_PRICE;
    var save = Math.max(petrol - gas, 0);
    return { km: km, cons: cons, petrol: petrol, gas: gas, save: save };
  }

  function renderCalcOut(r) {
    var c = S.calc, R = c.results;
    var out = document.getElementById('calc-out');

    /* месяц и год — одной строкой через слэш */
    var row = function (label, month) {
      return '<div class="calc__row"><span>' + esc(label) + '</span>' +
        '<b>' + fmt(month) + ' / ' + fmt(month * 12) + ' ₽</b></div>';
    };

    var calcNote = 'Мой расчёт: ' + fmt(r.km) + ' км/мес, расход ' + r.cons +
      ' л/100, экономия ' + fmt(r.save) + ' ₽/мес.';

    out.innerHTML =
      '<div class="calc__legend">в месяц / за год</div>' +
      row(R.petrol, r.petrol) +
      row(R.gas, r.gas) +
      '<div class="calc__save">' +
        '<span>' + esc(R.save) + '</span>' +
        '<b>' + fmt(r.save) + ' ₽</b>' +
        '<i>' + esc(R.saveYear) + ' — ' + fmt(r.save * 12) + ' ₽</i>' +
      '</div>' +
      leadBtn('btn--cta calc__go', c.cta.label, 'калькулятор', 16, calcNote);
  }

  /* =====================  БЛОК 6 — Мастера  ===================== */
  /* =====================  Лента фото «как док»  ===================== */
  function renderGallery() {
    var g = S.gallery;
    if (!g || !g.items || !g.items.length) return '';
    var items = g.items.map(function (x, i) {
      var n = i + 1;
      return '<div class="dock__item">' +
        '<figure class="dock__card">' +
          (x.photo
            ? pic(x.photo, x.alt || ('Фото ' + n), x.w, x.h)
            : '<div class="photo-stub"><span class="photo-stub__tag">Фото ' + n + '</span></div>') +
        '</figure>' +
      '</div>';
    }).join('');
    return '<section class="gallery" id="gallery"><div class="wrap">' +
      (g.title ? '<h2 class="gallery__title">' + accent(g.title) + '</h2>' : '') +
    '</div>' +
    '<div class="dock" data-dock>' + items + '</div>' +
    '</section>';
  }

  function renderTeam() {
    var t = S.team;

    /* Пустая карточка показывает, что именно сюда встанет: должность,
       имя, стаж и цитата — чтобы заказчику было понятно, что прислать. */
    function slot(value, label) {
      return value
        ? esc(value)
        : '<i class="person__slot">' + esc(label) + '</i>';
    }

    var people = t.people.map(function (p) {
      var empty = !p.name;
      return '<article class="person' + (empty ? ' person--empty' : '') + '">' +
        '<figure class="person__figure">' +
          photo({ photo: p.photo, photoKind: 'Фото', photoNeed: p.photoNeed, w: p.w, h: p.h }, false) +
        '</figure>' +
        '<div>' +
          '<span class="person__role">' + slot(p.role, 'Специфика работы') + '</span>' +
          '<b class="person__name">' + slot(p.name, 'Имя') + '</b>' +
          '<span class="person__years">' + slot(p.years, 'Стаж') + '</span>' +
          '<p class="person__quote">' + slot(p.quote, 'Цитата') + '</p>' +
        '</div>' +
      '</article>';
    }).join('');

    var not = t.not.map(function (x) {
      var tail = x.href
        ? '<a href="' + esc(x.href) + '">' + esc(x.t) + '</a>'
        : esc(x.t);
      return '<li class="not__item">' + ic('cross', { size: 15 }) +
        '<span><b>' + esc(x.b) + '</b> — ' + tail + '</span></li>';
    }).join('');

    return '<section class="team" id="team"><div class="wrap">' +
      '<h2 class="team__title">' + accent(t.title) + '</h2>' +
      '<div class="team__grid">' + people + '</div>' +
      '<div class="not">' +
        '<h3 class="not__title">' + esc(t.notTitle) + '</h3>' +
        '<ul class="not__list">' + not + '</ul>' +
      '</div>' +
    '</div></section>';
  }

  /* =====================  БЛОК 7 — Отзывы  ===================== */
  function renderReviews() {
    var r = S.reviews;
    var url = (C.yandex && C.yandex.reviews) || '';
    var org = (C.yandex && C.yandex.org) || url;
    var avitoUrl = (C.links && (C.links.avitoReviews || C.links.avito)) || '';
    var stars = [0,1,2,3,4].map(function () { return ic('star', { size: 14 }); }).join('');

    function ratingCard(data, link) {
      return '<a class="rating" href="' + esc(link) + '"' + (link ? ' target="_blank" rel="noopener"' : '') + '>' +
        '<span class="rating__value">' + esc(data.value) + '</span>' +
        '<span>' +
          '<span class="rating__stars">' + stars + '</span>' +
          '<span class="rating__counts">' + esc(data.counts) + '</span>' +
          '<span class="rating__src">' + esc(data.source) + '</span>' +
        '</span>' +
        '<span class="rating__go">' + ic('arrow', { size: 18 }) + '</span>' +
      '</a>';
    }

    var ratings = '<div class="reviews__ratings">' +
      ratingCard(r.rating, org) +
      (r.ratingAvito && avitoUrl ? ratingCard(r.ratingAvito, avitoUrl) : '') +
    '</div>';

    var items = r.items.map(function (x) {
      var isAv = x.src === 'Авито';
      var href = isAv ? avitoUrl : url;
      var srcLabel = x.src || r.rating.source;
      return '<a class="review" href="' + esc(href) + '"' + (href ? ' target="_blank" rel="noopener"' : '') +
        ' title="Открыть отзыв на ' + esc(srcLabel) + '">' +
        '<span class="review__top">' +
          '<span class="review__ava">' + esc(x.name.charAt(0)) + '</span>' +
          '<span class="review__who"><b>' + esc(x.name) + '</b>' +
            (x.meta ? '<span>' + esc(x.meta) + '</span>' : '') + '</span>' +
        '</span>' +
        '<span class="rating__stars">' + stars + '</span>' +
        '<span class="review__body">' + esc(x.text) + '</span>' +
        '<span class="review__foot">' + ic('star', { size: 13 }) + esc(srcLabel) + '</span>' +
      '</a>';
    }).join('');

    var buttons = r.cta.buttons.map(function (b) {
      return leadBtn('btn--cta', b.label, 'отзывы', 16);
    }).join('');

    return '<section class="reviews" id="reviews"><div class="wrap">' +
      '<div class="reviews__head">' +
        '<h2 class="reviews__lead">' + esc(r.lead) + '</h2>' +
        ratings +
      '</div>' +
      '<div class="reviews__grid">' + items + '</div>' +
      '<div class="reviews__cta">' +
        '<p>' + esc(r.cta.lead) + '</p>' +
        '<div class="reviews__buttons">' + buttons + '</div>' +
      '</div>' +
    '</div></section>';
  }

  /* =====================  БЛОК 8 — Частые вопросы  ===================== */
  function renderFaq() {
    var f = S.faq;

    var items = f.items.map(function (it, i) {
      var photos = photoStrip(it.photos, 'faq');
      return '<div class="acc__item" data-acc="faq-' + i + '">' +
        '<button class="acc__head" type="button" aria-expanded="false">' +
          '<span>' + esc(it.q) + '</span>' + ic('chevronDown', { size: 20 }) +
        '</button>' +
        '<div class="acc__panel"><div class="acc__inner">' +
          '<p class="acc__text">' + esc(it.a) + '</p>' +
          photos +
        '</div></div>' +
      '</div>';
    }).join('');

    return '<section class="faq" id="faq"><div class="wrap">' +
      '<h2 class="faq__lead">' + esc(f.lead) + '</h2>' +
      '<div class="acc faq__acc">' + items + '</div>' +
    '</div></section>';
  }

  /* =====================  БЛОК 9 — Как доехать  ===================== */
  function renderLocation() {
    var l = S.location;
    var y = C.yandex || {};

    var routes = l.routes.map(function (r) {
      return '<div class="loc__route"><span>' + esc(r.from) + '</span><span>' +
        (r.time ? esc(r.time) : '') + '</span></div>';
    }).join('');

    return '<section class="loc" id="contacts"><div class="wrap">' +
      '<h2 class="loc__lead">' + esc(l.lead) + '</h2>' +
      '<div class="loc__grid">' +

        '<div>' +
          '<a class="loc__map" href="' + esc(y.org || '#') + '" target="_blank" rel="noopener" ' +
            'aria-label="Открыть в Яндекс.Картах">' +
            '<picture><source type="image/webp" srcset="' +
              esc(String(l.mapImage).replace(/\.jpg$/, '')) + '.webp">' +
              '<img class="loc__map-img" src="' + esc(l.mapImage) + '" ' +
              'alt="Карта: ' + esc(l.address) + '" loading="lazy" decoding="async" ' +
              'width="1200" height="825"></picture>' +
          '</a>' +
        '</div>' +

        '<div class="loc__info">' +
          '<p class="loc__addr">' + esc(l.address) + '</p>' +
          '<p class="loc__note">' + esc(l.note) + '</p>' +
          '<div class="loc__block">' +
            '<b>' + esc(l.hoursLabel) + '</b>' +
            '<p class="loc__hours">' + esc(l.hours) + '</p>' +
          '</div>' +
          '<div class="loc__block">' +
            '<b>' + esc(l.routesLabel) + '</b>' +
            '<div class="loc__routes">' + routes + '</div>' +
          '</div>' +
          (y.org ? '<a class="btn btn--map" href="' + esc(y.org) + '" target="_blank" rel="noopener">' +
            'Открыть в Яндекс.Картах' + ic('arrow', { size: 16 }) + '</a>' : '') +
        '</div>' +

      '</div>' +

      /* фото гаража — во всю ширину блока, все сразу видно, листать не нужно */
      '<div class="loc__gallery">' + l.photos.map(function (ph) {
        return '<figure class="loc__shot">' +
          (ph.src
            ? pic(ph.src, ph.need, ph.w, ph.h)
            : '<div class="photo-stub"><span class="photo-stub__tag">Фото</span>' +
              '<p class="photo-stub__text">' + esc(ph.need || '') + '</p></div>') +
        '</figure>';
      }).join('') + '</div>' +
    '</div></section>';
  }

  /* =====================  БЛОК 10 — Форма записи  ===================== */
  /* Форма заявки — одна разметка на низ страницы и на всплывающее окно.
     [[текст|ссылка]] в подписях галочек — ссылка на документ в новой вкладке. */
  function leadFormHtml(key) {
    var f = S.form;
    var linked = function (t) {
      return esc(t).replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, function (_, text, href) {
        return '<a href="' + href + '" target="_blank" rel="noopener">' + text + '</a>';
      });
    };
    return '<form class="lead" data-lead-form="' + key + '" novalidate>' +
      '<label class="lead__field"><span>' + esc(f.nameLabel) + ' <i>— необязательно</i></span>' +
        '<input type="text" name="name" autocomplete="name" maxlength="60" placeholder="' + esc(f.nameHint) + '"></label>' +
      '<label class="lead__field"><span>' + esc(f.phoneLabel) + ' <i class="lead__req">*</i></span>' +
        '<input type="tel" name="phone" autocomplete="tel" inputmode="tel" placeholder="+7 (___) ___-__-__" required></label>' +
      '<em class="lead__err" data-err="phone" hidden>' + esc(f.errPhone) + '</em>' +
      '<label class="lead__check"><input type="checkbox" name="pd" required><span>' + linked(f.consentPd) + '</span></label>' +
      '<em class="lead__err" data-err="pd" hidden>' + esc(f.errPd) + '</em>' +
      /* ловушка для ботов: человек это поле не видит и не заполняет */
      '<input class="lead__trap" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<label class="lead__check"><input type="checkbox" name="ads"><span>' + linked(f.consentAds) + '</span></label>' +
      '<div class="lead__action">' +
        '<button type="submit" class="btn lead__submit">' +
          '<span class="lead__label">' + esc(f.submit) + '</span>' +
          '<span class="lead__tick">' + ic('check', { size: 26 }) + '</span>' +
        '</button>' +
      '</div>' +
      '<em class="lead__err" data-err="send" hidden>' + esc(f.errSend) + '</em>' +
      '<div class="lead__after" hidden>' +
        '<a class="btn lead__wa" data-lead-wa href="#" target="_blank" rel="noopener">' +
          ic('whatsapp', { size: 18 }) + esc(f.waLabel) + '</a>' +
      '</div>' +
    '</form>';
  }

  function renderForm() {
    return '<section class="form" id="zapis"><div class="wrap">' +
      '<div class="form__card">' +
        '<h2 class="form__lead">' + esc(S.form.lead).replace(' — ', '&nbsp;— ').replace(/\n/g, '<br>') + '</h2>' +
        leadFormHtml('низ страницы') +
      '</div>' +
    '</div></section>';
  }

  /* Всплывающее окно заявки. Открывают его все кнопки записи (data-lead). */
  function renderLeadModal() {
    var f = S.form;
    return '<div class="modal" id="lead-modal" hidden>' +
      '<div class="modal__backdrop" data-close></div>' +
      '<div class="modal__card" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title">' +
        '<button type="button" class="modal__close" data-close aria-label="Закрыть">' + ic('close', { size: 20 }) + '</button>' +
        '<h2 class="modal__title" id="lead-modal-title">' + esc(f.popTitle) + '</h2>' +
        '<p class="modal__sub">' + esc(f.popSub) + '</p>' +
        leadFormHtml('окно') +
      '</div>' +
    '</div>';
  }

  /* =====================  БЛОК 11 — Подвал  ===================== */
  function renderFooter() {
    var f = S.footer;
    var y = C.yandex || {}, links = C.links || {}, legal = C.legal || {};
    var ph = C.contacts.phoneDisplay;

    var net = '';
    if (y.org)       net += '<a href="' + esc(y.org) + '" target="_blank" rel="noopener">Яндекс.Карты</a>';
    if (links.avito) net += '<a href="' + esc(links.avito) + '" target="_blank" rel="noopener">Авито</a>';

    var reqs = [];
    if (legal.ipName) reqs.push(esc(legal.ipName));
    if (legal.ogrnip) reqs.push('ОГРНИП ' + esc(legal.ogrnip));
    if (legal.inn)    reqs.push('ИНН ' + esc(legal.inn));
    if (legal.okpo)   reqs.push('ОКПО ' + esc(legal.okpo));

    return '<footer class="footer"><div class="wrap">' +
      '<div class="footer__grid">' +

        '<div>' +
          '<div class="footer__brand">' +
            '<picture>' +
              '<source type="image/webp" srcset="img/logo.webp?v=2">' +
              '<img class="footer__logo" src="img/logo.png?v=2" alt="' + esc(legal.orgName || S.brand.name) + '" ' +
                'width="1673" height="840" loading="lazy" decoding="async">' +
            '</picture>' +
          '</div>' +
          '<p class="footer__addr">' + esc(f.address) + '<br>' + esc(f.hours) + '</p>' +
          '<p class="footer__disc">' + esc(f.disclaimer) + '</p>' +
        '</div>' +

        '<div class="footer__col">' +
          '<b>Контакты</b>' +
          (ph ? '<a href="tel:+' + esc(C.contacts.phone) + '">' + esc(ph) + '</a>' : '<span>Телефон — уточняется</span>') +
          '<a href="#zapis" data-lead="подвал: WhatsApp">Написать в WhatsApp</a>' +
        '</div>' +

        '<div class="footer__col">' +
          '<b>' + esc(f.linksTitle) + '</b>' +
          (net || '<span>Ссылки — уточняются</span>') +
        '</div>' +

      '</div>' +

      '<div class="footer__bottom">' +
        '<span>© ' + new Date().getFullYear() + ' ' + esc(legal.orgName || S.brand.name) +
          (reqs.length ? ' · ' + reqs.join(' · ') : '') + ' · Карта © OpenStreetMap</span>' +
        '<span class="footer__links">' +
          '<a href="' + esc(f.privacyHref || '#') + '">' + esc(f.privacyLabel) + '</a>' +
          '<button type="button" class="footer__cookie" data-cookie-settings hidden>Настройки cookie</button>' +
        '</span>' +
      '</div>' +
    '</div></footer>';
  }

  /* =====================  ПЛАВАЮЩАЯ КНОПКА WA (моб.)  ===================== */
  /* Как и все кнопки записи, открывает окно заявки; WhatsApp — после отправки. */
  function renderWaFloat() {
    return '<a class="wa-float" href="#zapis" data-lead="кнопка WhatsApp" aria-label="Написать в WhatsApp">' +
      ic('whatsapp', { size: 26 }) + '</a>';
  }

  /* =====================  СБОРКА  ===================== */
  function build() {
    document.title = S.meta.title;
    var d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute('content', S.meta.description);

    document.getElementById('app').innerHTML =
      renderHeader() +
      '<main>' + renderHero() + renderClients() + renderTuning() + renderCompare() + renderCalc() + renderGallery() + renderTeam() + renderReviews() + renderFaq() + renderLocation() + renderForm() + '</main>' +
      renderFooter() +
      renderLeadModal() +
      renderWaFloat();

    if (!C.contacts.phone) {
      console.warn('[config] Не задан contacts.phone — кнопки мессенджеров пока не ведут никуда.');
    }

    /* Снимок для поисковиков (prerender.py): нужна чистая разметка
       без слайдов, часов работы и прочего «живого» состояния. */
    if (/[?&]prerender\b/.test(location.search)) return;

    wireHeader();
    wireHero();
    wireClients();
    wireTuning();
    wireCalc();
    wireAccordions();
    wireCarousels();
    wireDock();
    wireTerms();
    wireImageFade();
    wireConsent();
    wireLeadForms();
  }

  /* ---------- шапка ---------- */
  function wireHeader() {
    var header = document.getElementById('site-header');
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 12); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    var burger = document.getElementById('burger');
    var menu = document.getElementById('mobile-menu');
    var setOpen = function (open) {
      menu.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.innerHTML = ic(open ? 'close' : 'menu', { size: 20 });
    };
    burger.addEventListener('click', function () { setOpen(!menu.classList.contains('is-open')); });
    menu.addEventListener('click', function (e) { if (e.target.closest('[data-close-menu]')) setOpen(false); });

    /* зелёный когда открыто, красный когда закрыто */
    var status = document.getElementById('work-status');
    var refresh = function () {
      var open = isOpenNow();
      if (open === null) return;
      status.classList.toggle('is-open', open);
      status.title = open ? 'Сейчас открыто' : 'Сейчас закрыто';
    };
    refresh();
    setInterval(refresh, 60000);
  }

  /* ---------- блок 1: переключение состояний ---------- */
  function wireHero() {
    var states = S.hero.states;
    var termBox = document.getElementById('hero-term');
    var capBox = document.getElementById('hero-caption');
    var slides = [].slice.call(document.querySelectorAll('.hero__slide'));
    /* в разметке уже стоит первое состояние (для поисковиков); очищаем,
       чтобы при открытии по ссылке ?car= текст не «ехал» */
    termBox.innerHTML = capBox.innerHTML = '';

    var reduced = PREFERS_STILL.matches;
    var idx = 0;
    var timer = null;
    var paused = false;   // пауза от ?car= — до первого действия пользователя

    function paint(i) {
      var st = states[i];
      slides.forEach(function (el, k) { el.classList.toggle('is-active', k === i); });
      roll(termBox, termHtml(st));
      roll(capBox, capHtml(st));
    }

    function schedule() {
      clearTimeout(timer);
      if (reduced || paused || document.hidden) return;
      var ms = C.hero.durations[states[idx].key] || 8000;
      timer = setTimeout(function () {
        idx = (idx + 1) % states.length;
        paint(idx);
        schedule();
      }, ms);
    }

    /* ?car=simple|china|commercial — открыть на состоянии и встать на паузу */
    var carParam = new URLSearchParams(location.search).get('car');
    if (carParam) {
      var found = states.findIndex(function (s) { return s.key === carParam; });
      if (found > -1) {
        idx = found;
        paused = true;
        var evs = ['scroll', 'pointerdown', 'keydown'];
        var resume = function () {
          paused = false;
          schedule();
          evs.forEach(function (ev) { window.removeEventListener(ev, resume); });
        };
        evs.forEach(function (ev) { window.addEventListener(ev, resume, { once: true, passive: true }); });
      }
    }

    /* высота под самый длинный вариант — чтобы блок не дёргался при смене */
    var fit = function () {
      reserveHeight(termBox, states.map(termHtml));
      reserveHeight(capBox, states.map(capHtml));
    };
    fit();
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(fit, 180); });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearTimeout(timer); else schedule();
    });

    paint(idx);
    schedule();
  }

  /* ---------- блок 2: лента стоит, пока её не видно ---------- */
  function wireClients() {
    var track = document.getElementById('clients-track');
    if (!track || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (entries) {
      track.classList.toggle('is-paused', !entries[0].isIntersecting);
    }).observe(track);
    /* нажатие останавливает ленту, повторное — запускает */
    track.parentElement.addEventListener('click', function () {
      track.classList.toggle('is-held');
    });
  }

  /* ---------- блок 3: три подблока ---------- */
  function wireTuning() {
    var subs = S.tuning.subblocks;
    var panel = document.getElementById('tuning-panel');
    var tabs = [].slice.call(document.querySelectorAll('.tab'));
    var section = document.getElementById('tuning');
    var idx = 0;

    /* Автосмены нет: подблоки переключаются только вкладками и стрелками.
       То, что подблоков несколько, видно по вкладкам — сам текст не двигается. */
    function show(i) {
      idx = (i + subs.length) % subs.length;
      panel.innerHTML = panelHtml(idx);
      tabs.forEach(function (t, k) { t.classList.toggle('is-active', k === idx); });
    }

    function byUser(i) { show(i); }

    tabs.forEach(function (t, i) { t.addEventListener('click', function () { byUser(i); }); });
    document.getElementById('tuning-prev').addEventListener('click', function () { byUser(idx - 1); });
    document.getElementById('tuning-next').addEventListener('click', function () { byUser(idx + 1); });

    /* ссылка «От 48 часов — на китайца» с первого экрана ведёт сразу на нужный подблок */
    function fromHash() {
      var m = /^#tuning-(.+)$/.exec(location.hash);
      if (!m) return;
      var i = subs.findIndex(function (b) { return b.key === m[1]; });
      if (i > -1) { byUser(i); section.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  /* ---------- блок 5: калькулятор и раскрывающиеся пункты ---------- */
  function wireCalc() {
    var units = { 'calc-km': 0, 'calc-cons': 1, 'calc-petrol': 0 };
    var recalc = function () { renderCalcOut(calcResult()); };

    Object.keys(units).forEach(function (id) {
      var el = document.getElementById(id);
      var out = document.getElementById(id + '-val');
      var digits = units[id];
      paintRange(el);
      el.addEventListener('input', function () {
        out.textContent = digits ? (+el.value).toFixed(1) : fmt(el.value);
        paintRange(el);
        recalc();
      });
    });
    recalc();
  }

  /* ---------- раскрывающиеся пункты: калькулятор (блок 5) и вопросы (блок 8) ----------
     Работают «на месте», без модальных окон. Панель едет по max-height,
     конкретную высоту ставим из scrollHeight — с фото внутри тоже корректно. */
  function wireAccordions() {
    document.querySelectorAll('.acc__item').forEach(function (item) {
      var head = item.querySelector('.acc__head');
      var panel = item.querySelector('.acc__panel');
      head.addEventListener('click', function () {
        var open = item.classList.toggle('is-open');
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel.style.maxHeight = open ? (panel.scrollHeight + 'px') : '';
      });
      /* если внутри появятся настоящие фото — пересчитать высоту после загрузки */
      panel.querySelectorAll('img').forEach(function (img) {
        img.addEventListener('load', function () {
          if (item.classList.contains('is-open')) panel.style.maxHeight = panel.scrollHeight + 'px';
        });
      });
    });
  }

  /* ---------- блок 9: карта грузится по клику ---------- */
  /* Термины с подсказкой. Слушаем на документе, а не на самих словах:
     панель блока 3 перерисовывается при смене вкладки, и обычные
     обработчики бы отваливались. На компьютере подсказка и так открыта
     по наведению — здесь только тап и закрытие. */
  function wireTerms() {
    /* Подсказка выравнена по левому краю слова. Если слово стоит у правого
       края экрана, плашка вылезала бы за него — сдвигаем ровно настолько,
       чтобы она целиком помещалась. Меряем до показа: она hidden, но
       размеры у неё уже есть. */
    function placeTip(t) {
      var tip = t.querySelector('.term__tip');
      if (!tip) return;
      tip.style.left = '';
      var r = tip.getBoundingClientRect();
      var vw = document.documentElement.clientWidth;
      var over = r.right - (vw - 12);
      if (over > 0) tip.style.left = -Math.ceil(over) + 'px';
      else if (r.left < 12) tip.style.left = Math.ceil(12 - r.left) + 'px';
    }
    ['mouseover', 'focusin'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        var t = e.target.closest ? e.target.closest('.term') : null;
        if (t) placeTip(t);
      }, { passive: true });
    });
    window.addEventListener('resize', function () {
      document.querySelectorAll('.term__tip').forEach(function (tip) { tip.style.left = ''; });
    });

    function closeOpen(except) {
      var open = document.querySelector('.term.is-open');
      if (open && open !== except) {
        open.classList.remove('is-open');
        open.setAttribute('aria-expanded', 'false');
      }
    }
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('.term') : null;
      closeOpen(t);
      if (!t) return;
      e.preventDefault();
      placeTip(t);
      var open = t.classList.toggle('is-open');
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeOpen(null);
    });
  }

  /* Фото проявляются вместо того, чтобы выскакивать рывком в уже
     отведённой рамке. Картинку из кеша помечаем сразу — иначе она
     мигнёт впустую. */
  function wireImageFade() {
    var sel = '.strip__item img, .compare__figure img, .person__figure img, .loc__shot img';
    var imgs = [].slice.call(document.querySelectorAll(sel));
    if (!imgs.length) return;

    /* Прячем фото только теперь, когда точно знаем, что скрипт работает
       и сможет их показать. До этого момента они просто видны. */
    document.documentElement.classList.add('js-fade');

    var show = function (img) { img.classList.add('is-loaded'); };

    imgs.forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) { show(img); return; }
      img.addEventListener('load',  function () { show(img); }, { once: true });
      /* картинка не открылась — всё равно снимаем прозрачность,
         иначе останется пустое место */
      img.addEventListener('error', function () { show(img); }, { once: true });
    });

    /* Последняя подстраховка: что бы ни случилось с событиями загрузки,
       через 5 секунд показываем всё, что ещё скрыто. */
    setTimeout(function () { imgs.forEach(show); }, 5000);
  }

  /* Ленты фото (блок 9 и блок 8): стрелки листают на одну плитку,
     прячутся у краёв и когда листать нечего. Свайп работает и без JS. */
  /* Лента «как док»: карточка в центре яркая и приподнята, соседние
     тусклее. Палец и колесо — обычная прокрутка с притягиванием;
     мышью ленту можно тянуть, после броска она доводится до ближайшей
     карточки; клик по боковой карточке везёт её в центр. */
  function wireDock() {
    document.querySelectorAll('[data-dock]').forEach(function (el) {
      var items = [].slice.call(el.children);
      var active = -1, s = null, suppressClick = false, settleTimer = 0;
      var smooth = function () { return PREFERS_STILL.matches ? 'auto' : 'smooth'; };

      function centerOf(i) { var ch = items[i]; return ch.offsetLeft + ch.offsetWidth / 2 - el.clientWidth / 2; }
      function nearest(pos) {
        var best = 0, bd = Infinity;
        items.forEach(function (_, i) { var d = Math.abs(centerOf(i) - pos); if (d < bd) { bd = d; best = i; } });
        return best;
      }
      function mark() {
        var i = nearest(el.scrollLeft);
        if (i === active) return;
        if (items[active]) items[active].classList.remove('is-active');
        items[i].classList.add('is-active');
        active = i;
      }
      function goTo(i) { el.scrollTo({ left: centerOf(i), behavior: smooth() }); }

      el.addEventListener('scroll', mark, { passive: true });
      window.addEventListener('resize', function () { if (active > -1) el.scrollLeft = centerOf(active); });

      el.addEventListener('click', function (e) {
        if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
        var it = e.target.closest('.dock__item');
        if (it) { var i = items.indexOf(it); if (i !== active) goTo(i); }
      }, true);
      el.addEventListener('dragstart', function (e) { e.preventDefault(); });

      /* перетаскивание мышью (палец и так листает) */
      function onMove(e) {
        if (!s || e.pointerId !== s.id) return;
        var dx = e.clientX - s.x;
        if (!s.moved) { if (Math.abs(dx) < 3) return; s.moved = true; el.classList.add('is-dragging'); }
        e.preventDefault();
        var now = performance.now(), dt = now - s.lt;
        if (dt > 0) s.v = 0.7 * ((e.clientX - s.lx) / dt) + 0.3 * s.v;
        s.lx = e.clientX; s.lt = now;
        el.scrollLeft = s.left - dx;
      }
      function onUp(e) {
        if (!s || e.pointerId !== s.id) return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        var st = s; s = null;
        if (!st.moved) { el.classList.remove('is-dragging'); return; }
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 80);
        if (performance.now() - st.lt > 100) st.v = 0;
        goTo(nearest(el.scrollLeft - st.v * 180));
        clearTimeout(settleTimer);
        /* притягивание включаем обратно только после доводки, иначе лента дёргается */
        settleTimer = setTimeout(function () { el.classList.remove('is-dragging'); }, 450);
      }
      el.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        clearTimeout(settleTimer);
        el.classList.add('is-dragging');
        s = { id: e.pointerId, x: e.clientX, left: el.scrollLeft, lx: e.clientX, lt: performance.now(), v: 0, moved: false };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      });

      /* старт — со второй карточки, чтобы слева было видно, что лента листается */
      el.scrollLeft = centerOf(Math.min(1, items.length - 1));
      mark();
    });
  }

  function wireCarousels() {
    document.querySelectorAll('[data-strip]').forEach(function (strip) {
      var track = strip.querySelector('.strip__track');
      var prev = strip.querySelector('.strip__nav--prev');
      var next = strip.querySelector('.strip__nav--next');
      if (!track || !prev || !next) return;

      function step() {
        var item = track.querySelector('.strip__item');
        return item ? item.getBoundingClientRect().width + 10 : track.clientWidth * 0.8;
      }
      function sync() {
        var max = track.scrollWidth - track.clientWidth - 1;
        var scrollable = max > 4;
        /* hidden убирает кнопку из потока целиком, а класс даёт ей
           плавно проявиться и погаснуть — см. .strip__nav в blocks.css */
        prev.hidden = next.hidden = !scrollable;
        prev.classList.toggle('is-visible', scrollable && track.scrollLeft > 2);
        next.classList.toggle('is-visible', scrollable && track.scrollLeft < max);
      }
      prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
      next.addEventListener('click', function () { track.scrollBy({ left:  step(), behavior: 'smooth' }); });
      track.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      /* картинки грузятся лениво — пересчитать, когда размеры станут известны */
      track.querySelectorAll('img').forEach(function (img) { img.addEventListener('load', sync); });
      sync();
    });
  }

  /* ---------- cookie и Яндекс Метрика ----------
     Код счётчика стоит в <head> (window.arMetrika) и работает сразу —
     кроме тех, кто нажал «Отклонить». Здесь — уведомление с выбором
     («Понятно» / «Отклонить» / «Настроить») и цели для Метрики:
     whatsapp, phone — нажатия на кнопки связи, lead — отправленная заявка. */
  function wireConsent() {
    var id = Number(String((C.metrika && C.metrika.id) || '').replace(/\D/g, ''));
    if (!id || typeof window.arMetrika !== 'function') return;
    var KEY = 'ar161-cookie';
    var get = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
    var set = function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} };
    var on = function () { return !!window.arMetrika.done; };
    var bar = null;

    function apply(analytics) {
      set(analytics ? 'yes' : 'no');
      bar.hidden = true;
      if (analytics) { window.arMetrika(); return; }
      /* отказ: стираем cookie Метрики; если она уже работала — перезагружаем без неё */
      /* Метрика ставит cookie на домен целиком — стираем для всех его уровней */
      var host = location.hostname.split('.');
      var domains = [''];
      for (var i = 0; i < host.length - 1; i++) domains.push('; domain=.' + host.slice(i).join('.'));
      document.cookie.split(';').forEach(function (c) {
        var name = c.split('=')[0].trim();
        if (!/^_ym/.test(name)) return;
        domains.forEach(function (d) { document.cookie = name + '=; Max-Age=0; path=/' + d; });
      });
      if (on()) location.reload();
    }

    function show(settings) {
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'cookie';
        bar.innerHTML =
          '<div class="cookie__main">' +
            '<p class="cookie__text">Продолжая пользоваться сайтом, вы соглашаетесь на использование cookie ' +
              'и Яндекс Метрики. <a href="consent.html">Подробнее</a></p>' +
            '<div class="cookie__actions">' +
              '<button type="button" class="btn btn--sm btn--cta" data-act="all">Понятно</button>' +
              '<button type="button" class="btn btn--sm cookie__ghost" data-act="none">Отклонить</button>' +
              '<button type="button" class="cookie__link" data-act="settings">Настроить</button>' +
            '</div>' +
          '</div>' +
          '<div class="cookie__settings">' +
            '<p class="cookie__title">Настройки cookie</p>' +
            '<label class="cookie__opt"><input type="checkbox" checked disabled>' +
              '<span><b>Необходимые</b>Запоминают ваш выбор в этом окне. Всегда включены</span></label>' +
            '<label class="cookie__opt"><input type="checkbox" data-opt="analytics">' +
              '<span><b>Аналитика — Яндекс Метрика</b>Статистика посещений, чтобы делать сайт удобнее</span></label>' +
            '<div class="cookie__actions">' +
              '<button type="button" class="btn btn--sm btn--cta" data-act="save">Сохранить</button>' +
              '<button type="button" class="btn btn--sm cookie__ghost" data-act="all">Принять все</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(bar);
        bar.addEventListener('click', function (e) {
          var b = e.target.closest('button[data-act]');
          if (!b) return;
          var act = b.dataset.act;
          if (act === 'settings') { show(true); return; }
          if (act === 'all') apply(true);
          else if (act === 'none') apply(false);
          else if (act === 'save') apply(bar.querySelector('[data-opt=analytics]').checked);
        });
      }
      bar.querySelector('[data-opt=analytics]').checked = get() !== 'no';
      bar.classList.toggle('is-settings', !!settings);
      bar.hidden = false;
    }

    document.querySelectorAll('[data-cookie-settings]').forEach(function (b) {
      b.hidden = false;
      b.addEventListener('click', function () { show(true); });
    });

    document.addEventListener('click', function (e) {
      if (!on() || !window.ym || !e.target.closest) return;
      var a = e.target.closest('a[href]');
      if (!a) return;
      var h = a.getAttribute('href');
      if (/wa\.me|whatsapp/i.test(h)) window.ym(id, 'reachGoal', 'whatsapp');
      else if (/^tel:/.test(h)) window.ym(id, 'reachGoal', 'phone');
    });

    var choice = get();
    if (choice !== 'yes' && choice !== 'no') show(false);
  }

  /* ---------- заявки: окно и формы ----------
     Кнопка «Оставить заявку» тусклая, пока не введён номер целиком,
     и загорается, как только номер введён. Галочка согласия проверяется
     уже при нажатии. После отправки кнопка сворачивается в галочку
     и появляется кнопка WhatsApp с готовым сообщением. */
  function wireLeadForms() {
    var f = S.form;
    var modal = document.getElementById('lead-modal');
    var lastSource = '', lastNote = '';
    var opener = null;

    function openModal(source, note) {
      lastSource = source || '';
      lastNote = note || '';
      opener = document.activeElement;
      modal.hidden = false;
      document.documentElement.classList.add('is-modal');
      requestAnimationFrame(function () { modal.classList.add('is-open'); });
      if (window.matchMedia('(hover: hover)').matches) {
        var first = modal.querySelector('input[name=name]');
        if (first && !first.closest('.lead').classList.contains('is-sent')) first.focus();
      }
    }
    /* окно в режиме «Спасибо, заявка отправлена» */
    var modalForm = modal.querySelector('[data-lead-form]');
    function setThanks() {
      modal.querySelector('.modal__title').textContent = f.thanksTitle;
      modal.querySelector('.modal__sub').textContent = f.thanksSub;
    }
    /* заявку отправили из формы внизу — благодарность тоже во всплывающем окне */
    function showThanks(href) {
      modalForm.querySelector('[data-lead-wa]').href = href;
      modalForm.classList.add('is-sent');
      modalForm.querySelector('.lead__submit').disabled = true;
      modalForm.querySelector('.lead__after').hidden = false;
      setThanks();
      openModal('', '');
    }
    function closeModal() {
      modal.classList.remove('is-open');
      document.documentElement.classList.remove('is-modal');
      setTimeout(function () { modal.hidden = true; }, PREFERS_STILL.matches ? 0 : 200);
      if (opener && opener.focus) opener.focus();
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-lead]') : null;
      if (b) {
        e.preventDefault();
        var menu = document.getElementById('mobile-menu');
        if (menu && menu.classList.contains('is-open')) document.getElementById('burger').click();
        openModal(b.dataset.lead, b.dataset.leadNote);
        return;
      }
      if (e.target.closest && e.target.closest('[data-close]') && modal.contains(e.target)) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });

    /* номер оформляется по ходу ввода: +7 (900) 123-45-67 */
    var digits = function (v) {
      var d = String(v).replace(/\D/g, '');
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d && d[0] !== '7') d = '7' + d;
      return d.slice(0, 11);
    };

    document.querySelectorAll('[data-lead-form]').forEach(function (form) {
      var inModal = modal.contains(form);
      var phone = form.elements.phone;
      var btn = form.querySelector('.lead__submit');
      var err = function (k, on) { form.querySelector('[data-err=' + k + ']').hidden = !on; };
      var ready = function () { return digits(phone.value).length === 11; };

      phone.addEventListener('input', function () {
        var d = digits(phone.value);
        var p = d ? '+7' : '';
        if (d.length > 1) p += ' (' + d.slice(1, 4);
        if (d.length > 4) p += ') ' + d.slice(4, 7);
        if (d.length > 7) p += '-' + d.slice(7, 9);
        if (d.length > 9) p += '-' + d.slice(9, 11);
        phone.value = p;
        btn.classList.toggle('is-ready', ready());
        if (ready()) err('phone', false);
      });
      form.elements.pd.addEventListener('change', function () { err('pd', false); });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (form.classList.contains('is-sent') || btn.disabled) return;
        if (!ready()) { err('phone', true); phone.focus(); return; }
        if (!form.elements.pd.checked) { err('pd', true); return; }
        err('send', false);

        var name = form.elements.name.value.trim();
        var source = inModal ? (lastSource || 'окно') : form.dataset.leadForm;
        var note = inModal ? lastNote : '';
        var lead = {
          name: name,
          phone: '+' + digits(phone.value),
          pdConsent: true,
          adsConsent: form.elements.ads.checked,
          company: form.elements.company.value,
          source: source,
          note: note,
          page: location.href,
          time: new Date().toISOString(),
        };
        btn.disabled = true;

        var finish = function () {
          var text = f.doneWa + (name ? ' Меня зовут ' + name + '.' : '') + (note ? ' ' + note : '');
          var href = waLink(text);
          form.querySelector('[data-lead-wa]').href = href;
          form.classList.add('is-sent');
          /* кнопка сворачивается в галочку, потом — «Спасибо» и WhatsApp */
          setTimeout(function () {
            form.querySelector('.lead__after').hidden = false;
            if (inModal) setThanks(); else showThanks(href);
          }, PREFERS_STILL.matches ? 0 : 380);
          if (window.arMetrika && window.arMetrika.done && window.ym) {
            window.ym(Number(C.metrika.id), 'reachGoal', 'lead');
          }
        };

        var url = C.leads && C.leads.endpoint;
        if (!url) {
          console.warn('[leads] Не задан адрес для заявок (config.js → leads.endpoint) — заявка не сохранена.', lead);
          finish();
          return;
        }
        /* text/plain — «простой» запрос: браузер не шлёт лишнюю предварительную проверку */
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(lead),
        }).then(function (r) {
          if (!r.ok) throw new Error(r.status);
          finish();
        }).catch(function () {
          err('send', true);
          btn.disabled = false;
        });
      });
    });
  }

  /* ---------- запуск ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else { build(); }
})();
