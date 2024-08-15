
# Resources

## Programming Articles

* [WebGL2 Smallest Programs](https://webgl2fundamentals.org/webgl/lessons/webgl-smallest-programs.html)
* [WebGL Anti-Patterns](https://webgl2fundamentals.org/webgl/lessons/webgl-anti-patterns.html)
* [WebGL2 - Less Code, More Fun](https://webgl2fundamentals.org/webgl/lessons/webgl-less-code-more-fun.html)

# Changelog by day

## 2024-08-13

Started with an empty folder, wrote up `serve_hot.py` Python hot-reloading server, built on `aiohttp` and `watchfiles`. I then found and began following along with the [WebGL2 Smallest Programs](https://webgl2fundamentals.org/webgl/lessons/webgl-smallest-programs.html) blog post. I have 5 data-texture points moving up and down to a sine wave across the viewport. Most of my time went to the hot reloader and to fixing my viewport issues with the tips in [WebGL Anti-Patterns](https://webgl2fundamentals.org/webgl/lessons/webgl-anti-patterns.html). Not everything I agreed with, but the tips worked like nothing else I've tried. Starting now on [WebGL2 - Less Code, More Fun](https://webgl2fundamentals.org/webgl/lessons/webgl-less-code-more-fun.html) to see if I can prepare some helper functions to make my life easier.

Issues: The hot reloader won't quit without `kill -9`. Need to figure out what's eating the KeyboardInterrupts.

## 2024-08-14

Started writing this changelog and initialized source control to make sure I don't lose track of my progress.
