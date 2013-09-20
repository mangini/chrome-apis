#!/bin/bash

CHROME_SRC=${PWD}/../chromium
TEMP_FILEPREFFIX=/tmp/__chromeapis_
TEMP_APP=${TEMP_FILEPREFFIX}apps.json
TEMP_EXT=${TEMP_FILEPREFFIX}extensions.json
GENERATION_TIME=`date -u +%y-%m-%d_%H%M_UTC`

GS_BUCKET=chrome-api

# stop if any command returns uncaught error
set -o pipefail
set -e

DRYRUN=
UPDATE_CHROME=1

# Check for command line flags
while [[ $* ]] ; do
  if [ "$1x" == "-nx" ] ; then
    echo "Dryrun - no changes will be made on remote repositories"
    DRYRUN=1
  elif [ "$1x" == "-cx" ] ; then
    echo "No Chrome source code update"
    UPDATE_CHROME=
  elif [ "$1x" == "-dx" -a -n "$2" ] ; then
    shift
    CHROME_SRC="$1"
  else
    echo "Unknown switch: $1"
    exit 1
  fi
  shift
done

echo "Using Chrome repo at $CHROME_SRC"

# update own source
git pull

# update index.html
if [ ! $DRYRUN ] ; then
  gsutil cp -R -a public-read site gs://${GS_BUCKET}
fi

# update chromium source
pushd ${CHROME_SRC}
if [ $UPDATE_CHROME ] ; then
  gclient sync
fi

# remove old temporary files
rm -f ${TEMP_APP} ${TEMP_EXT}

# extract data model from chromium source repository
popd
./generate_ide_agnostic_api.py -t apps -d ${CHROME_SRC}/src/chrome/common/extensions > ${TEMP_APP}
./generate_ide_agnostic_api.py -t extensions -d ${CHROME_SRC}/src/chrome/common/extensions > ${TEMP_EXT}

# check if data model was extracted
if [ -s ${TEMP_APP} -a -s ${TEMP_EXT} ] ; then
  
  # try to parse, to check if generated files are valid JSONs
  python -c "import json, io; json.load(open(\"${TEMP_APP}\", \"r\")); json.load(open(\"${TEMP_EXT}\", \"r\"));"

  # upload files to Google Cloud Storage, with public read access
  if [ ! $DRYRUN ] ; then
    gsutil cp -z json -a public-read ${TEMP_APP} gs://${GS_BUCKET}/apps_${GENERATION_TIME}.json
    gsutil cp -z json -a public-read ${TEMP_EXT} gs://${GS_BUCKET}/extensions_${GENERATION_TIME}.json
    gsutil cp -z json -a public-read ${TEMP_APP} gs://${GS_BUCKET}/apps_latest.json
    gsutil cp -z json -a public-read ${TEMP_EXT} gs://${GS_BUCKET}/extensions_latest.json
  else
    echo "DRYRUN: now I would copy apps_*.json and extensions_*.json to gs://${GS_BUCKET}"
  fi
  
else
  echo "Error, could not find valid files at ${TEMP_APP} and ${TEMP_EXT}!"
  exit 1
fi


## generate the IDE specific files:

# for Sublime:
SUBLIME_DIR_NAME=ChromeApis
SUBLIME_ROOT_DIR=/tmp
SUBLIME_DIR=${SUBLIME_ROOT_DIR}/${SUBLIME_DIR_NAME}

rm -Rf ${SUBLIME_DIR}
pushd ${SUBLIME_ROOT_DIR}
git clone git@github.com:mangini/chrome-apis-sublime.git ${SUBLIME_DIR_NAME}
popd

python SublimeApiGenerator.py ${TEMP_APP} ${SUBLIME_DIR}/apps.json
python SublimeApiGenerator.py ${TEMP_EXT} ${SUBLIME_DIR}/extensions.json

pushd ${SUBLIME_DIR}
echo "Let's update/commit object models"
git commit -m "updated apps and extensions object models" apps.json extensions.json
if [ ! $DRYRUN ] ; then
  git push
else
  echo "DRYRUN: now I would push the following changes..."
  git log origin/master..HEAD
fi

# applying changes to "published" branch:
git checkout -b published origin/published
git checkout master apps.json extensions.json
git commit -m "Merged apps and extensions object models from trunk"
if [ ! $DRYRUN ] ; then
  git push
else
  echo "DRYRUN: now I would push the following changes..."
  git log origin/published..HEAD
fi
popd

# stable/published version
tar czf /tmp/sublime_chromeapis_plugin_stable.tgz --exclude=".git" -C ${SUBLIME_ROOT_DIR} ${SUBLIME_DIR_NAME}
if [ ! $DRYRUN ] ; then
  gsutil cp -a public-read /tmp/sublime_chromeapis_plugin_stable.tgz gs://${GS_BUCKET}
else
  echo "DRYRUN: now I would copy /tmp/sublime_chromeapis_plugin_stable.tgz to gs://${GS_BUCKET}"
fi

pushd ${SUBLIME_DIR}
git checkout master
popd

# trunk version
tar czf /tmp/sublime_chromeapis_plugin.tgz --exclude=".git" -C ${SUBLIME_ROOT_DIR} ${SUBLIME_DIR_NAME}
if [ ! $DRYRUN ] ; then
  gsutil cp -a public-read /tmp/sublime_chromeapis_plugin.tgz gs://${GS_BUCKET}
else
  echo "DRYRUN: now I would copy /tmp/sublime_chromeapis_plugin.tgz to gs://${GS_BUCKET}"
fi

