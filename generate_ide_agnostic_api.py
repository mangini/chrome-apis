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
  templates = inst._template_data_source_factory.Create(None, apiType+"/api.json")

  content = None
  api_names = templates._api_list_data_source.get(apiType)
  all_apis = {}
  for api in api_names['experimental']:
    _Add_Api(api, templates, all_apis)
  for api in api_names['chrome']:
    _Add_Api(api, templates, all_apis)

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
  parser.add_option('-c', '--channel', default="trunk",
      help='Name of the chromium channel (trunk, dev, beta or stable). Defaults to "trunk"')

  (opts, argv) = parser.parse_args()

  if (not os.path.isdir(opts.directory) or
      not os.path.isdir(os.path.join(opts.directory, 'docs')) or
      not os.path.isdir(os.path.join(opts.directory, 'api'))):
    sys.stderr.write('Directory does not exist or does not contain extension '
          'docs. Please, use -h option to get help on command line options.\n')
    exit()

  sys.path.append(os.path.join(opts.directory, "docs", "server2"))

  from fake_fetchers import ConfigureFakeFetchers
  from file_system import FileNotFoundError
  import compiled_file_system as compiled_fs

  local_path = opts.directory
  ConfigureFakeFetchers(os.path.join(local_path, DOCS_PATH))

  import handler

  channel_name = opts.channel
  handler._CleanBranches()
  inst = handler._GetInstanceForBranch(channel_name, local_path)
  
  print(GenerateAPI(inst, opts.type))
