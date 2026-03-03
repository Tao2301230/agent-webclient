import React, { useRef, useCallback, useEffect } from "react";
import { useAppState, useAppDispatch } from "../../app/context/AppContext";
import {
	DESKTOP_FIXED_BREAKPOINT,
	MOBILE_BREAKPOINT,
} from "../../app/context/constants";
import type { LayoutMode } from "../../app/context/constants";
import { AtmosphereLayer } from "./AtmosphereLayer";
import { TopNav } from "./TopNav";
import { BottomDock } from "./BottomDock";
import { LeftSidebar } from "../sidebar/LeftSidebar";
import { RightSidebar } from "../sidebar/RightSidebar";
import { DrawerOverlay } from "../sidebar/DrawerOverlay";
import { ConversationStage } from "../timeline/ConversationStage";
import { SettingsModal } from "../modal/SettingsModal";
import { ActionModal } from "../modal/ActionModal";
import { EventPopover } from "../modal/EventPopover";
import { FireworksCanvas } from "../effects/FireworksCanvas";
import { useChatActions } from "../../hooks/useChatActions";
import { useMessageActions } from "../../hooks/useMessageActions";
import { useActionRuntime } from "../../hooks/useActionRuntime";

function inferLayoutMode(width: number): LayoutMode {
	if (width >= DESKTOP_FIXED_BREAKPOINT) return "desktop-fixed";
	if (width >= MOBILE_BREAKPOINT) return "tablet-mixed";
	return "mobile-drawer";
}

export const AppShell: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const appRef = useRef<HTMLDivElement>(null);

	/* Initialize business logic hooks */
	useChatActions();
	useMessageActions();
	useActionRuntime();

	const layoutClass =
		state.layoutMode === "desktop-fixed"
			? "layout-desktop-fixed"
			: state.layoutMode === "tablet-mixed"
				? "layout-tablet-mixed"
				: "";

	/* Responsive layout detection */
	useEffect(() => {
		const handleResize = () => {
			const mode = inferLayoutMode(window.innerWidth);
			if (mode !== state.layoutMode) {
				dispatch({ type: "SET_LAYOUT_MODE", mode });
			}
		};
		handleResize();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [dispatch, state.layoutMode]);

	const showOverlay =
		(state.leftDrawerOpen || state.rightDrawerOpen) &&
		state.layoutMode === "mobile-drawer";

	return (
		<div
			ref={appRef}
			className={`app-shell ${layoutClass}`.trim()}
			id="app"
		>
			<AtmosphereLayer />
			<TopNav />
			<LeftSidebar />
			<ConversationStage />
			<RightSidebar />
			<BottomDock />
			{showOverlay && <DrawerOverlay />}
			{state.settingsOpen && <SettingsModal />}
			<ActionModal />
			<EventPopover />
			<FireworksCanvas />
		</div>
	);
};
