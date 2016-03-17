"use strict";

var sh = require("shelljs");
var path = require("path");
var _ = require("lodash");
var execSync = require("child_process").execSync;
var fs = require("fs");

// ensures a directory has a given set of files, with correct modes
exports.fixtureDirectory = scenario;

// creates a repository with given history
exports.repository = repository;

exports.fixturePathFor = function(file) {
  return path.dirname(file) + "/" + path.basename(file, ".js") + "Fixtures"; 
}

exports.rmDirectory = function(path) {
  if(!path) {
    return;
  } 
  sh.rm("-rf", path);
}

function repository(repo) {
  var path = repo.path;
  
  sh.rm("-rf", path);
  sh.mkdir("-p", path);

  run("git init");

  var branchesByName = _.indexBy(repo.branches, "name");

  // probably not good to use branches + commits together, hasn't really been tested
  var branches = _.map(repo.branches, function(branch, index) {
    run(`git checkout -b ${branch.name}`);

    if(branch.base) {
      var nameAndCommit = branch.base.split("@");
      var name = nameAndCommit[0];
      var base = branchesByName[name];
      if(!base || !base.processedCommits) {
        throw new Error("base branch no created or processed yet");
      }

      var baseCommit = base.processedCommits[nameAndCommit[1]];
      if(!baseCommit) {
        throw new Error("can't see base commit");
      }

      // move our branch to the correct location
      if(name !== "master") {
        run(`git checkout -b '${name}'`);
      }
      run(`git reset --hard '${baseCommit.sha}'`);
    }

    branch.processedCommits = branch.commits.reverse().map(createCommit);
    branch.processedCommits.reverse();

    return branch;
  });

  var commits = (repo.commits || []).reverse().map(createCommit);

  commits.reverse();

  if(repo.workingCopy) {
    ensurePaths(path, repo.workingCopy);
  }

  _.each(repo.commandsAppliedToWorkingCopy, run);

  return {
    branches: branches,
    commits: commits,
    head: _.first(commits),
    path: repo.path,
    command: run,
  }

  function createCommit(paths, index) {
    ensurePaths(path, paths);

    var output = execSync("git add -A . && git commit -m 'commit " + (index + 1) + "'", {
      cwd: path,
    });

    return {
      sha: /([a-f0-9]+)\]/.exec(output)[1],
    }
  }

  function run(cmd) {
    execSync(cmd, {
      cwd: path,
    }); 
  }
}

function scenario(targetPath, paths) {
  sh.rm("-rf", targetPath); 
  sh.mkdir("-p", targetPath);

  ensurePaths(path, paths);
}

function ensurePaths(targetPath, paths) {
  _.each(paths, function(setup, p) {
    if(p === "$deleted") {
      return setup.forEach(function(p) {
        fs.unlinkSync(targetPath + "/" + p);
      })
    }

    var basedir = path.dirname(p);

    sh.mkdir("-p", targetPath + "/" + basedir);
    setup = typeof setup === "string" ? { content: setup } : setup;
    var target = targetPath + "/" + p;
    setup.content.to(target);

    if(setup.mode) {
      sh.chmod(setup.mode, target);
    }
  });

}
