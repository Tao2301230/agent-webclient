import React from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";

export const MentionSuggest: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();

	if (!state.mentionOpen || state.mentionSuggestions.length === 0) {
		return null;
	}

	return (
		<div className="mention-suggest" id="mention-suggest">
			<div className="mention-suggest-list">
				{state.mentionSuggestions.map((agent, index) => (
					<button
						key={agent.key}
						className={`mention-item ${index === state.mentionActiveIndex ? "active" : ""}`}
						onClick={() => {
							window.dispatchEvent(
								new CustomEvent("agent:select-mention", {
									detail: {
										agentKey: agent.key,
										agentName: agent.name || "",
									},
								}),
							);
							dispatch({ type: "SET_MENTION_OPEN", open: false });
						}}
					>
						<span className="mention-name">
							{agent.name || agent.key}
						</span>
					</button>
				))}
			</div>
		</div>
	);
};
