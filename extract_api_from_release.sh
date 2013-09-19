#!/bin/bash

CHROME_SRC=${PWD}/../chromium
TEMP_FILEPREFFIX=/tmp/__chromeapis_
GENERATION_TIME=`date -u +%y-%m-%d_%H%M_UTC`

GS_BUCKET=chrome-api

# stop if any command returns uncaught error
set -o pipefail
set -e

DRYRUN=
UPDATE_CHROME=1



function extract_API {

REL=$1
CHROME_SRC=/tmp/chromium_${REL}
TEMP_APP=${TEMP_FILEPREFFIX}apps_${REL}.json
TEMP_EXT=${TEMP_FILEPREFFIX}extensions_${REL}.json
mkdir -p $CHROME_SRC
pushd $CHROME_SRC
gclient config https://src.chromium.org/chrome/releases/${REL}

mv .gclient .gclient_bkp
cat .gclient_bkp | perl -pe '$a=$_; 
$custom_deps=qq!"custom_deps": {
    "src/third_party/WebKit/LayoutTests": None,
    "src/content/test/data/layout_tests/LayoutTests": None,
    "src/chrome/tools/test/reference_build/chrome_win": None,
    "src/chrome_frame/tools/test/reference_build/chrome_win": None,
    "src/chrome/tools/test/reference_build/chrome_linux": None,
    "src/chrome/tools/test/reference_build/chrome_mac": None,
    "src/third_party/hunspell_dictionaries": None,
  }!;
while (<>) { 
  $a.=$_; 
} 
$a =~ s/"custom_deps"\s*:\s*{[^}]*}/$custom_deps/s; 
print $a; ' | cat > .gclient
rm .gclient_bkp

gclient sync

# copy the appropriate third_party dependencies for docs server
pushd ${CHROME_SRC}/src/chrome/common/extensions/docs/server2
python build_server.py
popd

# extract data model from chromium source repository
popd
./generate_ide_agnostic_api.py -t apps -d ${CHROME_SRC}/src/chrome/common/extensions > ${TEMP_APP}
./generate_ide_agnostic_api.py -t extensions -d ${CHROME_SRC}/src/chrome/common/extensions > ${TEMP_EXT}

# check if data model was extracted
if [ -s ${TEMP_APP} -a -s ${TEMP_EXT} ] ; then
  
  # try to parse, to check if generated files are valid JSONs
  python -c "import json, io; json.load(open(\"${TEMP_APP}\", \"r\")); json.load(open(\"${TEMP_EXT}\", \"r\"));"

else
  echo "Error, could not find valid files at ${TEMP_APP} and ${TEMP_EXT}!"
  exit 1
fi

}


# update own source
git pull

# Check for command line flags
while [[ $* ]] ; do
  echo "Extracting API from release $1"
  extract_API $1
  shift
done
