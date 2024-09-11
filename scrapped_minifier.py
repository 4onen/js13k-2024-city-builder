#!/usr/bin/env env/bin/python3

from pathlib import Path
import argparse
import re

WHITESPACE = re.compile(r'\s+')
JS_COMMENT = re.compile(r'/\*.*?\*/', re.DOTALL)
JS_ONELINE_COMMENT = re.compile(r'//.*?\n')
JS_AFTER_SEMICOLON = re.compile(r';\s*')
JS_AFTER_COMMA = re.compile(r',\s*')
JS_CONST = re.compile(r'\bconst\b') # Breaks shaders
HTML_COMMENT = re.compile(r'<!--.*?-->', re.DOTALL)
HTML_WHITESPACE = re.compile(r'>\s+<')

def minify_js(js: str) -> str:
    js = JS_COMMENT.sub('', js)
    js = JS_ONELINE_COMMENT.sub('', js)
    js = JS_AFTER_SEMICOLON.sub(';', js)
    js = JS_AFTER_COMMA.sub(',', js)
    # js = JS_CONST.sub('let', js) # Breaks shaders
    # js = WHITESPACE.sub(' ', js) # Breaks shaders
    return js

def minify_html(html: str) -> str:
    html = HTML_COMMENT.sub('', html)
    html = HTML_WHITESPACE.sub('><', html)
    html = WHITESPACE.sub(' ', html)
    return html

def get_argparser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Minify HTML and JS files')
    parser.add_argument(
        'files',
        metavar='FILE',
        type=argparse.FileType('r'),
        nargs='+',
        help='Files to minify',
    )
    parser.add_argument(
        '-o', '--output',
        metavar='DIR',
        type=Path,
        help='Output directory',
        required=True,
    )
    return parser

def main() -> None:
    parser = get_argparser()
    args = parser.parse_args()

    for file in args.files:
        if file.name.endswith('.js'):
            minified = minify_js(file.read())
        elif file.name.endswith('.html'):
            minified = minify_html(file.read())
        else:
            print(f'Unsupported file type: {file.name}')
            continue

        name = Path(file.name)
        filename = name.name
        with open(args.output / filename, 'w') as f:
            f.write(minified)

if __name__ == "__main__":
    main()
