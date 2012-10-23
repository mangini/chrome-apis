import sublime, sublime_plugin
import json, os, re, cPickle

API_SIMPLIFIER=re.compile('chrome\.(?:experimental\.)?(.*)')
PACKAGE_NAME = "ChromeApp"

MANIFEST_LOOKSLIKE_NOTHING=0
MANIFEST_LOOKSLIKE_APP=1
MANIFEST_LOOKSLIKE_EXTENSION=2

def debug(obj):
	print('[ChromeApp] %s' % obj)

class ChromeApp(sublime_plugin.EventListener):

	def __init__(self):
		debug("initiating EventListener!")
		self.activeInViews={}
		self.appsCompletions=cPickle.load(open("%s/%s/apps.json" % 
			(sublime.packages_path(), PACKAGE_NAME), 'r'))
		self.appsCompletions=cPickle.load(open("%s/%s/extensions.json" % 
			(sublime.packages_path(), PACKAGE_NAME), 'r'))
		debug(self.appsCompletions)

	def activateForView(self, view, appType):
		self.activeInViews[view.id()] = appType
		status = "Chrome Packaged App" if appType==MANIFEST_LOOKSLIKE_APP else "Chrome Extension"
		view.set_status("ChromeApp", status)
		debug("activated for view %s as type %s" % (view.file_name(), appType))

	def deactivateForView(self, view):
		if view.id() in self.activeInViews:
			del self.activeInViews[view.id()]
		view.erase_status("ChromeApp")
		debug("deactivated for view %s" % view.file_name())

	def check_view(self, view, force=False):
		if view.file_name() == None or view.id() == None:
			return False

		if not force and view.id() in self.activeInViews:
			return self.activeInViews[view.id()]

		if view.file_name().endswith(".js"):
			manifestName=os.path.dirname(view.file_name())+"/manifest.json"
			if os.path.isfile(manifestName):
				looksLike=self.processManifest(manifestName)
				if looksLike!=MANIFEST_LOOKSLIKE_NOTHING:
					self.activateForView(view, looksLike)
					return True

		self.deactivateForView(view)
		return False

	def processManifest(self, path):
		try:
			obj = json.load(open(path, 'r'))
			if not 'name' in obj:
				return MANIFEST_LOOKSLIKE_NOTHING
			if 'app' in obj and 'background' in obj['app']:
				return MANIFEST_LOOKSLIKE_APP
			else:
				return MANIFEST_LOOKSLIKE_EXTENSION

		except Exception, e:
			debug(e)
			return MANIFEST_LOOKSLIKE_NOTHING

	def on_close(self, view):
		if view.id() in self.activeInViews:
			del self.activeInViews[view.id()]

	def on_post_save(self, view):
		debug("on_post_save, view="+view.file_name())
		if not self.check_view(view):
			if os.path.basename(view.file_name()) == "manifest.json":
				debug("manifest saved, rechecking files on window")
				views=view.window().views()
				for v in views:
					self.check_view(v, True)

	def on_load(self, view):
		self.check_view(view)


	def _on_activated(self, view):
		if (view.window() == None):
			return
		
		winId=view.window().id()

		for folder in view.window().folders():
			if (os.path.isfile(folder+"/manifest.json")):
				self.activeInWindows[winId]=True
				debug("Chrome App activated for windows %i" % winId)
				return
		debug("Chrome App deactivated for windows %i" % winId)
		self.activeInWindows[winId]=False

	def on_query_completions(self, view, prefix, locations):
		if view.id() in self.activeInViews:
			if self.activeInViews[view.id()]==MANIFEST_LOOKSLIKE_APP:
				return self.appsCompletions
			else:
				return self.extensionsCompletions
		  #completions = []
#		  return [('isochronousTransfer\tChrome usb', 'chrome.experimental.usb.isochronousTransfer(callback)')]
#		  return [('chrome.experimental.usb.isochronousTransfer', 'isochronousTransfer\tChrome usb', 'chrome.experimental.usb.isochronousTransfer(callback)')]
