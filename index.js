// console.log = console.trace;

var path = require('path');
var _ = require('lodash');
var argv = require('yargs').argv;
var fs = require('fs');
var async = require('async');
var i18n = require('i18n');

var defaults = require('./defaults.js');

module.exports = function(options) {
  var self = {};

  // Determine root module and root directory
  self.root = options.root || getRoot();
  self.rootDir = options.rootDir || path.dirname(root.filename);

  self.options = mergeConfiguration(options, defaults);
  acceptGlobalOptions();

  self.synth = defineModules();

  // No return statement here because we need to
  // return "self" after kicking this process off

  async.series([
    instantiateModules,
    modulesReady,
    modulesAfterInit,
    afterInit
  ], function(err) {
    if (err) {
      throw err;
    }
    console.log('task or listen');
  });

  // Return self so that app.js can refer to apos
  // in inline functions, etc.
  return self;

  // SUPPORTING FUNCTIONS BEGIN HERE

  // Merge configuration from defaults, data/local.js and app.js
  function mergeConfiguration(options, defaults) {
    var config = {};
    var local = {};
    var localPath = options.__localPath || '/data/local.js';

    if (fs.existsSync(self.rootDir + localPath)) {
      local = require(self.rootDir + localPath);
    }    

    var config = options.__testDefaults || defaults;
    var coreModules = _.cloneDeep(config.modules);

    _.merge(config, options);

    if (typeof(local) === 'function') {
      if (local.length === 1) {
        _.merge(config, local(self));
      } else if (local.length === 2) {
        local(self, config);
      } else {
        throw 'data/local.js may export an object, a function that takes apos as an argument and returns an object, OR a function that takes apos and config as objects and directly modifies config';
      }
    } else {
       _.merge(config, local || {});
    }
  
    return config;
  }

  function getRoot() {
    var m = module;
    while (m.parent) {
      m = m.parent;
      module = m;
    }
    return module;
  }

  function acceptGlobalOptions() {
    // Truly global options not specific to a module

    self.argv = argv;

    self.shortName = self.options.shortName;
    if (!self.shortName) {
      throw "Specify the `shortName` option and set it to the name of your project's repository or folder";
    }
    self.hostName = self.options.hostName;
    if (!self.hostName) {
      throw "Specify the `hostName` option and set it to the preferred hostname of your site, such as mycompany.com";
    }
    self.title = self.options.title;
    self.prefix = self.options.prefix || '';
  }

  function defineModules() {
    // Set moog-require up to create our module manager objects

    var synth = require('moog-require')({
      root: self.root,
      bundles: [ 'apostrophe' ],
      localModules: self.options.__testLocalModules || (self.rootDir + '/lib/modules'),
      defaultBaseClass: 'apostrophe-module'
    });

    _.each(self.options.modules, function(options, name) {
      synth.define(name, options);
    });

    return synth;
  }

  function instantiateModules(callback) {
    self.modules = {};
    return async.eachSeries(_.keys(self.options.modules), function(item, callback) {
      return self.synth.create(item, { apos: self }, function(err, obj) {
        if (err) {
          return callback(err);
        }
        self.modules[item] = obj;
        return callback(null);
      });
    }, function(err) {
      return setImmediate( function(err) {
        return callback(err);
      });
    });
  }

  function modulesReady(callback) {
    return callForAll('modulesReady', callback);
  }

  function modulesAfterInit(callback) {
    return callForAll('afterInit', callback);
  }

  function afterInit(callback) {
    // Give project-level code a chance to run before we
    // listen or run a task
    if (!self.options.afterInit) {
      return setImmediate(callback);
    }
    return self.options.afterInit(callback);
  }

  function callForAll(method, callback) {
    return async.eachSeries(_.keys(self.modules), function(name, callback) {
      var module = self.modules[name];
      var invoke = module[method];
      if (invoke) {
        if (invoke.length === 1) {
          return invoke(callback);
        } else if (invoke.length === 0) {
          return setImmediate(function() {
            try {
              invoke();
            } catch (e) {
              return callback(e);
            }
            return callback(null);
          });
        }
      } else {
        return setImmediate(callback);
      }
    }, function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null);
    });
  }

};

module.exports.moogBundle = {
  modules: [ 'apostrophe-module' ].concat(_.keys(defaults.modules)),
  directory: 'lib/modules'
};
