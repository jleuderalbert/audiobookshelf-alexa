#!/usr/bin/env bash
# Deploys skill-package/ (manifest + interaction models) to the development
# stage of an existing Alexa skill via SMAPI, then waits for the builds.
# Used by .github/workflows/deploy-skill.yml; runnable locally with an ASK CLI
# profile.
#
# Environment:
#   SKILL_ID       Alexa skill ID (amzn1.ask.skill....)
#   ENDPOINT_ARN   Lambda ARN written into the manifest's custom endpoint
#   LOCALES        optional, space-separated (e.g. "de-DE"); default: all
#                  locales in skill-package/skill.json. Other locales are
#                  removed from the uploaded manifest.
#   DRY_RUN=1      only print the manifest that would be uploaded
set -euo pipefail

cd "$(dirname "$0")/.."
: "${SKILL_ID:?}" "${ENDPOINT_ARN:?}"

pkg=skill-package
if [[ -z "${LOCALES:-}" ]]; then
  LOCALES=$(jq -r '.manifest.publishingInformation.locales | keys | join(" ")' "$pkg/skill.json")
fi
read -ra locales <<< "$LOCALES"

for l in "${locales[@]}"; do
  jq -e '.manifest.publishingInformation.locales[$l]' --arg l "$l" "$pkg/skill.json" >/dev/null \
    || { echo "locale $l is not in $pkg/skill.json" >&2; exit 1; }
  jq empty "$pkg/interactionModels/custom/$l.json"
done

manifest=$(mktemp)
trap 'rm -f "$manifest"' EXIT
jq --arg arn "$ENDPOINT_ARN" --argjson keep "$(printf '%s\n' "${locales[@]}" | jq -R . | jq -s .)" '
  def only_kept: with_entries(select(.key as $k | $keep | index($k)));
  .manifest.apis.custom.endpoint.uri = $arn
  | .manifest.publishingInformation.locales |= only_kept
  | .manifest.privacyAndCompliance.locales |= only_kept
' "$pkg/skill.json" > "$manifest"

if [[ "${DRY_RUN:-0}" == 1 ]]; then
  echo "locales: ${locales[*]}"
  jq '{endpoint: .manifest.apis.custom.endpoint, locales: (.manifest.publishingInformation.locales | keys)}' "$manifest"
  exit 0
fi

# Waits until manifest and the given locales' interaction models have left
# IN_PROGRESS; fails if any of them FAILED.
wait_for_builds() {
  local status states
  for _ in $(seq 1 60); do
    status=$(ask smapi get-skill-status -s "$SKILL_ID")
    states=$(jq -r --argjson ls "$(printf '%s\n' "$@" | jq -R . | jq -s .)" '
      [.manifest.lastUpdateRequest.status]
      + [$ls[] as $l | .interactionModel[$l].lastUpdateRequest.status // empty]
      | join(" ")' <<< "$status")
    if [[ "$states" == *FAILED* ]]; then
      echo "build failed:" >&2
      jq . <<< "$status" >&2
      return 1
    fi
    [[ "$states" != *IN_PROGRESS* ]] && { echo "status: $states"; return 0; }
    sleep 5
  done
  echo "timed out waiting for builds" >&2
  return 1
}

echo "updating manifest (endpoint $ENDPOINT_ARN, locales ${locales[*]})"
ask smapi update-skill-manifest -s "$SKILL_ID" -g development --manifest "file:$manifest"
wait_for_builds

for l in "${locales[@]}"; do
  echo "updating interaction model $l"
  ask smapi set-interaction-model -s "$SKILL_ID" -g development -l "$l" \
    --interaction-model "file:$pkg/interactionModels/custom/$l.json"
done
wait_for_builds "${locales[@]}"
