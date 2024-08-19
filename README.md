
# Resources

## Programming Articles

* WebGL2:
    * [WebGL2 Smallest Programs](https://webgl2fundamentals.org/webgl/lessons/webgl-smallest-programs.html)
    * [WebGL Anti-Patterns](https://webgl2fundamentals.org/webgl/lessons/webgl-anti-patterns.html)
    * [WebGL2 - Less Code, More Fun](https://webgl2fundamentals.org/webgl/lessons/webgl-less-code-more-fun.html)
    * [WebGL2 Points, Lines, and Triangles](https://webgl2fundamentals.org/webgl/lessons/webgl-points-lines-triangles.html)
    * [WebGL2 Indexed Vertices](https://webgl2fundamentals.org/webgl/lessons/webgl-indexed-vertices.html)
    * [WebGL2 3D Perspective](https://webgl2fundamentals.org/webgl/lessons/webgl-3d-perspective.html)
    * [WebGL2 Drawing Without Data](https://webgl2fundamentals.org/webgl/lessons/webgl-drawing-without-data.html)
        * [Solid gl.POINTS emulation](https://jsgist.org/?src=6306857bfd65adbdcd54b0051d441935)
* Shader Programming:
    * [The Book Of Shaders - Chapter 10: Random](https://thebookofshaders.com/10/)
    * [The Book Of Shaders - Chapter 11: Noise](https://thebookofshaders.com/11/)
* Audio/Music:
    * [Alphabet-Piano](https://xem.github.io/alphabet-piano/)
    * [Zzfx](https://github.com/KilledByAPixel/ZzFX) - Used for sound effects
    * [ZzfxM](https://github.com/keithclark/ZzFXM) - Used for music
* Misc:
    * [GitHub - Scripts to Rule Them All](https://github.com/github/scripts-to-rule-them-all/tree/2e68071ef33c5c6f0d525db00997cd333ff93e8d)
    * [StackOverflow - Smoothed FPS Counter](https://stackoverflow.com/a/7796547/9157179)

## Music Inspiration

As I'm building a city builder, I have to go back to the city builder I grew up on: SimCity 4 Deluxe Edition. I don't want to replicate the soundtrack exactly, and I've heard it so many times I practically have it all memorized, but I found the slightly slower bpm of the live cover of "By The Bay" [here](https://www.youtube.com/watch?v=qR4IIKbRflQ) to be a good split from my memory to help me think about it. I also found Charles Cornell's analysis video on the [Sims 1 Building Mode 1 track](https://www.youtube.com/watch?v=IJMds3jT7c8) to be extremely valuable, as those building mode tracks were also a big part of my childhood and fit well into the smaller-scale city builder I'm building.

# Changelog by day

## Day 1: 2024-08-13

Started with an empty folder, wrote up `serve_hot.py` Python hot-reloading server, built on `aiohttp` and `watchfiles`. I then found and began following along with the [WebGL2 Smallest Programs](https://webgl2fundamentals.org/webgl/lessons/webgl-smallest-programs.html) blog post. I have 5 data-texture points moving up and down to a sine wave across the viewport. Most of my time went to the hot reloader and to fixing my viewport issues with the tips in [WebGL Anti-Patterns](https://webgl2fundamentals.org/webgl/lessons/webgl-anti-patterns.html). Not everything I agreed with, but the tips worked like nothing else I've tried. Starting now on [WebGL2 - Less Code, More Fun](https://webgl2fundamentals.org/webgl/lessons/webgl-less-code-more-fun.html) to see if I can prepare some helper functions to make my life easier.

Issues: The hot reloader won't quit without `kill -9`. Need to figure out what's eating the KeyboardInterrupts.

## Day 2: 2024-08-14

Started writing this changelog and initialized source control to make sure I don't lose track of my progress. Also dug deep into the `aiohttp.web.run_app` implementation to determine why it was eating my `KeyboardInterrupt`s. Turns out it had nothing to do with that -- my `await change.wait()` (which waits on an `asyncio.Event`) was never getting the `CancelledError` that the rest of the system was. Eventually I gave up and made a `shutdown_event`, then copied the `aiohttp.web.run_app` functionality to stick in a `shutdown_event.set()` call before final shutdown. This forces me to poll both the `shutdown_event` and my new file change lamport clock, but it does now work. I suspect the issue is that I'm supposed to return my Websocket and hold onto it for my own purposes, but I always assumed that closed the port. Will experiment tomorrow.

Did I get any work done on my game today? _No. But I did get a lot of work done on my development environment, and that's important too._ (Emphasis written by GitHub Copilot.)

## Day 3: 2024-08-15

Today, added the Scripts-To-Rule-Them-All pattern from [https://github.com/github/scripts-to-rule-them-all/](https://github.com/github/scripts-to-rule-them-all/tree/2e68071ef33c5c6f0d525db00997cd333ff93e8d), cleaned up `serve_hot.py`'s requirements and interface (added an `argparse.ArgumentParser`) then implemented a smoothed FPS counter from [this StackOverflow post](https://stackoverflow.com/a/7796547/9157179). To that, I added a cap on the frame number, to cause it to reach a certain number of frames of "history" then continue updating as if it was only at that point. This makes it responsive to current events but not too responsive to outliers. I also capped the number of updates of the display of the FPS counter to 4 times per second to make it legible and prevent it flickering distractingly.

## Day 4: 2024-08-16

No progress. (Roommates invited me out to a party.😎)

## Day 5: 2024-08-17

Researched the WebAudio API and explored options for building my own music system. I came across this neat little [Alphabet-Piano](https://xem.github.io/alphabet-piano/) that I tried referencing for a system of my own, but I realized I would struggle to create audio with something like that in the ways I wanted, and that it was relatively expensive bytes-wise compared to what I eventually chose. I settled on using [Zzfx](https://github.com/KilledByAPixel/ZzFX) for audio, with the add-on [ZzfxM](https://github.com/keithclark/ZzFXM) for music, as the authors' understanding of audio engineering better compressed any sounds than I could have managed and their API is extremely flexible. They also have authoring tools for making the sounds and music in their format, which will save me a bunch of fumbling about in my text editor as I was doing with the Alphabet-Piano.

Also expanded the Makefile to fetch the Zzfx and ZzfxM scripts from GitHub, and changed Scripts-To-Rule-Them-All to use the Makefile for boostrapping, that way if the scripts are already present we won't re-download them.

## Day 6: 2024-08-18

![First development house floating in the void](dev_screenshots/day6_house.png)

We have house! First perspective rendering results today, albeit with zero game engine behind them.