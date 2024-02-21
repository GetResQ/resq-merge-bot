import * as core from "@actions/core"
import { graphqlClient } from "./graphqlClient"
import { processNextPrInQueue, mergePr, removeLabel } from "./mutations"
import { Repository } from "@octokit/webhooks-definitions/schema"
import { Label } from "./labels"
/**
 *
 * @param repo Repository object
 * @param commit Commit object
 * @param state Status state
 */
export async function processNonPendingStatus(repo: Repository): Promise<void> {
  const {
    repository: { queuedLabel, mergingLabel },
  } = await fetchData(repo.owner.login, repo.name)

  if (mergingLabel.pullRequests.nodes.length === 0) {
    core.info("No merging PR to process")
    await processNextPrInQueue(mergingLabel, queuedLabel, repo.node_id)
    return
  }

  const mergingPr = mergingLabel.pullRequests.nodes[0]
  const latestCommit = mergingPr.commits.nodes[0].commit
  const checksToSkip: string = process.env.INPUT_CHECKS_TO_SKIP || ""
  const checksToSkipList = checksToSkip.split(",")

  const isAllChecksPassed = latestCommit.checkSuites.nodes
    .filter((node) => !(node.checkRuns.nodes[0]?.name in checksToSkipList))
    .every((node) => {
      const status = node.checkRuns.nodes[0]?.status
      return status === "COMPLETED" || status === null || status === undefined
    })

  if (!isAllChecksPassed) {
    core.info("Not all checks have completed.")
    return
  }
  core.info("##### ALL CHECK PASS")
  try {
    await mergePr(mergingPr)
    // TODO: Delete head branch of that PR (maybe)(might not if merge unsuccessful)
  } catch (error) {
    core.info("Unable to merge the PR.")
    core.error(error)
  }

  if (queuedLabel.pullRequests.nodes.length === 0) {
    await removeLabel(mergingLabel, mergingPr.id)
    return
  }
  await removeLabel(mergingLabel, mergingPr.id)
  await processNextPrInQueue(mergingLabel, queuedLabel, repo.node_id)
}

/**
 * Fetch all the data for processing success status check webhook
 * @param owner Organzation name
 * @param repo Repository name
 */
async function fetchData(
  owner: string,
  repo: string
): Promise<{
  repository: {
    queuedLabel: Label
    mergingLabel: Label
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
          commits(last: 1) {
            nodes {
             commit {
              id
               checkSuites(first: 10) {
                 nodes {
                   checkRuns(last:1) {
                     nodes {
                       status
                       name
                     }
                   }
                 }
               }
             }
            }
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
          }
        }`,
    { owner, repo }
  )
}
