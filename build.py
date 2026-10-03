#!/usr/bin/env python3
"""Build Diptych into one self-contained HTML page.

src/index.html is the page template. Every line of the form

    /* @include styles/base.css */      (inside <style>)
    // @include engine/engine.js        (inside <script>)
    <!-- @include some/file.html -->    (in markup)

is replaced by the contents of that file (path relative to src/). The JS files
are concatenated into ONE classic <script>, so they share a single global scope
and run in the order listed in the template: top-level code in a later file can
use anything an earlier file defined, and function declarations hoist across
all of them, exactly as in the original single file.

There are two pages: src/index.html -> dist/diptych.html (the synth) and
src/fm/index.html -> dist/fm.html (a standalone FM synth sketch). Include paths
are always relative to src/.

Usage:
    python3 build.py            write both pages to dist/
    python3 build.py --check    fail if either page in dist/ is out of date
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
TARGETS = [('index.html', 'diptych.html'), ('fm/index.html', 'fm.html')]
INCLUDE = re.compile(r'^\s*(?:/\*|//|<!--)\s*@include\s+(\S+?)\s*(?:\*/|-->)?\s*$')


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def build(template, used):
    seen, out = set(), []
    for line in read(os.path.join(SRC, template)).splitlines(keepends=True):
        m = INCLUDE.match(line)
        if not m:
            out.append(line)
            continue
        rel = m.group(1)
        if rel in seen:
            sys.exit(f'build: {rel} is included twice in {template}')
        path = os.path.join(SRC, rel)
        if not os.path.isfile(path):
            sys.exit(f'build: missing include {rel} in {template}')
        body = read(path)
        if '</script' in body.lower() and rel.endswith('.js'):
            sys.exit(f'build: {rel} contains "</script", which would end the inline script early')
        seen.add(rel); used.add(rel)
        out.append(body if body.endswith('\n') else body + '\n')
    return ''.join(out)


def main():
    used = set()
    pages = [(out, build(tpl, used)) for tpl, out in TARGETS]
    orphans = sorted(
        os.path.relpath(os.path.join(d, f), SRC).replace(os.sep, '/')
        for d, _, fs in os.walk(SRC) for f in fs
        if f.endswith(('.js', '.css')) and not f.startswith('.')
    )
    orphans = [o for o in orphans if o not in used]
    if orphans:
        sys.exit('build: source files not included by any page: ' + ', '.join(orphans))
    for name, html in pages:
        path = os.path.join(ROOT, 'dist', name)
        if '--check' in sys.argv:
            if (read(path) if os.path.isfile(path) else None) != html:
                sys.exit(f'build: dist/{name} is out of date; run python3 build.py')
            print(f'build: dist/{name} is up to date')
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(html)
        print(f'build: wrote dist/{name} ({len(html.encode("utf-8")):,} bytes)')


if __name__ == '__main__':
    main()
