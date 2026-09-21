#!/usr/bin/env bash
set -euo pipefail

SERVICE="cloudy-ai-zoho-recruit"
REGION="us-central1"

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "ZOHO_ORG_ID=907042345" \
  --set-env-vars "ZOHO_ACCOUNTS_URL=https://accounts.zoho.com" \
  --set-env-vars "ZOHO_RECRUIT_API_URL=https://recruit.zoho.com/recruit/v2"

echo "Deployment command completed."
