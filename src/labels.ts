const BotLabel = {
  CommandQueueForMerging: "command:queue-for-merging",
  BotMerging: "bot:merging",
  BotQueued: "bot:queued",
} as const

export function isCommandQueueForMergingLabel(
  label: Pick<Label, "name">
): boolean {
  return label.name === BotLabel.CommandQueueForMerging
}

export function isBotMergingLabel(label: Pick<Label, "name">): boolean {
  return label.name === BotLabel.BotMerging
}

export function isBotQueuedLabel(label: Pick<Label, "name">): boolean {
  return label.name === BotLabel.BotQueued
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
