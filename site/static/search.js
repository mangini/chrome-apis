
var KEY_SEP = '|';
const EVENT_NAMESPACE='chrome.events';

(function(exports) {

  var SearchAPI = function() {
    this.isApps = true;
    this.appsApi = null;
    this.extensionsApi = null;
    this.queuedSearchTerm = null;
    this.listener = null;
    this.loadAPIs();
  }

  SearchAPI.prototype.setSearchOnApps = function(isApps) {
    this.isApps = isApps;
  }

  SearchAPI.prototype.loadAPIs = function(reloadRemote) {
    this.apiReader = new APIReader();
    var onAppsRead = function(result) {
      this.appsApi = result;
      this.finishedLoading();
    }.bind(this);
    var onExtensionsRead = function(result) {
      this.extensionsApi = result;
      this.finishedLoading();
    }.bind(this);

    this.apiReader.initialize(function() {
      //this.apiReader.read('http://chrome-api.storage.googleapis.com/apps_latest.json', 
      this.apiReader.read('apps_latest.json', 
        reloadRemote?null:onAppsRead, onAppsRead, reloadRemote);
      this.apiReader.read('http://chrome-api.storage.googleapis.com/extensions_latest.json', 
        reloadRemote?null:onExtensionsRead, onExtensionsRead, reloadRemote);
    }.bind(this));
  }

  SearchAPI.prototype.finishedLoading = function() {
    if (this.appsApi && this.extensionsApi && this.queuedSearchTerm!=null) {
      this.search(this.queuedSearchTerm);
    }
  }

  SearchAPI.prototype.addSearchListener = function(listener) {
    this.listener = listener;
  }

  var searchForMethod = function(re, methods) {
    if (!methods) return false;
    for (var method in methods) {
      if (re.test(methods[method]['name'])) {
        return true;
      }
    }
    return false;
  }

  SearchAPI.prototype.search = function(str) {
    if ((this.isApps && !this.appsApi) || (!this.isApps && !this.extensionsApi)) {
      this.queuedSearchTerm = str;
      return;
    }

    var results = {};
    var deepResults = {};

    // TODO: make this faster by using indexedDB
    str = str.replace(/[^\w.]/g, '_');
    var re = new RegExp("\\b"+str,"i");
    var api=this.isApps?this.appsApi:this.extensionsApi;
    for (var namespace in api) {
      if (namespace == '_meta') {
        continue;
      } else if (re.test(namespace)) {
        results[namespace] = api[namespace];
      } else {
        if (searchForMethod(re, api[namespace]['events']) ||  
          searchForMethod(re, api[namespace]['functions']) ||
          searchForMethod(re, api[namespace]['properties'])) {
          deepResults[namespace] = api[namespace];
        }
      }
    }

    if (this.listener) {
      this.listener(results, deepResults);
    }
      
  }

  SearchAPI.prototype.getTypeByName = function(namespace, name) {

    var searchObj = this.isApps?this.appsApi:this.extensionsApi;

    var types = this.getSubtree([namespace, 'types']);
    for (var i=0; types && i<types.length; i++) {
      if (types[i]['name'] === name) {
        return types[i];
      }
    }
    return null;
  }
  

  SearchAPI.prototype.getSubtree = function(keys) {

    var searchObj=this.isApps?this.appsApi:this.extensionsApi;

    for (var i=0; i<keys.length; i++) {
      searchObj = searchObj[keys[i]];
      if (!searchObj) {
        return null;
      }
    }
    return searchObj;
  }
  

  SearchAPI.prototype.printSimpleMethodSignature = function(namespace, typeName, functionObject, type) {
    var out = '';
    out += '<span class="namespace">'+namespace+'.</span>';
    if (typeName) {
      out += '<span class="tname">'+typeName+'.</span>';
    }

    out += '<span class="fname">'+functionObject['name']+'</span>';

    if (type!=='property') {
      out += '( ';

      out += this.printMethodParamsSimpleList(functionObject);

      out += ' );';
    }

    out += nl;
    return out;
  }

  SearchAPI.prototype.printMethodInfo = function(namespace, methodIndex, type) {

    var namespaceTree = this.getSubtree([namespace]);

    var branch;
    switch (type) {
      case 'event': branch='events'; break;
      case 'function': branch='functions'; break;
      case 'property': branch='properties'; break;
    }

    var subtree = namespaceTree[branch][methodIndex];

    if (!subtree) {
      return 'Invalid method or namespace: '+[namespace, branch, methodIndex];
    }

    var typeSubtree=null, addListenerFunction=null;
    if (type==='event') {
      addListenerFunction=subtree['addListenerFunction'];
      typeSubtree = this.getTypeByName(EVENT_NAMESPACE, 'Event');
    } else if (type==='property' && subtree['link']) {
      typeSubtree = this.getTypeByName(namespace, subtree['link']['name']);
    }
    
    var out = '';

    // Print the detailed comment with parameter descriptions:

    if (typeSubtree) {
      for (var i=0; i<typeSubtree['functions'].length; i++) {
        var functionObject = typeSubtree['functions'][i];

        // do not print functions of Event type except the ones related to Listeners
        // I'm not sure if this is correct for extensions, but at least for apps, the rules are usually not used and they polute the view
        // TODO: double check this
        if (type==='event' && ! /Listener/.test(functionObject['name'])) {
          continue;
        }

        // for events, only print the detailed header for addListener
        if (type!=='event' || functionObject['name']==='addListener') {
          out += this.printMethodParamsDetails(namespaceTree, addListenerFunction || functionObject);
        }
        out += this.printSimpleMethodSignature(namespace, subtree['name'], functionObject, 'function');
        out += nl;
      }
    } else {
      out += this.printMethodParamsDetails(namespaceTree, subtree);
      out += nl;
      out += this.printSimpleMethodSignature(namespace, null, subtree, type);
    }

    return out;
  }

  var nl='\n';
  var INDENT='    ';


  /**
    print param names delimited by commas
  **/

  SearchAPI.prototype.printMethodParamsSimpleList = function(subtree) {
    var out = '';
    var params = subtree['properties'] || subtree['parameters'] || [];
    for (var i=0; i<params.length; i++) {
      out += '<span class="param">'+params[i].name+'</span>';
      if (i<params.length-1) {
        out += ', ';
      }
    }
    return out;
  }


  /**
    Print a comment section with name, type and description for each param:

    //
    <functionHeader>
    <commentDelimiter>
    <functionBlock>
    <commentDelimiter>
    //

    <functionBlock> ::= <indexedParam>*
    <indexedParam> ::= <index> ': ' <nonIndexedParam>
    <nonIndexedParam> ::= ( <functionParam> | <objectParam> | <simpleParam> )  <eol> 
    <functionParam> ::= <simpleParam> <functionBlock>
    <objectParam> ::= <simpleParam> <objectBlock>
    <simpleParam> ::= <paramName> ', ' <paramType> <arrayindicator> ' : ' <paramDescription>
    <objectBlock> ::= '{' <eol> <nonIndexedParam>+ '}' <eol>


  Example: 
  
  chrome.alarms.create( name, options, myCallback, arrays )

  0-name, string: Optional name to identify this alarm.
  1-options, object: chunk of parameters blabla
      {
          when, double: Time at which blablabla
          callback, function(id, visible) : sflksflsdkf
              0-id, string: alarm id
              1-visible, boolean: show be shown or not
      }
  2-myCallback, function(resultOptions) : callback used to notify when things go bad
      resultOptions, object: sldkflsdkfdslkflsd
          {
              when, double: Time at which blablabla
              callback, function(id, visible): blablablabllbalbla
                  0-id, string: alarm id
                  1-visible, boolean: show be shown or not
          }
  3-arrays, object[]: chunk of parameters blabla
      {
          when, double: Time at which blablabla
          callback, function(id, visible) : sflksflsdkf
              0-id, string: alarm id
              1-visible, boolean: show be shown or not
      }

  **/
  SearchAPI.prototype.printMethodParamsDetails = function(namespaceTree, subtree) {
    var out = this.printParamsBlock(namespaceTree, subtree, subtree, true, INDENT);
    if (out && out!='') {
      out = out.replace(/\n+\s*\n/g, '\n'); 

      out = '/**'+nl+out+'**/'+nl;
    }
    return out;
  }

  SearchAPI.prototype.printParamsBlock = function(namespaceTree, functionTree, subtree, indexed, indent) {
    var out = '';
    if (!subtree) {
      return out;
    }
    var params = subtree['properties'] || subtree['parameters'] || [];
    for (var i=0; i<params.length; i++) {
        out += indent;
        //if (indexed) out += i+'-';
        out += this.printParam(namespaceTree, functionTree, params[i], i, indent);
        out += nl;
    }
    if (subtree['returns']) {
      out += '<br>    <span class="returns">RETURNS</span> ';
      out += this.printParam(namespaceTree, functionTree, subtree.returns, 0, indent);
      out += '<br>';
    }
    return out;
  }


  var fixLinksRe = /(<a )(href=")/g;

  SearchAPI.prototype.fixDescriptionLinks = function(description, eatDoubleLines) {
    if (description) {
      description = description
        .replace(fixLinksRe, 
          "$1 target=\"blank\" $2http://developer.chrome.com/"+
          (this.isApps?"apps":"extensions")+"/");
    }
    return description;
  }

  SearchAPI.prototype.cleanDescription = function(description, eatDoubleLines) {
    if (!description || description === '') {
      return '';
    }
    description = ': '+this.fixDescriptionLinks(description);
    if (eatDoubleLines) {
     return description.replace(/<br\/?>/gi, ''); 
    }
    return description;
  }

  SearchAPI.prototype.findLinkedTypeSubtree = function(namespaceTree, name) {
    var types = namespaceTree['types'];
    for (var i=0; i<types.length; i++) {
      if (types[i].name === name) {
        return types[i];  
      }
    }
    return null;
  }

  SearchAPI.prototype.printParam = function(namespaceTree, functionTree, subtree, index, indent) {
    var out = '';

    var name = subtree.name;
    var description = subtree.description;
    var typeSuffix = '';

    if ( subtree['array'] ) {
      subtree = subtree['array'];
      typeSuffix = '[]';
    }

    if ( subtree.simple_type==='function' ) { 
    // callback/function
      var paramType = 'function(';
      var callbackSubtree = functionTree['callback'];
      if (callbackSubtree) {
        paramType += this.printMethodParamsSimpleList(callbackSubtree);
      }
      paramType += ')';
      out += this.printSimpleParam(name, paramType+typeSuffix, description);
      out += nl;
      out += this.printParamsBlock(namespaceTree, functionTree, callbackSubtree, true, indent+INDENT);

    } else if (subtree['link']) {
    // object
      var objectSubtree = this.findLinkedTypeSubtree(namespaceTree, subtree.link.name);
      if (objectSubtree) {
        out += this.printSimpleParam(name, 'object'+typeSuffix, description);
        out += nl;
        out += this.printParamsBlock(namespaceTree, functionTree, objectSubtree, false, indent+INDENT);
      }

    } else {
    // simple param
      var paramType = null;
      if (subtree['simple_type']) {
        paramType=subtree.simple_type+typeSuffix;
      }
      out += this.printSimpleParam(name, paramType, description, subtree['value']);
    }

    return out;
  }

  SearchAPI.prototype.printSimpleParam = function(paramName, paramType, description, constantValue) {
    var out='<span class="param">' + paramName + '</span>';
    if (paramType) {
      out+=', <span class="paramType">' + paramType + '</span>';
    }
    if (constantValue) {
      out+='=<span class="paramValue">' + constantValue + '</span>';
    }
    out += '<span class="desc">' + this.cleanDescription(description, true) + '</span>';
    return out;
  }


  SearchAPI.prototype.getMeta = function() {
    var searchObj=this.isApps?this.appsApi:this.extensionsApi;
    var meta = searchObj['_meta'] ||
              {
                "build": {
                  "date": "unknown"
                }, 
                "git": {
                  "lastcommit": "unknown", 
                  "lastcommit_at": "unknown"
                }
              };
     return meta;
  }
  
  exports.SearchAPI = SearchAPI;

})(window);





window.addEventListener('DOMContentLoaded', function() {
  
  var searchBox = document.getElementById("searchbox");
  var resultsBox = document.getElementById("results");
  var appsCheckbox = document.getElementById("apps");
  var extensionsCheckbox = document.getElementById("extensions");
  var isApps = appsCheckbox.checked;
  var searchModule = new SearchAPI();

  searchBox.focus();

  var appendTextNode = function(el, text) {
    if (el.insertAdjacentText) {
      el.insertAdjacentText('beforeEnd', text);
    } else {  // firefox
      var textNode = document.createTextNode(text);
      el.appendChild(textNode);
    }
  }

  var renderFunctionReturn = function(f, key) {
    var el=document.createElement('span');
    if (f['returns']) {
      appendTextNode(el, getBestType(f.returns));
    } else {
      el.innerHTML = 'void';
    }
    return el;
  }

  var getBestDescription = function(obj) {
    if (obj['description']) {
      return searchModule.fixDescriptionLinks(obj.description);
    }
    return '(no description)';
  }

  var getBestType = function(obj) {
    // priority: link, simple_type
    if (obj['link']) {
      return obj.link.name;
    }
    if (!obj.simple_type) {
      return obj.name;
    } else {
      return obj.simple_type; 
    }
  }

  var renderFunctionHeader = function(f, name, type, key) {
    var header=document.createElement('div');
    header.setAttribute("data-name", key);
    header.setAttribute("data-type", type);

    // render the return type, if any:
    if (type==='function') {
      header.appendChild( renderFunctionReturn(f, key) );
      appendTextNode(header, ' ');
      appendTextNode(header, '.');
    } else if (type==='event') {
      appendTextNode(header, 'Event ');
    } else {
      appendTextNode(header, ((f['link'] && f['link']['name']) || f['simple_type'])+' ');
    }

    // render the function name
    var fname=document.createElement('a');
    fname.href = '?q='+f['name'];
    fname.className = 'fname';
    fname.innerHTML = name;

    header.appendChild( fname );

    if (type==='function') {
      appendTextNode(header, '(');

      if (f['parameters']) {
        f['parameters'].forEach(
          function(cur, index, ar) {
            var param=document.createElement('span');
            param.innerHTML = cur.name;
            header.appendChild( param );
            if (index<ar.length-1) {
              appendTextNode(header, ', ');
            }
          });
      }

      appendTextNode(header, ')');
    }

    appendTextNode(header, ' : ');
    var descEl = document.createElement('span');
    descEl.className = 'description';
    descEl.innerHTML = getBestDescription(f);
    header.appendChild( descEl );

    return header;
  }



  // Render the box with a simple code representing the method
  var renderFunctionDetail = function(f, type, key) {
    
    var keys = key.split(KEY_SEP);

    var detail=document.createElement('pre');
    detail.className = 'detail';
    detail.innerHTML = searchModule.printMethodInfo(keys[0], keys[keys.length-1], type);

    return detail;
  }

  var createNamespaceElement = function(namespace, searchRe, filterMethodsBy) {
    var el=document.createElement('div');

    var name = namespace;
    if (searchRe) {
      name=name.replace(searchRe, '<b>$1</b>');
    }

    el.innerHTML=name;
    el.setAttribute("data-name", namespace);
    el.setAttribute("data-type", 'namespace');
    if (filterMethodsBy) {
      el.setAttribute("data-filter", filterMethodsBy);
    }

    return el;
  }

  var appendChildren = function(results, deepResults, container, parentKeys, parentType) {

    container = container || resultsBox;
    parentKeys = parentKeys || [];
    var str = searchBox.value.replace(/[^\w.]/g, '_');
    var searchRe = new RegExp('\\b('+str+')', 'i');

    var lastNamespaceAdded = null;
    var namespacesInResult = 0;

    // append namespaces
    if ( !parentType) {
      for (var i in results) {
        namespacesInResult++;
        lastNamespaceAdded = i;
        container.appendChild( createNamespaceElement(i, searchRe) );
      }
      if (deepResults) for (var i in deepResults) {
        namespacesInResult++;
        lastNamespaceAdded = i;
        container.appendChild( createNamespaceElement(i, null, str) );
      }
    }

    // If there is only one namespace as a result, let's open it
    if (!parentType && namespacesInResult==1) {
      results = results[lastNamespaceAdded] || deepResults[lastNamespaceAdded];
      container = container.lastElementChild;
      parentType = 'namespace';
      parentKeys = [lastNamespaceAdded];
    }

    // append functions and events of given namespace
    if (parentType === 'namespace' ) {
      container.setAttribute('data-state', 'open');
      if (results['functions']) for (var i=0; i<results['functions'].length; i++) {
        var f = results['functions'][i];
        var fullKey=parentKeys.concat(['functions', i]).join(KEY_SEP);
        var name = checkFilter(container, f, searchRe);
        if (name) {
          container.appendChild( renderFunctionHeader(f, name, 'function', fullKey) );
        }
      }
      if (results['events']) for (var i=0; i<results['events'].length; i++) {
        var f = results['events'][i];
        var fullKey=parentKeys.concat(['events', i]).join(KEY_SEP);
        var name = checkFilter(container, f, searchRe);
        if (name) {
          container.appendChild( renderFunctionHeader(f, name, 'event', fullKey) );
        }
      }
      if (results['properties']) for (var i=0; i<results['properties'].length; i++) {
        var f = results['properties'][i];
        var fullKey=parentKeys.concat(['properties', i]).join(KEY_SEP);
        var name = checkFilter(container, f, searchRe);
        if (name) {
          container.appendChild( renderFunctionHeader(f, name, 'property', fullKey) );
        }
      }

    } else if (parentType === 'function'  || parentType === 'event' || parentType === 'property') {
      if (!container.getAttribute('data-state')) {
        var fullKey=container.getAttribute('data-name');
        container.appendChild( renderFunctionDetail(results, parentType, fullKey) );
        container.setAttribute('data-state', 'open');
      }
    }
  };

  var getParameterByName = function(name) {
    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
    var regexS = "[\\?&]" + name + "=([^&#]*)";
    var regex = new RegExp(regexS);
    var results = regex.exec(window.location.search);
    if(results == null)
      return "";
    else
      return decodeURIComponent(results[1].replace(/\+/g, " "));
  }

  var checkFilter = function(container, subtree, searchRe) {
    var isFiltered = container.hasAttribute('data-filter');
    var name = subtree['name'];
    if (!isFiltered) {
      return name;
    }
    if (searchRe.test(subtree['name'])) {
      return name.replace(searchRe, '<b>$1</b>');
    }
    return null;
  }


  var clearResultsBox = function() {
    // clear previous results
    while (resultsBox.hasChildNodes())
      resultsBox.removeChild(resultsBox.lastChild);
  }

  var search = function() {
    var searchStr = searchBox.value;

    // track event
    window.GATracker.sendEvent(isApps?'apps':'extensions', 'search', searchStr)

    clearResultsBox();
    searchModule.search(searchStr);
  }


  var renderMetadata = function() {
   var versionEl=document.querySelector('#version a');
   var version=searchModule.getMeta().git.lastcommit;
   versionEl.innerText = version;
   versionEl.href="http://git.chromium.org/gitweb/?p=chromium.git;a=commit;H=" + version;
   document.getElementById('build_date').innerText = searchModule.getMeta().build.date;
  };

  // event listeners:

  searchModule.addSearchListener( function(results, deepResults) {
    clearResultsBox();
    renderMetadata();
    appendChildren(results, deepResults);
  }.bind(this));

  var searchTimer=null;
  searchBox.addEventListener('keyup', function() {
    if (searchTimer) {
      window.clearTimeout(searchTimer);
    }
    searchTimer = window.setTimeout(search, 400);
  });

  appsCheckbox.addEventListener('change', function(e) {
    isApps = appsCheckbox.checked;
    searchModule.setSearchOnApps(isApps);
    renderMetadata();
    search();
  });

  extensionsCheckbox.addEventListener('change', function() {
    isApps = appsCheckbox.checked;
    searchModule.setSearchOnApps(isApps);
    renderMetadata();
    search();
  });

  document.querySelector('#reloadAPIs').addEventListener('click', function(e) {
    e.preventDefault();
    searchModule.loadAPIs(true);
  });
    
  document.querySelector('form').addEventListener('submit', function(e) {
    e.preventDefault();
    search();
  });

  resultsBox.addEventListener('click', function(e) {

    var element = e.target;
    var parentType=e.target.getAttribute('data-type');

    if (!parentType) {
      while (!parentType && element && element!=e.currenTarget) {
        element = element.parentNode;
        parentType=element.getAttribute('data-type');
      }
    }
    if (!parentType) {
      return;
    }
    var state=element.getAttribute('data-state');
    if (state==='open') {

      if (parentType!=='function' && parentType!=='event' && parentType!=='property' && parentType!=='namespace') {
        // do nothing
        return;
      }

      // close
      for (var i=element.children.length-1; i>=0; i--) {
        var child = element.children.item(i);
        if ((parentType==='function' || parentType==='event' || parentType==='property') && child.tagName==='PRE') {
          element.removeChild(child);
        } else if (parentType==='namespace' && child.tagName==='DIV') {
          element.removeChild(child);
        }
      }
      element.removeAttribute('data-state');

    } else {
      var keysStr = element.getAttribute('data-name');
      var keys = keysStr.split(KEY_SEP);

      // track event
      window.GATracker.sendEvent(isApps?'apps':'extensions', 'expand', keysStr)
    
      var subtree=searchModule.getSubtree(keys);
      appendChildren(subtree, null, element, keys, parentType);
      e.stopPropagation();

    }
  });


  // analytics initialization
  var GAService = analytics.getService('api_search_app');
  window.GATracker = GAService.getTracker('UA-38634901-1');
  window.GATracker.sendAppView('MainAppView');

  function initAnalyticsConfig(config) {
    var updateAllowGA = function(isTrackingPermitted) {
      document.querySelector('#allowga span').innerText = isTrackingPermitted ? 'Yes' : 'No';
    };

    document.querySelector('#allowga a').addEventListener('click', function(e) {
      e.preventDefault();
      var isTrackingPermitted = !config.isTrackingPermitted()
      config.setTrackingPermitted(isTrackingPermitted);
      updateAllowGA(isTrackingPermitted);
    });

    updateAllowGA(config.isTrackingPermitted());
  }

  GAService.getConfig().addCallback(initAnalyticsConfig);


  // Initialize search with query params, if necessary:
  var typeParam = getParameterByName("t");
  isApps = !typeParam || typeParam!=='e';
  appsCheckbox.checked=isApps;
  extensionsCheckbox.checked=!isApps;
  searchModule.setSearchOnApps(isApps);

  var queryParam = getParameterByName("q");
  searchBox.value = queryParam || '';
  search();

});
