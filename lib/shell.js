"use strict";

const exec = require("child_process").exec;
const util = require("util");

exports.execAtPath = execAtPath;

// 800k seems ok for now - stops DOS with horrid concatentated/minified shite
const KB = 1024;
const MAX_FILE = 800 * KB;

function execAtPath(cwd, cmdFormat) {
  var cb = arguments[arguments.length - 1];
  if(typeof cb != "function") {
    throw new Error("must pass cb to runExec");
  }

  var expected = (cmdFormat.replace(/%%/g, "").match(/%\w/g) || []).length;

  var shellArgs = [].slice.call(arguments, 2, arguments.length - 1);

  if(expected !== shellArgs.length) {
    return cb(new Error(`expected ${expected} args, got ${shellArgs.length}`));
  }

  var cmd = 
    util.format.apply(util, [cmdFormat].concat(shellArgs));

  exec(cmd,
    {
      cwd: cwd,
      maxBuffer: MAX_FILE,
    },
    function(err,stdout,stderr) {
      if(err) {
        var msg = util.format("'%s' with error code %s, in path '%s'\nstdout: %s\nstderr: %s",
          err, err.code, cwd, stdout, stderr);
        var error = new Error(msg);
        error.code = err.code;
        error.signal = err.signal;
        error.stdout = stdout;
        error.stderr = stderr;
        return cb(error);
      }

      cb(null, stdout, stderr);
    }
  );
}


