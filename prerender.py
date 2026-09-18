#!/usr/bin/env python3
"""
ГОТОВЫЙ ТЕКСТ ДЛЯ ПОИСКОВИКОВ

Сайт рисует страницу скриптом из content.js. Яндекс и боты мессенджеров
скрипты запускают плохо и видят почти пустую страницу. Этот файл открывает
сайт в Chrome без окна, забирает уже нарисованную страницу и вшивает её
в index.html. Посетитель ничего не замечает: скрипт при открытии всё равно
перерисует страницу из свежего content.js.

Запускать после любой правки текстов в content.js:

    python3 prerender.py

Нужны только Python 3, Node и Google Chrome — ничего устанавливать не надо.
Заодно обновляет разметку частых вопросов (FAQ) в index.html из content.js.
"""
import http.server
import json
import os
import re
import subprocess
import sys
import tempfile
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, 'index.html')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'


def fail(msg):
    print('ОШИБКА: ' + msg + '\nindex.html не изменён.')
    sys.exit(1)


def faq_schema():
    """Собирает разметку частых вопросов прямо из content.js."""
    js = r"""
      global.window = {};
      require(process.argv[1]);
      var clean = function (t) {
        return String(t).replace(/[{}]/g, '').replace(/\[\[([^|\]]+)\|[^\]]*\]\]/g, '$1');
      };
      var items = window.SITE.faq.items.map(function (x) {
        return { '@type': 'Question', name: clean(x.q),
                 acceptedAnswer: { '@type': 'Answer', text: clean(x.a) } };
      });
      console.log(JSON.stringify({ '@context': 'https://schema.org',
                                   '@type': 'FAQPage', mainEntity: items }));
    """
    out = subprocess.run(['node', '-e', js, os.path.join(HERE, 'content.js')],
                         capture_output=True, text=True)
    if out.returncode != 0:
        fail('content.js не читается — проверьте запятые и кавычки.\n' + out.stderr)
    data = json.loads(out.stdout)
    body = json.dumps(data, ensure_ascii=False, indent=2)
    return ('<script type="application/ld+json">\n'
            + '\n'.join('  ' + line for line in body.split('\n'))
            + '\n  </script>')


def dump_dom(url, profile):
    """Chrome печатает готовую страницу, но сам не закрывается (его держит
    служба обновлений Google). Поэтому читаем вывод до </html> и закрываем сами."""
    proc = subprocess.Popen([
        CHROME, '--headless=new', '--disable-gpu', '--no-first-run',
        '--user-data-dir=' + profile, '--window-size=1280,900',
        '--virtual-time-budget=6000', '--dump-dom', url,
    ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8')
    chunks = []
    timer = threading.Timer(90, proc.kill)   # страховка, если Chrome вообще молчит
    timer.start()
    try:
        for line in proc.stdout:
            chunks.append(line)
            if '</html>' in line:
                break
    finally:
        timer.cancel()
        proc.kill()
        proc.wait()
    return ''.join(chunks)


def rendered_app():
    """Открывает сайт в Chrome без окна и возвращает нарисованное содержимое #app."""
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=HERE, **k)
    http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
    with http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler) as srv:
        port = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        # ignore_cleanup_errors: Chrome иногда ещё дописывает профиль, когда папку уже удаляем
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
            dom = dump_dom('http://127.0.0.1:%d/index.html?prerender' % port, profile)
        srv.shutdown()
    m = re.search(r'<div id="app">(.*?)</div>\s*<script src="config\.js', dom, re.S)
    if not m:
        fail('Chrome не вернул страницу.')
    html = m.group(1).strip()
    # Проверка, что страница правда нарисовалась, а не упала на полпути
    if '<h1' not in html or 'class="footer' not in html or len(html) < 20000:
        fail('страница нарисовалась не целиком — возможно, ошибка в content.js.')
    return html


def main():
    if not os.path.exists(CHROME):
        fail('не найден Google Chrome.')
    page = open(INDEX, encoding='utf-8').read()

    page, n = re.subn(r'(<!--faq-schema-->\s*).*?(\s*<!--/faq-schema-->)',
                      lambda m: m.group(1) + faq_schema() + m.group(2), page, flags=re.S)
    if n != 1:
        fail('в index.html не найдены метки <!--faq-schema-->.')

    app = rendered_app()
    page, n = re.subn(r'(<div id="app">).*?(</div>\s*<script src="config\.js)',
                      lambda m: m.group(1) + '\n' + app + '\n  ' + m.group(2), page, flags=re.S)
    if n != 1:
        fail('в index.html не найден блок <div id="app">.')

    open(INDEX, 'w', encoding='utf-8').write(page)
    print('Готово: index.html обновлён (%d КБ текста для поисковиков).' % (len(app) // 1024))


if __name__ == '__main__':
    main()
