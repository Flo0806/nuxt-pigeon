#!/bin/bash
set -e

# Release one part of this repository: bump its version, commit, tag, push. The pushed
# tag is what starts the GitHub workflow, nothing here builds or publishes anything.
#
# Usage:   ./scripts/release.sh <project> <version>
#   project = module          the npm package, published to npm
#             docs            the documentation site, built into a container image
#   version = semver, e.g. 1.0.0 or 1.0.0-rc.1
#
# A prerelease version (1.0.0-rc.1) publishes to its own npm channel and never to
# `latest`, so `npm i nuxt-pigeon` keeps handing out the last stable one.

usage() {
  echo "Usage: ./scripts/release.sh <project> <version>"
  echo "  project: module | docs"
  echo "  example: ./scripts/release.sh module 1.0.0"
  echo "           ./scripts/release.sh docs 1.0.0"
  exit 1
}

PROJECT="$1"
VERSION="$2"
[ -z "$PROJECT" ] || [ -z "$VERSION" ] && usage

case "$PROJECT" in
  # The module is the workspace root, so its manifest is the root package.json.
  module)
    PKG_JSON="package.json"
    TAG_PREFIX="v"
    WHAT="the npm package"
    AFTER="npm, and it cannot be taken back after 72 hours"
    ;;
  docs)
    PKG_JSON="docs/package.json"
    TAG_PREFIX="docs-v"
    WHAT="the documentation site"
    AFTER="a container image on ghcr.io"
    ;;
  *) echo "Error: unknown project '$PROJECT' (use: module or docs)"; exit 1 ;;
esac

# semver: 1.2.3 or 1.2.3-rc.1
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-.+)?$ ]]; then
  echo "Error: version must be semver (e.g. 1.0.0 or 1.0.0-rc.1)"
  exit 1
fi

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

# Both sides, because a leftover tag on the remote is what actually blocks a re-run,
# and it survives deleting the local one.
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: tag '$TAG' already exists locally."
  echo "  git tag -d $TAG"
  exit 1
fi
if [ -n "$(git ls-remote --tags origin "refs/tags/$TAG" 2>/dev/null)" ]; then
  echo "Error: tag '$TAG' already exists on origin."
  echo "  git push origin :refs/tags/$TAG"
  exit 1
fi

echo ""
echo "  Release  $WHAT"
echo "  Version  $VERSION"
echo "  Tag      $TAG"
echo "  Goes to  $AFTER"
echo ""

# npm is the one that cannot be undone, so it asks differently.
if [ "$PROJECT" = "module" ]; then
  echo "  This publishes to npm. A version number can never be reused, and"
  echo "  unpublishing is only possible within 72 hours."
  echo ""
  read -r -p "Type the version to confirm: " typed
  [ "$typed" = "$VERSION" ] || { echo "Aborted."; exit 1; }
else
  read -r -p "Push the tag and let CI build it? [y/N] " ok
  [ "$ok" = "y" ] || [ "$ok" = "Y" ] || { echo "Aborted."; exit 1; }
fi

# Already at this version? Then there is nothing to bump, and committing would fail
# with "nothing to commit" and take the tagging down with it. That happens whenever a
# release is repeated, for instance after deleting a tag.
CURRENT=$(node -p "require('./$PKG_JSON').version")

if [ "$CURRENT" = "$VERSION" ]; then
  echo "$PKG_JSON already says $VERSION, so only the tag is missing. Tagging $(git rev-parse --short HEAD)."
else
  node -e "
const fs = require('fs');
const path = '$PKG_JSON';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"

  git add "$PKG_JSON"
  git commit -m "release: $PROJECT v$VERSION"
fi

git tag "$TAG"
git push origin HEAD
git push origin "$TAG"

echo ""
echo "Done. Watch it here:"
echo "  https://github.com/Flo0806/nuxt-pigeon/actions"
echo ""
if [ "$PROJECT" = "docs" ]; then
  echo "Then on server02:"
  echo "  docker compose pull pigeon-docs && docker compose up -d pigeon-docs"
fi
