# Skill: Firestore Pre-Computed Aggregation

## When to Use
When you need to serve derived/computed data from Firestore without expensive multi-document reads at query time. Classic pattern: "I have N raw data docs and need to serve a summary."

## Pattern

### Problem
Reading N historical docs on every request is O(N) reads = expensive + slow.

### Solution
Pre-compute aggregates on write. Store summary docs that are O(1) to read.

### Structure
```
rawData/{entityId}/daily/{date}          ← append-only raw data
aggregates/{entityId}/by{Dimension}/{key} ← pre-computed summaries
```

### Aggregation Trigger
Post-write in the same API route that creates raw data. No Cloud Functions needed at low-to-medium scale.

### Incremental Update Formula
```typescript
// Don't re-read all history. Update running stats:
newAvg = oldAvg + (newValue - oldAvg) / newCount;
```

### Decay for Time-Series
```typescript
weight = Math.pow(0.5, daysSinceDataPoint / halfLifeDays);
```

### Confidence Gating
Never serve aggregates below a minimum sample threshold. Better to show "no data" than wrong data.

## Key Decisions
- **Dimension choice matters:** Pick the strongest predictor (day-of-week for theme parks, hour-of-day for traffic, etc.)
- **Decay half-life:** Match the domain's change rate (30 days for seasonal businesses, 7 days for rapidly changing systems)
- **Threshold:** Set conservatively. Users trust "no data" more than "wrong data."
- **Non-breaking evolution:** Keep raw field unchanged, add metadata in sibling field.

## Anti-Patterns
- ❌ Computing aggregates on read (Firestore billing death)
- ❌ Using Cloud Functions for simple post-write logic at low scale (adds infra complexity)
- ❌ Blending/averaging with < 3 data points (statistically meaningless)
- ❌ Unbounded aggregate growth (always cap with rolling window or decay)
