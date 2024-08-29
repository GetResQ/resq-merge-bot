import * as core from "@actions/core"
import { graphqlClient } from "./graphqlClient"
import { processNextPrInQueue, mergePr, removeLabel } from "./mutations"
import { Repository } from "@octokit/webhooks-definitions/schema"
import { Label, Commit } from "./labels"

function isChecksPassing(latestCommit: Commit) {
  const checksToSkip: string = process.env.INPUT_CHECKS_TO_SKIP || ""
  const checksToSkipList = checksToSkip.split(",")

  return latestCommit.checkSuites.nodes
    .filter((node) => !(node.checkRuns.nodes[0]?.name in checksToSkipList))
    .every((node) => {
      const status = node.checkRuns.nodes[0]?.status
      return status === "COMPLETED" || status === null || status === undefined
    })
}

/**
 *
 * @param repo Repository object
 * @param commit_id Either the SHA or node_id of the commit
 * @param state Status state
 */
export async function processNonPendingStatus(
  repo: Repository,
  commit_id: string,
  state: "success" | "failure" | "error"
): Promise<void> {
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
  if (!(commit_id === latestCommit.id || commit_id === latestCommit.oid)) {
    core.info(
      `Commit that triggered this hook is not the latest commit of the merging PR: \
      eventCommitId:${commit_id}
      latestCommit.id:${latestCommit.id}
      latestCommit.oid:${latestCommit.oid}

      `
    )
    return
  }

  if (state === "success") {
    const isAllChecksPassed = isChecksPassing(latestCommit)

    if (!isAllChecksPassed) {
      core.info("Not all checks have completed.")
      return
    }
    core.info("##### ALL CHECK PASS")
    try {
      await mergePr(mergingPr)
    } catch (error) {
      core.info("PR merge failed, rechecking status.")
      core.info("Commit state when we decided to merge was:")
      core.info(JSON.stringify(latestCommit, null, 2))
      const RefetechedState = await fetchData(repo.owner.login, repo.name)
      const RefetchedMergingLabel = RefetechedState.repository.mergingLabel
      const RefetchedLatestCommit =
        RefetchedMergingLabel.pullRequests.nodes[0].commits.nodes[0].commit
      const isAllChecksPassed = isChecksPassing(RefetchedLatestCommit)
      if (!isAllChecksPassed) {
        core.info("Not all checks have completed.")
        core.info("Refetched commit state:")
        core.info(JSON.stringify(RefetchedLatestCommit, null, 2))
        return
      }
      core.info("Aborting Merge")
      core.error(error)
    }
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
              oid
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
