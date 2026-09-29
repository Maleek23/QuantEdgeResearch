/**
 * MARKET tools — the terminal's market-focus overlay (Pulse / Rotation /
 * Session brief) had no trigger (IA N12 debt); its three views are tools now,
 * wrapping the same components in their expanded form. Each component
 * already stamps its own session/age, so the registry marks them ageInside.
 */
import { OracleMarketField } from '@/components/oracle/oracle-market-field';
import { RotationMap } from '@/components/rotation-map';
import { SessionBrief } from '@/components/oracle/session-brief';
import { useFocusSymbol } from '../../frame';

export function MarketPulseTool() {
  const [, setFocus] = useFocusSymbol();
  return <div className="fd-scroll fd-pad"><OracleMarketField expanded onSelectSymbol={setFocus} /></div>;
}
export function RotationMapTool() {
  return <div className="fd-scroll fd-pad"><RotationMap expanded /></div>;
}
export function SessionBriefTool() {
  const [, setFocus] = useFocusSymbol();
  return <div className="fd-scroll fd-pad"><SessionBrief expanded onSelectSymbol={setFocus} /></div>;
}
