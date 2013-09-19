
//var BASE_URL='http://chrome-api.storage.googleapis.com/';
var BASE_URL='';
var KEY_SEP = '|';

(function(exports) {

  var CompareAPI = function() {
    this.isApps = true;
  }

  CompareAPI.prototype.setCompareOnApps = function(isApps) {
    this.isApps = isApps;
  }

  CompareAPI.prototype.compare = function(releaseLeft, releaseRight) {
    if (!this.dataLeft || this.dataLeft.release!==releaseLeft || !this.dataLeft.data) {
      this.dataLeft={'release': releaseLeft, 'data': null};
      this.loadJson(BASE_URL+'apps_'+releaseLeft+'.json', function(result) {
        this.dataLeft.data = result;
        this.finishedLoading();
      });
    }
    if (!this.dataRight || this.dataRight.release!==releaseRight || !this.dataRight.data) {
      this.dataRight={'release': releaseRight, 'data': null};
      this.loadJson(BASE_URL+'apps_'+releaseRight+'.json', function(result) {
        this.dataRight.data = result;
        this.finishedLoading();
      });
    }
  }

  CompareAPI.prototype.finishedLoading = function() {
    if (this.dataRight && this.dataRight.release && this.dataRight.data &&
      this.dataLeft && this.dataLeft.release && this.dataLeft.data) {
      this.diff(this.dataLeft, this.dataRight);
    }
  }

  CompareAPI.prototype.diff = function(d1, d2) {
    for (var namespace in d1.data) {
      if (!d2.data[namespace]) {
        document.write('namespace only in '+d1.release+': '+namespace);
      } else {
        this.diffElements(namespace, d1.release, d2.release, d1.data[namespace]['functions'], d2.data[namespace]['functions']);
        this.diffElements(namespace, d1.release, d2.release, d1.data[namespace]['events'], d2.data[namespace]['events']);
      }
    }
  }

  CompareAPI.prototype.diffElements = function(namespace, release1, release2, elements1, elements2) {
    if (!elements1 || !elements2) {
      return;
    }
    var map2 = {};
    for (var i=0; i<elements2.length; i++) {
      map2[elements2[i].id] = elements2[i];
    }
    for (var i=0; i<elements1.length; i++) {
      if (!map2[elements1[i].id]) {
        // exists in 1 but not in 2
        /([^-]*)-.*/.test(elements1[i].id);
        document.write(RegExp.$1+' only in '+release1+': '+namespace+'.'+elements1[i].name+'<br>');
      } else {
        // exists in both. check parameters
        this.diffElements(namespace+'.'+elements1[i].name, release1, release2, elements1[i]['parameters'], map2[elements1[i].id]['parameters']);
        delete map2[elements1[i].id];
      }
    }
    for (var k in map2) {
      // exists in 2 but not in 1
      /([^-]*)-.*/.test(map2[k].id);
      document.write(RegExp.$1+' only in '+release2+': '+namespace+'.'+map2[k].name+'<br>');
    }
  }

  CompareAPI.prototype.loadJson = function(filename, callback) {
    var client = new XMLHttpRequest();
    var _this = this;
    client.onreadystatechange = function() {
      _this.handleXhr(this, callback);
    };
    client.open("GET", filename);
    client.send();
  }

  CompareAPI.prototype.handleXhr = function(context, callback) {
    if(context.readyState == 4) {
      if(context.status != 200 || context.responseText == null) {
        callback(null);
        return;
      }
      callback.apply(this, [JSON.parse(context.responseText)]);
    }
  }

  exports.CompareAPI = CompareAPI;

})(window);





window.addEventListener('DOMContentLoaded', function() {
  
  var compareModule = new CompareAPI();
  var release1 = document.getElementById("release1");
  var release2 = document.getElementById("release2");
  var resultsBox = document.getElementById("results");
  //var appsCheckbox = document.getElementById("apps");
  //var extensionsCheckbox = document.getElementById("extensions");
  //var isApps = appsCheckbox.checked;

  
  document.querySelector('form').addEventListener('submit', function(e) {
    e.preventDefault();
    compareModule.compare(release1.value, release2.value);
  });

});
