import * as core from "@actions/core"
import { graphqlClient } from "./graphqlClient"
import { Repository } from "@octokit/webhooks-definitions/schema"
/**
 *
 * @param repo Repository object
 * @param commit Commit object
 * @param state Status state
 */
export async function canQueueForMerge(
  repo: Repository,
  prNumber: number
): Promise<boolean> {
  const checksToRequire: string = process.env.INPUT_REQUIRE_TO_QUEUE || ""
  const checksToRequireList = checksToRequire.split(",")
  if (checksToRequireList.length === 0) {
    core.info("No checks required to queue for merge")
    return true
  }
  const data = await fetchData(repo.owner.login, repo.name, prNumber)
  core.info(`${repo.owner.login}, ${repo.name}, ${prNumber}`)
  core.info(JSON.stringify(data, null, 2))
  const {
    repository: { pullRequest },
  } = data
  const latestCommit = pullRequest.commits.nodes[0].commit

  return latestCommit.checkSuites.nodes
    .filter((node) => !(node.checkRuns.nodes[0]?.name in checksToRequireList))
    .every((node) => {
      const status = node.checkRuns.nodes[0]?.status
      return status === "COMPLETED" || status === null || status === undefined
    })
}
interface PullRequest {
  id: string
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
}
/**
 * Fetch all the data for processing success status check webhook
 * @param owner Organzation name
 * @param repo Repository name
 */
async function fetchData(
  owner: string,
  repo: string,
  prNumber: number
): Promise<{
  repository: {
    id: string
    pullRequest: PullRequest
  }
}> {
  return graphqlClient(
    `
    query GetPullRequestChecks($owner:String!, $repo: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          id
          pullRequest(number: $prNumber) {
            id
            commits(last: 1) {
              nodes {
                commit {
                  id
                  checkSuites(first: 10) {
                    nodes {
                      checkRuns(last: 1) {
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
      }  `,
    { owner, repo, prNumber }
  )
}
