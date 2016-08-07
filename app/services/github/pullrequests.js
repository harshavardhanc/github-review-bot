var githubApi = require('./github-api'),
	github = githubApi.service,
	auth = require('./auth'),
	debug = require('debug')('reviewbot:bot'),
	config = require('../../../config');


/**
 * Fetch a single pull requests in the currently configured repo
 * @callback {getPullRequestsCb} callback
 */
function get(prNumber, repo, callback) {
	auth.authenticate();
	/**
	 * @callback getPullRequestsCb
	 * @param {Object[]} result - Returned pull request objects
	 */
	debug('GitHub: Attempting to get PR #' + prNumber);

	github.pullRequests.get({
		user: config.organization,
		repo: repo,
		number: prNumber
	}, function(error, result) {
		if (error) {
			return debug('getPullRequests: Error while fetching PRs: ' + error);
		}
		debug('GitHub: PR successfully recieved. Changed files: ' + result.changed_files);
		if (callback) {
			callback([result]);
		}
	});
}


/**
 * Fetch all pull requests in the currently configured repo
 * @callback {getPullRequestsCb} callback
 */
function getAll(repo, callback) {
	auth.authenticate();

	/**
	* @callback getPullRequestsCb
	* @param {Object[]} result - Returned pull request objects
	*/
	github.pullRequests.getAll({
		user: config.organization,
		repo: repo,
		state: config.pullRequestStatus
	}, function(error, result) {
		if (error) {
			return debug('getPullRequests: Error while fetching PRs: ', error);
		}

		if (!result || !result.length || result.length < 1) {
			return debug('getPullRequests: No open PRs found');
		}

		if (callback) {
			callback(result);
		}
	});
}
var _knownCommits = [];
function _getCommits(err, res, callback) {
		if(err){
			return false;
		}
		_knownCommits = _knownCommits.concat(res);
		if(github.hasNextPage(res)) {
			github.getNextPage(res, function(err,res) { _getCommits(err,res,callback) });
		} else {
			if(callback) {
				callback(err,_knownCommits);
			}
		}
}

function getCommits(repo, prNumber, callback) {
	auth.authenticate();

	github.pullRequests.getCommits({
		user: config.organization,
		repo: repo,
		number: prNumber,
		per_page: 100
	}, function(err, result) {
		_getCommits(err, result, callback);
	});
}

function getMostRecentCommit(repo, prNumber, callback) {
	this.getCommits(repo, prNumber, function(err, result) {
		var recentDate = new Date(1970,0,1,0,0,0);
		var recent = null;
		for(var i = 0; i < result.length; ++i) {
			var c = result[i];
			if(c.commit && c.commit.author && c.commit.author.date) {
				var tdate = Date.parse(c.commit.author.date);
				if(tdate > recentDate) {
					recent = c;
					recentDate = tdate;
				}
			}
		}
		callback(err, recent);
	});
}

module.exports = {
	get: get,
	getAll: getAll,
	getMostRecentCommit: getMostRecentCommit,
	getCommits: getCommits
};
