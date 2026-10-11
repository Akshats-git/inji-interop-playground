#!/usr/bin/env bash
# Inji Interoperability Playground: one command to run the whole bundle.
#
#   ./playground.sh up              start locally on http://localhost:8080
#   ./playground.sh tunnel [URL]    start with a public HTTPS URL so a phone wallet can connect
#   ./playground.sh doctor          check the machine, the containers and (in tunnel mode) the public URL
#   ./playground.sh down            stop everything, keeping data
#   ./playground.sh reset           stop everything and delete all data (asks first)
#   ./playground.sh logs [service]  follow logs
#   ./playground.sh status          list containers and their health
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT/.env"
COMPOSE_FILE="$ROOT/infra/compose.yml"
PROJECT="inji-playground"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-600}"

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; R=$'\e[31m'; Y=$'\e[33m'; D=$'\e[2m'; N=$'\e[0m'; else B='' G='' R='' Y='' D='' N=''; fi
say() { printf '%s\n' "$*"; }
ok() { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
bad() { printf '  %s✗%s %s\n' "$R" "$N" "$*"; FAILED=1; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
die() { printf '%sError:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

compose() { docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# --- .env handling ---------------------------------------------------------------------------------

get_env() { [[ -f "$ENV_FILE" ]] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -n1 || true; }

set_env() {
  local key=$1 value=$2 tmp
  tmp="$(mktemp)"
  if [[ -f "$ENV_FILE" ]]; then grep -v "^$key=" "$ENV_FILE" >"$tmp" || true; fi
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

random_b64() { openssl rand -base64 "$1" 2>/dev/null || head -c "$1" /dev/urandom | base64; }

ensure_env() {
  [[ -f "$ENV_FILE" ]] || { cp "$ROOT/.env.example" "$ENV_FILE"; chmod 600 "$ENV_FILE"; say "Created .env"; }
  if [[ -z "$(get_env EVENT_ENCRYPTION_KEY)" ]]; then
    set_env EVENT_ENCRYPTION_KEY "$(random_b64 32)"
    say "Generated EVENT_ENCRYPTION_KEY (protocol payloads are encrypted at rest with it)."
  fi
  if [[ -z "$(get_env POSTGRES_PASSWORD)" ]]; then
    # Postgres only reads its password when the data volume is first created. Keep the old default for an
    # existing volume, otherwise every service would fail to log in.
    if docker volume inspect "${PROJECT}_pgdata" >/dev/null 2>&1; then
      set_env POSTGRES_PASSWORD postgres
      warn "Existing database volume found: keeping its password. Run ./playground.sh reset for a fresh, random one."
    else
      set_env POSTGRES_PASSWORD "$(random_b64 18 | tr -d '/+=')"
    fi
  fi
}

port() { local p; p="$(get_env PLAYGROUND_PORT)"; echo "${p:-8080}"; }

# Plain HTTP on this machine. did:web needs HTTPS, so issuers and Certify sign with URL-based keys.
local_identity() {
  local p; p="$(port)"
  set_env PLAYGROUND_MODE local
  set_env PUBLIC_BASE_URL "http://playground.localhost:$p"
  set_env CERTIFY_DEFAULT_DID "http://playground.localhost:$p/pub/issuers/certify/keys/EdDSA"
  set_env VERIFY_DID "did:web:playground.localhost%3A$p:pub:verify:v1:verify"
  set_env VERIFY_COOKIE_SECURE false
}

# A public HTTPS origin: everything is identified by did:web on that host.
public_identity() {
  local url=${1%/} host
  host="${url#https://}"
  host="${host%%/*}"
  set_env PLAYGROUND_MODE tunnel
  set_env PUBLIC_BASE_URL "$url"
  set_env CERTIFY_DEFAULT_DID "did:web:$host:pub:issuers:certify"
  set_env VERIFY_DID "did:web:$host:pub:verify:v1:verify"
  set_env VERIFY_COOKIE_SECURE true
}

require_docker() {
  command -v docker >/dev/null || die "Docker is not installed. Install Docker Desktop or Docker Engine first."
  docker info >/dev/null 2>&1 || die "Docker is installed but not running. Start it and try again."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (the 'docker compose' plugin)."
}

banner() {
  local url; url="$(get_env PUBLIC_BASE_URL)"
  say ""
  say "${B}The playground is running.${N}"
  say "  Open        http://localhost:$(port)"
  [[ "$(get_env PLAYGROUND_MODE)" == tunnel ]] && say "  Phone URL   $url" && say "  ${D}Wallets on a phone use this URL. It changes each time the quick tunnel restarts.${N}"
  say "  Check it    ./playground.sh doctor"
  say "  Stop it     ./playground.sh down"
}

start() {
  say "Building the playground and starting Postgres, Inji Certify and Inji Verify."
  say "${D}The first start downloads about 2 GB of images and can take several minutes; Certify needs 1–3 minutes to boot.${N}"
  local started=$SECONDS
  compose "$@" up -d --build --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT" && return
  # A failure within seconds is almost always a download that was cut off (Docker Hub, npm); try once more.
  if (( SECONDS - started < 60 )); then
    warn "Starting failed early, usually a dropped download. Trying once more."
    sleep 5
    compose "$@" up -d --build --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT" && return
    die "The bundle did not start; the messages above say why. Check your network, then run this command again."
  fi
  die "Not every service became healthy within ${WAIT_TIMEOUT}s. Run ./playground.sh doctor, or ./playground.sh logs certify."
}

# --- commands --------------------------------------------------------------------------------------

cmd_up() {
  require_docker
  ensure_env
  local_identity
  # Leave tunnel mode cleanly if it was on.
  compose --profile tunnel rm -sf tunnel >/dev/null 2>&1 || true
  start
  banner
}

# The newest URL cloudflared announced (api.trycloudflare.com is its own API, seen in error lines).
quick_tunnel_url() { { compose --profile tunnel logs tunnel 2>/dev/null || true; } | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' | grep -v '^https://api\.' | tail -n1 || true; }

cmd_tunnel() {
  require_docker
  ensure_env
  local url=${1:-}
  if [[ -n "$url" ]]; then
    [[ "$url" == https://* ]] || die "The public URL must start with https:// (phones and did:web both need HTTPS)."
    say "Using your public URL $url. Point it at http://localhost:$(port)."
    public_identity "$url"
    start
  else
    say "Opening a Cloudflare quick tunnel (no account needed)."
    compose --profile tunnel up -d --no-deps tunnel >/dev/null
    for _ in $(seq 1 45); do url="$(quick_tunnel_url)"; [[ -n "$url" ]] && break; sleep 2; done
    [[ -n "$url" ]] || die "The tunnel did not report a URL within 90s. See ./playground.sh logs tunnel."
    say "Tunnel URL: $url"
    public_identity "$url"
    # Certify and Verify read their public URL and DIDs at boot, so they restart with the new identity;
    # the tunnel itself keeps running, so its URL stays the same.
    start --profile tunnel
  fi
  banner
}

cmd_down() {
  require_docker
  [[ -f "$ENV_FILE" ]] || touch "$ENV_FILE"
  compose --profile tunnel down --remove-orphans
  say "Stopped. Data is kept; ./playground.sh up starts again where you left off."
}

cmd_reset() {
  require_docker
  [[ -f "$ENV_FILE" ]] || touch "$ENV_FILE"
  say "${B}This deletes every credential type, run, recorded message, held credential and Certify signing key.${N}"
  read -r -p "Type 'reset' to continue: " answer
  [[ "$answer" == reset ]] || die "Nothing was deleted."
  compose --profile tunnel down --volumes --remove-orphans
  # A new database gets a new password on the next start.
  if [[ -f "$ENV_FILE" ]]; then grep -v '^POSTGRES_PASSWORD=' "$ENV_FILE" >"$ENV_FILE.tmp" || true; mv "$ENV_FILE.tmp" "$ENV_FILE"; fi
  say "All data deleted. Run ./playground.sh up for a fresh start."
}

cmd_logs() { require_docker; compose --profile tunnel logs -f --tail 200 "$@"; }
cmd_status() { require_docker; compose --profile tunnel ps; }

http_ok() { curl -fsS --max-time "${2:-8}" -o /dev/null "$1" 2>/dev/null; }
http_get() { curl -fsS --max-time "${2:-8}" "$1" 2>/dev/null; }

cmd_doctor() {
  FAILED=0
  say "${B}Machine${N}"
  if ! command -v docker >/dev/null; then bad "Docker is not installed"; exit 1; fi
  if docker info >/dev/null 2>&1; then ok "Docker is running ($(docker version --format '{{.Server.Version}}'))"; else bad "Docker is not running"; exit 1; fi
  local cv; cv="$(docker compose version --short 2>/dev/null || true)"
  if [[ -z "$cv" ]]; then bad "Docker Compose v2 is missing"
  elif [[ "$(printf '%s\n' 2.20.0 "${cv#v}" | sort -V | head -n1)" == 2.20.0 ]]; then ok "Docker Compose $cv"
  else bad "Docker Compose $cv is too old; 2.20 or newer is needed"; fi
  local mem; mem=$(( $(docker info --format '{{.MemTotal}}') / 1024 / 1024 / 1024 ))
  if (( mem >= 6 )); then ok "Docker can use ${mem} GB of memory"
  elif (( mem >= 4 )); then warn "Docker can use ${mem} GB of memory; 6 GB or more is comfortable (the bundle needs about 3 GB)"
  else bad "Docker can use only ${mem} GB of memory; the bundle needs about 3 GB"; fi
  command -v curl >/dev/null && ok "curl is available" || bad "curl is missing (needed for these checks)"

  say "${B}Configuration${N}"
  if [[ ! -f "$ENV_FILE" ]]; then bad ".env is missing: run ./playground.sh up"; else
    local key; key="$(get_env EVENT_ENCRYPTION_KEY)"
    if [[ -n "$key" && "$(printf '%s' "$key" | base64 -d 2>/dev/null | wc -c | tr -d ' ')" == 32 ]]; then ok "Encryption key is set (32 bytes)"; else bad "EVENT_ENCRYPTION_KEY is missing or not 32 bytes of base64"; fi
    ok "Mode: $(get_env PLAYGROUND_MODE), public URL $(get_env PUBLIC_BASE_URL)"
  fi

  say "${B}Containers${N}"
  local svc state
  for svc in postgres certify verify-service playground; do
    state="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "${PROJECT}-${svc}-1" 2>/dev/null || echo missing)"
    case "$state" in
      "running healthy") ok "$svc is healthy" ;;
      "running starting") warn "$svc is still starting" ;;
      missing) bad "$svc is not running: ./playground.sh up" ;;
      *) bad "$svc is $state: ./playground.sh logs $svc" ;;
    esac
  done

  say "${B}Gateway${N}"
  local base status
  base="http://localhost:$(port)"
  if http_ok "$base/api/health"; then ok "Playground answers on $base"
  elif (echo >/dev/tcp/127.0.0.1/"$(port)") 2>/dev/null; then bad "Port $(port) is taken by another program; set PLAYGROUND_PORT in .env"
  else bad "Nothing answers on $base"; fi
  if status="$(http_get "$base/api/status")"; then
    [[ "$status" == *'"certify":true'* ]] && ok "Inji Certify is reachable through the playground" || bad "Inji Certify is not reachable yet"
    [[ "$status" == *'"verify":true'* ]] && ok "Inji Verify is reachable through the playground" || bad "Inji Verify is not reachable yet"
  fi

  if [[ "$(get_env PLAYGROUND_MODE)" == tunnel ]]; then
    local pub; pub="$(get_env PUBLIC_BASE_URL)"
    say "${B}Public URL (for phones)${N}"
    if docker inspect "${PROJECT}-tunnel-1" >/dev/null 2>&1; then
      local live; live="$(quick_tunnel_url)"
      if [[ -n "$live" && "$live" != "$pub" ]]; then bad "The quick tunnel now has a different URL ($live); run ./playground.sh tunnel again"; fi
    fi
    local meta; meta="$(http_get "$pub/pub/certify/v1/certify/.well-known/openid-credential-issuer" 15 || true)"
    if [[ -z "$meta" ]]; then bad "$pub is not reachable from the internet; check the tunnel with ./playground.sh logs tunnel"
    elif [[ "$meta" == *"\"credential_issuer\":\"$pub/pub/certify\""* || "$meta" == *"\"credential_issuer\" : \"$pub/pub/certify\""* ]]; then ok "$pub is reachable, and Certify announces itself at $pub/pub/certify"
    else bad "Certify announces a different URL; restart with ./playground.sh tunnel"; fi
    if [[ "$(get_env PUBLIC_UI)" == true ]]; then warn "PUBLIC_UI=true: the UI and API are reachable by anyone with the public URL"
    elif http_ok "$pub/api/health" 15; then bad "The API is reachable through the public URL; it should not be"
    else ok "Only wallet-facing paths (/pub/*) are public; the UI and API stay on this machine"; fi
    local host="${pub#https://}"
    http_ok "https://$host/pub/issuers/certify/did.json" 15 && ok "did:web:$host:pub:issuers:certify resolves" || bad "Certify's did:web document does not resolve"
    http_ok "https://$host/pub/verify/v1/verify/did.json" 15 && ok "did:web:$host:pub:verify:v1:verify resolves" || bad "Inji Verify's did:web document does not resolve"
  fi

  say ""
  if (( FAILED )); then say "${R}Some checks failed.${N}"; exit 1; else say "${G}Everything looks fine.${N}"; fi
}

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; }

case "${1:-help}" in
  up) shift; cmd_up "$@" ;;
  tunnel) shift; cmd_tunnel "$@" ;;
  down) shift; cmd_down ;;
  reset) shift; cmd_reset ;;
  logs) shift; cmd_logs "$@" ;;
  status | ps) shift; cmd_status ;;
  doctor) shift; cmd_doctor ;;
  help | -h | --help) usage ;;
  *) usage; exit 1 ;;
esac
