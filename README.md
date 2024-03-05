<p align="center">
  <a href="https://github.com/autifyhq/merge-queue-action/actions"><img alt="merge-queue-action status" src="https://github.com/autifyhq/merge-queue-action/workflows/build-test/badge.svg"></a>
</p>

# Resq-Merge-Bot

\_This action is created based on [TypeScript Action Template](https://github.com/actions/typescript-action) and [autifyhq/merge-queue-action](https://github.com/autifyhq/merge-queue-action).

The main differences between this and the original project are:

- Does not require a Personal Access Token (Uses `GITHUB_TOKEN`).
- Does not wait for required checks to pass on the target branch.
- Attempts to merge when a PR is up to date and checks have completed, relying on branch protection rules to prevent bad merges.

## Setup

1. Create the following labels to your repository:
   - `command:queue-for-merging`
   - `bot:merging`
   - `bot:queued`
2. Create `.github/workflows/merge-queue.yml` in your repository with the following content:

   ```yml
    name: merge-queue
    on:
    // either status or check_suite is required
    status:
    check_suite:
    types: [completed]

        pull_request_target:
          types:
            - labeled
        jobs:
          merge-queue:
            runs-on: ubuntu-latest
            steps:
              - uses: GetResQ/resq-merge-bot@main
                with:
                  checks_to_skip: merge-queue
                  require_to_queue: this-is-optional
                env:
                  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

The github token needs to have `read and write` permissions.

Use the `checks_to_skip` input variable to pass in what checks you want to skip, the bot will NOT wait for these checks to finish, and will continue merging.

Separate check names with commas.
Example: `checks_to_skip: build,deploy`

3. Ensure your external ci runner reports statuses
   For instance on circleci, this feature must be enabled in you projects advanced tab
   ![Screenshot 2024-02-26 at 4 27 23 PM](https://github.com/GetResQ/resq-merge-bot/assets/22199431/dff4d535-ebbd-429a-a6e8-c61025966ce4)

## Usage

You can merge a PR by adding `command:queue-for-merging` label to your PR. The action will take care of the rest.

- If there’s no merging PR, the PR will be a merging PR (`bot:merging`)
- If there a merging PR already, the PR will be in the queue (`bot:queued`)

The action will do the following to the merging PR:

- Make PR up-to-date if it isn't. If it's unable to make the PR up-to-date, PR will be removed from merging status and next PR will be processed.
- Attempt to merge PR if all checks (not including the checks listed in `checks_to_skip`) have completed.
- The merge may fail due to branch protection rules, failing required checked, or merge conflicts with the base branch.
- Once the merge has either succeeded or failed, it will remove labels and merging status from the PR and start processing the next PR in the queue.

### Limitation

- The bot does not wait for pending required checks on the target branch.
- If 20 of the most recent PR's have merge conflicts, the bot will dequeue all the PR's with merge conflicts (remove all labels, since they cannot be merged), and will NOT process any additional PR's. The command label will need to be added again to process the remaining PR's.
- The bot waits for all checks that are NOT listed in `checks_to_skip` to be completed before merging, even checks that are not required under branch protection.

PRs welcome :)

## Releasing

1. Bump the version in `package.json`
2. Run `npm install && npm run all`
3. Update the version in code example in `README.md`
4. Commit and push to the `main` branch
5. Create a release in GitHub with the new version; e.g. `0.4.0` in `package.json`, the release should have a tag `v0.4.0`.

Please follow [SemVer](https://semver.org/) when picking a version number for a new version

```

```
