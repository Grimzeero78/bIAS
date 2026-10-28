#!/bin/bash
# PRODUCTION E2E — verify AI is live via Cloudflare Workers AI after redeploy.
# Flow: CEO login → job → candidate → CV upload → video manifest → poll → report
set -euo pipefail
BASE="https://truemerit.dev078.workers.dev"
JAR=/tmp/tm_prod_cookies.txt
ASSETS=/home/z/my-project/scripts/e2e
CEO_PASS="CEO-KEY-7Q4M-APEX-2026"

step () { echo; echo "━━━ $1 ━━━"; }

step "1. CEO login (production)"
LOGIN=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"password\":\"$CEO_PASS\"}")
echo "$LOGIN" | head -c 200; echo
echo "$LOGIN" | grep -q '"ok":true' || { echo "✗ login failed"; exit 1; }

step "2. Create verification job"
JOB=$(curl -s -b "$JAR" -X POST "$BASE/api/jobs" -H 'Content-Type: application/json' \
  -d '{"title":"AI Activation Check — Workers AI","description":"Post-deploy AI verification run","location":"Remote","employmentType":"FULL_TIME"}')
JOB_ID=$(echo "$JOB" | python3 -c "import sys,json; print(json.load(sys.stdin)['jobId'])")
echo "JOB_ID=$JOB_ID"

step "3. Register candidate (Grace Njeri)"
CAND=$(curl -s -b "$JAR" -X POST "$BASE/api/candidates" -H 'Content-Type: application/json' \
  -d "{\"jobId\":\"$JOB_ID\",\"fullName\":\"Grace Njeri\",\"email\":\"grace.njeri.aicheck@example.com\"}")
CAND_ID=$(echo "$CAND" | python3 -c "import sys,json; print(json.load(sys.stdin)['candidate']['id'])")
CODE=$(echo "$CAND" | python3 -c "import sys,json; print(json.load(sys.stdin)['candidate']['accessCode'])")
echo "CAND_ID=$CAND_ID  CODE=$CODE"

step "4. Upload CV (triggers CV analysis)"
curl -s -b "$JAR" -X POST "$BASE/api/upload" \
  -F "candidateId=$CAND_ID" -F "docType=CV" \
  -F "file=@$ASSETS/cv_grace_njeri.pdf;type=application/pdf" | head -c 300; echo

step "5. Upload video analysis manifest (triggers VIDEO analysis)"
python3 "$ASSETS/make_manifest.py" "$CAND_ID"
curl -s -b "$JAR" -X POST "$BASE/api/upload/manifest" \
  -H 'Content-Type: application/json' --data-binary "@$ASSETS/manifest_grace.json" | head -c 300; echo

step "6. Poll analysis status (up to 6 min)"
STATUS=""
for i in $(seq 1 90); do
  sleep 6
  S=$(curl -s -b "$JAR" "$BASE/api/analysis/$CAND_ID")
  CV=$(echo "$S" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cv',{}).get('status','?'))" 2>/dev/null || echo "?")
  VID=$(echo "$S" | python3 -c "import sys,json; print(json.load(sys.stdin).get('video',{}).get('status','?'))" 2>/dev/null || echo "?")
  echo "[$((i*6))s] cv=$CV video=$VID"
  if [[ "$CV$VID" =~ PENDING|PROCESSING ]]; then continue; fi
  STATUS="done"; break
done

step "7. Final analysis payload"
FINAL=$(curl -s -b "$JAR" "$BASE/api/analysis/$CAND_ID")
echo "$FINAL" | python3 -c "
import sys, json
d = json.load(sys.stdin)
cv, vid = d.get('cv', {}), d.get('video', {})
print('CV   status:', cv.get('status'), '| error:', (cv.get('error') or 'none')[:160])
print('VID  status:', vid.get('status'), '| error:', (vid.get('error') or 'none')[:160])
c = cv.get('result') or {}
if c:
    print('CV   scores:', json.dumps(c.get('scores', c.get('criteria', c)))[:500])
    print('CV   verdict:', str(c.get('verdict', c.get('summary','')))[:220])
v = vid.get('result') or {}
if v:
    print('VID  transcript:', str(v.get('transcript',''))[:200])
    print('VID  scores:', json.dumps(v.get('scores', v.get('criteria', v)))[:500])
if not c and not v: print('NO AI RESULTS PARSED')
"
echo "$FINAL" > /tmp/tm_prod_final.json

step "8. Candidate detail + ranking check"
DET=$(curl -s -b "$JAR" "$BASE/api/candidates/$CAND_ID")
echo "$DET" | head -c 400; echo

echo
echo "ACCESS_CODE=$CODE  CAND_ID=$CAND_ID  JOB_ID=$JOB_ID"
