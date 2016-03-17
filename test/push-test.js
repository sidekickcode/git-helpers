var git = require("../sidekick-git-helpers");
const prepush = git._parsePrepushCliInput;
const fixtures = require("./pushFixtures");
const _ = require("lodash");


describe('parsing pre-push hook', function() {

  var TEST_ARGV = ["a","b"];

  describe('parsing single branch update', function() {
    before(function() {
      this.push = prepush(TEST_ARGV, fixtures.updateOneBranch);
    });

    it('parses correct number of events', function() {
      assert.lengthOf(this.push.actions, 1);
    })
      
    it('parses as update', function() {
      assert.equal(this.push.actions[0].type, git.UPDATE_BRANCH);
    })
  })


  describe('parsing single branch delete', function() {
    before(function() {
      this.push = prepush(TEST_ARGV, fixtures.deleteBranch);
    });

    it('parses correct number of events', function() {
      assert.lengthOf(this.push.actions, 1);
    })
      
    it('parses as update', function() {
      assert.equal(this.push.actions[0].type, git.DELETE_BRANCH);
    })
  })

  describe('parsing double branch create', function() {
    before(function() {
      this.push = prepush(TEST_ARGV, fixtures.createTwoBranches);
    });

    it('parses correct number of events', function() {
      assert.lengthOf(this.push.actions, 2);
    })
      
    it('parses as update', function() {
      assert.equal(this.push.actions[0].type, git.CREATE_BRANCH);
      assert.equal(this.push.actions[1].type, git.CREATE_BRANCH);
    })
  })

  describe('parsing tags push', function() {
    before(function() {
      this.push = prepush(TEST_ARGV, fixtures.pushTags);
    });

    it('parses correct number of events', function() {
      assert.lengthOf(this.push.actions, 1);
    })

    it('parses as tag actions', function() {
      assert.equal(this.push.actions[0].type, git.TAG_ACTION);
    })
  })

    
})
