import React from "react";
import type { TimelineNode } from "../../context/types";
import { useAppDispatch } from "../../context/AppContext";
import { MarkdownContent } from "../markdown/MarkdownContent";
import { ViewportEmbed } from "./ViewportEmbed";
import { MaterialIcon } from "../common/MaterialIcon";

interface ContentBlockProps {
	node: TimelineNode;
}

export const ContentBlock: React.FC<ContentBlockProps> = ({ node }) => {
	const dispatch = useAppDispatch();
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

				if (segment.kind === "ttsVoice") {
					const signature = segment.signature || "";
					const voiceBlock = node.ttsVoiceBlocks?.[signature];
					const expanded = Boolean(voiceBlock?.expanded);
					const status = String(voiceBlock?.status || "ready");
					const statusText = voiceBlock?.error
						? `error: ${voiceBlock.error}`
						: status;
					const blockText = String(
						voiceBlock?.text || segment.text || "",
					).trim();

					return (
						<section
							key={signature || idx}
							className="timeline-tts-voice"
						>
							<button
								type="button"
								className="tts-voice-pill"
								data-voice-status={status}
								aria-expanded={expanded}
								onClick={() => {
									const blocks = {
										...(node.ttsVoiceBlocks || {}),
									};
									if (!blocks[signature]) return;
									blocks[signature] = {
										...blocks[signature],
										expanded: !expanded,
									};
									dispatch({
										type: "SET_TIMELINE_NODE",
										id: node.id,
										node: {
											...node,
											ttsVoiceBlocks: blocks,
										},
									});
								}}
							>
								<span className="tts-voice-label">
									tts voice
								</span>
								<span className="tts-voice-status">
									{statusText}
								</span>
								<MaterialIcon
									name="chevron_right"
									className="chevron"
								/>
							</button>
							<div
								className={`tts-voice-detail ${expanded ? "is-open" : ""}`}
							>
								<div className="tts-voice-text">
									{blockText || "(empty)"}
								</div>
							</div>
						</section>
					);
				}

				return null;
			})}
		</div>
	);
};
