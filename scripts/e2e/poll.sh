#!/bin/bash
# Poll analysis status for both candidates until done
JAR=/tmp/j.txt
BASE=http://localhost:3000
G=cmvrv1lyk0003snmoh8bpqz6q
B=cmvrv1m0a000asnmorxgph7dn
for i in $(seq 1 50); do
  sleep 6
  S=$(curl -s -b $JAR "$BASE/api/analysis/$G")
  G_CV=$(echo "$S" | python3 -c "import sys,json; print(json.load(sys.stdin)['cv']['status'])" 2>/dev/null || echo "?")
  G_VID=$(echo "$S" | python3 -c "import sys,json; print(json.load(sys.stdin)['video']['status'])" 2>/dev/null || echo "?")
  S2=$(curl -s -b $JAR "$BASE/api/analysis/$B")
  B_CV=$(echo "$S2" | python3 -c "import sys,json; print(json.load(sys.stdin)['cv']['status'])" 2>/dev/null || echo "?")
  B_VID=$(echo "$S2" | python3 -c "import sys,json; print(json.load(sys.stdin)['video']['status'])" 2>/dev/null || echo "?")
  echo "[$((i*6))s] grace(cv=$G_CV,video=$G_VID) brian(cv=$B_CV,video=$B_VID)"
  if [[ "$G_CV$G_VID$B_CV$B_VID" =~ PENDING|PROCESSING ]]; then continue; else break; fi
done
