import React, { useState } from "react";
import type { TimelineNode } from "../../app/context/types";

interface ToolPillProps {
	node: TimelineNode;
}

export const ToolPill: React.FC<ToolPillProps> = ({ node }) => {
	const [expanded, setExpanded] = useState(false);

	const toolName = node.toolName || node.toolId || "tool";
	const status = node.status || "pending";

	return (
		<div>
			<button
				className="tool-pill"
				data-tool-status={status}
				onClick={() => setExpanded(!expanded)}
			>
				<span className="tool-status-dot" />
				<span>{toolName}</span>
			</button>

			<div className={`tool-detail ${expanded ? "is-open" : ""}`}>
				{node.description && (
					<div className="tool-section">
						<div className="tool-section-head">
							<span className="tool-section-title">
								DESCRIPTION
							</span>
						</div>
						<div className="tool-section-body">
							{node.description}
						</div>
					</div>
				)}

				{node.argsText && (
					<div className="tool-section">
						<div className="tool-section-head">
							<span className="tool-section-title">
								ARGUMENTS
							</span>
						</div>
						<pre className="tool-section-body is-code">
							{node.argsText}
						</pre>
					</div>
				)}

				{node.result && (
					<div className="tool-section">
						<div className="tool-section-head">
							<span className="tool-section-title">RESULT</span>
						</div>
						<pre
							className={`tool-section-body ${node.result.isCode ? "is-code" : ""}`}
						>
							{node.result.text}
						</pre>
					</div>
				)}
			</div>
		</div>
	);
};
