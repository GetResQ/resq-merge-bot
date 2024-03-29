import * as core from "@actions/core"
import { processQueueForMergingCommand } from "./processQueueForMergingCommand"
import { processNonPendingStatus } from "./processNonPendingStatus"
import { isCommandQueueForMergingLabel } from "./labels"
import {
  CheckSuiteEvent,
  PullRequestEvent,
  StatusEvent,
  WebhookEvent,
} from "@octokit/webhooks-definitions/schema"

export async function handleWebhookEvent(
  eventName: string | undefined,
  eventPayload: WebhookEvent
): Promise<void> {
  try {
    if (eventName === "pull_request_target") {
      await processPullRequestEvent(eventPayload as PullRequestEvent)
    } else if (eventName === "status") {
      await processStatusEvent(eventPayload as StatusEvent)
    } else if (eventName === "check_suite") {
      await processCheckSuiteEvent(eventPayload as CheckSuiteEvent)
    } else {
      core.info(`Event does not need to be processed: ${eventName}`)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}
export async function processPullRequestEvent(
  pullRequestEvent: PullRequestEvent
): Promise<void> {
  if (
    pullRequestEvent.action !== "labeled" ||
    !isCommandQueueForMergingLabel(pullRequestEvent.label)
  ) {
    return
  }
  await processQueueForMergingCommand(
    pullRequestEvent.pull_request,
    pullRequestEvent.repository
  )
  core.info("Finish process queue-for-merging command")
}

export async function processStatusEvent(
  statusEvent: StatusEvent
): Promise<void> {
  if (statusEvent.state === "pending") {
    core.info("status state is pending.")
    return
  }
  await processNonPendingStatus(
    statusEvent.repository,
    statusEvent.commit.node_id,
    statusEvent.state
  )
  core.info("Finish process status event")
}

export async function processCheckSuiteEvent(
  checkSuiteEvent: CheckSuiteEvent
): Promise<void> {
  const conclusion = checkSuiteEvent.check_suite.conclusion
  if (conclusion === null) {
    core.info(`check suite pending.`)
    return
  }
  const status = conclusion === "success" ? "success" : "failure"
  const commit_node_id = checkSuiteEvent.check_suite.head_sha
  await processNonPendingStatus(
    checkSuiteEvent.repository,
    commit_node_id,
    status
  )
  core.info("Finish process check suite event")
}
