#!/usr/bin/python
# Copyright (c) 2012 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

from fnmatch import fnmatch
import optparse
import os
import json
import sys
import re


DOCS_PATH = 'docs'

def _Add_Api(api, templates, all_apis):
  api_name = re.sub(r'(.*)(devtools)\.([^.]+)', r'\2/\1\3', api['name'])
  #sys.stderr.write("API = %s    API_NAME = %s\n" % (api['name'], api_name.replace('.', '_')))
  api_data = templates._api_data_source.get(api_name.replace('.', '_'))
  api_name = 'chrome.'+api['name']
  all_apis[api_name] = {}
  _Add_Api_obj(all_apis[api_name], api_data, 'functions')
  sys.stderr.write("  adding %s: %d functions, %d events, %d properties and %d types\n" % (api_name,
    len(api_data['functions']),  
    len(api_data['events']),  
    len(api_data['properties']),  
    len(api_data['types'])
    ))
  _Add_Api_obj(all_apis[api_name], api_data, 'events')
  _Add_Api_obj(all_apis[api_name], api_data, 'properties')
  _Add_Api_obj(all_apis[api_name], api_data, 'types')

def _Add_Api_obj(api_obj, api_data, key):
  if key in api_data:
    api_obj[key] = api_data[key]  

def GenerateAPI(inst, apiType):
  # uses _api_list_data_source and _api_data_source
  templates = inst.template_data_source_factory.Create(None, apiType+"/api.json")

  content = None
  api_names = templates._api_list_data_source.get(apiType)
  all_apis = {}
  for api in api_names['experimental']:
    _Add_Api(api, templates, all_apis)
  for api in api_names['chrome']:
    _Add_Api(api, templates, all_apis)
  for api in api_names['private']:
    if api['name'] == 'webview':
      _Add_Api(api, templates, all_apis)
  
  import subprocess, datetime
  git_meta = subprocess.Popen(
      ['git', 'log', '-1', '--pretty=format:{ "lastcommit": \"%H\", "lastcommit_at": \"%ci\" }', '.'],
      stdout=subprocess.PIPE).communicate()[0]

  all_apis['_meta'] = { 
    "git" : json.loads(git_meta),
    "build" : { "date": datetime.datetime.utcnow().strftime("%Y/%m/%d %H:%M GMT") }
    }
  content=json.dumps(all_apis, sort_keys=True, indent=2)
  return content

if __name__ == '__main__':
  parser = optparse.OptionParser(
      description='Read chromium API docs and generate a JSON IDE-agnostic file.',
      usage='usage: %prog [option]...')
  parser.add_option('-d', '--directory', default="",
      help='Extensions directory to serve from - '
           'should be chrome/common/extensions within a Chromium checkout. Defaults to current dir')
  parser.add_option('-t', '--type', default="apps",
      help='Type of API to generate (apps or extensions). Defaults to "apps"')

  (opts, argv) = parser.parse_args()

  if (not os.path.isdir(opts.directory) or
      not os.path.isdir(os.path.join(opts.directory, 'docs')) or
      not os.path.isdir(os.path.join(opts.directory, 'api'))):
    sys.stderr.write('Directory does not exist or does not contain extension '
          'docs. Please, use -h option to get help on command line options.\n')
    exit()

  sys.path.insert(0, os.path.join(opts.directory, "docs", "server2"))

  import build_server
# Copy all the files necessary to run the server. These are cleaned up when the
# server quits.
  build_server.main()

  from server_instance import ServerInstance

  inst = ServerInstance.ForLocal()
  
  print(GenerateAPI(inst, opts.type))
