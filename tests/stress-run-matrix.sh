#!/bin/bash
# EmoBar Stress Test Matrix Runner
# Runs all model × effort × run combinations sequentially.
# Skips runs that already have complete results (7 scenarios).
#
# Usage: bash tests/stress-run-matrix.sh [2>&1 | tee tests/stress-results/matrix.log]

cd "$(dirname "$0")/.." || exit 1

MODELS=("opus" "sonnet" "haiku")
EFFORTS=("default" "high")
RUNS=3
EXPECTED_SCENARIOS=9

TOTAL=$((${#MODELS[@]} * ${#EFFORTS[@]} * RUNS))
CURRENT=0
SKIPPED=0
STARTED=$(date +%s)

echo "=============================================="
echo "  EmoBar Stress Test Matrix"
echo "  Models: ${MODELS[*]}"
echo "  Efforts: ${EFFORTS[*]}"
echo "  Runs per config: $RUNS"
echo "  Total configs: $TOTAL"
echo "  Started: $(date)"
echo "=============================================="
echo ""

for model in "${MODELS[@]}"; do
  for effort in "${EFFORTS[@]}"; do
    for run in $(seq 1 $RUNS); do
      CURRENT=$((CURRENT + 1))

      # Check if this run already has complete results
      RESULT_FILE="tests/stress-results/${model}-${effort}-run${run}.json"
      if [ -f "$RESULT_FILE" ]; then
        SCENARIO_COUNT=$(node -e "const d=JSON.parse(require('fs').readFileSync('$RESULT_FILE','utf-8')); console.log(d.scenarios?.length??0)" 2>/dev/null)
        if [ "$SCENARIO_COUNT" = "$EXPECTED_SCENARIOS" ]; then
          echo "  [$CURRENT/$TOTAL] ${model}/${effort}/run${run} — SKIP (already complete: ${SCENARIO_COUNT} scenarios)"
          SKIPPED=$((SKIPPED + 1))
          continue
        else
          echo "  [$CURRENT/$TOTAL] ${model}/${effort}/run${run} — RESUME (partial: ${SCENARIO_COUNT}/${EXPECTED_SCENARIOS} scenarios)"
        fi
      fi

      ELAPSED=$(( $(date +%s) - STARTED ))
      DONE=$((CURRENT - SKIPPED))
      if [ $DONE -gt 1 ]; then
        ETA_MIN=$(( ELAPSED * (TOTAL - CURRENT) / (DONE - 1) / 60 ))
      else
        ETA_MIN="?"
      fi

      echo ""
      echo "======================================================"
      echo "  [$CURRENT/$TOTAL] model=$model effort=$effort run=$run"
      echo "  Elapsed: $((ELAPSED/60))m${ELAPSED}s | ETA: ~${ETA_MIN}min"
      echo "======================================================"

      ARGS=(--model "$model" --runs 1 --run-start "$run")
      if [ "$effort" != "default" ]; then
        ARGS+=(--effort "$effort")
      fi

      npx tsx tests/stress-playbook.ts "${ARGS[@]}"
      EXIT_CODE=$?

      if [ $EXIT_CODE -ne 0 ]; then
        echo "  [WARN] Run exited with code $EXIT_CODE"
      fi

      echo "  Completed: $(date)"
    done
  done
done

TOTAL_TIME=$(( $(date +%s) - STARTED ))
echo ""
echo "=============================================="
echo "  Matrix complete!"
echo "  Ran: $((TOTAL - SKIPPED))  Skipped: $SKIPPED"
echo "  Total time: $((TOTAL_TIME / 60))m $((TOTAL_TIME % 60))s"
echo "  Results in: tests/stress-results/"
echo "=============================================="
echo ""
echo "Run comparison: npx tsx tests/stress-compare.ts"
