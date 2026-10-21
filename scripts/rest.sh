#!/usr/bin/env bash
# The Evaluation API from the command line: the calls the Node SDK makes, plus
# the error answers a QA pass wants to see. Needs curl; uses jq when present.
#
#   STP_API_KEY=stp_… STP_BASE_URL=https://app-staging.splittestpro.com bash scripts/rest.sh
#
# Optional: STP_FLAG_KEY (new-checkout), STP_GOAL (purchase), and
# STP_CLIENT_EXPERIMENT_ID + STP_CLIENT_VARIANT_ID (an experiment set to
# "On your site") for the pixel_owned step.
#
# Only two calls here fail authentication on purpose; the API allows 60 failed
# attempts per IP per minute before answering 429.
set -u
: "${STP_API_KEY:?export STP_API_KEY (Settings → API keys)}"
BASE="${STP_BASE_URL:-https://app.splittestpro.com}"
BASE="${BASE%/}"
FLAG="${STP_FLAG_KEY:-new-checkout}"
GOAL="${STP_GOAL:-purchase}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

show() {
  # $1 = title, $2 = headers file, $3 = body file
  echo
  echo "== $1"
  grep -iE '^(HTTP/|etag:|retry-after:|content-type:)' "$2" | tr -d '\r' | sed 's/^/   /'
  if command -v jq >/dev/null 2>&1 && jq -e . "$3" >/dev/null 2>&1; then
    jq . "$3" | sed 's/^/   /'
  else
    sed 's/^/   /' "$3"; echo
  fi
}

call() {
  # $1 = title, $2 = method, $3 = path, $4 = body or "", then extra curl args
  local title="$1" method="$2" path="$3" body="$4"; shift 4
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$BASE$path" -H "Content-Type: application/json" -d "$body" -D "$TMP/h" -o "$TMP/b" "$@"
  else
    curl -sS -X "$method" "$BASE$path" -D "$TMP/h" -o "$TMP/b" "$@"
  fi
  show "$title" "$TMP/h" "$TMP/b"
}

AUTH=(-H "Authorization: Bearer $STP_API_KEY" -H "Accept: application/json")

call "1. GET /api/html/flags/config (expect 200 + ETag)" GET /api/html/flags/config "" "${AUTH[@]}"
ETAG="$(grep -i '^etag:' "$TMP/h" | tr -d '\r' | cut -d' ' -f2-)"

if [ -n "$ETAG" ]; then
  call "2. GET config with If-None-Match (expect 304)" GET /api/html/flags/config "" "${AUTH[@]}" -H "If-None-Match: $ETAG"
else
  echo; echo "== 2. skipped: no ETag on the first answer"
fi

call "3. POST /api/html/flags/evaluate (expect 200 with $FLAG)" POST /api/html/flags/evaluate \
  "{\"identity\":\"rest-demo-1\",\"flags\":[\"$FLAG\"]}" "${AUTH[@]}"

call "4. Bad key (expect 401 invalid_key)" GET /api/html/flags/config "" \
  -H "Authorization: Bearer stp_not_a_real_key" -H "Accept: application/json"

call "5. Key in the query string instead of the header (expect 401: never accepted)" GET \
  "/api/html/flags/config?api_key=stp_not_a_real_key" "" -H "Accept: application/json"

call "6. Identity with whitespace (expect 400)" POST /api/html/flags/evaluate \
  "{\"identity\":\"bad id\",\"flags\":[\"$FLAG\"]}" "${AUTH[@]}"

if [ -n "${STP_CLIENT_EXPERIMENT_ID:-}" ] && [ -n "${STP_CLIENT_VARIANT_ID:-}" ]; then
  call "7. Exposure for an On-your-site experiment (expect 409 pixel_owned)" POST /api/html/flags/exposure \
    "{\"identity\":\"rest-demo-1\",\"experiment_id\":\"$STP_CLIENT_EXPERIMENT_ID\",\"variant_id\":\"$STP_CLIENT_VARIANT_ID\",\"event_id\":\"rest-exp-$$\"}" "${AUTH[@]}"
else
  echo; echo "== 7. skipped: set STP_CLIENT_EXPERIMENT_ID and STP_CLIENT_VARIANT_ID for the pixel_owned check"
fi

DUP="rest-dup-$(date +%s)"
call "8a. Conversion (expect 200; recorded:true when a server-side test is running, else reason unassigned)" POST /api/html/flags/conversion \
  "{\"identity\":\"rest-demo-1\",\"event_type\":\"$GOAL\",\"event_id\":\"$DUP\",\"value\":49,\"currency\":\"USD\"}" "${AUTH[@]}"
call "8b. Same event_id again (expect recorded:false reason:duplicate when 8a was recorded)" POST /api/html/flags/conversion \
  "{\"identity\":\"rest-demo-1\",\"event_type\":\"$GOAL\",\"event_id\":\"$DUP\",\"value\":49,\"currency\":\"USD\"}" "${AUTH[@]}"
