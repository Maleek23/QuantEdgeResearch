import { ResearchHub } from "@/components/research-hub";
import { AuroraBackground } from "@/components/aurora-background";

export default function ResearchHubPage() {
  return (
    <>
      <AuroraBackground />
      <div className="relative z-10">
        <ResearchHub />
      </div>
    </>
  );
}
