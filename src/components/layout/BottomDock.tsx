import React from "react";
import { useAppState } from "../../app/context/AppContext";
import { ComposerArea } from "../composer/ComposerArea";
import { PlanPanel } from "../plan/PlanPanel";
import { FrontendToolContainer } from "../frontend-tool/FrontendToolContainer";

export const BottomDock: React.FC = () => {
	const state = useAppState();

	return (
		<div className="bottom-dock">
			<div
				className="bottom-dock-inner"
				style={{ maxWidth: "860px", margin: "0 auto" }}
			>
				{state.plan && <PlanPanel />}
				{state.activeFrontendTool && <FrontendToolContainer />}
				<ComposerArea />
			</div>
		</div>
	);
};
