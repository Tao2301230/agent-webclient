import React, { useMemo } from "react";
import type { TimelineNode } from "../../app/context/types";
import { MarkdownContent } from "../markdown/MarkdownContent";
import { ViewportEmbed } from "./ViewportEmbed";

interface ContentBlockProps {
	node: TimelineNode;
}

export const ContentBlock: React.FC<ContentBlockProps> = ({ node }) => {
	const text = node.text || "";

	const segments = node.segments;
	const hasViewport = segments?.some((s) => s.kind === "viewport");

	/* Simple case: no viewport, just markdown */
	if (!hasViewport) {
		return (
			<div className="timeline-content-stack">
				<div className="timeline-text timeline-markdown">
					<MarkdownContent content={text} />
				</div>
			</div>
		);
	}

	/* With viewport segments */
	return (
		<div className="timeline-content-stack">
			{segments?.map((segment, idx) => {
				if (segment.kind === "text") {
					return (
						<div
							key={idx}
							className="timeline-text timeline-markdown"
						>
							<MarkdownContent content={segment.text || ""} />
						</div>
					);
				}

				if (segment.kind === "viewport") {
					return (
						<ViewportEmbed
							key={segment.signature || idx}
							viewportKey={segment.key || ""}
							signature={segment.signature || ""}
							payload={segment.payload}
							payloadRaw={segment.payloadRaw}
						/>
					);
				}

				return null;
			})}
		</div>
	);
};
