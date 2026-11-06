#!/usr/bin/env sh
# Installs the Node.js and pnpm versions this repo needs, for macOS and Linux.
# Windows: use scripts\setup.cmd (or scripts\setup.ps1).
#
#   sh scripts/setup.sh            # install what is missing
#   sh scripts/setup.sh --force    # reinstall Node even if a suitable one exists
#
# Versions come from the repo: Node major from .node-version, pnpm from the
# "packageManager" field in package.json. Nothing needs sudo:
# - an existing Node that satisfies "engines" (>= 22.12) is kept;
# - otherwise fnm or nvm is used when installed;
# - otherwise the official build is downloaded from nodejs.org, its SHA-256 is
#   checked against SHASUMS256.txt, and it is unpacked into ~/.local/node.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NODE_MAJOR=$(tr -d ' \r\n' < "$ROOT/.node-version" | sed 's/^v//; s/\..*//')
PNPM_VERSION=$(sed -n 's/.*"packageManager"[^"]*"pnpm@\([0-9][0-9.]*\)".*/\1/p' "$ROOT/package.json")
NODE_HOME="$HOME/.local/node"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
has()  { command -v "$1" >/dev/null 2>&1; }

[ -n "$NODE_MAJOR" ] || die "could not read the Node version from .node-version"
[ -n "$PNPM_VERSION" ] || die "could not read the pnpm version from package.json \"packageManager\""

# --- helpers ---------------------------------------------------------------

download() { # url dest
  if has curl; then curl -fsSL --proto '=https' --tlsv1.2 -o "$2" "$1"
  elif has wget; then wget -q -O "$2" "$1"
  else die "curl or wget is required"; fi
}

sha256() {
  if has sha256sum; then sha256sum "$1" | cut -d' ' -f1
  elif has shasum; then shasum -a 256 "$1" | cut -d' ' -f1
  else die "sha256sum or shasum is required"; fi
}

node_ok() { # Node on PATH satisfies engines >= 22.12.0
  has node || return 1
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)' 2>/dev/null
}

profile_file() {
  case "${SHELL:-}" in
    */zsh)  echo "$HOME/.zshrc" ;;
    */bash) if [ "$(uname -s)" = Darwin ]; then echo "$HOME/.bash_profile"; else echo "$HOME/.bashrc"; fi ;;
    *)      echo "$HOME/.profile" ;;
  esac
}

add_to_path() { # dir: prepend for this run and persist in the shell profile
  PATH="$1:$PATH"; export PATH
  profile=$(profile_file)
  line="export PATH=\"$1:\$PATH\""
  if [ ! -f "$profile" ] || ! grep -qF "$line" "$profile"; then
    printf '\n# Added by Dnn.Themes.Bond scripts/setup.sh\n%s\n' "$line" >> "$profile"
    info "Added $1 to PATH in $profile"
    RESTART_SHELL=1
  fi
}
RESTART_SHELL=0

install_node_official() {
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux)  os=linux ;;
    *) die "unsupported OS $(uname -s); install Node $NODE_MAJOR from https://nodejs.org" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64)  arch=x64 ;;
    arm64|aarch64) arch=arm64 ;;
    armv7l)        arch=armv7l ;;
    *) die "unsupported CPU $(uname -m); install Node $NODE_MAJOR from https://nodejs.org" ;;
  esac

  base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT INT TERM

  download "$base/SHASUMS256.txt" "$tmp/SHASUMS256.txt"
  file=$(grep -o "node-v[0-9.]*-$os-$arch\.tar\.gz" "$tmp/SHASUMS256.txt" | head -n1)
  [ -n "$file" ] || die "no Node $NODE_MAJOR build for $os-$arch on nodejs.org"
  expected=$(grep " $file\$" "$tmp/SHASUMS256.txt" | cut -d' ' -f1)

  info "Downloading $file"
  download "$base/$file" "$tmp/$file"
  [ "$(sha256 "$tmp/$file")" = "$expected" ] || die "checksum mismatch for $file; download aborted"

  rm -rf "$NODE_HOME"
  mkdir -p "$NODE_HOME"
  tar -xzf "$tmp/$file" -C "$NODE_HOME" --strip-components=1
  add_to_path "$NODE_HOME/bin"
}

# --- Node ------------------------------------------------------------------

if [ "$FORCE" -eq 0 ] && node_ok; then
  info "Node $(node --version) found at $(command -v node), keeping it"
  case "$(node --version)" in v"$NODE_MAJOR".*) ;; *) warn "this repo targets Node $NODE_MAJOR (.node-version); CI uses that version" ;; esac
elif has fnm; then
  info "Installing Node $NODE_MAJOR with fnm"
  fnm install "$NODE_MAJOR"
  eval "$(fnm env)"; fnm use "$NODE_MAJOR"
elif [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  info "Installing Node $NODE_MAJOR with nvm"
  set +u; . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"; nvm install "$NODE_MAJOR"; nvm use "$NODE_MAJOR"; set -u
else
  info "Installing Node $NODE_MAJOR (official build) into $NODE_HOME"
  install_node_official
fi

node_ok || die "Node >= 22.12 is still not on PATH"
info "Node $(node --version), npm $(npm --version)"

# --- pnpm ------------------------------------------------------------------

if has pnpm && [ "$(pnpm --version 2>/dev/null)" = "$PNPM_VERSION" ]; then
  info "pnpm $PNPM_VERSION already installed"
else
  # A system Node (apt, dnf...) has a root-owned global prefix; use a user one.
  prefix=$(npm config get prefix)
  target="$prefix/lib/node_modules"
  [ -d "$target" ] || target="$prefix"
  if [ -w "$target" ]; then
    npm_prefix=""
  else
    npm_prefix="$HOME/.local/npm-global"
    mkdir -p "$npm_prefix"
  fi
  info "Installing pnpm $PNPM_VERSION"
  # pnpm 12 is a native binary set up by its own install script, which recent npm skips by default.
  if [ -n "$npm_prefix" ]; then
    npm install -g --prefix "$npm_prefix" "pnpm@$PNPM_VERSION" --allow-scripts=pnpm
    add_to_path "$npm_prefix/bin"
  else
    npm install -g "pnpm@$PNPM_VERSION" --allow-scripts=pnpm
  fi
  hash -r 2>/dev/null || true
fi

[ "$(pnpm --version 2>/dev/null)" = "$PNPM_VERSION" ] || die "pnpm $PNPM_VERSION is not on PATH (found: $(pnpm --version 2>/dev/null || echo none))"
info "pnpm $(pnpm --version)"

echo
info "Done. Next: pnpm install --frozen-lockfile"
[ "$RESTART_SHELL" -eq 1 ] && warn "open a new terminal (or run: . $(profile_file)) so PATH changes apply"
exit 0
