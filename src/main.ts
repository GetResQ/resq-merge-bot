import * as core from "@actions/core"
import * as fs from "fs"
import { exit } from "process"
import { WebhookEvent } from "@octokit/webhooks-definitions/schema"
import { handleWebhookEvent } from "./handleWebhookEvent"

if (!process.env.GITHUB_EVENT_PATH) {
  core.setFailed("GITHUB_EVENT_PATH is not available")
  exit(1)
}

const eventName = process.env.GITHUB_EVENT_NAME
const eventPayload: WebhookEvent = JSON.parse(
  fs.readFileSync(process.env.GITHUB_EVENT_PATH).toString()
)
handleWebhookEvent(eventName, eventPayload)
