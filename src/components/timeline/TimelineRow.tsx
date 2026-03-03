import React from "react";
import type { TimelineNode } from "../../app/context/types";
import { UserBubble } from "./UserBubble";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolPill } from "./ToolPill";
import { ContentBlock } from "./ContentBlock";
import { SystemAlert } from "./SystemAlert";

interface TimelineRowProps {
	node: TimelineNode;
}

const NodeIcon: React.FC<{ kind: string; role?: string }> = ({
	kind,
	role,
}) => {
	let className = "node-icon";
	let svg: React.ReactNode;

	switch (kind) {
		case "thinking":
			className += " node-icon-thinking";
			svg = (
				<svg viewBox="0 0 24 24">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
			);
			break;
		case "tool":
			className += " node-icon-tool";
			svg = (
				<svg viewBox="0 0 24 24">
					<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.77 3.77z" />
				</svg>
			);
			break;
		case "content":
			className += " node-icon-content";
			svg = (
				<svg viewBox="0 0 24 24">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
					<line x1="16" y1="13" x2="8" y2="13" />
					<line x1="16" y1="17" x2="8" y2="17" />
				</svg>
			);
			break;
		default:
			className += " node-icon-assistant";
			svg = (
				<svg viewBox="0 0 24 24">
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
				</svg>
			);
	}

	return <span className={className}>{svg}</span>;
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
