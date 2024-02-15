import * as core from "@actions/core"
import { graphqlClient } from "./graphqlClient"
import {
  stopMergingCurrentPrAndProcessNextPrInQueue,
  mergePr,
  removeLabel,
} from "./mutations"
import { Repository } from "@octokit/webhooks-definitions/schema"

/**
 *
 * @param repo Repository object
 * @param commit Commit object
 * @param state Status state
 */
export async function processNonPendingStatus(
  repo: Repository,
  commit: { node_id: string },
  state: "success" | "failure" | "error"
): Promise<void> {
  const {
    repository: { queuedLabel, mergingLabel },
  } = await fetchData(repo.owner.login, repo.name)

  if (mergingLabel.pullRequests.nodes.length === 0) {
    core.info("No merging PR to process")
    return
  }

  const mergingPr = mergingLabel.pullRequests.nodes[0]
  const latestCommit = mergingPr.commits.nodes[0].commit
  if (commit.node_id !== latestCommit.id) {
    // Commit that trigger this hook is not the latest commit of the merging PR
    core.info(commit.node_id)
    core.info(latestCommit.id)
    return
  }
  const checksToSkip: string = process.env.INPUT_CHECKS || ""
  const checksToSkipList = checksToSkip.split(",")

  if (state === "success") {
    const isAllRequiredCheckPassed = latestCommit.checkSuites.nodes.every(
      (node) => {
        let status = node.checkRuns.nodes[0]?.status
        if (node.checkRuns.nodes[0]?.name in checksToSkipList) {
          status = "COMPLETED"
        }
        return status === "COMPLETED" || status === null || status === undefined
      }
    )
    if (!isAllRequiredCheckPassed) {
      core.info("Not all Required Checks have finished.")
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
  }

  if (queuedLabel.pullRequests.nodes.length === 0) {
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

export interface Label {
  id: string
  name: string
  pullRequests: {
    nodes: {
      id: string
      number: number
      title: string
      baseRef: { name: string }
      headRef: { name: string }
      commits: {
        nodes: {
          commit: {
            id: string
            checkSuites: {
              nodes: {
                checkRuns: {
                  nodes: {
                    status: string
                    name: string
                  }[]
                }
              }[]
            }
          }
        }[]
      }
    }[]
  }
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
