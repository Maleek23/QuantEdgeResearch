import { Player } from "@remotion/player";
import { EngineConvergenceComposition } from "./EngineConvergenceVideo";

interface EngineConvergencePlayerProps {
  className?: string;
}

export function EngineConvergencePlayer({ className = "" }: EngineConvergencePlayerProps) {
  return (
    <div className={`relative ${className}`} data-testid="engine-convergence-player">
      <Player
        component={EngineConvergenceComposition}
        inputProps={{}}
        durationInFrames={600}
        compositionWidth={440}
        compositionHeight={440}
        fps={30}
        style={{
          width: "100%",
          height: "100%",
          background: "transparent"
        }}
        loop
        autoPlay
        controls={false}
      />
    </div>
  );
}

export default EngineConvergencePlayer;
