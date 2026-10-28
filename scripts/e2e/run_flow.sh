#!/bin/bash
# E2E API flow: login → add candidates → upload CV+video → wait for AI → evaluate → ranking
set -e
BASE="http://localhost:3000"
JAR=/home/z/my-project/scripts/e2e/cookies.txt
ASSETS=/home/z/my-project/scripts/e2e
cd "$ASSETS"

step () { echo; echo "━━━ $1 ━━━"; }

step "1. Admin login"
curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@recruit.ai","password":"admin123"}' | head -c 300; echo

step "2. Get demo job id"
JOB_ID=$(curl -s -b "$JAR" "$BASE/api/jobs" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['jobs'][0]['id'])")
echo "JOB_ID=$JOB_ID"

step "3. Add two candidates"
GRACE=$(curl -s -b "$JAR" -X POST "$BASE/api/candidates" -H 'Content-Type: application/json' \
  -d "{\"jobId\":\"$JOB_ID\",\"fullName\":\"Grace Njeri\",\"email\":\"grace.njeri@example.com\",\"phone\":\"+254712345678\"}")
echo "$GRACE"
GRACE_ID=$(echo "$GRACE" | python3 -c "import sys,json; print(json.load(sys.stdin)['candidate']['id'])")
GRACE_CODE=$(echo "$GRACE" | python3 -c "import sys,json; print(json.load(sys.stdin)['candidate']['accessCode'])")

BRIAN=$(curl -s -b "$JAR" -X POST "$BASE/api/candidates" -H 'Content-Type: application/json' \
  -d "{\"jobId\":\"$JOB_ID\",\"fullName\":\"Brian Otto\",\"email\":\"brian.otto@example.com\"}")
echo "$BRIAN"
BRIAN_ID=$(echo "$BRIAN" | python3 -c "import sys,json; print(json.load(sys.stdin)['candidate']['id'])")
BRIAN_CODE=$(echo "$BRIAN" | python3 -c "import sys,json; print(json.load(sys.stdin)['candidate']['accessCode'])")

step "4. Upload CVs + videos"
curl -s -b "$JAR" -X POST "$BASE/api/upload" -F "candidateId=$GRACE_ID" -F "docType=CV" -F "file=@cv_grace_njeri.pdf" | head -c 200; echo
curl -s -b "$JAR" -X POST "$BASE/api/upload" -F "candidateId=$BRIAN_ID" -F "docType=CV" -F "file=@cv_brian_otto.pdf" | head -c 200; echo
curl -s -b "$JAR" -X POST "$BASE/api/upload" -F "candidateId=$GRACE_ID" -F "docType=VIDEO" -F "file=@video_grace.mp4" | head -c 200; echo
curl -s -b "$JAR" -X POST "$BASE/api/upload" -F "candidateId=$BRIAN_ID" -F "docType=VIDEO" -F "file=@video_brian.mp4" | head -c 200; echo

step "5. Poll analyses (up to 6 min)"
for i in $(seq 1 60); do
  sleep 6
  S=$(curl -s -b "$JAR" "$BASE/api/analysis/$GRACE_ID")
  G_CV=$(echo "$S" | python3 -c "import sys,json; print(json.load(sys.stdin)['cv']['status'])")
  G_VID=$(echo "$S" | python3 -c "import sys,json; print(json.load(sys.stdin)['video']['status'])")
  S2=$(curl -s -b "$JAR" "$BASE/api/analysis/$BRIAN_ID")
  B_CV=$(echo "$S2" | python3 -c "import sys,json; print(json.load(sys.stdin)['cv']['status'])")
  B_VID=$(echo "$S2" | python3 -c "import sys,json; print(json.load(sys.stdin)['video']['status'])")
  echo "[$((i*6))s] grace(cv=$G_CV,video=$G_VID) brian(cv=$B_CV,video=$B_VID)"
  if [[ "$G_CV$G_VID$B_CV$B_VID" =~ PENDING|PROCESSING ]]; then continue; else break; fi
done

step "6. Compute ranking"
curl -s -b "$JAR" -X POST "$BASE/api/jobs/$JOB_ID/evaluate" | head -c 200; echo

step "7. Final ranking"
curl -s -b "$JAR" "$BASE/api/jobs/$JOB_ID" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Weighting: CV', d['job']['cvWeight'], '% / Video', d['job']['videoWeight'], '%')
for c in d['candidates']:
    ev = c['evaluation']
    if ev:
        print(f\"#{ev['rank']} {c['fullName']}: final={ev['finalScore']} (cv={ev['cvScore']}, video={ev['videoScore']})\")
        print('   WHY:', (ev['justification'] or '')[:220].replace(chr(10),' '))
    else:
        print(f\"  - {c['fullName']}: not evaluated (cv={c['cv']['status'] if c['cv'] else None}, video={c['video']['status'] if c['video'] else None})\")
    if c['video'] and c['video'].get('observations'):
        print('   observations:', len(c['video']['observations']), 'first:', c['video']['observations'][0])
    if c['video'] and c['video'].get('transcript'):
        print('   transcript head:', c['video']['transcript'][:80].replace(chr(10),' '))
"

step "8. Candidate portal login (Grace) + audit tail"
curl -s -c cand_jar.txt -X POST "$BASE/api/auth/candidate" -H 'Content-Type: application/json' \
  -d "{\"email\":\"grace.njeri@example.com\",\"accessCode\":\"$GRACE_CODE\"}" | head -c 200; echo
curl -s -b "$JAR" "$BASE/api/audit?limit=15" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for e in d['entries'][:15]: print(e['createdAt'][11:19], e['actorRole'], e['action'])
"

echo "$GRACE_ID" > grace_id.txt; echo "$BRIAN_ID" > brian_id.txt
echo "$GRACE_CODE" > grace_code.txt; echo "$BRIAN_CODE" > brian_code.txt
echo "$JOB_ID" > job_id.txt
echo; echo "E2E DONE"
