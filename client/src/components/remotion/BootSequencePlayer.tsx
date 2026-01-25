import { Player } from "@remotion/player";
import { BootSequenceComposition } from "./BootSequence";
import { useEffect, useState } from "react";

interface BootSequencePlayerProps {
  onComplete?: () => void;
  autoPlay?: boolean;
  className?: string;
}

export const BootSequencePlayer = ({
  onComplete,
  autoPlay = true,
  className = ""
}: BootSequencePlayerProps) => {
  // Check URL params on mount
  const urlParams = new URLSearchParams(window.location.search);
  const forceBoot = urlParams.get('boot') === 'true';

  // Clear sessionStorage if boot is forced
  if (forceBoot) {
    sessionStorage.removeItem("quantedge_boot_seen");
  }

  const [hasPlayed, setHasPlayed] = useState(() => {
    // TEMPORARY: Always show boot sequence for testing
    // TODO: Re-enable sessionStorage caching later
    return false;

    // Only check sessionStorage if not forcing boot
    // if (forceBoot) return false;
    // return !!sessionStorage.getItem("quantedge_boot_seen");
  });

  useEffect(() => {
    // If already seen and not forcing, skip to complete
    if (hasPlayed) {
      setTimeout(() => onComplete?.(), 100);
    }
  }, [hasPlayed, onComplete]);

  const handleEnded = () => {
    // TEMPORARY: Disabled sessionStorage for testing
    // sessionStorage.setItem("quantedge_boot_seen", "true");
    setHasPlayed(true);
    onComplete?.();
  };

  // If already played this session, don't render
  if (hasPlayed) return null;

  return (
    <div className={`w-full h-full ${className}`}>
      <Player
        component={BootSequenceComposition}
        durationInFrames={210} // 7 seconds at 30fps (faster)
        fps={30}
        compositionWidth={1920}
        compositionHeight={1080}
        controls={false}
        autoPlay={autoPlay}
        loop={false}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#020617"
        }}
        onEnded={handleEnded}
      />
    </div>
  );
};

export default BootSequencePlayer;
