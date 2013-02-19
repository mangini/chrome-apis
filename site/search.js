
var KEY_SEP = '|';

(function(exports) {

  var SearchAPI = function() {
    this.isApps = true;
    this.appsApi = null;
    this.extensionsApi = null;
    this.queuedSearchTerm = null;
    this.listener = null;
    this.initialize();
  }

  SearchAPI.prototype.setSearchOnApps = function(isApps) {
    this.isApps = isApps;
  }

  SearchAPI.prototype.initialize = function() {
    this.loadJson('../apps_latest.json', function(result) {
      this.appsApi = result;
      this.finishedLoading();
    });
    this.loadJson('../extensions_latest.json', function(result) {
      this.extensionsApi = result;
      this.finishedLoading();
    });
  }

  SearchAPI.prototype.finishedLoading = function() {
    if (this.appsApi && this.extensionsApi && this.queuedSearchTerm) {
      this.search(this.queuedSearchTerm[0], this.queuedSearchTerm[1]);
    }
  }

  SearchAPI.prototype.loadJson = function(filename, callback) {
    var client = new XMLHttpRequest();
    var _this = this;
    client.onreadystatechange = function() {
      _this.handleXhr(this, callback);
    };
    client.open("GET", filename);
    client.send();
  }

  SearchAPI.prototype.handleXhr = function(context, callback) {
    if(context.readyState == 4) {
      if(context.status != 200 || context.responseText == null) {
        callback(null);
        return;
      }
      callback.apply(this, [JSON.parse(context.responseText)]);
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
      this.queuedSearchTerm = [this.isApps, str];
      return;
    }

    var results = {};
    var deepResults = {};

    // TODO: make this faster by using indexedDB
    var re = new RegExp("\\b"+str,"i");
    var api=this.isApps?this.appsApi:this.extensionsApi;
    for (var namespace in api) {
      if (re.test(namespace)) {
        results[namespace] = api[namespace];
      } else {
        if (searchForMethod(re, api[namespace]['events']) ||  
          searchForMethod(re, api[namespace]['functions'])) {
          deepResults[namespace] = api[namespace];
        }
      }
    }

    if (this.listener) {
      this.listener(results, deepResults);
    }
      
  }

  SearchAPI.prototype.getSubtree = function(keys) {

    var searchObj=this.isApps?this.appsApi:this.extensionsApi;

    for (var i=0; i<keys.length; i++) {
      searchObj = searchObj[keys[i]];
      if (!searchObj) {
        console.error("Invalid keys: "+keys+"  (key "+keys[i]+" not found)");
        return null;
      }
    }
    return searchObj;
  }
  

  SearchAPI.prototype.printMethodInfo = function(namespace, methodIndex, isEvent) {

    var namespaceTree = this.getSubtree([namespace]);

    var branch = isEvent?'events' : 'functions';
    var subtree = namespaceTree[branch][methodIndex];

    if (!subtree) {
      return 'Invalid method or namespace: '+[namespace, branch, methodIndex];
    }
    
    var out = '';

    out += this.printMethodParamsDetails(namespaceTree, subtree);
    out += nl;

    out += '<span class="namespace">'+namespace+'.</span><span class="fname">'+subtree.name+'</span>';

    if (isEvent) {
      out += '.<span class="namespace">addListener</span>( function';
    }
    out += '( ';

    out += this.printMethodParamsSimpleList(subtree);

    if (isEvent) {
      out += '  )';
    }

    out += ' );';

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

      out = '/**'+nl+nl+out+nl+'**/'+nl;
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
      out += '<br><span class="returns">RETURNS</span> ';
      out += this.printParam(namespaceTree, functionTree, subtree.returns, 0, indent);
    }
    return out;
  }


  var fixLinksRe = /(<a )(href=")/g;

  SearchAPI.prototype.fixDescriptionLinks = function(description, eatDoubleLines) {
    if (description) {
      description = description.replace(fixLinksRe, 
        "$1 target=\"blank\" $2http://developer.chrome.com/trunk/"+
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
      out += this.printSimpleParam(name, subtree.simple_type+typeSuffix, description);
    }

    return out;
  }

  SearchAPI.prototype.printSimpleParam = function(paramName, paramType, description) {
    var out='<span class="param">' + paramName + '</span>, ';
    out += '<span class="paramType">' + paramType + '</span>';
    out += '<span class="desc">' + this.cleanDescription(description, true) + '</span>';
    return out;
  }


  exports.SearchAPI = SearchAPI;

})(window);





window.addEventListener('DOMContentLoaded', function() {
  
  var searchModule = new SearchAPI();
  var searchBox = document.getElementById("searchbox");
  var resultsBox = document.getElementById("results");
  var appsCheckbox = document.getElementById("apps");
  var extensionsCheckbox = document.getElementById("extensions");
  var isApps = appsCheckbox.checked;

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

  var renderFunctionHeader = function(f, name, isEvent, key) {
    var header=document.createElement('div');
    header.setAttribute("data-name", key);
    header.setAttribute("data-type", isEvent?'event':'function');

    // render the return type, if any:
    if (!isEvent) {
      header.appendChild( renderFunctionReturn(f, key) );
      appendTextNode(header, ' ');
    }

    appendTextNode(header, '.');
    // render the function name
    var fname=document.createElement('span');
    fname.className = 'fname';
    fname.innerHTML = name;

    header.appendChild( fname );

    if (isEvent) {
      appendTextNode(header, '.addListener');
    }
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

    appendTextNode(header, ') : ');
    var descEl = document.createElement('span');
    descEl.className = 'description';
    descEl.innerHTML = getBestDescription(f);
    header.appendChild( descEl );

    return header;
  }



  // Render the box with a simple code representing the method
  var renderFunctionDetail = function(f, isEvent, key) {
    
    var keys = key.split(KEY_SEP);

    var detail=document.createElement('pre');
    detail.className = 'detail';
    detail.innerHTML = searchModule.printMethodInfo(keys[0], keys[keys.length-1], isEvent);

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
    var searchRe = new RegExp('\\b('+searchBox.value+')', 'i');

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
        container.appendChild( createNamespaceElement(i, null, searchBox.value) );
      }
    }

    // append functions and events of given namespace
    if (!parentType && namespacesInResult==1) {
      results = results[lastNamespaceAdded] || deepResults[lastNamespaceAdded];
      container = container.lastElementChild;
      parentType = 'namespace';
      parentKeys = [lastNamespaceAdded];
    }
    if (parentType === 'namespace' ) {
      container.setAttribute('data-state', 'open');
      if (results['functions']) for (var i=0; i<results['functions'].length; i++) {
        var f = results['functions'][i];
        var fullKey=parentKeys.concat(['functions', i]).join(KEY_SEP);
        var name = checkFilter(container, f, searchRe);
        if (name) {
          container.appendChild( renderFunctionHeader(f, name, false, fullKey) );
        }
      }
      if (results['events']) for (var i=0; i<results['events'].length; i++) {
        var f = results['events'][i];
        var fullKey=parentKeys.concat(['events', i]).join(KEY_SEP);
        var name = checkFilter(container, f, searchRe);
        if (name) {
          container.appendChild( renderFunctionHeader(f, name, true, fullKey) );
        }
      }

    } else if (parentType === 'function'  || parentType === 'event') {
      if (!container.getAttribute('data-state')) {
        var fullKey=container.getAttribute('data-name');
        container.appendChild( renderFunctionDetail(results, parentType === 'event', fullKey) );
        container.setAttribute('data-state', 'open');
      }
    }
  };


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


  var search = function() {
    
    var searchStr = searchBox.value;

    // track event
    _gaq.push(['_trackEvent', isApps?'apps':'extensions', 'search', searchStr])

    // clear previous results
    while (resultsBox.hasChildNodes())
      resultsBox.removeChild(resultsBox.lastChild);

    searchModule.search(searchStr);
  }

  // event listeners:

  searchModule.addSearchListener( appendChildren );

  document.addEventListener('keydown', function(e) {
    if (e.keyCode === 17 ) { // Ctrl
      resultsBox.classList.add('showlinks');
    }
  });

  document.addEventListener('keyup', function(e) {
    if (e.keyCode === 17 ) { // Ctrl
      resultsBox.classList.remove('showlinks');
    }
  });

  searchBox.addEventListener('keyup', search);

  appsCheckbox.addEventListener('change', function(e) {
    isApps = appsCheckbox.checked;
    searchModule.setSearchOnApps(isApps);
    search();
  });
  extensionsCheckbox.addEventListener('change', function() {
    isApps = appsCheckbox.checked;
    searchModule.setSearchOnApps(isApps);
    search();
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

      if (parentType!=='function' && parentType!=='event' && parentType!=='namespace') {
        // do nothing
        return;
      }

      // close
      for (var i=element.children.length-1; i>=0; i--) {
        var child = element.children.item(i);
        if ((parentType==='function' || parentType==='event') && child.tagName==='PRE') {
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
      _gaq.push(['_trackEvent', isApps?'apps':'extensions', 'expand', keysStr])
    
      var subtree=searchModule.getSubtree(keys);
      appendChildren(subtree, null, element, keys, parentType);
      e.stopPropagation();

    }
  });

});
