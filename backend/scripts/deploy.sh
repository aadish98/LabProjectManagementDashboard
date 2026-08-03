#!/usr/bin/env bash
set -Eeuo pipefail

mode="check"
case "${1:-}" in
  "") ;;
  --check) mode="check" ;;
  --deploy) mode="deploy" ;;
  -h|--help)
    cat <<'EOF'
Usage: backend/scripts/deploy.sh [--check|--deploy]

--check   Validate files, identity, project, APIs, region, service accounts,
          Firestore, Artifact Registry, OAuth audiences, and CORS. This is
          the safe default and does not submit a build.
--deploy  Run the same checks, then submit backend/cloudbuild.yaml.
EOF
    exit 0
    ;;
  *)
    printf 'Unknown argument: %s\n' "$1" >&2
    exit 64
    ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${backend_dir}/.." && pwd)"

required_files=(
  "${backend_dir}/cloudbuild.yaml"
  "${backend_dir}/Dockerfile"
  "${backend_dir}/firestore.indexes.json"
  "${backend_dir}/package.json"
  "${backend_dir}/package-lock.json"
  "${backend_dir}/tsconfig.build.json"
  "${backend_dir}/scripts/smoke.ts"
)
for file in "${required_files[@]}"; do
  [[ -f "${file}" ]] || {
    printf 'Required deployment file is missing: %s\n' "${file}" >&2
    exit 1
  }
done

required_variables=(
  GCP_PROJECT_ID
  GCP_REGION
  CLOUD_RUN_SERVICE
  CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT
  CLOUD_BUILD_SERVICE_ACCOUNT
  ARTIFACT_REGISTRY_REPOSITORY
  GOOGLE_OAUTH_CLIENT_IDS
  GOOGLE_OAUTH_TOKEN_CLIENT_ID
  GOOGLE_OAUTH_CLIENT_SECRET_NAME
  CORS_ALLOWED_ORIGINS
)
for variable in "${required_variables[@]}"; do
  [[ -n "${!variable:-}" ]] || {
    printf 'Required environment variable is empty: %s\n' "${variable}" >&2
    exit 1
  }
done

FIRESTORE_DATABASE_ID="${FIRESTORE_DATABASE_ID:-(default)}"

[[ "${GCP_PROJECT_ID}" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || {
  printf 'GCP_PROJECT_ID is not a valid project ID: %s\n' "${GCP_PROJECT_ID}" >&2
  exit 1
}
[[ "${GCP_REGION}" =~ ^[a-z]+-[a-z]+[0-9]$ ]] || {
  printf 'GCP_REGION is not a valid region name: %s\n' "${GCP_REGION}" >&2
  exit 1
}
[[ "${CLOUD_RUN_SERVICE}" =~ ^[a-z][a-z0-9-]{0,61}[a-z0-9]$ ]] || {
  printf 'CLOUD_RUN_SERVICE is not a valid service name: %s\n' "${CLOUD_RUN_SERVICE}" >&2
  exit 1
}
[[ "${ARTIFACT_REGISTRY_REPOSITORY}" =~ ^[a-z][a-z0-9._-]{0,62}$ ]] || {
  printf 'ARTIFACT_REGISTRY_REPOSITORY is invalid: %s\n' "${ARTIFACT_REGISTRY_REPOSITORY}" >&2
  exit 1
}
expected_suffix="@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
for service_account in \
  "${CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT}" \
  "${CLOUD_BUILD_SERVICE_ACCOUNT}"; do
  [[ "${service_account}" == *"${expected_suffix}" ]] || {
    printf 'Service account must belong to project %s: %s\n' \
      "${GCP_PROJECT_ID}" "${service_account}" >&2
    exit 1
  }
done

IFS=',' read -r -a audiences <<< "${GOOGLE_OAUTH_CLIENT_IDS}"
(( ${#audiences[@]} > 0 )) || {
  printf 'At least one Google OAuth client ID audience is required.\n' >&2
  exit 1
}
for audience in "${audiences[@]}"; do
  audience="${audience//[[:space:]]/}"
  [[ "${audience}" =~ ^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$ ]] || {
    printf 'Invalid Google OAuth client ID audience: %s\n' "${audience}" >&2
    exit 1
  }
done

# The brokered client must be one of the accepted ID-token audiences, and the
# secret itself must never travel through this script -- only its Secret
# Manager name does.
[[ "${GOOGLE_OAUTH_TOKEN_CLIENT_ID}" =~ ^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$ ]] || {
  printf 'GOOGLE_OAUTH_TOKEN_CLIENT_ID is not a valid OAuth client ID: %s\n' \
    "${GOOGLE_OAUTH_TOKEN_CLIENT_ID}" >&2
  exit 1
}
brokered_is_audience=0
for audience in "${audiences[@]}"; do
  [[ "${audience//[[:space:]]/}" == "${GOOGLE_OAUTH_TOKEN_CLIENT_ID}" ]] && brokered_is_audience=1
done
(( brokered_is_audience == 1 )) || {
  printf 'GOOGLE_OAUTH_TOKEN_CLIENT_ID must appear in GOOGLE_OAUTH_CLIENT_IDS.\n' >&2
  exit 1
}
[[ "${GOOGLE_OAUTH_CLIENT_SECRET_NAME}" =~ ^[a-zA-Z0-9_-]{1,255}$ ]] || {
  printf 'GOOGLE_OAUTH_CLIENT_SECRET_NAME is not a valid Secret Manager name: %s\n' \
    "${GOOGLE_OAUTH_CLIENT_SECRET_NAME}" >&2
  exit 1
}
[[ -z "${GOOGLE_OAUTH_CLIENT_SECRET:-}" ]] || {
  printf 'Pass only GOOGLE_OAUTH_CLIENT_SECRET_NAME; the secret value must live in Secret Manager and never in this environment.\n' >&2
  exit 1
}

IFS=',' read -r -a origins <<< "${CORS_ALLOWED_ORIGINS}"
(( ${#origins[@]} > 0 )) || {
  printf 'At least one exact CORS origin is required.\n' >&2
  exit 1
}
for origin in "${origins[@]}"; do
  [[ "${origin}" != *"*"* && "${origin}" =~ ^[a-zA-Z][a-zA-Z0-9+.-]*://[^[:space:]]+$ ]] || {
    printf 'CORS origins must be exact URLs without wildcards: %s\n' "${origin}" >&2
    exit 1
  }
done

for value in "${GOOGLE_OAUTH_CLIENT_IDS}" "${CORS_ALLOWED_ORIGINS}"; do
  [[ "${value}" != *"@"* && "${value}" != *$'\n'* ]] || {
    printf 'OAuth audiences and CORS origins cannot contain @ or newlines.\n' >&2
    exit 1
  }
done

if [[ "${DEPLOY_PREFLIGHT_OFFLINE:-0}" == "1" ]]; then
  [[ "${mode}" == "check" ]] || {
    printf 'DEPLOY_PREFLIGHT_OFFLINE is valid only with --check.\n' >&2
    exit 64
  }
  printf 'Offline deployment preflight passed.\n'
  printf '  project syntax: %s\n' "${GCP_PROJECT_ID}"
  printf '  region syntax: %s\n' "${GCP_REGION}"
  printf '  deployment artifacts and non-secret configuration are present.\n'
  printf 'No cloud APIs queried and no build submitted.\n'
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  printf 'gcloud is not installed. Install Google Cloud CLI before deployment.\n' >&2
  exit 127
}

active_account="$(
  gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | awk 'NF { print; exit }'
)"
[[ -n "${active_account}" ]] || {
  printf 'gcloud has no active authenticated account or federated identity.\n' >&2
  exit 1
}

gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectId)' >/dev/null
gcloud iam service-accounts describe "${CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT}" \
  --project="${GCP_PROJECT_ID}" --format='value(email)' >/dev/null
gcloud iam service-accounts describe "${CLOUD_BUILD_SERVICE_ACCOUNT}" \
  --project="${GCP_PROJECT_ID}" --format='value(email)' >/dev/null
gcloud artifacts repositories describe "${ARTIFACT_REGISTRY_REPOSITORY}" \
  --project="${GCP_PROJECT_ID}" --location="${GCP_REGION}" \
  --format='value(name)' >/dev/null
gcloud firestore databases describe \
  --project="${GCP_PROJECT_ID}" --database="${FIRESTORE_DATABASE_ID}" \
  --format='value(name)' >/dev/null
gcloud secrets describe "${GOOGLE_OAUTH_CLIENT_SECRET_NAME}" \
  --project="${GCP_PROJECT_ID}" --format='value(name)' >/dev/null

# The runtime service account must be able to read the brokered client secret,
# or sign-in fails only after the revision is already serving.
if ! gcloud secrets get-iam-policy "${GOOGLE_OAUTH_CLIENT_SECRET_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --flatten='bindings[].members[]' \
  --filter="bindings.role:roles/secretmanager.secretAccessor" \
  --format='value(bindings.members)' \
  | grep -Fxq "serviceAccount:${CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT}"; then
  printf 'Runtime service account lacks roles/secretmanager.secretAccessor on secret: %s\n' \
    "${GOOGLE_OAUTH_CLIENT_SECRET_NAME}" >&2
  exit 1
fi

if ! gcloud run regions list --project="${GCP_PROJECT_ID}" \
  --format='value(locationId)' | awk -v region="${GCP_REGION}" '$0 == region { found=1 } END { exit !found }'; then
  printf 'Cloud Run region is unavailable in this project: %s\n' "${GCP_REGION}" >&2
  exit 1
fi

required_services=(
  artifactregistry.googleapis.com
  cloudbuild.googleapis.com
  firestore.googleapis.com
  run.googleapis.com
  secretmanager.googleapis.com
  drive.googleapis.com
  sheets.googleapis.com
)
enabled_services="$(
  gcloud services list --enabled --project="${GCP_PROJECT_ID}" --format='value(config.name)'
)"
for service in "${required_services[@]}"; do
  grep -Fxq "${service}" <<< "${enabled_services}" || {
    printf 'Required API is not enabled: %s\n' "${service}" >&2
    exit 1
  }
done

printf 'Deployment preflight passed.\n'
printf '  active identity: %s\n' "${active_account}"
printf '  project: %s\n' "${GCP_PROJECT_ID}"
printf '  region: %s\n' "${GCP_REGION}"
printf '  Cloud Run service: %s\n' "${CLOUD_RUN_SERVICE}"
printf '  runtime service account: %s\n' "${CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT}"
printf '  Cloud Build service account: %s\n' "${CLOUD_BUILD_SERVICE_ACCOUNT}"

if [[ "${mode}" == "check" ]]; then
  printf 'No build submitted. Re-run with --deploy after reviewing these values.\n'
  exit 0
fi

oauth_client_ids_b64="$(printf '%s' "${GOOGLE_OAUTH_CLIENT_IDS}" | base64 | tr -d '\n')"
cors_origins_b64="$(printf '%s' "${CORS_ALLOWED_ORIGINS}" | base64 | tr -d '\n')"
release_sha="$(git -C "${repo_root}" rev-parse --verify HEAD 2>/dev/null || printf 'manual')"

gcloud builds submit "${repo_root}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --service-account="projects/${GCP_PROJECT_ID}/serviceAccounts/${CLOUD_BUILD_SERVICE_ACCOUNT}" \
  --config="${backend_dir}/cloudbuild.yaml" \
  --substitutions="_REGION=${GCP_REGION},_SERVICE=${CLOUD_RUN_SERVICE},_AR_REPOSITORY=${ARTIFACT_REGISTRY_REPOSITORY},_RUNTIME_SERVICE_ACCOUNT=${CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT},_FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_ID},_GOOGLE_OAUTH_CLIENT_IDS_B64=${oauth_client_ids_b64},_GOOGLE_OAUTH_TOKEN_CLIENT_ID=${GOOGLE_OAUTH_TOKEN_CLIENT_ID},_GOOGLE_CLIENT_SECRET_NAME=${GOOGLE_OAUTH_CLIENT_SECRET_NAME},_CORS_ALLOWED_ORIGINS_B64=${cors_origins_b64},_RELEASE_SHA=${release_sha}"
