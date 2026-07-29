import type { AppConfig, UserSession } from "../../domain/app";
import type { Membership } from "../../domain/onboarding";
import {
  TeamSetupPane,
  TeamSetupUnavailable
} from "./TeamSetupViews";
import { useTeamSetupController } from "./useTeamSetupController";

export interface TeamSetupPanelProps {
  config: AppConfig;
  session: UserSession;
  membership: Membership | null;
  onChange: (nextConfig: AppConfig) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function TeamSetupPanel(props: TeamSetupPanelProps) {
  const controller = useTeamSetupController(props);
  return controller.available ? (
    <TeamSetupPane controller={controller} />
  ) : (
    <TeamSetupUnavailable controller={controller} />
  );
}
