# Dependencies

## Runtime

As part of the JS13K competition, the game must be self-contained and not rely
on external libraries. As such, the following two libraries have been vendored
into the project under the MIT license:

* [Zzfx](https://github.com/KilledByAPixel/ZzFX)
  * Provides sound effects for the game - hover, click, building placement, etc.
  * Version: e5390764053cf24c56e9d8f82c842345691d16d2/ZzFXMicro.min.js
* [ZzfxM](https://github.com/keithclark/ZzFXM)
  * Provides a music engine for the game on top of Zzfx.
  * Version: cb07fa9ca36aefd67a0c8c656d2958b62f8ed9fe/zzfxm.min.js

## Build time

* The Python 3.10 standard library (Thanks Python Software Foundation!)
* The GNU `make` utility (Thanks Free Software Foundation!)
* Too many standard unix utilities for me to count. (Thanks to everyone working on the Linux user experience and GNU project!)

## Debug time (Hot reloading server)

The following Python libraries are used to provide a hot-reloading server for
the game during development:

* `aiohttp==3.10.3` - A Python web server library for serving the game files.
* `watchfiles==0.23.0` - A Python library to notify the server so I can hot reload.

These libraries transitively depend on many more Python libraries. Forgive me
for not taking the time to list them all.
