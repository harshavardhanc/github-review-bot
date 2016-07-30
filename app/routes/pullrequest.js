var express = require('express'),
    bot = require('../bot'),
    config = require('../../config'),
    debug = require('debug')('reviewbot:pullrequest'),
    router = express.Router();


    /**
     * POST /pullrequest: Process incoming GitHub payload
     */
    router.post('/', function (req, res) {
      var eventName = req.get("X-GitHub-Event");
      // ensure we only handle events we know how to handle
      if(eventName !== 'pull_request' && eventName !== 'pull_request_review_comment' && eventName !== 'issue_comment' ) {
        console.log('POST Request received, but this is not the event I am looking for.');
        return debug('POST Request received, but this is not the event I am looking for.');
      }

      if (!req.body) {
        console.log('POST Request received, but no body!');
        return debug('POST Request received, but no body!');
      }

      if (!req.body.repository) {
        console.log('POST Request received, but no repo found.');
        return debug('POST Request received, but no repo found.');
      }
      var repo = req.body.repository.name;

      console.log("repo: " + repo);
      // Check if it's a simple PR action
      if (req.body.pull_request && req.body.pull_request.number) {
          bot.checkForLabel(req.body.pull_request.number, repo, req.body.pull_request, processPullRequest);
          console.log("respond: pr");
          return _respond(res, 'Processing PR ' + req.body.pull_request.number);
      }
      // Check if it's an issue action (comment, for instance)
      if (req.body.issue && req.body.issue.pull_request) {
          bot.getPullRequest(req.body.issue.number, repo, function (pullRequests) {
              if (!pullRequests || pullRequests.length < 0) {
                console.log('Error: Tried to process single pull request, but failed');
                return debug('Error: Tried to process single pull request, but failed');
              }

              bot.checkForLabel(pullRequests[0].number, repo, pullRequests[0], processPullRequest);
          });
          console.log("respond: issue");
          return _respond(res, 'Processing PR as Issue' + req.body.issue.number);
      }
    });


/**
 * Respond using a given Express res object
 * @param {Object} res - Express res object
 * @param {string|string[]} message - Either a message or an array filled with messages
 */
function _respond(res, message) {
    if (res && message) {
        if (message.isArray) {
            return res.json({messages: JSON.stringify(message)});
        } else {
            res.json({message: message});
        }
    }
}

/**
 * Process Pull Request
 * @param {string[]} labelResult - Result as generated by bot.checkForLabels;
 * @param {Object} pr - PR currently handled
 */
function processPullRequest(labelResult, pr) {
    // Check if PR is already labeled as 'reviewed', in which case we stop here
    if (labelResult.labeledReviewed) {
        return debug('PR ' + pr.number + ' already marked as "reviewed", stopping');
    }

    // Check if we're supposed to skip this one
    if (labelResult.labeledExclude) {
        return debug('PR ' + pr.number + ' labeled to be exlcuded from the bot, stopping');
    }
    console.log("processPullRequest");
    // Check for filenameFilter
     bot.checkForFiles(pr.number, pr.head.repo.name, function (isFilenameMatched) {
        if (!isFilenameMatched) {
            console.log('PR ' + pr.number + ' does not match filenameFilter, stopping')
            return debug('PR ' + pr.number + ' does not match filenameFilter, stopping');
        }
        console.log("checkForApprovalComments:::")
        // Let's get all our comments and check them for approval
        bot.checkForApprovalComments(pr.number, pr.head.repo.name, pr, function (approved) {
            var labels, output = [];

            // Check for instructions comment and post if not present
            bot.checkForInstructionsComment(pr.number, pr.head.repo.name, function (posted) {
              if (!posted) {
                console.log('No intructions comment found on PR ' + pr.number + '; posting instructions comment');
                debug('No intructions comment found on PR ' + pr.number + '; posting instructions comment');
                bot.postInstructionsComment(pr.number, pr.head.repo.name);
              }
            });

            // Stop if we already marked it as 'needs-review' and it does need more reviews
            if (labelResult.labeledNeedsReview && !approved) {
              console.log('PR ' + pr.number + ' already marked as "needs-review", stopping');
              return debug('PR ' + pr.number + ' already marked as "needs-review", stopping');
            }

            labels = labelResult.labels.map(function (label) {
                return label.name;
            });

            // Update the labels
            output.push('Updating labels for PR ' + pr.number);
            bot.updateLabels(pr.number, pr.head.repo.name, approved, labels);

            // If we're supposed to merge, merge
            if (approved && config.mergeOnReview) {
                output.push('Merging on review set to true, PR approved, merging');
                //bot.merge(pr.number);
            }
        });
    });
}


/**
 * GET /pullrequest: Process all pull requests
 */
// router.get('/:repo', function (req, res) {
//     bot.getPullRequests(function (req.params.repo, pullRequests) {
//         var pr, i;
//
//         // For each PR, check for labels
//         for (i = 0; i < pullRequests.length; i = i + 1) {
//             pr = pullRequests[i];
//             bot.checkForLabel(pr.number, req.params.repo, pr, processPullRequest);
//         }
//
//         return _respond(res, 'Processing ' + pullRequests.length + ' PRs.');
//     });
// });

/**
 * GET /pullrequest/:id: Process Single Pull Request
 */
router.get('/:repo/:id', function (req, res) {
    debug('Received request to process PR #' + req.params.id);

    bot.getPullRequest(req.params.id, req.params.repo, function (pullRequests) {
        if (pullRequests && pullRequests.length > 0) {
            bot.checkForLabel(req.params.id, req.params.repo, pullRequests[0], processPullRequest);
        } else {
            return debug('PR ' + req.params.id + ' not found');
        }
    });

    return _respond(res, 'Processing PR #' + req.params.id);
});

module.exports = router;
