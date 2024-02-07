import * as core from "@actions/core"
import { graphqlClient } from "./graphqlClient"
import { Label } from "./labels"
/**
 *
 * @param base Base branch name
 * @param head Head branch name
 * @param repoId Repository ID
 * @param [commitMessage] Commit message
 */
export async function mergeBranch(pr: {
  id: string
  title: string
  baseRef: { name: string }
  headRef: { name: string }
}): Promise<void> {
  await graphqlClient(
    `mutation UpdatePullRequest($pullRequestId: ID!, $baseRefName: String!) {
      updatePullRequest(input: {pullRequestId: $pullRequestId, baseRefName: $baseRefName}) {
        __typename
      }
    }`,
    {
      pullRequestId: pr.id,
      baseRefName: pr.baseRef.name,
    }
  )
}

/**
 *
 * @param label Label object
 * @param labelableId ID of the thing that we want to remove the label from
 */
export async function removeLabel(
  label: Label,
  labelableId: string
): Promise<void> {
  await graphqlClient(
    `mutation removeBotCommandLabel($input: RemoveLabelsFromLabelableInput!) {
      removeLabelsFromLabelable(input: $input) {
        __typename
      }
    }`,
    {
      input: { labelIds: [label.id], labelableId },
    }
  )
  core.info(`Label ${label.name} removed`)
}

/**
 *
 * @param label Label object
 * @param labelableId ID of the thing that we want to add the label into
 */
export async function addLabel(
  label: Label,
  labelableId: string
): Promise<void> {
  await graphqlClient(
    `mutation addBotStatusLabel($input: AddLabelsToLabelableInput!) {
      addLabelsToLabelable(input: $input) {
        __typename
      }
    }`,
    {
      input: { labelIds: [label.id], labelableId },
    }
  )
  core.info(`Label ${label.name} added`)
}

/**
 * Remove `bot:merging` label from the PR, and start processing other PRs that has `bot:queued`
 * @param mergingLabel `bot:merging` label
 * @param queuedLabel `bot:queued` label with PR data
 * @param mergingPrId ID of PR that has `bot:merging` label
 * @param repoId ID of repository
 */
export async function stopMergingCurrentPrAndProcessNextPrInQueue(
  mergingLabel: Label,
  queuedLabel: Label & {
    pullRequests: {
      nodes: {
        id: string
        headRef: { name: string }
        baseRef: { name: string }
      }[]
    }
  },
  mergingPrId: string
): Promise<void> {
  await removeLabel(mergingLabel, mergingPrId)

  const queuedPrs = queuedLabel.pullRequests.nodes
  for (const queuedPr of queuedPrs) {
    await removeLabel(queuedLabel, queuedPr.id)
    await addLabel(mergingLabel, queuedPr.id)
    try {
      await mergeBranch(queuedPr)
      core.info("PR successfully made up-to-date")
      break
    } catch (error) {
      core.info(
        "Unable to update the queued PR. Will process the next item in the queue."
      )
      await removeLabel(mergingLabel, queuedPr.id)
    }
  }
}

/**
 *
 * @param pr Pull request object
 * @param repoId
 */
export async function mergePr(pr: {
  id: string
  title: string
  baseRef: { name: string }
  headRef: { name: string }
}): Promise<void> {
  await graphqlClient(
    `mutation MergePullRequest($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
      mergePullRequest(input: {pullRequestId: $pullRequestId, mergeMethod: $mergeMethod}) {
        __typename
      }
    }`,
    {
      pullRequestId: pr.id,
      mergeMethod: "SQUASH",
    }
  )
}
