
(function(exports) {

  // constructor
  function APIReader() {
    this.initialized = false;
    this.callbacks = {};
  }

  APIReader.prototype.initialize = function(callback) {
    this.callbacks['init'] = callback;
    chrome.storage.local.get(['__reader_cache', '__reader_cache_meta'],
      function(data) {
        this.cache = data['__reader_cache'] || {};
        this.cacheMeta = data['__reader_cache_meta'] || {};
        window.webkitRequestFileSystem(window.PERSISTENT, 1024*1024*10, 
          onInitFS.bind(this), onFSError.bind(this));
      }.bind(this));
  }
  
  APIReader.prototype.read = function(url, onLoadLocal, onLoadRemote, force) {
    if (!this.initialized) {
      throw new Error('Invalid state: Call initialize() first');
    }

    var filename = normalizeUrlAsFilename(url);

    // read local
    if (onLoadLocal && this.fs) {
      // if there is an entry for this file:
      if (url in this.cache) {
        readFromCache.apply(this, [filename, onLoadLocal.bind(this)]);
      }
    }

    // read remote and update local
    if (onLoadRemote && navigator.onLine) {
      var dateOfLocal = force ? 0 : getDateOfLocal.apply(this, [url]);
      loadJson(url, function(content, lastModified) {
        if (content==null) {
          return;
        }
        console.log('remote content read from '+url+' (dateOfLocal='+dateOfLocal+', lastRemoteModification='+lastModified+')');
        saveToCache.apply(this, [filename, url, content, lastModified, onLoadRemote]);
      }.bind(this), dateOfLocal);
    }

  };

  // private methods

  function getDateOfLocal(url) {
    var dateOfLocal=0;
    if (this.cacheMeta && url in this.cacheMeta) {
      dateOfLocal=new Date(this.cacheMeta[url]['lastModified']);
    }
    return dateOfLocal;
  }

  function readFromCache(filename, callback) {
    this.fs.root.getFile(filename, {}, function(fileEntry) {
      fileEntry.file( function(file) {
        var reader = new FileReader();
        reader.onloadend = function(e) {
          if (e.target.readyState == FileReader.DONE) {
            // file content is read, run onLoadLocal callback
            callback(JSON.parse(e.target.result));
          }
        };
        reader.readAsText(file);
      });
    });
  }

  // save the textual content to the filesystem
  function saveToCache(filename, url, content, lastModified, callback) {
    this.fs.root.getFile(filename, { create: true }, function(fileEntry) {
      fileEntry.createWriter( function(writer) {
        var blob = new Blob([content], ['text/plain']);
        writer.seek(0);
        writer.onwriteend = function() {
          writer.onwriteend = null;
          writer.truncate(blob.size);
        };
        writer.onerror = onFSError;
        writer.write(blob);

        // update table of cached files:
        chrome.storage.local.get(['__reader_cache', '__reader_cache_meta'], function(data) {
          
          var contentObj=JSON.parse(content);

          this.cache = this.cache || data['__reader_cache'];
          this.cache[url] = filename;
          this.cacheMeta = this.cacheMeta || data['__reader_cache_meta'];

          this.cacheMeta[url] = JSON.parse(content)['_meta'];
          this.cacheMeta[url]['lastModified'] = lastModified;
          chrome.storage.local.set(
            {'__reader_cache': this.cache, '__reader_cache_meta': this.cacheMeta},
            callback.bind(this, contentObj));
        }.bind(this));
      }.bind(this));
    }.bind(this), onFSError);
  }

  // load a remote json via XHR
  function loadJson(url, callback, onlyIfModifiedAfter) {
    var client = new XMLHttpRequest();
    var lastModified = null;

    // abort XHR if Last-Modified header states that the file is newer than onlyIfModifiedAfter
    client.onreadystatechange = function(e) {
      if (this.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        lastModified = Date.parse( this.getResponseHeader('Last-Modified') || '2000/01/01' );
        console.log('checking if '+url+' remote build is newer than local (dateOfRemote='+lastModified+' dateOfLocal='+onlyIfModifiedAfter+')');
        if (lastModified <= onlyIfModifiedAfter) {
          // don't read the file contents
          console.log('aborting download of '+url+' because remote build is not newer (dateOfRemote='+lastModified+' dateOfLocal='+onlyIfModifiedAfter+')');
          this.abort();
        }
      }
    };

    // onload will only fire if the abort() method wasn't called
    client.onload = function(e) {
      if(this.readyState == XMLHttpRequest.DONE) {
        var content = null;
        if(this.status == 200 && this.responseText != null) {
          content = this.responseText;
        }
        callback(content, lastModified);
      }
    };

    client.open("GET", url);
    client.send();
  }

  function onInitFS(fs, callback) {
    this.fs = fs;   
    this.initialized = true;
    this.callbacks['init'] && this.callbacks['init'].apply(this, []);
  }

  function onFSError(e) {
    var msg = '';

    switch (e.code) {
      case FileError.QUOTA_EXCEEDED_ERR:
        msg = 'QUOTA_EXCEEDED_ERR';
        break;
      case FileError.NOT_FOUND_ERR:
        msg = 'NOT_FOUND_ERR';
        break;
      case FileError.SECURITY_ERR:
        msg = 'SECURITY_ERR';
        break;
      case FileError.INVALID_MODIFICATION_ERR:
        msg = 'INVALID_MODIFICATION_ERR';
        break;
      case FileError.INVALID_STATE_ERR:
        msg = 'INVALID_STATE_ERR';
        break;
      default:
        msg = 'Unknown Error';
        break;
    };

    throw new Error('Could not initialize FileSystem: ' + msg);
  } 

  function normalizeUrlAsFilename(url) {
    return url.replace(/https?:\/\//, '').replace(/[^\w\d._\-]/g, '_');
  }

  exports.APIReader = APIReader;

})(window);

