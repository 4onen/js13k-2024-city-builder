DEPS=ZzFXMicro.min.js zzfxm.min.js

install_dev: env install_deps
	env/bin/pip install --upgrade pip
	env/bin/pip install -r requirements.txt

install_deps: $(addprefix game/dep/,$(DEPS))

.PHONY: install_dev

.PRECIOUS: env

env:
	python3 -m venv $@

game/dep/ZzFXMicro.min.js:
	mkdir -p game/dep
	curl --output-dir $< -O 'https://raw.githubusercontent.com/KilledByAPixel/ZzFX/e5390764053cf24c56e9d8f82c842345691d16d2/ZzFXMicro.min.js'

game/dep/zzfxm.min.js:
	mkdir -p game/dep
	curl --output-dir $< -O 'https://raw.githubusercontent.com/keithclark/ZzFXM/cb07fa9ca36aefd67a0c8c656d2958b62f8ed9fe/zzfxm.min.js'
