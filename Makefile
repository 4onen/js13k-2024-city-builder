DEPS=ZzFXMicro.min.js zzfxm.min.js
ENV_DIR=env
GAME_DIR=game/
DEP_DIR=$(GAME_DIR)/dep/
OUT=submission.zip

size: $(OUT)
	stat -c %s $<

install_dev: env $(addprefix $(DEP_DIR),$(DEPS))
	env/bin/pip install --upgrade pip
	env/bin/pip install -r requirements.txt

clean:
	rm -vrf submission.zip

full_clean: clean
	rm -vrf env $(DEP_DIR)

.PHONY: install_dev clean full_clean size

.PRECIOUS: env

$(OUT): $(addprefix $(DEP_DIR),$(DEPS)) $(wildcard game/*)
	cd game && zip -r ../$@ .

env:
	python3 -m venv $@

$(DEP_DIR)/ZzFXMicro.min.js:
	mkdir -p game/dep
	curl --output-dir $< -O 'https://raw.githubusercontent.com/KilledByAPixel/ZzFX/e5390764053cf24c56e9d8f82c842345691d16d2/ZzFXMicro.min.js'

$(DEP_DIR)/zzfxm.min.js:
	mkdir -p game/dep
	curl --output-dir $< -O 'https://raw.githubusercontent.com/keithclark/ZzFXM/cb07fa9ca36aefd67a0c8c656d2958b62f8ed9fe/zzfxm.min.js'
