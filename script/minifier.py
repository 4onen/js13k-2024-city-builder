#!/usr/bin/env env/bin/python3
"""
Minify HTML and JS files
"""

from pathlib import Path
import argparse
import re

WHITESPACE = re.compile(r"\s+")
JS_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
JS_ONELINE_COMMENT = re.compile(r"//.*?\n")
JS_AFTER_SEMICOLON = re.compile(r";\s*")
JS_AFTER_COLON = re.compile(r":\s*")
JS_AFTER_COMMA = re.compile(r",\s*")
JS_AFTER_OPEN_CURLY = re.compile(r"\{\s*")
JS_AFTER_CLOSE_CURLY = re.compile(r"\}\s*")
JS_AFTER_OPEN_BRACKET = re.compile(r"\[\s*")
JS_AFTER_CLOSE_BRACKET = re.compile(r"\]\s*")
JS_CONST = re.compile(r"\bconst\b")  # Breaks shaders
JS_SPACE_AROUND_EQUAL = re.compile(r"\s*=\s*")
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
HTML_WHITESPACE = re.compile(r">\s+<")


def minify_js(js: str) -> str:
    js = JS_COMMENT.sub("", js)
    js = JS_ONELINE_COMMENT.sub("", js)
    js = JS_AFTER_SEMICOLON.sub(";", js)
    js = JS_AFTER_COLON.sub(":", js)
    js = JS_AFTER_COMMA.sub(",", js)
    js = JS_AFTER_OPEN_CURLY.sub("{", js)
    js = JS_AFTER_CLOSE_CURLY.sub("}", js)
    js = JS_AFTER_OPEN_BRACKET.sub("[", js)
    js = JS_AFTER_CLOSE_BRACKET.sub("]", js)
    js = JS_SPACE_AROUND_EQUAL.sub("=", js)
    # js = JS_CONST.sub('let', js) # Breaks shaders
    # js = WHITESPACE.sub(' ', js) # Breaks shaders
    return js


def minify_html(html: str) -> str:
    html = HTML_COMMENT.sub("", html)
    html = HTML_WHITESPACE.sub("><", html)
    html = JS_AFTER_SEMICOLON.sub(";", html)  # For CSS
    html = JS_AFTER_COLON.sub(":", html)  # For CSS
    html = JS_AFTER_OPEN_CURLY.sub("{", html)  # For CSS
    html = JS_AFTER_CLOSE_CURLY.sub("}", html)  # For CSS
    html = JS_COMMENT.sub("", html)  # For CSS
    html = WHITESPACE.sub(" ", html)
    return html


def get_argparser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Minify HTML and JS files")
    parser.add_argument(
        "files",
        metavar="FILE",
        type=argparse.FileType("r"),
        nargs="+",
        help="Files to minify",
    )
    parser.add_argument(
        "-o",
        "--output",
        metavar="FILE",
        type=Path,
        help="Output file (Valid only for single input file)",
    )
    parser.add_argument(
        "-d",
        "--output-dir",
        metavar="DIR",
        type=Path,
        help="Output directory",
    )
    return parser


def main() -> None:
    parser = get_argparser()
    args = parser.parse_args()

    if args.output and args.output_dir:
        print("--output and --output-dir are mutually exclusive")
        parser.print_help()
        return
    if args.output and len(args.files) > 1:
        print("--output is valid only for a single input file")
        parser.print_help()
        return
    if len(args.files) < 1:
        print("No files provided")
        parser.print_help()
        return

    for file in args.files:
        if file.name.endswith(".js"):
            minified = minify_js(file.read())
        elif file.name.endswith(".html"):
            minified = minify_html(file.read())
        else:
            print(f"Unsupported file type: {file.name}")
            continue

        if args.output:
            with open(args.output, "w") as f:
                f.write(minified)
            return
        else:
            name = Path(file.name)
            filename = name.name
            with open(args.output / filename, "w") as f:
                f.write(minified)


if __name__ == "__main__":
    main()
