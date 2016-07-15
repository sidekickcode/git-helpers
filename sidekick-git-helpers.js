/*
 * exposes an API around git data
 *
 * all diffing operations (should) take arguments in HEAD, BASE order so a 
 * diff would show additions if first arg has a new line vs base
 *
 */
"use strict";

// TODO make all promiseable

const exec = require("child_process").exec;
const util = require("util");
const _ = require("lodash");
const Promise = require("bluebird");
const parseDiff = require("./parse-diff");


const fs = Promise.promisifyAll(require("fs"));
const path = require("path");

const execAtPath = Promise.promisifyAll(require("./lib/shell")).execAtPathAsync;

exports.CREATE_BRANCH = "create-branch";
exports.UPDATE_BRANCH = "update-branch";
exports.DELETE_BRANCH = "delete-branch";
// tag actions - we don't care about tags
exports.TAG_ACTION = "tag-action";


exports.ERROR_WORKING_COPY_DIRTY = "working-copy-unclean";

exports.prepush = Promise.method(prepush);
exports._parsePrepushCliInput = parsePrepushCliInput;
exports.fetchBranchFromRemote = fetchBranchFromRemote;
exports.workingCopyIsClean = workingCopyIsClean;
exports.getCurrentBranch = getCurrentBranch;

exports.getHeadSha = getHeadSha;

// 1 indexed modifications
exports.filesWithModifications = filesWithModifications;
exports.fileModifications = fileModifications;

exports.allFiles = allFiles;

exports.stageFile = stageFile;

exports.ensureComparisonTargetPresent = ensureComparisonTargetPresent;
exports.parseCommitish = parseCommitish;


/**
 * lines added/modified in new state of file
 */

exports.commitsBetween = commitsBetween;
exports.commitSidekick = commitSidekick;
exports.commitAndPushFixup = commitAndPushFixup;

exports.gitShowBlob = gitShowBlob;
exports.gitShowPathInCommit = gitShowPathInCommit;

exports.branchTipContainsAncestorAsync = branchTipContainsAncestorAsync();

exports.findRootGitRepo = findRootGitRepo;

exports.NotAGitRepo = NotAGitRepo;

exports.possibleComparisonTargets = possibleComparisonTargets;

let gitBin = "/usr/bin/git";

exports.setGitBin = function(to) {
  gitBin = to;
}
 
function NotAGitRepo() {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = "not a git repo - this operation can only be performed in a git repo";
}
 
require('util').inherits(NotAGitRepo, Error);


// don't move me - I need to be after exports
Promise.promisifyAll(exports);

/**
 * gives you modifications in commits, and in working copy
 */
function filesWithModifications(repoPath, target, cb) {
  const workingCopy = {};
  const parsedTarget = interpretTarget();

  // onlying use one char of two char status
  // TODO handle unmerged etc
  const untrackingAndWorkingCopy = parsedTarget.after === workingCopy
    ? Promise.join(findWorkingCopyChanges(repoPath), findUntrackedPathsInRepo(repoPath), (a,b) => a.concat(b))
    : Promise.resolve([]);


  const commitedChanges = findCommittedChangesInRepoVsSha(repoPath, parsedTarget.before, parsedTarget.after === workingCopy ? "HEAD" : parsedTarget.after);

  return Promise.join(commitedChanges, untrackingAndWorkingCopy, function(inDiff, outsideOfCommits) {
    return _(inDiff.concat(outsideOfCommits))
      .filter(hasPotentialModifications)
      .unique("path")
      .value();
  })
  .nodeify(cb); 

  function interpretTarget() {
    if(typeof target === 'string') {
      return { before: target, after: workingCopy };
    } else {
      return { before: target.before || "HEAD", after: target.after || workingCopy };
    }
  }

}

/**
 * everything we'd want to look at in the repo
 */
function allFiles(repoPath, cb) {
  return Promise.join(findUntrackedPathsInRepo(repoPath), allTrackedFilesInRepo(repoPath), function(untracked, tracked) {
    return _(untracked.concat(tracked))
      .unique("path")
      .value();
  })
  .nodeify(cb);
}

function hasPotentialModifications(file) {
  return statesThatImplyModification.has(file.action) ||
    lessThanCompleteRenameOrCopy(file.action);
  function lessThanCompleteRenameOrCopy(rn) {
    // Rename and copies look like R100, C44
    if(rn[0] === "R" || rn[0] === "C") {
      return parseInt(rn.slice(1), 10) < 100;
    }
  }
}

function ensureComparisonTargetPresent(repoPath, remote, remoteBranch){
  //git ls-remote --heads remote branch
  return gitAtPath(repoPath, "ls-remote --heads " + remote + " " + remoteBranch)
  .then(function(remoteShas){
    return remoteShas !== '';
  });
}

function findWorkingCopyChanges(repoPath) {
  // We need status to pick up working copy changes, but
  // git status is terrible for untracked, as it doesn't recurse into directories.
  //
  // It gives you /blah only for /blah/{foo,bar,baz}.js
  return gitAtPath(repoPath, "status --untracked=no --porcelain")
  .then(preprocessStdoutLines)
  .then(function(lines) {
    return compactMap(lines, parseLineFromGitStatus);
  });

}

function findUntrackedPathsInRepo(repoPath) {
  return gitAtPath(repoPath, "ls-files --others --exclude-standard")
  .then(preprocessStdoutLines)
  .then(function(lines) {
    return _.map(lines, function(p) {
      return {
        path: p,
        action: STATES.UNTRACKED,
      };   
    });
  });
}

function allTrackedFilesInRepo(repoPath) {
  return gitAtPath(repoPath, "ls-files --exclude-standard")
  .then(preprocessStdoutLines)
  .then(function(lines) {
    return _.map(lines, function(p) {
      return {
        path: p,
        action: STATES.TRACKED,
      };    
    });
  });
  
}

function findCommittedChangesInRepoVsSha(repoPath, vsSha, after = "HEAD") {
  return gitAtPath(repoPath, "diff --find-copies --find-renames --name-status %s %s", vsSha, after)
  .then(preprocessStdoutLines)
  .then(function(lines) {
    return compactMap(lines, parseLineFromGitDiff);
  });
}

function preprocessStdoutLines(stdoutStderr) {
  if(stdoutStderr[0] === "") {
    return [];
  }

  var lines = stdoutStderr[0];
  // drop the trailing newline
  return _.initial(lines.split("\n"));
}

function compactMap(xs, fn, ctx) {
  return _.compact(_.map(xs, fn, ctx)); 
}

function parseWithWarning(parser, input) {
  var file = parser(input);
  var name = parser.name;
  if(file) {
    return file;
  } else {
    throw Error(name + " couldn't parse '" + input + "'");
  }
}

exports._parseLineFromGitStatus = parseLineFromGitStatus;
exports._parseLineFromGitDiff = parseLineFromGitDiff;

function parseLineFromGitDiff(line) {
  var DIFF_LINE_RE = /^([\w\d]+)\t([^\t]+)(?:\t(.+))?/;
  var match = DIFF_LINE_RE.exec(line); 
  if(!match || line === "") {
    return;
  }

  var file = {
    action: parseAction(match[1]),
    path: match[3] || match[2],
  };

  if(file.action) {
    return file;
  }
}

function parseLineFromGitStatus(line) {
  var STATUS_LINE_RE = /^(.)(.) (.+)/;
  var match = STATUS_LINE_RE.exec(line); 
  if(!match || line === "") {
    return;
  }

  var x = match[1];
  var y = match[2];
  var path = match[3];

  var file = {
    action: parseAction(x == " " ? y : x),
    path: path,
  };

  if(file.action) {
    return file;
  }
}


function branchTipContainsAncestorAsync() {
  return Promise.method(function(repoPath, opts) {

    assertIsSha(opts.ancestor);
    assertIsSha(opts.tip);

    // we've validated it's a sha, so must be unpulled etc
    var unknownCommitRe = /Not a valid commit name/;

    // Check if the first <commit> is an ancestor of the second <commit>, and exit with status 0 if true, o with status 1 if not. Errors are signaled by a non-zero status that is not 1.
    return gitAtPath(repoPath, "merge-base --is-ancestor %s %s", opts.ancestor, opts.tip)
    .catch(function(err) {
      if(Number(err.code) === 1) {
        return false;
      }
      if(unknownCommitRe.test(err.message)) {
        return false;
      }
      return Promise.reject(err);
    });
  });
}

function commitsBetween(repoPath, before, after, cb) {
  cb(Error("unimplemented"));
}

// 1-indexed modifications
function fileModifications(repoPath, path, headSha, cb) {
  // find blobs in both commits
  return trackingStatus()
    .then(function(statusOrLines) {
      if(statusOrLines === "tracked") {
        return diffBlob(repoPath, path, headSha)
        .then(parseDiff)
        .get("modified")
      } else {
        return statusOrLines;
      }
    })
    .nodeify(cb)

  function trackingStatus() {
    return gitAtPath(repoPath, "ls-tree HEAD -- %s", path)
    .then(function(stdoutStderr) {
      if(stdoutStderr[0] === "") {
        return allLines();
      } else {
        return "tracked";
      }

    });
  }

  function allLines() {
    return fs.readFileAsync(repoPath + "/" + path)
    .then(function(f) {
      // range is exclusive of end
      return _.range(1, f.toString().split("\n").length + 1); 
    });
  }
}



function diffBlob(repoPath, path, headSha) {
  return gitAtPath(
    repoPath,
    /* older, newer order */
    "diff %s -- %s", headSha, path
  )
  .get(0);
}


function diffBlobs(repoPath,currentSha,previousSha) {
  // -r : recursive
  return gitAtPath(
    repoPath,
    "diff-tree -r --find-renames --find-copies %s %s",
    /* older, newer order */
    previousSha,
    currentSha
  )
  .get(0)
  .then(parseDiffOutput);
}


function gitShowPathInCommit(repoPath, ref, path, cb) {
  if(!repoPath) {
    return cb(Error("missing path"));
  }

  gitAtPath(
    repoPath,
    "show %s:%s", ref, path
  ).then(stdoutOnly)
  .nodeify(cb);
}


function gitShowBlob(repoPath, ref, cb) {
  gitAtPath(
    repoPath,
    "show %s", ref
  ).then(stdoutOnly)
  .nodeify(cb);
}

function stdoutOnly(stdoutStderr) {
  return stdoutStderr[0]; 
}

// private

// file states - a superset of git's statuses for files in diffs (TRACKED is additional one)
const STATES = exports.ACTIONS = {
  "ADD": "add",
  "COPY": "copy",
  "DELETE": "delete",
  "MODIFIED": "modified",
  "RENAME": "rename",
  "TYPE": "type",
  "UNMERGED": "unmerged",
  "UNKNOWN": "unknown",
  "UNTRACKED": "untracked",
  // special case: for non-diff analysis
  "TRACKED": "tracked",
};

const statesThatImplyModification = new Set([
  STATES.ADD,
  STATES.COPY,
  STATES.UNTRACKED,
  STATES.MODIFIED
]);


function parseDiffOutput(str) {
  return str.split("\n")
    .filter(notEmptyLine)
    .map(parseDiffTreeLine)
    .filter(function(action) {
      return !IGNORE_STATES.has(action);
    });
}

function notEmptyLine(line) {
  return !/^\s*$/.test(line);
}

// https://www.kernel.org/pub/software/scm/git/docs/git-diff-tree.html#_raw_output_format
const stateLookups = {
  A: STATES.ADD,
  C: STATES.COPY,
  D: STATES.DELETE,
  M: STATES.MODIFIED,
  R: STATES.RENAME,
  T: STATES.TYPE,
  U: STATES.UNMERGED,
  '?': STATES.UNTRACKED,
  X: STATES.UNKNOWN
};
const IGNORE_STATES = new Set([
  STATES.UNMERGED,
  STATES.UNKNOWN,
  STATES.TYPE,
]);

const diffTreeLineRe = /^:\d+ \d+ ([a-f0-9]+) ([a-f0-9]+) (\w)/i;

function parseDiffTreeLine(str) {
  var diffInfoFiles = str.split("\t");
  var diffInfo = diffInfoFiles[0];

  var tuple = diffInfo.match(diffTreeLineRe).slice(1);
  var parsed = _.object(_.zip(["hashBefore","hashAfter","action"],tuple));

  var files = diffInfoFiles.slice(1);
  parsed.sourceFile = files[0];
  if(parsed.action in {"R":1,"C":1}) {
    parsed.destinationFile = files[1];
  }

  // path = file currently
  parsed.path = parsed.destinationFile || parsed.sourceFile;

  parsed.action = parseAction(parsed.action);

  return parsed;
}


function parseAction(action) {
  if(action[0] === "R") {
    return STATES.RENAME;
  } else if(action[0] === "C") {
    return STATES.COPY;
  } else {
    return stateLookups[action];
  }
}


function prepush(cliArgs, input, cwd) {
  const info = parsePrepushCliInput(cliArgs, input);

  return findRootGitRepo(cwd)
  .then(function(root) {

    // parse any symbolic locals to full branch name
    return parseSymbolicRefs(_.pluck(info.actions, "localRef"))
    .then(function(parsed) {
      _.each(info.actions, function(action, index) {
        action.localBranch = refToBranchName(parsed[index]);
        action.remoteBranch = refToBranchName(action.remoteRef);
      });

      info.repoPath = root;

      return info;
    });
  });

  function parseSymbolicRefs(localRefs) {
    if(localRefs.length === 0) {
      return Promise.resolve([]);
    }

    var query = localRefs.join(" ");

    // handles stuff like HEAD
    return gitAtPath(cwd, `rev-parse --symbolic-full-name '%s'`, query)
    .then(function(stdinStderr) {
      return logicalLinesFromStdio(stdinStderr[0]);
    });
  }
}

function parsePrepushCliInput(cliArgs, input) {
  if(!cliArgs[0] || !cliArgs[1]) {
    throw Error("missing remote and url - ensure hook arguments are being passed ($1 and $2)");
  }
  // wrap to catch parsing errors
  return {
    remote: cliArgs[0],
    url: cliArgs[1],
    actions: parsePrepushRefs(input),
  };
}

// returns: "nothing-added" or "pushed"
function commitAndPushFixup(push, update) {
  const repoPath = push.repoPath;

  // TODO make this anything staged?
  return hasChangesToCommit(repoPath)
    .then(function(yes) {
      if(yes) {
        return commit();
      } else {
        return "nothing-added";
      }
    })
    .then(function() {
      return gitAtPath(repoPath, `push --no-verify '%s' %s:%s`
        , push.remote
        , update.localRef
        , update.remoteRef
        )
      .then(_.constant("pushed"));
    })

  function commit() {
    var getStdout = _.first;
    return gitAtPath(
      repoPath
      , "commit -m 'sidekick fixes'"
    ).then(getStdout);
  }
}

function commitSidekick(path) {
  return gitAtPath(path, `add .sidekickrc && git commit -m "add sidekick config"`);
  
}

function stageFile(repoPath, filePath) {
  return gitAtPath(repoPath, "add '%s'", filePath);
}


const EMPTY_BRANCH = "0000000000000000000000000000000000000000";

// while read local_ref local_sha remote_ref remote_sha
const lineFormat = ["localRef", "localSha", "remoteRef", "remoteSha"];
const deletePrefix = /^\(delete\) /;

/**
 * parse input from a push hook
 *
 * format:
 *
 *     local_ref local_sha remote_ref remote_sha
 *
 * new-branch
 *
 *     refs/heads/initial-ui b043e68623118e827eaf2ef0fbb29bc79f6f9ee8 refs/heads/fooby 00000000000000000000000000000000000    00000
 *
 * update-branch
 *
 *     refs/heads/initial-ui b043e68623118e827eaf2ef0fbb29bc79f6f9ee8 refs/heads/initial-ui 300bf412782759fad91e9af4ce0c3859b8c1a543
 *
 * symbolic refs
 *
 *     HEAD b043e68623118e827eaf2ef0fbb29bc79f6f9ee8 refs/heads/initial-ui 300bf412782759fad91e9af4ce0c3859b8c1a543
 *
 * delete
 *
 *     (delete) 0000000000000000000000000000000000000000 refs/heads/fooby b043e68623118e827eaf2ef0fbb29bc79f6f9ee8
 *
 */
function parsePrepushRefs(input) {
  // reads refs from git's pre-push hook
  if(input === "") {
    return [];
  }

  const cmds = input.trim().split("\n").map(function(l) {

    const chunks = l.split(" ");

    if(chunks.length !== 4) {
      throw Error("invalid line format");
    }

    var type = exports.UPDATE_BRANCH;
    if(deletePrefix.test(l)) {
      l = l.replace(deletePrefix, "");
      type = exports.DELETE_BRANCH;
    }
    const info = _.object(_.zip(lineFormat, chunks));


    if(isTagPush(info)) {
      type = exports.TAG_ACTION;
    } else if(info.remoteSha === EMPTY_BRANCH) {
      type = exports.CREATE_BRANCH;
    }

    info.type = type;

    return info;
  });

  return cmds;


}


function findRootGitRepo(start, cb) {
  return new Promise(function(resolve, reject) {
    fs.realpathAsync(start)
      .catch(reject)
      .then(walk);

    function walk(at) {
      fs.exists(at + "/.git", function(yes) {
        if(yes) {
          return resolve(at);
        }

        var parent = path.normalize(at + "/..");
        if(parent === "/") {
          reject(new NotAGitRepo);
        } else {
          walk(parent);
        }
      });
    }
  })
  .nodeify(cb);
}

function possibleComparisonTargets(repoPath) {
  return Promise.all([
    getLocalRefs(repoPath),
  ])
  .then(_.flatten);
}

function getLocalRefs(repoPath) {


  return gitAtPath(repoPath, "show-ref")
  .then(function(stdinStderr) {
    return _(logicalLinesFromStdio(stdinStderr[0]))
    .map(parseShowRefLine)
    .filter(function(ref) {
      return ref && !isRemoteHead(ref); 
    })
    .value();
  });

  function isRemoteHead(ref) {
    // the default branch (i.e. the target of the symbolic-ref refs/remotes/<name>/HEAD) - not useful for user
    return ref.type === "remoteBranch" && ref.name === "HEAD"; 
  }
}

function logicalLinesFromStdio(input) {
  return input.trim().split("\n");
}

exports._parseShowRefLine = parseShowRefLine;

function parseShowRefLine(line) {
  var shaRefPair = line.split(" ");

  var sha = shaRefPair[0];
  var ref = shaRefPair[1];

  // we're interested in 3 types of ref:
  //
  // refs/heads/:branch
  // refs/remotes/:remoteName/:branch
  // refs/tags/:name
  var parts = ref.split("/");
  var type = parts[1];

  switch(type) {
  case "heads":
    // refs/heads/:branch
    return {
      type: "localBranch",
      name: parts[2],
      full: ref,
      sha: sha,
    }
  case "remotes":
    // refs/remotes/:remoteName/:branch
    return {
      type: "remoteBranch",
      remote: parts[2],
      name: parts[3],
      full: ref,
      sha: sha,
    }
  case "tags":
    // refs/tags/:name
    return {
      type: "tag",
      name: parts[2],
      full: ref,
      sha: sha,
    }
  }
}


function workingCopyIsClean(repoPath) {
  return gitAtPath(repoPath, "status --porcelain")
  .then(isOutputEmpty); 
}

function hasChangesToCommit(repoPath) {
  return gitAtPath(repoPath, "diff --cached --name-status")
  .then(function(stdinStderr) {
    return !isOutputEmpty(stdinStderr); 
  }); 
}

function isOutputEmpty(stdoutErr) {
  return stdoutErr[0].length === 0;
}

function getCurrentBranch(repoPath, cb) {
  return gitAtPath(repoPath, "rev-parse --abbrev-ref HEAD")
    .then(function(stdoutErr) {
      return stdoutErr[0].trim();
    })
    .nodeify(cb);
}

function getHeadSha(repoPath) {
  return gitAtPath(repoPath, "rev-parse HEAD")
    .then(function(stdoutErr) {
      return stdoutErr[0].trim();
    });
}

function parseCommitish(repoPath, commitIsh) {
  return gitAtPath(repoPath, "rev-parse '%s'", commitIsh)
    .then(function(stdoutErr) {
      return stdoutErr[0].trim();
    });
}


function fetchBranchFromRemote(repoPath, remote, branch) {
  return gitAtPath(repoPath, `fetch '%s' '%s'`, remote, branch);
}

function refToBranchName(ref) {
  return _.last(ref.split("/"));
}

function assertIsSha(s) {
  if(!/^[a-f0-9]{40}$/i.test(s)) {
    throw Error("should be a valid sha, got: " + s);
  }
}

function isTagPush(info) {
  return /^refs\/tags\//.test(info.remoteRef);
}

function gitPath() {
  return gitBin;
}

function gitAtPath(repoPath, command) {
  var args = [repoPath, gitPath() + " " + command].concat(_.slice(arguments, 2));
  return execAtPath.apply(null, args);
}
