
(function(exports) {

  // constructor
  function APIReader() {
    this.initialized = false;
    this.callbacks = {};
  }

  APIReader.prototype.initialize = function(callback) {
    this.callbacks['init'] = callback;
    chrome.storage.local.get('__reader_cache', function(data) {
      this.cache = data['__reader_cache'] || {};
      window.webkitRequestFileSystem(window.PERSISTENT, 1024*1024*10, 
        onInitFS.bind(this), onFSError.bind(this));
    }.bind(this));
  }
  
  APIReader.prototype.read = function(url, onLoadLocal, onLoadRemote) {
    if (!this.initialized) {
      throw new Error('Invalid state: Call initialize() first');
    }

    var filename = normalizeUrlAsFilename(url);

    // read local
    if (this.fs) {
      // if there is an entry for this file:
      if (url in this.cache) {
        readFromCache.apply(this, [filename, onLoadLocal.bind(this)]);
      }
    }

    // read remote and update local
    loadJson(url, function(content) {
      if (content==null) {
        return;
      }
      saveToCache.apply(this, [filename, url, content]);
      onLoadRemote.apply(this, [JSON.parse(content)]);
    }.bind(this));

  };

  // private methods
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
  function saveToCache(filename, url, content) {
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
        chrome.storage.local.get('__reader_cache', function(data) {
          this.cache = data['__reader_cache'] || {}
          this.cache[url] = filename;
          chrome.storage.local.set({'__reader_cache': this.cache});
        }.bind(this));
      }.bind(this));
    }.bind(this), onFSError);
  }

  // load a remote json via XHR
  function loadJson(url, callback) {
    var client = new XMLHttpRequest();
    client.onload = function(e) {
      if(this.readyState == 4) {
        var content = null;
        if(this.status == 200 && this.responseText != null) {
          content = this.responseText;
        }
        callback(content);
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

