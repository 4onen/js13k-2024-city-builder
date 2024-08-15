#!/usr/bin/env python3
"""
A simple hot-reload server for development
"""
import os
import sys
import asyncio
import functools
import logging
from pathlib import Path
from typing import List

from aiohttp import web
import watchfiles

SCRIPT_HOT_JS = b"""<script>"use strict";
const u = new URL(window.location);
u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
u.hash = "";
u.search = "";
u.pathname = "/serve_hot.js";
const sck = (new WebSocket(u.href, "serve_hot")).addEventListener("message", (event) => {
    if (event.data === "reload") {
        window.location.reload();
    }
});</script>"""

_logger = logging.getLogger(__name__)

shutdown_event = asyncio.Event()

change_number: int = 0


async def watch_path(path: Path) -> None:
    """
    Watch a path for changes
    """
    # pylint: disable-next=global-statement
    global change_number
    error_count = 0
    try:
        async for _ in watchfiles.awatch(
            path,
            ignore_permission_denied=False,
            stop_event=shutdown_event,
        ):
            _logger.debug("Change %s detected", change_number)
            # pylint: disable-next=protected-access
            change_number += 1
    # pylint: disable-next=broad-except
    except Exception as e:
        error_count += 1
        _logger.exception(
            "Error %s watching path: %s\nExiting...",
            error_count,
            e,
        )
        raise SystemExit(1) from e
    _logger.info("Watching path process shut down.")


async def serve_hot_js(request):
    """Serve the hot-reload script or switch to websocket"""
    # If the protocol is websocket, switch to websocket
    my_change_number = change_number
    if request.headers.get("Upgrade", "").lower() == "websocket":
        ws = web.WebSocketResponse(protocols=["serve_hot"])
        await ws.prepare(request)
        try:
            while (
                my_change_number >= change_number
                and not ws.closed
                and not shutdown_event.is_set()
            ):
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass
        else:
            if not ws.closed and not shutdown_event.is_set():
                await ws.send_str("reload")
        await ws.close()
        return ws
    # Otherwise, error because we now inject the script into the page.
    raise web.HTTPForbidden()


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


async def my_run_app(
    app: web.Application,
    *,
    host: str = "localhost",
    port: int = 8080,
    **kwargs,
) -> None:
    """
    Copy of aiohttp.web._run_app with
    only the behavior I need
    """
    runner = web.AppRunner(
        app, host=host, port=port, handle_signals=False, **kwargs
    )

    await runner.setup()

    sites: List[web.BaseSite] = []

    try:
        if host is not None:
            sites.append(web.TCPSite(runner, host, port))
        for site in sites:
            await site.start()

        names = sorted(str(s.name) for s in runner.sites)
        print(
            f"======== Running on {', '.join(names)} ========"
            "\n(Press CTRL+C to quit)"
        )

        while True:
            await asyncio.sleep(3600)
    finally:
        await runner.cleanup()


def main() -> None:
    """
    Main function
    """
    logging.basicConfig(level=logging.DEBUG)

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
    loop.set_debug(True)
    # Put the file watching in the background
    loop.create_task(watch_path(Path(".")))
    # Run the server
    main_task = loop.create_task(my_run_app(app))
    _logger.info("Server startup complete.")
    try:
        asyncio.set_event_loop(loop)
        loop.run_until_complete(main_task)
    except (web.GracefulExit, KeyboardInterrupt):
        _logger.warning("Server shutting down.")
    # pylint: disable-next=broad-except
    except Exception as e:
        _logger.exception("Error running server: %s", e)
        raise SystemExit(1) from e
    finally:
        # All this code copied from asyncio.run for this
        # one line right here, because my asyncio.Event
        # setup wasn't getting the CancelledError
        shutdown_event.set()
        # pylint: disable-next=protected-access
        web._cancel_tasks({main_task}, loop)
        # pylint: disable-next=protected-access
        web._cancel_tasks(asyncio.all_tasks(loop), loop)
        loop.run_until_complete(loop.shutdown_asyncgens())
        loop.close()


if __name__ == "__main__":
    main()
