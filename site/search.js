
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
    this.loadJson('apps_latest.json', function(result) {
      this.appsApi = result;
      this.finishedLoading();
    });
    this.loadJson('extensions_latest.json', function(result) {
      this.extensionsApi = result;
      this.finishedLoading();
    });
  }

  SearchAPI.prototype.finishedLoading = function() {
    if (this.appsApi && this.extensionsApi) {
      if (this.queuedSearchTerm) {
        this.search(str);
      }
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

  SearchAPI.prototype.search = function(apps, str) {
    if (!this.appsApi || !this.extensionsApi) {
      this.queuedSearchTerm = str;
      return;
    }

    var results = {};
    // TODO: make this faster by using indexedDB
    var re = new RegExp("\\b"+str);
    var api=apps?this.appsApi:this.extensionsApi;
    for (var namespace in api) {
      if (re.test(namespace)) {
        results[namespace] = api[namespace];
      }
    }

    if (this.listener) {
      this.listener(results);
    }
      
  }

  SearchAPI.prototype.getSubtree = function(apps, keys) {

    var searchObj=apps?this.appsApi:this.extensionsApi;

    for (var i=0; i<keys.length; i++) {
      searchObj = searchObj[keys[i]];
      if (!searchObj) {
        throw "Invalid keys: "+keys+"  (key "+keys[i]+" not found)";
      }
    }
    return searchObj;
  }
  
  exports.SearchAPI = SearchAPI;

})(window);



window.addEventListener('DOMContentLoaded', function() {
  
  var searchModule = new SearchAPI();
  var searchBox = document.getElementById("searchbox");
  var resultsBox = document.getElementById("results");
  var isApps = true;

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
    header.setAttribute("data-type", 'function');

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



  var renderTypeStructure = function(link, namespace, el) {
    var types = searchModule.getSubtree(isApps, [namespace, 'types']);
    for (var i=0; i<types.length; i++) {
      if (types[i].name === link.name) {
        el.insertAdjacentText('beforeEnd', '{');
        if (types[i]['properties']) {
          types[i]['properties'].reduce(reduceParameters, [namespace, el]);
        }
        el.insertAdjacentText('beforeEnd', ' }');
      }
    }
  }


  var reduceParameters = function(data, cur, index, ar) {
    var param=document.createElement('div');
    if ( cur["link"] ) {
      param.className='struct';
      renderTypeStructure(cur["link"], data[0], param);
    } else {
      param.insertAdjacentText('beforeEnd', cur.name);
      if (index<ar.length-1) param.insertAdjacentText('beforeEnd', ',');
      param.insertAdjacentText('beforeEnd', '   // ('+getBestType(cur)+')');
      if (cur.description) {
        param.insertAdjacentHTML('beforeEnd', " " + getBestDescription(cur, true));
      }
    }
    data[1].appendChild(param);
    return data;
  }


  // Render the box with a simple code representing the method
  var renderFunctionDetail = function(f, isEvent, key) {
    
    var detail=document.createElement('pre');
    detail.className = 'detail';
    var keys = key.split(KEY_SEP);

    if (f['parameters']) {
      detail.insertAdjacentText('beforeEnd', keys[0]+'.'+f.name+'(');
      f['parameters'].reduce(reduceParameters, [keys[0], detail]);
    }
      
    detail.insertAdjacentText('beforeEnd', ');');
    // render the return type, if any:
    if (!isEvent && f["returns"] && f.returns!='void') {
      var returns=document.createElement('span');
      returns.className = 'returnDetail';
      returns.insertAdjacentText('beforeEnd', '  // Returns ');
      returns.appendChild( renderFunctionReturn(f, key, true) );
      detail.appendChild(returns);
    }

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
    } else if (parentType === 'function' ) {
      if (!container.getAttribute('data-state')) {
        var fullKey=container.getAttribute('data-name');
        container.appendChild( renderFunctionDetail(results, false, fullKey) );
	container.setAttribute('data-state', 'open');
      }
    }
  };

  var removeAllSiblingsOfType = function (node, type) {
    var children = node.parentNode.getElementsByTagName('div');
    for (var i=children.length-1; i>=0; i--) {
      if (children.item(i)!=node) {
        node.parentNode.removeChild(children.item(i));
      }
    }
  };

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

  searchBox.addEventListener('keyup', function() {
    // clear previous results
    while (resultsBox.hasChildNodes())
      resultsBox.removeChild(resultsBox.lastChild);

    searchModule.search(isApps, searchBox.value);
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
      var keys=element.getAttribute('data-name').split(KEY_SEP);
      var subtree=searchModule.getSubtree(isApps, keys);
      appendChildren(subtree, element, keys, parentType);
      e.stopPropagation();
    }
  });



});
