"use strict";

var proxyquire =  require('proxyquire');

global.helpers = require("./file-system-helpers");

var chai = require("chai");

chai.config.showDiff = true;

require("pprint").expose();
global.assert = chai.assert;
global.expect = chai.expect;


chai.use(function (_chai, utils) {
  assert.startsWith = function(str, prefix) {
    assert.isString(str);
    assert.isString(prefix);
    var match = new RegExp("^" + prefix);
    assert.match(str, match, "expected '" + str + "' to start with '" + prefix + "'");
  }
});

