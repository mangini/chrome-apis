#!/bin/bash

CHROME_SRC=${PWD}/../chromium
GITHUB_CHROMEAPIS=${PWD}
TEMP_FILEPREFFIX=/tmp/__chromeapis_
TEMP_APP=${TEMP_FILEPREFFIX}apps.json
TEMP_EXT=${TEMP_FILEPREFFIX}extensions.json
GENERATION_TIME=`date -u +%y-%m-%d_%H%M_UTC`

GS_BUCKET=chrome-api

# stop if any command returns uncaught error
set -o pipefail
set -e

# update own source
git pull

# update chromium source
cd ${CHROME_SRC}
gclient sync

# remove old temporary files
rm -f ${TEMP_APP} ${TEMP_EXT}

# extract data model from chromium source repository
cd ${GITHUB_CHROMEAPIS}
./generate_ide_agnostic_api.py -t apps -d ${CHROME_SRC}/src/chrome/common/extensions > ${TEMP_APP}
./generate_ide_agnostic_api.py -t extensions -d ${CHROME_SRC}/src/chrome/common/extensions > ${TEMP_EXT}

# check if data model was extracted
if [ -s ${TEMP_APP} -a -s ${TEMP_EXT} ] ; then
  
  # try to parse, to check if generated files are valid JSONs
  python -c "import json, io; json.load(open(\"${TEMP_APP}\", \"r\")); json.load(open(\"${TEMP_EXT}\", \"r\"));"

  # upload files to Google Cloud Storage, with public read access
  gsutil cp -z json -a public-read ${TEMP_APP} gs://${GS_BUCKET}/apps_${GENERATION_TIME}.json
  gsutil cp -z json -a public-read ${TEMP_EXT} gs://${GS_BUCKET}/extensions_${GENERATION_TIME}.json
  gsutil cp -z json -a public-read ${TEMP_APP} gs://${GS_BUCKET}/apps_latest.json
  gsutil cp -z json -a public-read ${TEMP_EXT} gs://${GS_BUCKET}/extensions_latest.json
  
else
  echo "Error, could not find valid files at ${TEMP_APP} and ${TEMP_EXT}!"
  exit 1
fi


## generate the IDE specific files:

# for Sublime:
SUBLIME_DIR_NAME=ChromeApis
SUBLIME_DIR=/tmp/${SUBLIME_DIR_NAME}

rm -Rf ${SUBLIME_DIR}
cp -R sublime ${SUBLIME_DIR}

python SublimeApiGenerator.py ${TEMP_APP} ${SUBLIME_DIR}/apps.json
python SublimeApiGenerator.py ${TEMP_EXT} ${SUBLIME_DIR}/extensions.json

tar czf /tmp/sublime_chromeapis_plugin.tgz -C /tmp ${SUBLIME_DIR_NAME}
gsutil cp -a public-read /tmp/sublime_chromeapis_plugin.tgz gs://${GS_BUCKET}

