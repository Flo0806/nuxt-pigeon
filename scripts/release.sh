#!/bin/bash
set -e

# Release one part of this repository: bump its version, commit, tag, push. The pushed
# tag is what starts the GitHub workflow, nothing here builds or publishes anything.
#
# Usage:   ./scripts/release.sh <project> <version>
#   project = docs            the documentation site, built into a container image
#   version = semver, e.g. 1.0.0 or 1.0.0-rc.1
#
# `module` (the npm package) will slot in here later. It is deliberately not offered
# yet rather than half wired, so nobody tags something no workflow listens to.

usage() {
  echo "Usage: ./scripts/release.sh <project> <version>"
  echo "  project: docs"
  echo "  example: ./scripts/release.sh docs 1.0.0"
  exit 1
}

PROJECT="$1"
VERSION="$2"
[ -z "$PROJECT" ] || [ -z "$VERSION" ] && usage

case "$PROJECT" in
  docs)
    DIR="docs"
    TAG_PREFIX="docs-v"
    WHAT="the documentation site"
    AFTER="GitHub builds the image and pushes it to ghcr.io/\$REPO-docs."
    ;;
  module)
    echo "Error: releasing the npm package is not wired up yet."
    echo "Only 'docs' exists today, and tagging for something with no workflow"
    echo "behind it would look like it worked and do nothing."
    exit 1
    ;;
  *) echo "Error: unknown project '$PROJECT' (use: docs)"; exit 1 ;;
esac

# semver: 1.2.3 or 1.2.3-rc.1
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-.+)?$ ]]; then
  echo "Error: version must be semver (e.g. 1.0.0 or 1.0.0-rc.1)"
  exit 1
fi

PKG_JSON="$DIR/package.json"
TAG="${TAG_PREFIX}${VERSION}"

# Release ONLY from an up to date `main`. Releasing from a feature branch strands the
# bump commit, releasing from a stale main bumps the wrong base.
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "Error: releases must run on 'main', but you are on '$BRANCH'."
  echo "Run:  git checkout main && git pull"
  exit 1
fi

# The fetch ONLY refreshes the remote ref for this check. It does not touch your
# working tree, and the script never pulls for you.
git fetch --quiet origin main || { echo "Error: could not reach origin/main."; exit 1; }
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "Error: local 'main' is not in sync with origin/main. Pull or push first."
  echo "  local:  $LOCAL"
  echo "  origin: $REMOTE"
  exit 1
fi

# We are about to commit and tag exactly the version bump, nothing else.
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree not clean. Commit or stash first."
  exit 1
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: tag '$TAG' already exists. Pick a new version."
  exit 1
fi

echo ""
echo "  Release  $WHAT"
echo "  Version  $VERSION"
echo "  Tag      $TAG"
echo ""
read -r -p "Push the tag and let CI build it? [y/N] " ok
[ "$ok" = "y" ] || [ "$ok" = "Y" ] || { echo "Aborted."; exit 1; }

node -e "
const fs = require('fs');
const path = '$PKG_JSON';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"

git add "$PKG_JSON"
git commit -m "release: docs v$VERSION"
git tag "$TAG"
git push origin HEAD
git push origin "$TAG"

echo ""
echo "Done. Watch it here:"
echo "  https://github.com/Flo0806/nuxt-pigeon/actions"
echo ""
echo "Then on server02:"
echo "  docker compose pull docs && docker compose up -d docs"
