install_dev: env
	env/bin/pip install --upgrade pip
	env/bin/pip install -r server-requirements.txt

.PHONY: install_dev

.PRECIOUS: env

env:
	python3 -m venv $@

