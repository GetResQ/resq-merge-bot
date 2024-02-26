import * as core from "@actions/core"
import * as fs from "fs"
import { processQueueForMergingCommand } from "./processQueueForMergingCommand"
import { processNonPendingStatus } from "./processNonPendingStatus"
import { isCommandQueueForMergingLabel } from "./labels"
import { exit } from "process"
import {
  CheckRunCompletedEvent,
  PullRequestEvent,
  WebhookEvent,
} from "@octokit/webhooks-definitions/schema"

if (!process.env.GITHUB_EVENT_PATH) {
  core.setFailed("GITHUB_EVENT_PATH is not available")
  exit(1)
}

const eventName = process.env.GITHUB_EVENT_NAME
const eventPayload: WebhookEvent = JSON.parse(
  fs.readFileSync(process.env.GITHUB_EVENT_PATH).toString()
)

async function run(): Promise<void> {
  try {
    if (eventName === "pull_request_target") {
      await processPullRequestEvent(eventPayload as PullRequestEvent)
    } else if (eventName === "check_run") {
      await processCheckRunEvent(eventPayload as CheckRunCompletedEvent)
    } else {
      core.info(`Event does not need to be processed: ${eventName}`)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()

async function processPullRequestEvent(
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

async function processCheckRunEvent(
  checkRunEvent: CheckRunCompletedEvent
): Promise<void> {
  if (checkRunEvent.action !== "completed") {
    core.info("Check Run has not completed.")
    return
  }
  await processNonPendingStatus(
    checkRunEvent.repository,
    checkRunEvent.check_run.head_sha,
    checkRunEvent.check_run.conclusion || ""
  )
  core.info("Finish process status event")
}
