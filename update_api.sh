#!/bin/bash

CHROME_SRC=${PWD}/../chromium
GITHUB_CHROMEAPIS=${PWD}
TEMP_FILEPREFFIX=/tmp/__chromeapis_
TEMP_APP=${TEMP_FILEPREFFIX}apps.json
TEMP_EXT=${TEMP_FILEPREFFIX}extensions.json
GENERATION_TIME=`date -u +%y-%m-%d_%H%M_UTC`

# stop if any command returns uncaught error
set -o pipefail
set -e

# update chromium source
cd ${CHROME_SRC}
gclient sync

# remove old temporary files
rm -f ${TEMP_APP} ${TEMP_EXT} ${TEMP_APP}.gz ${TEMP_EXT}.gz

# extract data model from chromium source repository
cd ${GITHUB_CHROMEAPIS}
./generate_ide_agnostic_api.py -t apps -d ${CHROME_SRC}/src/chrome/common/extensions > ${TEMP_APP}
./generate_ide_agnostic_api.py -t extensions -d ${CHROME_SRC}/src/chrome/common/extensions > ${TEMP_EXT}

# check if data model was extracted
if [ -s ${TEMP_APP} -a -s ${TEMP_EXT} ] ; then
  
  # try to parse, to check if generated files are valid JSONs
  python -c "import json, io; json.load(open(\"${TEMP_APP}\", \"r\")); json.load(open(\"${TEMP_EXT}\", \"r\"));"

  # gzip to save bandwidth
  gzip ${TEMP_APP}
  gzip ${TEMP_EXT}

  # upload files to Google Cloud Storage, with public read access
  gsutil cp -a public-read ${TEMP_APP}.gz gs://chrome-api/apps_${GENERATION_TIME}.json.gz
  gsutil cp -a public-read ${TEMP_EXT}.gz gs://chrome-api/extensions_${GENERATION_TIME}.json.gz
  gsutil cp -a public-read ${TEMP_APP}.gz gs://chrome-api/apps_latest.json.gz
  gsutil cp -a public-read ${TEMP_EXT}.gz gs://chrome-api/extensions_latest.json.gz
  #gsutil ls "gs://chrome-api/*.json.gz
  
else
  echo "Error, could not find valid files at ${TEMP_APP} and ${TEMP_EXT}!"
  exit 1
fi

