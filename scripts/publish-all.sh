#!/bin/bash
# Publish all Pyra packages to npm in the correct order.


# ./scripts/publish-all.sh           # full publish
# ./scripts/publish-all.sh --dry-run # simulate without publishing

set -e

# Flags
DRY_RUN=false
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# Helpers
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

publish() {
  local dir="$1"
  local name="$2"
  echo "📦  Publishing $name..."
  if [ "$DRY_RUN" = true ]; then
    echo "    [dry-run] pnpm publish --access public --no-git-checks"
  else
    (cd "$ROOT/$dir" && pnpm publish --access public --no-git-checks)
  fi
  echo "    ✅ $name"
  echo ""
}

deprecate() {
  local pkg="$1"
  local msg="$2"
  echo "⚠️   Deprecating $pkg..."
  if [ "$DRY_RUN" = true ]; then
    echo "    [dry-run] npm deprecate \"$pkg\" \"$msg\""
  else
    npm deprecate "$pkg" "$msg"
  fi
  echo "    ✅ $pkg deprecated"
  echo ""
}

# Sync compat versions to match real packages
# Compat shims must always publish at the same version as the real packages so users upgrading pyrajs-cli always get a shim that points at the matching @pyra-js/cli version.
sync_compat_versions() {
  local version="$1"
  for f in "$ROOT"/packages/compat-pyrajs-*/package.json; do
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$f', 'utf8'));
      pkg.version = '$version';
      fs.writeFileSync('$f', JSON.stringify(pkg, null, 2) + '\n');
    "
  done
}

# Banner
VERSION=$(cd "$ROOT" && node -e "console.log(require('./packages/cli/package.json').version)")

echo ""
echo "╔════════════════════════════════════════╗"
echo "║        Pyra - Publishing v$VERSION        ║"
echo "╚════════════════════════════════════════╝"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "🔍  DRY RUN - no packages will be published or deprecated"
  echo ""
fi

# Sync compat versions + Build
echo "🔄  Syncing compat shim versions to v$VERSION..."
if [ "$DRY_RUN" = true ]; then
  echo "    [dry-run] set compat versions to $VERSION"
else
  sync_compat_versions "$VERSION"
fi
echo "    ✅ Compat versions synced"
echo ""

echo "🔨  Building all packages..."
if [ "$DRY_RUN" = true ]; then
  echo "    [dry-run] pnpm build"
else
  (cd "$ROOT" && pnpm build)
fi
echo "    ✅ Build complete"
echo ""

# Publish scoped packages (@pyra-js/*)
echo "── Scoped packages (@pyra-js/*) ──────────────────────────────────────────"
echo ""

publish "packages/shared"        "@pyra-js/shared"
publish "packages/core"          "@pyra-js/core"
publish "packages/adapter-react" "@pyra-js/adapter-react"
publish "packages/cli"           "@pyra-js/cli"
publish "packages/create-pyra"   "create-pyra"

# Step 3: Publish compat shims (pyrajs-*)
# These are NEW versions of the old package names that re-export from @pyra-js/*.

# new installs get the shim with the deprecation warning.
echo "── Compat shims (pyrajs-*) ───────────────────────────────────────────────"
echo "   (new versions of old names - re-export from @pyra-js/*)"
echo ""

publish "packages/compat-pyrajs-shared"        "pyrajs-shared"
publish "packages/compat-pyrajs-core"          "pyrajs-core"
publish "packages/compat-pyrajs-adapter-react" "pyrajs-adapter-react"
publish "packages/compat-pyrajs-cli"           "pyrajs-cli"

# Step 4: Deprecate old package names
echo "── Deprecating old names ─────────────────────────────────────────────────"
echo ""

deprecate "pyrajs-cli"           "Renamed to @pyra-js/cli. Update your devDependencies and imports."
deprecate "pyrajs-shared"        "Renamed to @pyra-js/shared. User-facing types are re-exported from @pyra-js/cli."
deprecate "pyrajs-core"          "Renamed to @pyra-js/core."
deprecate "pyrajs-adapter-react" "Renamed to @pyra-js/adapter-react."

# Done
echo "╔════════════════════════════════════════╗"
echo "║   🎉  All packages published - v$VERSION  ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Get started:"
echo "  npm create pyra@latest my-app"
echo "  npx @pyra-js/cli@latest create my-app"
echo ""
