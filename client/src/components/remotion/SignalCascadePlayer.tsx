import { Player } from "@remotion/player";
import { SignalCascadeComposition } from "./SignalCascade";

interface SignalCascadePlayerProps {
  className?: string;
}

export const SignalCascadePlayer = ({ className = "" }: SignalCascadePlayerProps) => {
  return (
    <div className={`w-full h-full ${className}`}>
      <Player
        component={SignalCascadeComposition}
        durationInFrames={90} // 3 seconds at 30fps
        fps={30}
        compositionWidth={1920}
        compositionHeight={1080}
        controls={false}
        autoPlay={true}
        loop={true}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "12px",
          overflow: "hidden"
        }}
      />
    </div>
  );
};

export default SignalCascadePlayer;
