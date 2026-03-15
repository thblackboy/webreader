#!/bin/bash
source "$(dirname "$0")/venv/bin/activate"
export SEARXNG_SETTINGS_PATH="$(dirname "$0")/settings.yml"
python -m searx.webapp
