# The dependencies of the project
# These are dependencies we download into the dep directory
# and minify over to the final package at build time.
DEPS=ZzFXMicro.min.js zzfxm.min.js

# The dependencies directory of the project
# This is where we keep the original dependencies
DEP_DIR=dep

# The targets of the project
# These are the files we wrote that we minify and include in the final package
TARGETS=g.js index.html favicon.ico

# The Python environment of the project
# I prefer this name, others may prefer others (like venv)
PYENV_DIR=env

# The source directory of the project
# This is where we keep the original files and check them into source control
SOURCE_DIR=src

# The build directory of the project
# This is where we keep the minified files and build the final package
BUILD_DIR=build

# The output file of the project
# This is the final package that we submit
OUT=submission.zip


# Now we begin the rules, which describe operations that we can perform on the
# project. Each rule has target(s), dependencies, and one or more commands. The
# target is the file that the rule creates or updates.
#
# The first few rules here are .PHONY rules, which don't directly produce
# anything, instead triggering necessary operations or other rules.


# This rule is the default target of the Makefile. If we just type `make` in
# the terminal, this is the rule that will be executed. It depends on the OUT
# file, which is the final package that we submit. If the OUT file is missing,
# then its rule will be executed to create our submission, which will depend on
# the build rule, which will depend on the dependencies and targets of the
# project. Thus, all of our building gets triggered with this one rule and
# updated on demand.
#
# The rule is also marked as .PHONY, which means that it doesn't correspond to
# a file on disk. This is because the OUT file is a file on disk, but the rule
# itself we use to print the size of the OUT file for our convenience.
size: $(OUT)
	stat -c %s $<

# This rule is a phony rule that installs the development environment of the
# project. It depends on the env directory, which is the Python environment of
# the project, as well as the requirements.txt file, which lists the Python
# packages that we need to install. The rule creates the Python environment and
# installs the packages into it.
install_dev: requirements.txt env
	$(PYENV_DIR)/bin/pip install --upgrade pip
	$(PYENV_DIR)/bin/pip install -r $<

# This rule is a phony rule that cleans the project. It removes the submission
# file and the build directory.
clean:
	rm -vrf submission.zip $(BUILD_DIR)

# This rule is a phony rule that cleans the project. It removes the submission
# file, the build directory, and the Python environment.
full_clean: clean
	rm -vrf env $(DEP_DIR) $(BUILD_DIR)

# This rule is a phony rule that builds the project. It depends on the
# dependencies and targets of the project, to make sure all of them are created
# and put in place.
build: $(addprefix $(DEP_DIR)/,$(DEPS)) $(addprefix $(BUILD_DIR)/,$(TARGETS))

# These two rules are special rules in Makefiles. The .PHONY rule marks the
# rules as not corresponding to files on disk, so that they always run when
# called. The .PRECIOUS rule marks the rules as not deleting the files they
# create if the rule fails. This is useful for files that take a while to
# create and we want to keep around, like Python environments.
.PHONY: install_dev clean full_clean size build
.PRECIOUS: env

# Rules below this point are concrete rules, in that they directly create
# files on disk.

# These two rules are pattern rule that minify the source files of the project.
# The rule creates the build directory if it doesn't exist, and then minifies
# the source files into the build directory. It also depends on the minifier
# script, which is the script that we use to minify the files.
# If there's a change to that script, then the source files will be minified
# again.
$(BUILD_DIR)/%: minifier.py env $(SOURCE_DIR)/%
	mkdir -p $(BUILD_DIR)
	./$< $(word 3,$^) -o $@

$(BUILD_DIR)/%: minifier.py env $(DEP_DIR)/%
	mkdir -p $(BUILD_DIR)
	./$< $(word 3,$^) -o $@

# This rule prevents minification of the favicon, since it's already in the
# correct format. Instead we just copy it over.
$(BUILD_DIR)/favicon.ico: $(SOURCE_DIR)/favicon.ico
	cp $^ $@

# This is the rule to create the final package. It depends on the dependencies
# and targets of the project, which are minified and put in place. It creates
# the final package by zipping up the build directory's contents.
$(OUT): $(addprefix $(BUILD_DIR)/,$(DEPS)) $(addprefix $(BUILD_DIR)/,$(TARGETS))
	rm -f $@
	cd $(BUILD_DIR) && zip -r ../$@ .

# This is the rule to create our python environment. That's all.
$(PYENV_DIR):
	python3 -m venv $@

# These are the rules to download the dependencies of the project. They create
# the dependencies directory if it doesn't exist, and then download specific
# files from GitHub releases into that directory.
#
# I did this both to figure out if I could and because I was too lazy to copy
# their license files and explain which files are under which licenses. This
# also helps establish provenance of the files, though I'm unsure what'll
# happen if these repos are ever yanked from GitHub or rebased...
$(DEP_DIR)/ZzFXMicro.min.js:
	mkdir -p $(DEP_DIR)
	curl --output-dir $(DEP_DIR) -O 'https://raw.githubusercontent.com/KilledByAPixel/ZzFX/e5390764053cf24c56e9d8f82c842345691d16d2/ZzFXMicro.min.js'

$(DEP_DIR)/zzfxm.min.js:
	mkdir -p $(DEP_DIR)
	curl --output-dir $(DEP_DIR) -O 'https://raw.githubusercontent.com/keithclark/ZzFXM/cb07fa9ca36aefd67a0c8c656d2958b62f8ed9fe/zzfxm.min.js'
