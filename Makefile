DEPS=ZzFXMicro.min.js zzfxm.min.js
TARGETS=g.js index.html
ENV_DIR=env
SOURCE_DIR=src
BUILD_DIR=build
DEP_DIR=dep
OUT=submission.zip

size: $(OUT)
	stat -c %s $<

install_dev: env $(addprefix $(DEP_DIR)/,$(DEPS))
	env/bin/pip install --upgrade pip
	env/bin/pip install -r requirements.txt

clean:
	rm -vrf submission.zip $(BUILD_DIR)

full_clean: clean
	rm -vrf env $(DEP_DIR) $(BUILD_DIR)

build: $(addprefix $(DEP_DIR)/,$(DEPS)) $(addprefix $(BUILD_DIR)/,$(TARGETS))

$(BUILD_DIR)/%: $(SOURCE_DIR)/%
	mkdir -p $(BUILD_DIR)
	./minifier.py $^ -o $(BUILD_DIR)

$(BUILD_DIR)/%: $(DEP_DIR)/%
	mkdir -p $(BUILD_DIR)
	./minifier.py $^ -o $(BUILD_DIR)

.PHONY: install_dev clean full_clean size build

.PRECIOUS: env

$(OUT): $(addprefix $(BUILD_DIR)/,$(DEPS)) $(addprefix $(BUILD_DIR)/,$(TARGETS))
	rm -f $@
	cd $(BUILD_DIR) && zip -r ../$@ .

env:
	python3 -m venv $@

$(DEP_DIR)/ZzFXMicro.min.js:
	mkdir -p $(DEP_DIR)
	curl --output-dir $(DEP_DIR) -O 'https://raw.githubusercontent.com/KilledByAPixel/ZzFX/e5390764053cf24c56e9d8f82c842345691d16d2/ZzFXMicro.min.js'

$(DEP_DIR)/zzfxm.min.js:
	mkdir -p $(DEP_DIR)
	curl --output-dir $(DEP_DIR) -O 'https://raw.githubusercontent.com/keithclark/ZzFXM/cb07fa9ca36aefd67a0c8c656d2958b62f8ed9fe/zzfxm.min.js'
