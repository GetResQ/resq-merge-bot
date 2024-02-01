import * as core from "@actions/core"
import { graphqlClient } from "./graphqlClient"
import {
  stopMergingCurrentPrAndProcessNextPrInQueue,
  mergePr,
  removeLabel,
} from "./mutations"
import { isBotMergingLabel, isBotQueuedLabel } from "./labels"
import { Repository } from "@octokit/webhooks-definitions/schema"

/**
 *
 * @param repo Repository object
 * @param commit Commit object
 * @param context Check name
 * @param state Status state
 */
export async function processNonPendingStatus(
  repo: Repository,
  commit: { node_id: string },
  state: "success" | "failure" | "error"
): Promise<void> {
  const {
    repository: {
      labels: { nodes: labelNodes },
    },
  } = await fetchData(repo.owner.login, repo.name)

  const mergingLabel = labelNodes.find(isBotMergingLabel)

  if (!mergingLabel || mergingLabel.pullRequests.nodes.length === 0) {
    // No merging PR to process
    return
  }

  const mergingPr = mergingLabel.pullRequests.nodes[0]
  const latestCommit = mergingPr.commits.nodes[0].commit
  if (commit.node_id !== latestCommit.id) {
    // Commit that trigger this hook is not the latest commit of the merging PR
    return
  }
  const requiredChecks = mergingPr.checks.nodes

  if (state === "success") {
    const isAllRequiredCheckPassed = requiredChecks.every((node) => {
      const status = node.status
      return status === "NEUTRAL" || status === "SUCCESS"
    })
    if (!isAllRequiredCheckPassed) {
      // Some required check is still pending
      return
    }

    core.info("##### ALL CHECK PASS")
    try {
      await mergePr(mergingPr, repo.node_id)
      // TODO: Delete head branch of that PR (maybe)(might not if merge unsuccessful)
    } catch (error) {
      core.info("Unable to merge the PR.")
      core.error(error)
    }
  }

  const queuedLabel = labelNodes.find(isBotQueuedLabel)
  if (!queuedLabel) {
    await removeLabel(mergingLabel, mergingPr.id)
    return
  }
  await stopMergingCurrentPrAndProcessNextPrInQueue(
    mergingLabel,
    queuedLabel,
    mergingPr.id,
    repo.node_id
  )
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
    labels: {
      nodes: {
        id: string
        name: string
        pullRequests: {
          nodes: {
            id: string
            checks: {
              nodes: {
                name: string
                status:
                  | "SUCCESS"
                  | "FAILURE"
                  | "NEUTRAL"
                  | "CANCELLED"
                  | "TIMED_OUT"
                  | "ACTION_REQUIRED"
              }[]
            }
            number: number
            title: string
            baseRef: { name: string }
            headRef: { name: string }
            commits: {
              nodes: {
                id: string
                commit: {
                  id: string
                  status: {
                    contexts: {
                      context: string
                      state: "SUCCESS" | "PENDING" | "FAILURE"
                    }[]
                  }
                }
              }[]
            }
          }[]
        }
      }[]
    }
  }
}> {
  return graphqlClient(
    `query allLabels($owner: String!, $repo: String!) {
         repository(owner:$owner, name:$repo) {
           labels(last: 50) {
             nodes {
               id
               name
               pullRequests(first: 20) {
                 nodes {
                   id
                   checks(first: 10) {
                    nodes {
                      name
                      status
                    }
                   }
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
                         status {
                           contexts {
                             context
                             state
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
       }`,
    { owner, repo }
  )
}
