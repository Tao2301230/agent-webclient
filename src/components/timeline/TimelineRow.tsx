import React from "react";
import type { TimelineNode } from "../../context/types";
import { UserBubble } from "./UserBubble";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolPill } from "./ToolPill";
import { ContentBlock } from "./ContentBlock";
import { SystemAlert } from "./SystemAlert";
import { MaterialIcon } from "../common/MaterialIcon";

interface TimelineRowProps {
	node: TimelineNode;
}

const NodeIcon: React.FC<{ kind: string; role?: string }> = ({
	kind,
	role,
}) => {
	let className = "node-icon";
	let iconName = "smart_toy";

	switch (kind) {
		case "thinking":
			className += " node-icon-thinking";
			iconName = "psychology";
			break;
		case "tool":
			className += " node-icon-tool";
			iconName = "build";
			break;
		case "content":
			className += " node-icon-content";
			iconName = "description";
			break;
		default:
			if (role === "system") {
				className += " node-icon-alert";
				iconName = "warning";
			} else {
				className += " node-icon-assistant";
				iconName = "smart_toy";
			}
	}

	return (
		<span className={className}>
			<MaterialIcon name={iconName} />
		</span>
	);
};

export const TimelineRow: React.FC<TimelineRowProps> = ({ node }) => {
	/* User messages */
	if (node.kind === "message" && node.role === "user") {
		return (
			<div
				className="timeline-row timeline-row-user"
				data-kind="message"
				data-role="user"
			>
				<UserBubble text={node.text || ""} />
			</div>
		);
	}

	/* System alerts */
	if (node.kind === "message" && node.role === "system") {
		return (
			<div
				className="timeline-row timeline-row-flow"
				data-kind="message"
				data-role="system"
			>
				<div className="timeline-marker">
					<NodeIcon kind="message" role="system" />
				</div>
				<div className="timeline-flow-content">
					<SystemAlert text={node.text || ""} />
				</div>
			</div>
		);
	}

	/* Thinking */
	if (node.kind === "thinking") {
		return (
			<div
				className="timeline-row timeline-row-flow"
				data-kind="thinking"
			>
				<div className="timeline-marker">
					<NodeIcon kind="thinking" />
				</div>
				<div className="timeline-flow-content">
					<ThinkingBlock node={node} />
				</div>
			</div>
		);
	}

	/* Tool */
	if (node.kind === "tool") {
		return (
			<div className="timeline-row timeline-row-flow" data-kind="tool">
				<div className="timeline-marker">
					<NodeIcon kind="tool" />
				</div>
				<div className="timeline-flow-content">
					<ToolPill node={node} />
				</div>
			</div>
		);
	}

	/* Content */
	if (node.kind === "content") {
		return (
			<div className="timeline-row timeline-row-flow" data-kind="content">
				<div className="timeline-marker">
					<NodeIcon kind="content" />
				</div>
				<div className="timeline-flow-content">
					<ContentBlock node={node} />
				</div>
			</div>
		);
	}

	/* Default assistant message */
	return (
		<div
			className="timeline-row timeline-row-flow"
			data-kind={node.kind}
			data-role={node.role}
		>
			<div className="timeline-marker">
				<NodeIcon kind={node.kind} role={node.role} />
			</div>
			<div className="timeline-flow-content">
				<ContentBlock node={node} />
			</div>
		</div>
	);
};
