#!/bin/sh
# Build the current branch as the :dev image, to try it on staging before merging: ./scripts/dev-build.sh
#
# GitHub builds its own copy of the branch, so this stops unless everything is committed and pushed. The
# image is ghcr.io/<owner>/tidyquest:dev (and :sha-<short>); every merge to main replaces :dev again.
# Needs gh (GitHub's command line), signed in. See RELEASING.md, "Trying a branch on staging".
set -eu

cd "$(dirname "$0")/.."
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" != "HEAD" ] || { echo "Check out a branch first."; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Commit and push your changes first: GitHub builds what's pushed."; exit 1; }
git fetch -q origin "$BRANCH" 2>/dev/null || { echo "Push $BRANCH first: git push -u origin $BRANCH"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse FETCH_HEAD)" ] || { echo "$BRANCH isn't the same as origin/$BRANCH: push or pull first."; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "Needs gh: https://cli.github.com"; exit 1; }

REPO="$(git remote get-url origin | sed -E 's#\.git$##; s#^.*github\.com[:/]##')"
gh workflow run docker-publish.yml -R "$REPO" --ref "$BRANCH"
echo "Building $BRANCH ($(git rev-parse --short HEAD)) as :dev, about 5 minutes:"
echo "  https://github.com/$REPO/actions/workflows/docker-publish.yml"
echo "Then on staging: docker compose pull && docker compose up -d"
