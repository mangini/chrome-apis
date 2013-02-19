
var KEY_SEP = '|';

(function(exports) {

  var SearchAPI = function() {
    this.appsApi = null;
    this.extensionsApi = null;
    this.queuedSearchTerm = null;
    this.listener = null;
    this.initialize();
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

  SearchAPI.prototype.search = function(isApps, str) {
    if ((isApps && !this.appsApi) || (!isApps && !this.extensionsApi)) {
      this.queuedSearchTerm = [isApps, str];
      return;
    }

    var results = {};
    // TODO: make this faster by using indexedDB
    var re = new RegExp("\\b"+str,"i");
    var api=isApps?this.appsApi:this.extensionsApi;
    for (var namespace in api) {
      if (re.test(namespace)) {
        results[namespace] = api[namespace];
      }
    }

    if (this.listener) {
      this.listener(results);
    }
      
  }

  SearchAPI.prototype.getSubtree = function(isApps, keys) {

    var searchObj=isApps?this.appsApi:this.extensionsApi;

    for (var i=0; i<keys.length; i++) {
      searchObj = searchObj[keys[i]];
      if (!searchObj) {
        console.error("Invalid keys: "+keys+"  (key "+keys[i]+" not found)");
        return null;
      }
    }
    return searchObj;
  }
  

  SearchAPI.prototype.printMethodInfo = function(isApps, namespace, methodIndex, isEvent) {

    var namespaceTree = this.getSubtree(isApps, [namespace]);

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


  var cleanDescription = function(description, eatDoubleLines) {
    if (!description || description === '') {
      return '';
    }
    description = ': '+description;
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
    out += '<span class="desc">' + cleanDescription(description, true) + '</span>';
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

  var renderFunctionReturn = function(f, key, withDescription) {
    var el=document.createElement('span');
    if (f['returns']) {
      el.insertAdjacentText('beforeEnd', getBestType(f.returns));
      if (withDescription && f.returns.description) {
        el.insertAdjacentHTML('beforeEnd', ": " + getBestDescription(f.returns, true));
      }
    } else {
      el.innerText = 'void';
    }
    return el;
  }

  var getBestDescription = function(obj, eatDoubleLines) {
    if (obj['description']) {
      if (eatDoubleLines) {
       return obj.description.replace(/<br\/?><br\/?>/gi, '<br>'); 
      }
      return obj.description;
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

  var renderFunctionName = function(f, isEvent, key) {
    var fname=document.createElement('span');
    fname.className = 'fname';
    fname.innerText = f.name;
    return fname;
  }

  var renderFunctionHeader = function(f, isEvent, key) {
    var header=document.createElement('div');
    header.setAttribute("data-name", key);
    header.setAttribute("data-type", isEvent?'event':'function');

    // render the return type, if any:
    if (!isEvent) {
      header.appendChild( renderFunctionReturn(f, key) );
      header.insertAdjacentText('beforeEnd', ' ');
    }

    header.insertAdjacentText('beforeEnd', '.');
    // render the function name
    header.appendChild( renderFunctionName(f, isEvent, key) );

    if (isEvent) {
      header.insertAdjacentText('beforeEnd', '.addListener');
    }
    header.insertAdjacentText('beforeEnd', '(');

    if (f['parameters']) {
      f['parameters'].forEach(
        function(cur, index, ar) {
          var param=document.createElement('span');
          param.innerText = cur.name;
	        header.appendChild ( param );
          if (index<ar.length-1) {
	          header.insertAdjacentText('beforeEnd', ', ');
	        }
        });
    }

    header.insertAdjacentText('beforeEnd', ') : ');
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
    detail.innerHTML = searchModule.printMethodInfo(isApps, keys[0], keys[keys.length-1], isEvent);

    return detail;
  }

  var appendChildren = function(results, container, parentKeys, parentType) {
    container = container || resultsBox;
    parentKeys = parentKeys || [];

    var lastNamespaceAdded = null;
    var namespacesInResult = 0;
    // append namespaces
    if ( !parentType) {
      for (var i in results) {
        namespacesInResult++;
        lastNamespaceAdded = i;
        var el=document.createElement('div');
        el.innerText=i;
        el.setAttribute("data-name", i);
        el.setAttribute("data-type", 'namespace');
        container.appendChild( el );
      }
    }

    // append functions and events of given namespace
    if (!parentType && namespacesInResult==1) {
      results = results[lastNamespaceAdded];
      container = container.lastElementChild;
      parentType = 'namespace';
      parentKeys = [lastNamespaceAdded];
    }
    if (parentType === 'namespace' ) {
      if (results['functions']) for (var i=0; i<results['functions'].length; i++) {
        var f = results['functions'][i];
        var fullKey=parentKeys.concat(['functions', i]).join(KEY_SEP);
        container.appendChild( renderFunctionHeader(f, false, fullKey) );
      }
      if (results['events']) for (var i=0; i<results['events'].length; i++) {
        var f = results['events'][i];
        var fullKey=parentKeys.concat(['events', i]).join(KEY_SEP);
        container.appendChild( renderFunctionHeader(f, true, fullKey) );
      }

    } else if (parentType === 'function'  || parentType === 'event') {
      if (!container.getAttribute('data-state')) {
        var fullKey=container.getAttribute('data-name');
        container.appendChild( renderFunctionDetail(results, parentType === 'event', fullKey) );
        container.setAttribute('data-state', 'open');
      }
    }
  };

  var search = function() {
    
    var searchStr = searchBox.value;

    // track event
    _gaq.push(['_trackEvent', isApps?'apps':'extensions', 'search', searchStr])

    // clear previous results
    while (resultsBox.hasChildNodes())
      resultsBox.removeChild(resultsBox.lastChild);

    searchModule.search(isApps, searchStr);
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
    search();
  });
  extensionsCheckbox.addEventListener('change', function() {
    isApps = appsCheckbox.checked;
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
      // close
    } else {
      var keysStr = element.getAttribute('data-name');
      var keys = keysStr.split(KEY_SEP);

      // track event
      _gaq.push(['_trackEvent', isApps?'apps':'extensions', 'expand', keysStr])
    
      var subtree=searchModule.getSubtree(isApps, keys);
      appendChildren(subtree, element, keys, parentType);
      e.stopPropagation();

    }
  });



});
