"use client";

import { domainTheme } from "./domain-theme";
import { ESTIMATED_STAGES, traceToStages } from "./pipeline";

interface LaneData {
  domain: string;
  /** Real trace once the response has arrived; undefined while still processing. */
  trace?: string[];
}

const LANE_HEIGHT = 46;
const NODE_R = 5;
const LEFT_PAD = 90;
const RIGHT_PAD = 70;
const TOP_PAD = 16;

/**
 * Renders each classified domain as its own horizontal lane of stage-nodes,
 * converging into a single "synthesis" point -- a direct visual read of the
 * actual architecture (Domain Router -> N domains reasoning in parallel via
 * asyncio.gather -> merged response), not decorative chrome. While a
 * response is in flight, nodes fill in against ESTIMATED_STAGES (explicitly
 * an estimate); once real data lands, `trace` holds the backend's actual
 * agent_trace and every filled node reflects something that really ran.
 */
export function ReasoningLanes({ lanes, processing, filledCount }: { lanes: LaneData[]; processing: boolean; filledCount: number }) {
  if (lanes.length === 0) return null;

  const width = LEFT_PAD + ESTIMATED_STAGES.length * 62 + RIGHT_PAD;
  const height = TOP_PAD * 2 + lanes.length * LANE_HEIGHT;
  const synthesisX = width - RIGHT_PAD + 20;
  const synthesisY = height / 2;

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-3">
      <svg width={width} height={height} className="block" role="img" aria-label="Multi-domain reasoning pipeline">
        <defs>
          <radialGradient id="synthesisGlow">
            <stop offset="0%" stopColor="rgba(0,229,255,.55)" />
            <stop offset="100%" stopColor="rgba(0,229,255,0)" />
          </radialGradient>
        </defs>

        {/* Convergence lines from each lane's last node to the synthesis point */}
        {lanes.map((lane, laneIndex) => {
          const y = TOP_PAD + laneIndex * LANE_HEIGHT + LANE_HEIGHT / 2;
          const theme = domainTheme(lane.domain);
          const stages = lane.trace ? traceToStages(lane.trace) : ESTIMATED_STAGES;
          const lastX = LEFT_PAD + (stages.length - 1) * 62;
          const done = Boolean(lane.trace);
          return (
            <path
              key={`link-${lane.domain}`}
              d={`M${lastX},${y} C${lastX + 40},${y} ${synthesisX - 40},${synthesisY} ${synthesisX},${synthesisY}`}
              fill="none"
              stroke={theme.color}
              strokeWidth={1.5}
              strokeOpacity={done ? 0.55 : 0.15}
              strokeDasharray={done ? undefined : "3 4"}
            />
          );
        })}

        {/* Synthesis node */}
        <circle cx={synthesisX} cy={synthesisY} r={16} fill="url(#synthesisGlow)" />
        <circle
          cx={synthesisX}
          cy={synthesisY}
          r={7}
          fill="#050608"
          stroke={processing ? "#00e5ff" : "#37f29a"}
          strokeWidth={2}
          className={processing ? "animate-pulse" : ""}
        />

        {/* Lanes */}
        {lanes.map((lane, laneIndex) => {
          const y = TOP_PAD + laneIndex * LANE_HEIGHT + LANE_HEIGHT / 2;
          const theme = domainTheme(lane.domain);
          const stageLabels = lane.trace ? traceToStages(lane.trace).map((s) => s.label) : ESTIMATED_STAGES;
          const activeCount = lane.trace ? stageLabels.length : Math.min(filledCount, stageLabels.length);

          return (
            <g key={lane.domain}>
              <text x={0} y={y + 4} fontSize="11" fill={theme.color} fontWeight={600}>
                {theme.label}
              </text>
              {/* Baseline track */}
              <line
                x1={LEFT_PAD - 14}
                y1={y}
                x2={LEFT_PAD + (stageLabels.length - 1) * 62}
                y2={y}
                stroke="rgba(255,255,255,.08)"
                strokeWidth={2}
              />
              {stageLabels.map((label, stageIndex) => {
                const x = LEFT_PAD + stageIndex * 62;
                const filled = stageIndex < activeCount;
                const isCurrent = processing && !lane.trace && stageIndex === activeCount - 1;
                return (
                  <g key={`${lane.domain}-${stageIndex}`}>
                    <circle
                      cx={x}
                      cy={y}
                      r={isCurrent ? NODE_R + 2 : NODE_R}
                      fill={filled ? theme.color : "rgba(255,255,255,.12)"}
                      opacity={filled ? 1 : 0.5}
                      className={isCurrent ? "animate-pulse" : ""}
                    >
                      <title>{label}</title>
                    </circle>
                    {filled && (
                      <circle cx={x} cy={y} r={NODE_R + 5} fill="none" stroke={theme.color} strokeOpacity={0.25}>
                        {isCurrent && (
                          <animate attributeName="r" values={`${NODE_R + 3};${NODE_R + 9}`} dur="1.4s" repeatCount="indefinite" />
                        )}
                        {isCurrent && <animate attributeName="opacity" values="0.4;0" dur="1.4s" repeatCount="indefinite" />}
                      </circle>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
