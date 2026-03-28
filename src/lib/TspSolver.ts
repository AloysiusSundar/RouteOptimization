export function optimizeRoute(
  coords: [number, number][],
  durations: number[][],
  places?: { reservation_time?: Date | null }[],
  fixedStart: boolean = false
): { optimizedCoords: [number, number][]; order: number[] } {
  const n = coords.length;
  if (n === 0) return { optimizedCoords: [], order: [] };
  if (n === 1) return { optimizedCoords: [coords[0]], order: [0] };

  // dp map -> key: "[mask],[node]", value: [cost, prevNode]
  const dp: Record<string, [number, number]> = {};

  if (fixedStart) {
    // Force start at index 0
    dp[`${1 << 0},0`] = [0, -1];
  } else {
    for (let i = 0; i < n; i++) {
      dp[`${1 << i},${i}`] = [0, -1];
    }
  }

  for (let size = 2; size <= n; size++) {
    // iterate over all subsets of size
    for (let mask = 1; mask < (1 << n); mask++) {
      if (countBits(mask) === size) {
        for (let j = 0; j < n; j++) {
          if ((mask & (1 << j)) === 0) continue;
          
          const prevMask = mask ^ (1 << j);
          
          // Topological Time-Constraint Check
          // Ensure we don't visit `j` (if it has a reservation) AFTER visiting any node that has a LATER reservation.
          let isValidTiming = true;
          if (places && places[j]?.reservation_time) {
            for (let x = 0; x < n; x++) {
              if ((prevMask & (1 << x)) !== 0 && places[x]?.reservation_time) {
                if (places[x]!.reservation_time! > places[j]!.reservation_time!) {
                  isValidTiming = false;
                  break;
                }
              }
            }
          }
          if (!isValidTiming) continue;
          
          let minCost = Infinity;
          let bestPrevNode = -1;

          for (let k = 0; k < n; k++) {
            if ((prevMask & (1 << k)) !== 0) {
              const key = `${prevMask},${k}`;
              if (dp[key]) {
                const cost = dp[key][0] + durations[k][j];
                if (cost < minCost) {
                  minCost = cost;
                  bestPrevNode = k;
                }
              }
            }
          }

          if (bestPrevNode !== -1) {
            dp[`${mask},${j}`] = [minCost, bestPrevNode];
          }
        }
      }
    }
  }

  const fullMask = (1 << n) - 1;
  let minCost = Infinity;
  let endNode = -1;

  for (let j = 0; j < n; j++) {
    const key = `${fullMask},${j}`;
    if (dp[key] && dp[key][0] < minCost) {
      minCost = dp[key][0];
      endNode = j;
    }
  }

  const path: number[] = [];
  let currentMask = fullMask;
  let currentNode = endNode;

  while (currentNode !== -1) {
    path.push(currentNode);
    const prevNode = dp[`${currentMask},${currentNode}`]?.[1] ?? -1;
    currentMask = currentMask ^ (1 << currentNode);
    currentNode = prevNode;
  }

  path.reverse();
  const optimizedCoords = path.map((i) => coords[i]);

  return { optimizedCoords, order: path };
}

function countBits(n: number): number {
  let count = 0;
  while (n > 0) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}
