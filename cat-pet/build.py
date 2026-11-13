#!/usr/bin/env python3
"""Bundle src/ into a single self-contained index.html.

Edit files in src/, then run:  python3 build.py
The output works when opened on its own (downloaded, emailed, from file://).
"""
import pathlib
import re

here = pathlib.Path(__file__).resolve().parent
src = here / 'src'
html = (src / 'index.html').read_text(encoding='utf-8')


def inline(match):
    path = src / match.group(1)
    code = path.read_text(encoding='utf-8').replace('</script', '<\\/script')
    return f'<script>/* {match.group(1)} */\n{code}\n</script>'


out, n = re.subn(r'<script src="([^"]+)"></script>', inline, html)
banner = '<!-- Built from src/ by build.py. Edit src/ and re-run the build instead of editing this file. -->\n'
(here / 'index.html').write_text(out.replace('<!doctype html>\n', '<!doctype html>\n' + banner, 1), encoding='utf-8')
print(f'Inlined {n} scripts -> index.html ({len(out) // 1024} KB)')
