import * as core from "@actions/core"
import { graphqlClient } from "./graphqlClient"
import {
  mergeBranch,
  removeLabel,
  addLabel,
  processNextPrInQueue,
  mergePr,
} from "./mutations"
import { PullRequest, Repository } from "@octokit/webhooks-definitions/schema"
import { isBotMergingLabel, isBotQueuedLabel, Label } from "./labels"

/**
 *
 * @param pr PR data from the webhook
 * @param repo Reposotiry data from the webhook
 */
export async function processQueueForMergingCommand(
  pr: PullRequest,
  repo: Repository
): Promise<void> {
  const {
    repository: { queuedLabel, mergingLabel, commandLabel },
  } = await fetchData(repo.owner.login, repo.name)

  // Remove `command:queue-for-merging` label
  await removeLabel(commandLabel, pr.node_id)

  // Create bot labels if not existed
  if (!mergingLabel) {
    // TODO: Create bot:merging label on the fly
    return
  }
  if (!queuedLabel) {
    // TODO: Create bot:queued label on the fly
    return
  }

  // Ignore PR that's already processed
  if (pr.labels.find(isBotMergingLabel)) {
    core.info("PR already in the merging process.")
    return
  } else if (pr.labels.find(isBotQueuedLabel)) {
    core.info("PR already in the queue.")
    return
  }

  // Add either `bot:merging` or `bot:queued`
  // `bot:merging` is not in any PR yet. -> Add `bot:merging`
  // `bot:merging` is already in some other PR. -> Add `bot:queued`
  const labelToAdd =
    mergingLabel.pullRequests.nodes.length === 0 ? mergingLabel : queuedLabel

  await addLabel(labelToAdd, pr.node_id)

  // Finish the process if not added `bot:merging`
  if (!isBotMergingLabel(labelToAdd)) {
    return
  }

  // Try to make the PR up-to-date
  try {
    await mergeBranch(pr.head.ref, pr.base.ref, repo.node_id)
    core.info("Make PR up-to-date")
  } catch (error) {
    if (error.message === 'Failed to merge: "Already merged"') {
      core.info("PR already up-to-date.")
      try {
        await mergePr({
          id: pr.node_id,
          baseRef: { name: pr.base.ref },
          headRef: { name: pr.head.ref },
        })
      } catch (mergePrError) {
        core.info("Unable to merge the PR")
        core.error(mergePrError)
      }
    }
    await removeLabel(mergingLabel, pr.node_id)
    processNextPrInQueue(mergingLabel, queuedLabel, repo.node_id)
  }
}

/**
 * Fetch all the data for processing bot command webhook
 * @param owner Organization name
 * @param repo Repository name
 */
async function fetchData(
  owner: string,
  repo: string
): Promise<{
  repository: {
    queuedLabel: Omit<Label, "commits">
    mergingLabel: Omit<Label, "commits">
    commandLabel: Omit<Label, "commits">
  }
}> {
  return graphqlClient(
    `fragment labelFragment on Label{
      id
      name
      pullRequests(first: 20) {
        nodes {
          id
          number
          title
          baseRef {
            name
          }
          headRef {
            name
          }
        }
      }
    }
    query allLabels($owner: String!, $repo: String!) {
          repository(owner:$owner, name:$repo) {
            queuedLabel: label(name: "bot:queued") {
              ...labelFragment
            }
            mergingLabel: label(name: "bot:merging") {
              ...labelFragment
            }
            commandLabel: label(name: "command:queue-for-merging") {
              ...labelFragment
            }
          }
        }`,
    { owner, repo }
  )
}
