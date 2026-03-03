import React, { useState } from "react";
import type { TimelineNode } from "../../app/context/types";

interface ThinkingBlockProps {
	node: TimelineNode;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ node }) => {
	const [expanded, setExpanded] = useState(node.expanded ?? false);

	const text = node.text || "";
	const isLoading = node.status === "running" || node.status === "streaming";

	return (
		<div>
			<button
				className={`thinking-trigger ${expanded ? "is-open" : ""}`}
				onClick={() => setExpanded(!expanded)}
			>
				<span className="chevron">▸</span>
				{isLoading ? "思考中..." : "思考过程"}
			</button>
			<div className={`thinking-detail ${expanded ? "is-open" : ""}`}>
				{text}
			</div>
		</div>
	);
};
