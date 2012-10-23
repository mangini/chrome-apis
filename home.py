#!/usr/bin/env python
#
# Copyright 2007 Google Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
import cgi
import webapp2

class MainPage(webapp2.RequestHandler):
  def get(self):
    self.response.out.write('<html><body>')

    self.response.out.write("""
          <a href="chromeapps-sublime.zip">Chrome Apps Sublime plugin</a><br/>
          Definitions file for <a href="apps.json">Chrome Apps</a> and for <a href="extensions.json">Chrome Extenstions</a>
<ul>
<li>that's where your preferred IDE's plugins will come</li>
</ul>
        </body>
      </html>""")


app = webapp2.WSGIApplication([
  ('/', MainPage)
], debug=True)
