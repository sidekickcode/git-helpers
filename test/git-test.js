var git = require("../sidekick-git-helpers");
var _ = require("lodash");
var Promise = require("bluebird");
var fs = require("fs");


// generated with:
//
//   find . -type d -maxdepth 2 -exec test -d {}/.git \; '!' -print | while read d; do pushd $d >/dev/null; git status --untracked=no --porcelain; popd > /dev/null; done > lots-of-git-status-output
//
// use initial to drop final empty string
var gitStatusFixtures = _.initial(fs.readFileSync(__dirname + "/git-test-git-status-fixtures.txt", { encoding: "utf8" }).split("\n"));
var gitDiffFixtures = _.initial(fs.readFileSync(__dirname + "/git-test-git-diff-fixtures.txt", { encoding: "utf8" }).split("\n"));

var FIXTURES_PATH = __dirname + "/temporary-test-repos";
describe('given a situation with modifications and additions in commits and working copy', function() {

	var commits;
	var repo;
  var repoApi;

	before(function() {
		repo = modifiedInWorkingCopyAndCommits();
    repoApi = helpers.repository(repo);
		commits = repoApi.commits;
	});

  after(function() {
    helpers.rmDirectory(FIXTURES_PATH)
  });

	describe('loading modifications to file', function() {

		var diffsByPath;

		before(function() {
			return Promise.props(_.transform([
				"modifiedInCommit.js",
				"addedInCommit.js",
				"modifiedInWorkingCopy.js",
				"addedInWorkingCopy.js",
			], function(diffsByPath, path) {
				diffsByPath[path] = 
					git.fileModifications(repo.path, path, _.last(commits).sha);
			}, {}))
			.then(function(props) {
				diffsByPath = props;	
			});
		});

		describe('modified in commit', function() {

			it('includes modified lines', function() {
				assert.sameMembers(diffsByPath["modifiedInCommit.js"], [1,3]);
			})
				
		})

		describe('added in commit', function() {

			it('includes all lines', function() {
				assert.sameMembers(diffsByPath["addedInCommit.js"], [1,2,3]);
			})
				
		})

		describe('modified in working copy', function() {

			it('includes modified lines', function() {
				assert.sameMembers(diffsByPath["modifiedInWorkingCopy.js"], [1,3]);
			})
				
		})

		describe('added in working copy', function() {

			it('includes all lines', function() {
				assert.sameMembers(diffsByPath["addedInWorkingCopy.js"], [1,2,3]);
			})
				
		})


	});

	describe('filesWithModifications', function() {

		before(function() {
			return git.filesWithModifications(repo.path, _.last(commits).sha)
			.then(function(files) {
				result = files;
			});
		});

		it('contains files modified in commits', function() {
			assertFile("modifiedInCommit.js");
		})

		it('contains files added in commits', function() {
			assertFile("addedInCommit.js");
		})

		it('contains files modified in working copy', function() {
			assertFile("modifiedInWorkingCopy.js");
		})

		it('contains files added in working copy', function() {
			assertFile("addedInWorkingCopy.js");
		})

		it('contains files staged', function() {
			assertFile("stagedInWorkingCopy.js");
		})

		it('ignores files deleted', function() {
			refuteFile("deletedInWorkingCopy.js");
		})

		it('handles adding deep', function() {
			assertFile("deep/path/addedInWorkingCopy.js");
		})

		it('handles additions in untracked directories', function() {
			assertFile("untracked/path/untrackedInWorkingCopy.js");
		})

		it('handles untracked', function() {
			assertFile("untrackedInWorkingCopy.js");
		})

		it('handles additions in deep tracked directories', function() {
			assertFile("deep/path/addedInCommit.js");
		})

		pathsValid(function() {
			return result;	
		});
				
		function assertFile(f) {
			var paths = _.pluck(result, "path");
			assert.include(paths, f); 
		}

		function refuteFile(f) {
			var paths = _.pluck(result, "path");
			assert.notInclude(paths, f); 
		}
	})

  describe('getting comparison targets', function() {

    before(function() {
      var self = this;

      [
        "git tag one-behind-head-tag HEAD~1",
        "git tag head-tag HEAD",
        "git branch one-behind-head-branch HEAD~1",
        "git branch head-branch HEAD",
      ].forEach(repoApi.command);

      this.head = _.first(commits);
      this.oneBehindHead = commits[1];

      return git.possibleComparisonTargets(repo.path, this.head)
      .then(function(targets) {
        self.targets = targets;
      });
    });

    it('identifies branches', function() {
      var headBranch = assertFind(this.targets, { name: "head-branch" });
      assert.startsWith(headBranch.sha, this.head.sha);
      assert.equal(headBranch.type, "localBranch")

      var headButOneBranch = assertFind(this.targets, { name: "one-behind-head-branch" });
      assert.startsWith(headButOneBranch.sha, this.oneBehindHead.sha);
    })

    it('identifies tags', function() {
      var head = assertFind(this.targets, { name: "head-tag" });
      assert.startsWith(head.sha, this.head.sha);
      assert.equal(head.type, "tag")

      var headButOne= assertFind(this.targets, { name: "one-behind-head-tag" });
      assert.startsWith(headButOne.sha, this.oneBehindHead.sha);
    })

    describe('parsing remotes', function() {
      before(function() {
        // adding remotes to local repo is a pain, so check it can parse lines
        var lines =
`599aa51c5e68357367152277917d446655fa21bd refs/remotes/heroku/master
3fea0077b57e847a5c8b669973089ff284509a28 refs/remotes/origin/HEAD
e8576565a14a334e52230a40a7ed4420669b6fb1 refs/remotes/origin/add_repo_fixes
ab470bd3ee5d42e5301e2430a1a488f80585461e refs/remotes/other/angular-structure
dbddd2e07d2352a1d46f5c53d774f5d39ab2ce3f refs/remotes/origin/api-sketching`.split("\n");

        this.parsed = _.map(lines, git._parseShowRefLine);
      });

      it('parses the default target', function() {
        assertFind(this.parsed, { name: "HEAD" });
      })

      it('parses standard remotes', function() {
        assertFind(this.parsed, { name: "add_repo_fixes" });
      })

      it('parses as remote branches', function() {
        assertFind(this.parsed, { name: "add_repo_fixes", type: "remoteBranch" });
      });

      it('parses origin', function() {
        assertFind(this.parsed, { remote: "origin" });

        assertFind(this.parsed, { remote: "heroku" });
      });

        
    })
      
  })


});

function assertFind(xs, query) {
  var found = _.findWhere(xs, query);

  if(found) {
    return found;
  } else {
    assert(false, "expected to find object matching " + JSON.stringify(query));
  }
}

function assertNotFind(xs, query) {
  var found = _.findWhere(xs, query);

  if(found) {
    assert(false, "found " + JSON.stringify(found) + " unexpectedly, which matches " + JSON.stringify(query));
  }
}

describe('parsing lines from git diff', function() {
  var LINES = {
    "R097\tapp/analysers/coffeelint/bin/blob\tapp/analysers/coffeelint/index.js": git.ACTIONS.RENAME,
    "C097\tapp/analysers/coffeelint/bin/blob\tapp/analysers/coffeelint/index.js": git.ACTIONS.COPY,
    "C012\tapp/analysers/coffeelint/bin/blob\tapp/analysers/coffeelint/index.js": git.ACTIONS.COPY,
    "C5\tapp/analysers/coffeelint/bin/blob\tapp/analysers/coffeelint/index.js": git.ACTIONS.COPY,
    "C09\tapp/analysers/coffeelint/bin/blob\tapp/analysers/coffeelint/index.js": git.ACTIONS.COPY,
    "R050	doc/files/.._lib_Ratio-0.3.10.min.js.html	doc/files/.._lib_Ratio-0.3.11.min.js.html": git.ACTIONS.RENAME,
    "D\tapp/analysers/eslint/bin/blob": git.ACTIONS.DELETE,
    "A\tapp/analysers/eslint/config.json": git.ACTIONS.ADD,
  }; 


  it("parses a range of tricky statuses", function() {
    _.each(LINES, function(action, line) {
      var parsed = git._parseLineFromGitDiff(line);
      assert(parsed, "couldn't parse line");
      assert.equal(parsed.action, parsed.action);
    });
  });


  it("parses a lot of status lines found empirically", function() {
    _.each(gitDiffFixtures, function(line) {
      var parsed = git._parseLineFromGitDiff(line);
      assert(parsed, "couldn't parse '" + line + "'");
      assert.isString(parsed.action, "missing action");
      assert.isString(parsed.path, "missing path");
    });
  });

  it("includes the new name of a file as the path to analyse", function() {
    var parsed = git._parseLineFromGitDiff("R097\tapp/analysers/coffeelint/bin/blob\tapp/analysers/coffeelint/index.js");
    assert(parsed, "couldn't parse line");
    assert.equal(parsed.path, "app/analysers/coffeelint/index.js");
  })

  it("can parse instane path names", function() {
    var parsed = git._parseLineFromGitDiff("R050	doc/files/.._lib_Ratio-0.3.10.min.js.html	doc/files/.._lib_Ratio-0.3.11.min.js.html");
    assert(parsed, "couldn't parse line");
    assert.equal(parsed.path, "doc/files/.._lib_Ratio-0.3.11.min.js.html");
  })
})

describe('parsing lines from git status', function() {
  it("parses a lot of status lines found empirically", function() {
    _.each(gitStatusFixtures, function(line) {
      var parsed = git._parseLineFromGitStatus(line);
      assert(parsed, "couldn't parse '" + line + "'");
      assert.isString(parsed.action, "missing action");
      assert.isString(parsed.path, "missing path");
    });
  });
})

describe('detecting unmerged files', function() {


	var result;

	before(function() {
		this.setup = unmerged();
		var repo = helpers.repository(this.setup);
		var commits = repo.branches[0].processedCommits;

		return git.filesWithModifications(repo.path, _.last(commits).sha)
		.then(function(files) {
			result = files;
		});
	});
		
	it('includes unmerged files', function() {
		var paths = _.pluck(result, "path");
		assert.include(paths, "unmerged.js"); 
	})

	pathsValid(function() {
		return result;	
	});
})

describe('parsing symbolic refs in prepush', function() {

  var self;

  before(function() {
    self = this;

		this.setup = prepushRepo();
		this.repo = helpers.repository(this.setup);

    var stdin =
`HEAD 8ee0899950e5e2ebf30d4ae4796dae067aa8a6f9 refs/heads/other d4e1111e7170f1deab6709bba6fe15b42512ef74
`;

    var cliArgs = ["origin", "https://github.com/timruffles/testy.git"];


    return git.prepush(cliArgs, stdin, this.repo.path)
    .then(function(parsed) {
      self.parsedHead = parsed;
    })
  })

  before(function() {

    var stdin =
`REFFY 8ee0899950e5e2ebf30d4ae4796dae067aa8a6f9 refs/heads/other d4e1111e7170f1deab6709bba6fe15b42512ef74
`;

    var cliArgs = ["origin", "https://github.com/timruffles/testy.git"];

    return git.prepush(cliArgs, stdin, this.repo.path)
    .then(function(parsed) {
      self.parsedReffy = parsed;
    })
  })

  before(function() {

    var stdin =
`refs/heads/master 8ee0899950e5e2ebf30d4ae4796dae067aa8a6f9 refs/heads/other d4e1111e7170f1deab6709bba6fe15b42512ef74
`;

    var cliArgs = ["origin", "https://github.com/timruffles/testy.git"];

    return git.prepush(cliArgs, stdin, this.repo.path)
    .then(function(parsed) {
      self.parsedStandard = parsed;
    })
  })

  it('deferenced HEAD', function() {
    assert.equal(self.parsedHead.actions[0].localBranch, "master"); 
  })

  it('deferenced other symbolic refs', function() {
    assert.equal(self.parsedReffy.actions[0].localBranch, "other"); 
  })

  it('handles non-symbolic refs', function() {
    assert.equal(self.parsedStandard.actions[0].localBranch, "master"); 
  })

  describe("empty push", function() {
    before(function() {
      var stdin = "";

      var cliArgs = ["origin", "https://github.com/timruffles/testy.git"];

      return git.prepush(cliArgs, stdin, this.repo.path)
      .then(function(parsed) {
        self.parsedReffy = parsed;
      })
    })

    it('returns nothing', function() {
       assert.lengthOf(self.parsedReffy.actions, 0); 
    })
  })

   

  function prepushRepo() {
    return {
      path: FIXTURES_PATH + "/pre-push-repo",
      commandsAppliedToWorkingCopy: [
        // create a new symbolic ref
        "git branch other",
        "git symbolic-ref REFFY refs/heads/other",
      ],
      commits: [
        {
          "copiedInCommit2.js": "1234557890123456789",
        },
      ],
    };
  }
  
})

function pathsValid(paths) {
	it("has valid paths",	function() {
		_.each(paths(),	function(p) {
			assert.isString(p.action, "action not valid");	
			assert.isString(p.path, "not a path");	
		});
	});
}

xdescribe('commits between', function() {
  var commits;
  before(function() {
    return git.commitsBetweenAsync(REPO_PATH, "27f6565eb7a55378bd5dc8fb34198a12e644d26b", "739c59a548ab170f0078d2d097d8d05b2ee682fc")
    .then(function(files) {
      commits = files;
    });
  })

  it('loads files', function() {
    assert.lengthOf(commits, 7);
  })
})


describe('listing all files for analysis, without a comparison target', function() {

  var self;

  before(function() {
    self = this;

		this.setup = allFilesRepo();
		this.repo = helpers.repository(this.setup);

    return git.allFiles(this.repo.path).then(function(all) {
      self.found = all;
    });
  })

  it('has tracked files', function() {
    assertFind(self.found, { path: "a.js" }); 
    assertFind(self.found, { path: "b.js" }); 
  })

  it('has untracked files', function() {
    assertFind(self.found, { path: "c.js" }); 
  })

  it("has excluded .gitignore'd files", function() {
    assertNotFind(self.found, { path: "d.js" }); 
  })

   

  function allFilesRepo() {
    return {
      path: FIXTURES_PATH + "/all-files-repo",
      workingCopy: {
        "c.js": "oj!!@@ 22 2  2",
        "d.js": "I really shouldn't be included",
        ".gitignore": "d.js",
      },
      commits: [
        {
          "b.js": "019230asodjijsd",
        },
        {
          "a.js": "1234557890123456789",
        },
      ],
    };
  }
  
})




// need to watch out here to ensure all files
// aren't picked up as renames (e.g don't have similar content
function modifiedInWorkingCopyAndCommits() {
	var basicFile = "function x() {}";
	var basicFileModified = "function y() {}";
  return {
    path: FIXTURES_PATH + "/modified-in-working-copy-and-commits",
    workingCopy: {
      "modifiedInWorkingCopy.js": [
				"function add(x) {",
				"  x + y;",
        " }",
      ].join("\n"),
      "copiedInWorkingCopy2.js": "abcdeffhiabcdefghi",
      "addedInWorkingCopy.js": [
        "function add() {",
        "  x + y;",
        "}",
      ].join("\n"),
			"stagedInWorkingCopy.js": "qqqq",
			"deep/path/addedInWorkingCopy.js": "a\nb\c",
			"untracked/path/untrackedInWorkingCopy.js": "z0120392",
			"untrackedInWorkingCopy.js": "12312",
    },
		commandsAppliedToWorkingCopy: [
			"rm deletedInWorkingCopy.js",
			"git add modifiedInWorkingCopy.js addedInWorkingCopy.js stagedInWorkingCopy.js deep/path/addedInWorkingCopy.js",
		],
    commits: [
      {
        "copiedInCommit2.js": "1234557890123456789",
        "modifiedInCommit.js": [
					"function add(x) {",
					"  x + y;",
					" }",
        ].join("\n"),
        "addedInCommit.js": [
          "function add() {",
          "  x + y;",
          "}",
        ].join("\n"),
        "deep/path/addedInCommit.js": "e\ng\nh",
      },
      {
        "modifiedInWorkingCopy.js": [
          "function add(x,y) {",
          "  x + y;",
          "}",
        ].join("\n"),
        "copiedInCommit.js": "1234567890123456789",
        "copiedInWorkingCopy.js": "abcdefghiabcdefghi",
        "modifiedInCommit.js": [
          "function add(x,y) {",
          "  x + y;",
          "}",
        ].join("\n"),
        "stagedInWorkingCopy.js": "z",
        "deletedInCommit.js": "x",
        "deletedInWorkingCopy.js": "p",
      }
    ],
  };
  
}

function unmerged() {
  return {
    path: FIXTURES_PATH + "/unmerged",
		commandsAppliedToWorkingCopy: [
			"git merge master || echo ok",
		],
		branches: [
			{
				name: "master",
				commits: [
					{
						"unmerged.js": ["c","a","b"].join("\n"),
					},
					{
						"unmerged.js": ["a","b","c"].join("\n"),
					}
				],
			},
			{
				name: "dev",
				base: "master@1",
				commits: [
					{
						"unmerged.js": ["c","b","a"].join("\n"),
					}
				],
			}
		]
  };
  
} 
