
# Resources

## Programming Articles

* [WebGL2 Smallest Programs](https://webgl2fundamentals.org/webgl/lessons/webgl-smallest-programs.html)
* [WebGL Anti-Patterns](https://webgl2fundamentals.org/webgl/lessons/webgl-anti-patterns.html)
* [WebGL2 - Less Code, More Fun](https://webgl2fundamentals.org/webgl/lessons/webgl-less-code-more-fun.html)
* [GitHub - Scripts to Rule Them All](https://github.com/github/scripts-to-rule-them-all/tree/2e68071ef33c5c6f0d525db00997cd333ff93e8d)
* [StackOverflow - Smoothed FPS Counter](https://stackoverflow.com/a/7796547/9157179)

# Changelog by day

## 2024-08-13

Started with an empty folder, wrote up `serve_hot.py` Python hot-reloading server, built on `aiohttp` and `watchfiles`. I then found and began following along with the [WebGL2 Smallest Programs](https://webgl2fundamentals.org/webgl/lessons/webgl-smallest-programs.html) blog post. I have 5 data-texture points moving up and down to a sine wave across the viewport. Most of my time went to the hot reloader and to fixing my viewport issues with the tips in [WebGL Anti-Patterns](https://webgl2fundamentals.org/webgl/lessons/webgl-anti-patterns.html). Not everything I agreed with, but the tips worked like nothing else I've tried. Starting now on [WebGL2 - Less Code, More Fun](https://webgl2fundamentals.org/webgl/lessons/webgl-less-code-more-fun.html) to see if I can prepare some helper functions to make my life easier.

Issues: The hot reloader won't quit without `kill -9`. Need to figure out what's eating the KeyboardInterrupts.

## 2024-08-14

Started writing this changelog and initialized source control to make sure I don't lose track of my progress. Also dug deep into the `aiohttp.web.run_app` implementation to determine why it was eating my `KeyboardInterrupt`s. Turns out it had nothing to do with that -- my `await change.wait()` (which waits on an `asyncio.Event`) was never getting the `CancelledError` that the rest of the system was. Eventually I gave up and made a `shutdown_event`, then copied the `aiohttp.web.run_app` functionality to stick in a `shutdown_event.set()` call before final shutdown. This forces me to poll both the `shutdown_event` and my new file change lamport clock, but it does now work. I suspect the issue is that I'm supposed to return my Websocket and hold onto it for my own purposes, but I always assumed that closed the port. Will experiment tomorrow.

Did I get any work done on my game today? _No. But I did get a lot of work done on my development environment, and that's important too._ (Emphasis written by GitHub Copilot.)

## 2024-08-15

Today, added the Scripts-To-Rule-Them-All pattern from [https://github.com/github/scripts-to-rule-them-all/](https://github.com/github/scripts-to-rule-them-all/tree/2e68071ef33c5c6f0d525db00997cd333ff93e8d), cleaned up `serve_hot.py`'s requirements and interface (added an `argparse.ArgumentParser`) then implemented a smoothed FPS counter from [this StackOverflow post](https://stackoverflow.com/a/7796547/9157179). To that, I added a cap on the frame number, to cause it to reach a certain number of frames of "history" then continue updating as if it was only at that point. This makes it responsive to current events but not too responsive to outliers. I also capped the number of updates of the display of the FPS counter to 4 times per second to make it legible and prevent it flickering distractingly.

## 2024-08-16