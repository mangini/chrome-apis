import json, os, re, io, sys, traceback, cPickle

API_SIMPLIFIER = re.compile('chrome\.(?:experimental\.)?(.*)')

def processApiJson(inputFilename, outputFilename):
	completions = []

	obj = json.loads(open(inputFilename, 'r').read())
	for api in obj:
		if 'functions' in obj[api]:
			simpleApiName=API_SIMPLIFIER.match(api).groups(0)[0]
			for method in obj[api]['functions']:
				paramStr=""
				if 'parameters' in method:
					for param in method['parameters']:
						paramStr+=param['name']
						if 'last' not in param or not param['last']:
							paramStr+=", "
				completion=(
					"%s.%s" % (api, method['name']),
					"%s\tChrome %s" % (method['name'], simpleApiName), 
					"%s.%s(%s)" % (api, method['name'], paramStr))
				completions.append(completion)
	with open(outputFilename, 'w') as out:
		cPickle.dump(completions, out)

def main(argv=[None]):
	processApiJson(argv[0], argv[1])

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
