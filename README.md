# sidekick-git-helpers

[![Build Status](https://travis-ci.org/sidekickcode/sidekick-git-helpers.svg?branch=master)](https://travis-ci.org/sidekickcode/sidekick-git-helpers)

git helpers that work with the git CLI. Probably only useful if you've got the same constraints as SK: x-platform without native deps.

Promise based API;

## Installation

```sh
npm install --save sidekick-git-helpers
```

## Usage

```sh
var helpers = require("sidekick-git-helpers");

helpers.findRootGitRepo(process.cwd())
.then((r) => console.log(`the enclosing git repo is: ${r}`))
.catch((e) => console.error(e));
```

