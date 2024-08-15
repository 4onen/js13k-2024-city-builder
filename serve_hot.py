#!/usr/bin/env python3
"""
A simple hot-reload server for development
"""
import sys
import asyncio
import functools
import logging
from pathlib import Path

from aiohttp import web
from watchfiles import awatch

SERVE_HOT_JS = Path("serve_hot.mjs").read_bytes()

SCRIPT_HOT_JS = b"<script>%s</script>" % (SERVE_HOT_JS,)

_logger = logging.getLogger(__name__)

change = asyncio.Event()


async def watch_path(path: Path, max_error_count: int = 3) -> None:
    """
    Watch a path for changes
    """
    error_count = 0
    while True:
        try:
            async for _ in awatch(path, ignore_permission_denied=False):
                change.set()
                await asyncio.sleep(0.1)
                change.clear()
        except KeyboardInterrupt:
            _logger.info("Keyboard interrupt. Exiting...")
            sys.exit(0)
        # pylint: disable-next=broad-except
        except Exception as e:
            error_count += 1
            if error_count > max_error_count:
                _logger.exception(
                    "Error %s watching path: %s\nExiting...",
                    error_count,
                    e,
                )
                sys.exit(1)
            _logger.exception(
                "Error %s watching path: %s\nWill try to restart...",
                error_count,
                e,
            )


async def serve_hot_js(request):
    """Serve the hot-reload script or switch to websocket"""
    # If the protocol is websocket, switch to websocket
    if request.headers.get("Upgrade", "").lower() == "websocket":
        ws = web.WebSocketResponse(protocols=["serve_hot"])
        await ws.prepare(request)
        await change.wait()
        await ws.send_str("reload")
        await ws.close()
        return ws
    # Otherwise, stream the hot-reload script
    return web.Response(body=SERVE_HOT_JS, content_type="text/javascript")


CONTENT_TYPES = {
    ".css": "text/css",
    ".gif": "image/gif",
    ".html": "text/html",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".json": "application/json",
    ".js": "text/javascript",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
}


async def serve_file_raw(path: Path):
    """
    Serve a file as raw bytes

    Guess the content type based on the file extension
    """
    content_type = CONTENT_TYPES.get(
        path.suffix.lower(), "application/octet-stream"
    )
    assert path.is_file()
    return web.FileResponse(path=path, headers={"Content-Type": content_type})


def read_inject_html(path: Path):
    """
    Read an HTML file and inject the hot-reload script right after the <head> tag
    """
    return path.read_bytes().replace(b"<head>", b"<head>%s" % (SCRIPT_HOT_JS,))


async def serve_html(path: Path):
    """
    Serve an HTML file with the hot-reload script injected right before the </body> tag
    """
    return web.Response(
        body=read_inject_html(path),
        content_type="text/html",
    )


async def serve_other(root: Path, request):
    """
    Serve other files. All files are served relative to root.
    """
    path = request.match_info.get("path", "")
    if path and path[0] == "/":
        path = path[1:]
    merged_path = root / path
    try:
        merged_path = merged_path.relative_to(root)
    except ValueError as e:
        _logger.error("Path not in root: %s", merged_path)
        raise web.HTTPForbidden(
            body="No, you may not look at my other files."
        ) from e
    if merged_path.is_dir():
        merged_path /= "index.html"
    if not merged_path.exists():
        _logger.error("File not found: %s", merged_path)
        raise web.HTTPNotFound()
    if not merged_path.is_file():
        _logger.info("Not a file: %s", merged_path)
        raise web.HTTPForbidden()
    if merged_path.suffix == ".html":
        return await serve_html(merged_path)
    return await serve_file_raw(merged_path)


def print_usage():
    """
    Print the usage of the script
    """
    print("Usage: serve_hot.py [root]")
    print("  root: The root directory to serve files from")


@web.middleware
async def no_cache_middleware(request, handler):
    """
    Middleware to add no-cache headers
    """
    response = await handler(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@web.middleware
async def log_every_inbound_request(request, handler):
    """
    Middleware to log every inbound request
    """
    _logger.debug("Inbound request: %s", request)
    return await handler(request)


if __name__ == "__main__":
    import os

    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) == 2:
        root_dir = Path(sys.argv[1])
    else:
        print_usage()
        sys.exit(1)

    app = web.Application(
        logger=_logger,
        middlewares=[
            web.normalize_path_middleware(),
            no_cache_middleware,
        ],
    )
    app.router.add_route("GET", "/serve_hot.js", serve_hot_js)
    app.router.add_route(
        "GET", "/{path:.*}", functools.partial(serve_other, root_dir)
    )
    app.router.add_route("GET", "/", functools.partial(serve_other, root_dir))

    os.chdir(root_dir)

    # Get the event loop
    loop = asyncio.get_event_loop()
    # Put the file watching in the background
    loop.create_task(watch_path(Path(".")))
    # Run the server
    web.run_app(app, host="localhost", port=8080, loop=loop)
