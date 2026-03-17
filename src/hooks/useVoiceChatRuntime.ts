import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAppContext } from "../context/AppContext";
import type {
	AppState,
	TimelineNode,
	VoiceCapabilities,
	VoiceOption,
} from "../context/types";
import {
	getVoiceCapabilitiesFlexible,
	getVoiceVoicesFlexible,
} from "../lib/apiClient";
import { parseContentSegments } from "../lib/contentSegments";
import { resolveCurrentWorkerSummary } from "../lib/currentWorker";
import {
	bytesToBase64,
	DEFAULT_VOICE_CHAT_SEND_PAUSE_MS,
	mergeVoiceChatUtterance,
	normalizeVoiceChatUtteranceForLength,
	PcmQueuePlayer,
	ReadyCuePlayer,
	describeVoiceChatWsTarget,
	resolveVoiceChatWsUrl,
} from "../lib/voiceChatAudio";
import {
	cleanupVoiceAudioCapture,
	createVoiceAudioCaptureState,
	flushVoiceAudioCaptureRemainder,
	initializeVoiceAudioCapture,
	type VoiceAudioCaptureState,
} from "../lib/voiceAudioCapture";
import {
	buildVoiceAsrStartPayload,
	buildVoiceAsrStopFrames,
	resolveVoiceAsrRuntimeConfig,
} from "../lib/voiceAsrProtocol";
import { runVoiceChatListeningReady } from "../lib/voiceChatListeningReady";

const QA_ASR_TASK_ID = "qa-asr";
const QA_TTS_TASK_ID = "qa-tts";
const MAX_VOICE_WS_RECONNECT_ATTEMPTS = 4;
const VOICE_WS_RECONNECT_BASE_DELAY_MS = 600;

type VoiceTaskEvent = {
	type: string;
	taskId?: string;
	message?: string;
	code?: string;
	reason?: string;
	text?: string;
	chatId?: string;
	sampleRate?: number;
	channels?: number;
	seq?: number;
	byteLength?: number;
	websocketPath?: string;
};

function formatVoiceSocketClose(event: CloseEvent | Event | undefined): string {
	if (!event || typeof event !== "object" || !("code" in event)) {
		return "语音 WebSocket 已关闭";
	}
	const closeEvent = event as CloseEvent;
	const code = Number(closeEvent.code) || 0;
	const reason = String(closeEvent.reason || "").trim();
	const clean = closeEvent.wasClean ? "clean" : "unclean";
	return reason
		? `语音 WebSocket 已关闭 (code=${code}, reason=${reason}, ${clean})`
		: `语音 WebSocket 已关闭 (code=${code}, ${clean})`;
}

function ensureVoiceOptions(data: unknown): VoiceOption[] {
	const payload = data as { voices?: unknown };
	const voices = Array.isArray(payload?.voices) ? payload.voices : [];
	return voices
		.map((item) => {
			const record = item as Record<string, unknown>;
			return {
				id: String(record.id || "").trim(),
				displayName: String(record.displayName || record.id || "").trim(),
				provider: String(record.provider || "").trim(),
				default: Boolean(record.default),
			};
		})
		.filter((item) => item.id);
}

function resolveDefaultVoice(
	voices: VoiceOption[],
	currentVoice: string,
	defaultVoiceId: unknown,
): string {
	const current = String(currentVoice || "").trim();
	if (current && voices.some((item) => item.id === current)) {
		return current;
	}
	const preferred = String(defaultVoiceId || "").trim();
	if (preferred && voices.some((item) => item.id === preferred)) {
		return preferred;
	}
	return voices.find((item) => item.default)?.id || voices[0]?.id || "";
}

export function useVoiceChatRuntime() {
	const { state, dispatch, stateRef } = useAppContext();
	const currentWorker = useMemo(
		() => resolveCurrentWorkerSummary(state),
		[state],
	);

	const socketRef = useRef<WebSocket | null>(null);
	const socketPromiseRef = useRef<Promise<WebSocket> | null>(null);
	const expectedCloseRef = useRef(false);
	const startedAgentKeyRef = useRef("");
	const pendingBinaryRef = useRef<
		Array<{ taskId: string; seq: number }>
	>([]);
	const pendingUtteranceRef = useRef("");
	const flushTimerRef = useRef<number | null>(null);
	const assistantNodeIdRef = useRef("");
	const assistantContentIdRef = useRef("");
	const ttsSampleRateRef = useRef(24000);
	const ttsChannelsRef = useRef(1);
	const capturePausedRef = useRef(false);
	const turnCounterRef = useRef(0);
	const playerRef = useRef(new PcmQueuePlayer());
	const readyCuePlayerRef = useRef(new ReadyCuePlayer());
	const audioCaptureStateRef = useRef<VoiceAudioCaptureState>(
		createVoiceAudioCaptureState(),
	);
	const asrChunkCounterRef = useRef(0);
	const listeningTransitionRef = useRef(0);
	const reconnectTimerRef = useRef<number | null>(null);
	const reconnectAttemptRef = useRef(0);
	const reconnectInFlightRef = useRef(false);
	const asrTaskActiveRef = useRef(false);
	const asrStartInFlightRef = useRef(false);
	const asrRestartPendingRef = useRef(false);
	const ttsTaskActiveRef = useRef(false);
	const scheduleVoiceReconnectRef = useRef<(reason: string) => void>(() => undefined);

	const appendDebug = useCallback(
		(line: string) => {
			dispatch({ type: "APPEND_DEBUG", line: `[voice-chat] ${line}` });
		},
		[dispatch],
	);

	const patchVoiceChat = useCallback(
		(patch: Partial<AppState["voiceChat"]>) => {
			dispatch({ type: "PATCH_VOICE_CHAT", patch });
		},
		[dispatch],
	);

	const clearFlushTimer = useCallback(() => {
		if (flushTimerRef.current != null) {
			window.clearTimeout(flushTimerRef.current);
			flushTimerRef.current = null;
		}
	}, []);

	const clearReconnectTimer = useCallback(() => {
		if (reconnectTimerRef.current != null) {
			window.clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = null;
		}
	}, []);

	const resetAssistantRefs = useCallback(() => {
		assistantNodeIdRef.current = "";
		assistantContentIdRef.current = "";
	}, []);

	const cancelListeningTransition = useCallback(() => {
		listeningTransitionRef.current += 1;
	}, []);

	const stopSocket = useCallback(() => {
		socketPromiseRef.current = null;
		const socket = socketRef.current;
		if (!socket) return;
		expectedCloseRef.current = true;
		try {
			if (
				socket.readyState === WebSocket.OPEN ||
				socket.readyState === WebSocket.CONNECTING
			) {
				socket.close(1000, "voice chat reset");
			}
		} catch {
			/* no-op */
		}
		socketRef.current = null;
	}, []);

	const isVoiceRecoveryEligible = useCallback(() => {
		const worker = resolveCurrentWorkerSummary(stateRef.current);
		return (
			stateRef.current.inputMode === "voice" &&
			worker?.type === "agent" &&
			!stateRef.current.activeFrontendTool &&
			!stateRef.current.streaming
		);
	}, [stateRef]);

	const resetVoiceSession = useCallback(
		(options: {
			keepCapabilities?: boolean;
			keepVoices?: boolean;
			forceTextMode?: boolean;
		} = {}) => {
			clearFlushTimer();
			clearReconnectTimer();
			cancelListeningTransition();
			pendingBinaryRef.current = [];
			pendingUtteranceRef.current = "";
			startedAgentKeyRef.current = "";
			capturePausedRef.current = false;
			reconnectAttemptRef.current = 0;
			reconnectInFlightRef.current = false;
			asrTaskActiveRef.current = false;
			asrStartInFlightRef.current = false;
			asrRestartPendingRef.current = false;
			ttsTaskActiveRef.current = false;
			resetAssistantRefs();
			playerRef.current.stopAll();
			readyCuePlayerRef.current.stop();
			cleanupVoiceAudioCapture(audioCaptureStateRef.current);
			stopSocket();
			asrChunkCounterRef.current = 0;
			patchVoiceChat({
				status: "idle",
				sessionActive: false,
				partialUserText: "",
				partialAssistantText: "",
				error: "",
				wsStatus: "idle",
				currentAgentKey: "",
				currentAgentName: "",
				capabilities:
					options.keepCapabilities === false
						? null
						: stateRef.current.voiceChat.capabilities,
				capabilitiesLoaded:
					options.keepCapabilities === false
						? false
						: stateRef.current.voiceChat.capabilitiesLoaded,
				capabilitiesError:
					options.keepCapabilities === false
						? ""
						: stateRef.current.voiceChat.capabilitiesError,
				voices:
					options.keepVoices === false
						? []
						: stateRef.current.voiceChat.voices,
				voicesLoaded:
					options.keepVoices === false
						? false
						: stateRef.current.voiceChat.voicesLoaded,
				voicesError:
					options.keepVoices === false
						? ""
						: stateRef.current.voiceChat.voicesError,
				selectedVoice:
					options.keepVoices === false
						? ""
						: stateRef.current.voiceChat.selectedVoice,
			});
			if (options.forceTextMode) {
				dispatch({ type: "SET_INPUT_MODE", mode: "text" });
			}
		},
		[
			clearFlushTimer,
			clearReconnectTimer,
			cancelListeningTransition,
			dispatch,
			patchVoiceChat,
			resetAssistantRefs,
			stateRef,
			stopSocket,
		],
	);

	const upsertChatSummary = useCallback(
		(content: string) => {
			const chatId = String(stateRef.current.chatId || "").trim();
			const agentKey = String(
				stateRef.current.voiceChat.currentAgentKey || "",
			).trim();
			if (!chatId || !agentKey) return;
			dispatch({
				type: "SET_CHAT_AGENT_BY_ID",
				chatId,
				agentKey,
			});
			dispatch({
				type: "UPSERT_CHAT",
				chat: {
					chatId,
					chatName:
						stateRef.current.voiceChat.currentAgentName ||
						stateRef.current.chats.find(
							(chat) => chat.chatId === chatId,
						)?.chatName,
					firstAgentKey: agentKey,
					firstAgentName:
						stateRef.current.voiceChat.currentAgentName || agentKey,
					agentKey,
					lastRunContent: content,
					updatedAt: Date.now(),
				},
			});
		},
		[dispatch, stateRef],
	);

	const updateAssistantNode = useCallback(
		(text: string, status: TimelineNode["status"] = "running") => {
			const nodeId = assistantNodeIdRef.current;
			const contentId = assistantContentIdRef.current;
			if (!nodeId || !contentId) return;
			const current = stateRef.current.timelineNodes.get(nodeId);
			const nextNode: TimelineNode = {
				id: nodeId,
				kind: "content",
				contentId,
				text,
				segments: parseContentSegments(contentId, text),
				status,
				ts: current?.ts || Date.now(),
			};
			dispatch({ type: "SET_TIMELINE_NODE", id: nodeId, node: nextNode });
		},
		[dispatch, stateRef],
	);

	const createTurnNodes = useCallback(
		(userText: string) => {
			const suffix = `${Date.now()}_${turnCounterRef.current++}`;
			const userNodeId = `voice_user_${suffix}`;
			const contentId = `voice_content_${suffix}`;
			const assistantNodeId = `voice_node_${suffix}`;
			const now = Date.now();

			dispatch({
				type: "SET_TIMELINE_NODE",
				id: userNodeId,
				node: {
					id: userNodeId,
					kind: "message",
					role: "user",
					text: userText,
					ts: now,
				},
			});
			dispatch({ type: "APPEND_TIMELINE_ORDER", id: userNodeId });

			dispatch({
				type: "SET_TIMELINE_NODE",
				id: assistantNodeId,
				node: {
					id: assistantNodeId,
					kind: "content",
					contentId,
					text: "",
					segments: [],
					status: "running",
					ts: now,
				},
			});
			dispatch({ type: "APPEND_TIMELINE_ORDER", id: assistantNodeId });
			dispatch({
				type: "SET_CONTENT_NODE_BY_ID",
				contentId,
				nodeId: assistantNodeId,
			});

			assistantNodeIdRef.current = assistantNodeId;
			assistantContentIdRef.current = contentId;
		},
		[dispatch],
	);

	const handleFatalError = useCallback(
		(message: string) => {
			appendDebug(message);
			clearReconnectTimer();
			cancelListeningTransition();
			reconnectAttemptRef.current = 0;
			reconnectInFlightRef.current = false;
			asrTaskActiveRef.current = false;
			asrStartInFlightRef.current = false;
			asrRestartPendingRef.current = false;
			ttsTaskActiveRef.current = false;
			patchVoiceChat({
				status: "error",
				error: message,
				sessionActive: false,
				wsStatus: socketRef.current ? stateRef.current.voiceChat.wsStatus : "error",
			});
			playerRef.current.stopAll();
			cleanupVoiceAudioCapture(audioCaptureStateRef.current);
			stopSocket();
			startedAgentKeyRef.current = "";
			asrChunkCounterRef.current = 0;
		},
		[
			appendDebug,
			clearReconnectTimer,
			cancelListeningTransition,
			patchVoiceChat,
			stateRef,
			stopSocket,
		],
	);

	const sendJson = useCallback((payload: Record<string, unknown>) => {
		const socket = socketRef.current;
		if (socket == null || socket.readyState !== WebSocket.OPEN) {
			return false;
		}
		socket.send(JSON.stringify(payload));
		return true;
	}, []);

	const resolveCurrentAsrRuntime = useCallback(
		(capabilities?: VoiceCapabilities | null) =>
			resolveVoiceAsrRuntimeConfig(
				capabilities ?? stateRef.current.voiceChat.capabilities,
				stateRef.current.voiceChat.clientGate,
				stateRef.current.voiceChat.clientGateCustomized,
			),
		[stateRef],
	);

	const startAsrTask = useCallback(
		(reason: string) => {
			if (asrTaskActiveRef.current || asrStartInFlightRef.current) {
				return true;
			}
			const runtimeConfig = resolveCurrentAsrRuntime();
			const sent = sendJson(
				buildVoiceAsrStartPayload(
					QA_ASR_TASK_ID,
					runtimeConfig.asrDefaults,
				),
			);
			if (!sent) {
				return false;
			}
			asrTaskActiveRef.current = false;
			asrStartInFlightRef.current = true;
			asrRestartPendingRef.current = false;
			asrChunkCounterRef.current = 0;
			appendDebug(`sent asr.start (${reason})`);
			return true;
		},
		[appendDebug, resolveCurrentAsrRuntime, sendJson],
	);

	const ensureAudioCapture = useCallback(async () => {
		if (capturePausedRef.current) return false;
		const runtimeConfig = resolveCurrentAsrRuntime();
		return initializeVoiceAudioCapture(
			audioCaptureStateRef.current,
			(chunk) => {
				const sent = sendJson({
					type: "asr.audio.append",
					taskId: QA_ASR_TASK_ID,
					audio: bytesToBase64(chunk),
				});
				if (!sent) return;
				asrChunkCounterRef.current += 1;
				if (
					asrChunkCounterRef.current === 1 ||
					asrChunkCounterRef.current % 25 === 0
				) {
					appendDebug(
						`sent asr.audio.append (${asrChunkCounterRef.current})`,
					);
				}
			},
			(message) => {
				handleFatalError(message);
			},
			runtimeConfig.asrDefaults.clientGate,
		);
	}, [
		appendDebug,
		handleFatalError,
		resolveCurrentAsrRuntime,
		sendJson,
	]);

	const pauseAudioCapture = useCallback(() => {
		if (!audioCaptureStateRef.current.captureStarted || capturePausedRef.current) {
			return;
		}
		capturePausedRef.current = true;
		cleanupVoiceAudioCapture(audioCaptureStateRef.current);
	}, []);

	const resumeAudioCapture = useCallback(async () => {
		if (!capturePausedRef.current) {
			return audioCaptureStateRef.current.captureStarted;
		}
		await playerRef.current.waitForIdle();
		capturePausedRef.current = false;
		return ensureAudioCapture();
	}, [ensureAudioCapture]);

	const enterListeningReady = useCallback(
		async (options: { resumeCapture: boolean }) => {
			const transitionId = listeningTransitionRef.current + 1;
			listeningTransitionRef.current = transitionId;

			await runVoiceChatListeningReady({
				transitionId,
				resumeCapture: options.resumeCapture,
				isCurrent: (id) =>
					id === listeningTransitionRef.current &&
					stateRef.current.inputMode === "voice" &&
					!Boolean(stateRef.current.voiceChat.error),
				waitForIdle: () => playerRef.current.waitForIdle(),
				playReadyCue: async () => {
					try {
						await readyCuePlayerRef.current.playReadyCue();
					} catch (error) {
						appendDebug(
							`ready cue failed: ${
								error instanceof Error ? error.message : String(error)
							}`,
						);
					}
				},
				ensureAudioCapture,
				resumeAudioCapture,
				onListeningReady: () => {
					patchVoiceChat({
						status: "listening",
						sessionActive: true,
						error: "",
						wsStatus: "open",
					});
				},
			});
		},
		[
			appendDebug,
			ensureAudioCapture,
			patchVoiceChat,
			resumeAudioCapture,
			stateRef,
		],
	);

	const ensureVoiceSetup = useCallback(async () => {
		let capabilities = stateRef.current.voiceChat.capabilities;
		let voices = stateRef.current.voiceChat.voices;
		let selectedVoice = stateRef.current.voiceChat.selectedVoice;

		if (!stateRef.current.voiceChat.capabilitiesLoaded) {
			try {
				capabilities = await getVoiceCapabilitiesFlexible();
				const runtimeConfig = resolveCurrentAsrRuntime(capabilities);
				patchVoiceChat({
					capabilities,
					capabilitiesLoaded: true,
					capabilitiesError: "",
					speechRate:
						Number(capabilities?.tts?.speechRateDefault) ||
						stateRef.current.voiceChat.speechRate,
					clientGate: stateRef.current.voiceChat.clientGateCustomized
						? stateRef.current.voiceChat.clientGate
						: runtimeConfig.asrDefaults.clientGate,
				});
			} catch (error) {
				const message = (error as Error).message;
				patchVoiceChat({
					capabilitiesLoaded: false,
					capabilitiesError: message,
				});
				throw error;
			}
		}

		if (!stateRef.current.voiceChat.voicesLoaded) {
			try {
				const voicesPath =
					String(capabilities?.tts?.voicesEndpoint || "").trim() ||
					"/api/voice/tts/voices";
				const response = await getVoiceVoicesFlexible(voicesPath);
				voices = ensureVoiceOptions(response);
				selectedVoice = resolveDefaultVoice(
					voices,
					stateRef.current.voiceChat.selectedVoice,
					response?.defaultVoice,
				);
				patchVoiceChat({
					voices,
					voicesLoaded: true,
					voicesError: "",
					selectedVoice,
				});
			} catch (error) {
				const rawMessage = (error as Error).message;
				const message =
					rawMessage === "Response is not ApiResponse shape" ||
					rawMessage === "voice voices response is invalid"
						? "语音后端音色列表返回格式异常"
						: rawMessage;
				patchVoiceChat({
					voicesLoaded: false,
					voicesError: message,
				});
				throw error;
			}
		}

		return {
			capabilities: capabilities || stateRef.current.voiceChat.capabilities,
			voices: voices || stateRef.current.voiceChat.voices,
			selectedVoice:
				selectedVoice || stateRef.current.voiceChat.selectedVoice,
		};
	}, [patchVoiceChat, resolveCurrentAsrRuntime, stateRef]);

	const connectSocket = useCallback(async () => {
		if (socketRef.current?.readyState === WebSocket.OPEN) {
			return socketRef.current;
		}
		if (socketPromiseRef.current) {
			return socketPromiseRef.current;
		}

		const wsPath =
			stateRef.current.voiceChat.capabilities?.websocketPath ||
			"/api/voice/ws";
		const accessToken = String(stateRef.current.accessToken || "").trim();
		if (!accessToken) {
			throw new Error("voice access_token is required");
		}
		const url = resolveVoiceChatWsUrl(wsPath, accessToken);
		appendDebug(`connect ${describeVoiceChatWsTarget(wsPath)}`);
		patchVoiceChat({ wsStatus: "connecting" });

		socketPromiseRef.current = new Promise<WebSocket>((resolve, reject) => {
			let settled = false;
			try {
				const socket = new WebSocket(url);
				socket.binaryType = "arraybuffer";
				socketRef.current = socket;

				socket.onopen = () => {
					if (settled) return;
					settled = true;
					socketPromiseRef.current = null;
					patchVoiceChat({ wsStatus: "open" });
					appendDebug("socket open");
					resolve(socket);
				};

				socket.onmessage = async (event) => {
					if (typeof event.data === "string") {
						try {
							const message = JSON.parse(event.data) as VoiceTaskEvent;
							if (message.taskId === QA_ASR_TASK_ID) {
								if (message.type === "task.started") {
									asrTaskActiveRef.current = true;
									asrStartInFlightRef.current = false;
									reconnectAttemptRef.current = 0;
									if (ttsTaskActiveRef.current) {
										appendDebug(
											"received task.started for asr while tts is active",
										);
										return;
									}
									if (
										audioCaptureStateRef.current.captureStarted &&
										!capturePausedRef.current
									) {
										appendDebug(
											"received task.started for asr while capture is already active",
										);
										patchVoiceChat({
											sessionActive: true,
											error: "",
											wsStatus: "open",
										});
										return;
									}
									appendDebug("received task.started for asr");
									void enterListeningReady({
										resumeCapture: false,
									}).catch(() => undefined);
									return;
								}
								if (message.type === "asr.text.final" && message.text) {
									const merged = mergeVoiceChatUtterance(
										pendingUtteranceRef.current,
										message.text,
									);
									pendingUtteranceRef.current = merged;
									patchVoiceChat({
										partialUserText: merged,
										error: "",
									});
									clearFlushTimer();
									flushTimerRef.current = window.setTimeout(() => {
										flushTimerRef.current = null;
										const finalText = pendingUtteranceRef.current.trim();
										pendingUtteranceRef.current = "";
										if (!finalText) return;
										if (
											normalizeVoiceChatUtteranceForLength(finalText)
												.length <= 2
										) {
											patchVoiceChat({ status: "listening" });
											return;
										}
										createTurnNodes(finalText);
										patchVoiceChat({
											status: "thinking",
											partialUserText: finalText,
											partialAssistantText: "",
											error: "",
										});
										const sent = sendJson({
											type: "tts.start",
											taskId: QA_TTS_TASK_ID,
											mode: "llm",
											text: finalText,
											voice:
												stateRef.current.voiceChat.selectedVoice ||
												stateRef.current.voiceChat.voices[0]?.id,
											speechRate:
												stateRef.current.voiceChat.speechRate || 1.2,
											chatId:
												String(stateRef.current.chatId || "").trim() ||
												undefined,
											agentKey:
												String(
													stateRef.current.voiceChat.currentAgentKey || "",
												).trim() || undefined,
										});
										if (!sent) {
											handleFatalError("语音 WebSocket 尚未连接");
										}
									}, DEFAULT_VOICE_CHAT_SEND_PAUSE_MS);
									return;
								}
								if (message.type === "error") {
									asrTaskActiveRef.current = false;
									asrStartInFlightRef.current = false;
									handleFatalError(
										`${message.code || "ERROR"}: ${message.message || "ASR 失败"}`,
									);
									return;
								}
								if (message.type === "task.stopped") {
									asrTaskActiveRef.current = false;
									asrStartInFlightRef.current = false;
									appendDebug(
										`asr task stopped: ${
											message.reason ? `reason=${message.reason}` : "no reason"
										}`,
									);
									if (stateRef.current.inputMode === "voice") {
										if (ttsTaskActiveRef.current) {
											asrRestartPendingRef.current = true;
											appendDebug(
												"defer asr restart until tts finishes",
											);
											return;
										}
										const restarted = startAsrTask(
											"recover after asr task.stopped",
										);
										if (!restarted) {
											scheduleVoiceReconnectRef.current(
												message.reason || "语音识别任务已停止",
											);
										}
									}
									return;
								}
							}

							if (message.taskId === QA_TTS_TASK_ID) {
								if (message.type === "task.started") {
									ttsTaskActiveRef.current = true;
									cancelListeningTransition();
									pendingBinaryRef.current = [];
									playerRef.current.resetQueue();
									pauseAudioCapture();
									patchVoiceChat({
										status: "speaking",
										sessionActive: true,
										error: "",
									});
									return;
								}
								if (message.type === "tts.audio.format") {
									ttsSampleRateRef.current =
										Number(message.sampleRate) || 24000;
									ttsChannelsRef.current =
										Number(message.channels) || 1;
									return;
								}
								if (message.type === "tts.audio.chunk") {
									pendingBinaryRef.current.push({
										taskId: QA_TTS_TASK_ID,
										seq: Number(message.seq) || 0,
									});
									return;
								}
								if (message.type === "tts.text.delta" && message.text) {
									const nextText = `${String(
										stateRef.current.voiceChat.partialAssistantText || "",
									)}${message.text}`;
									patchVoiceChat({
										partialAssistantText: nextText,
										status: "speaking",
									});
									updateAssistantNode(nextText, "running");
									return;
								}
								if (message.type === "tts.chat.updated" && message.chatId) {
									const chatId = String(message.chatId).trim();
									dispatch({ type: "SET_CHAT_ID", chatId });
									dispatch({
										type: "SET_CHAT_AGENT_BY_ID",
										chatId,
										agentKey:
											stateRef.current.voiceChat.currentAgentKey,
									});
									dispatch({
										type: "UPSERT_CHAT",
										chat: {
											chatId,
											chatName:
												stateRef.current.voiceChat.currentAgentName,
											firstAgentKey:
												stateRef.current.voiceChat.currentAgentKey,
											firstAgentName:
												stateRef.current.voiceChat.currentAgentName,
											agentKey:
												stateRef.current.voiceChat.currentAgentKey,
											updatedAt: Date.now(),
										},
									});
									return;
								}
								if (message.type === "error") {
									ttsTaskActiveRef.current = false;
									handleFatalError(
										`${message.code || "ERROR"}: ${message.message || "TTS 失败"}`,
									);
									return;
								}
								if (message.type === "task.stopped") {
									ttsTaskActiveRef.current = false;
									updateAssistantNode(
										stateRef.current.voiceChat.partialAssistantText,
										"completed",
									);
									upsertChatSummary(
										stateRef.current.voiceChat.partialAssistantText,
									);
									if (
										asrRestartPendingRef.current ||
										asrStartInFlightRef.current ||
										!asrTaskActiveRef.current
									) {
										const restarted = startAsrTask(
											asrRestartPendingRef.current
												? "resume after tts"
												: "recover missing asr after tts",
										);
										if (!restarted && !asrStartInFlightRef.current) {
											scheduleVoiceReconnectRef.current(
												"tts completed without active asr",
											);
										}
										return;
									}
									void enterListeningReady({
										resumeCapture: true,
									}).catch(() => undefined);
								}
							}
						} catch (error) {
							appendDebug(
								`message parse failed: ${
									error instanceof Error ? error.message : String(error)
								}`,
							);
						}
						return;
					}

					const pending = pendingBinaryRef.current.shift();
					if (!pending || pending.taskId !== QA_TTS_TASK_ID) return;
					const buffer =
						event.data instanceof ArrayBuffer
							? event.data
							: await (event.data as Blob).arrayBuffer();
					await playerRef.current.enqueue(
						buffer,
						ttsSampleRateRef.current,
						ttsChannelsRef.current,
					);
				};

				socket.onerror = () => {
					appendDebug("socket error event");
					if (!settled) {
						settled = true;
						socketPromiseRef.current = null;
						reject(new Error("语音 WebSocket 连接失败"));
						return;
					}
					asrTaskActiveRef.current = false;
					asrStartInFlightRef.current = false;
					asrRestartPendingRef.current = false;
					ttsTaskActiveRef.current = false;
					patchVoiceChat({ wsStatus: "error" });
					try {
						if (
							socket.readyState === WebSocket.OPEN ||
							socket.readyState === WebSocket.CONNECTING
						) {
							socket.close(1011, "voice socket error");
						}
					} catch {
						/* no-op */
					}
				};

				socket.onclose = (event) => {
					socketPromiseRef.current = null;
					socketRef.current = null;
					asrTaskActiveRef.current = false;
					asrStartInFlightRef.current = false;
					asrRestartPendingRef.current = false;
					ttsTaskActiveRef.current = false;
					const closeEvent = event as CloseEvent;
					appendDebug(
						`socket closed: code=${String(closeEvent?.code ?? "-")}, reason=${String(closeEvent?.reason || "").trim() || "-"}, clean=${Boolean(closeEvent?.wasClean)}`,
					);
					const closeMessage = formatVoiceSocketClose(event);
					const expected = expectedCloseRef.current;
					expectedCloseRef.current = false;
					if (expected) {
						patchVoiceChat({ wsStatus: "closed" });
						return;
					}
					if (stateRef.current.inputMode === "voice") {
						if (isVoiceRecoveryEligible()) {
							scheduleVoiceReconnectRef.current(closeMessage);
							return;
						}
						handleFatalError(closeMessage);
					}
				};
			} catch (error) {
				socketPromiseRef.current = null;
				reject(error as Error);
			}
		});

		return socketPromiseRef.current;
	}, [
		appendDebug,
		cancelListeningTransition,
		clearFlushTimer,
		createTurnNodes,
		dispatch,
		enterListeningReady,
		ensureAudioCapture,
		handleFatalError,
		isVoiceRecoveryEligible,
		patchVoiceChat,
		pauseAudioCapture,
		resumeAudioCapture,
		sendJson,
		startAsrTask,
		stateRef,
		updateAssistantNode,
		upsertChatSummary,
	]);

	const scheduleVoiceReconnect = useCallback(
		(reason: string) => {
			if (!isVoiceRecoveryEligible()) {
				return;
			}
			if (reconnectTimerRef.current != null || reconnectInFlightRef.current) {
				appendDebug(`skip reconnect scheduling: ${reason}`);
				return;
			}

			const attempt = reconnectAttemptRef.current + 1;
			reconnectAttemptRef.current = attempt;
			if (attempt > MAX_VOICE_WS_RECONNECT_ATTEMPTS) {
				handleFatalError(`语音链路恢复失败: ${reason}`);
				return;
			}

			const delay = Math.min(
				VOICE_WS_RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
				4000,
			);
			patchVoiceChat({
				status: "connecting",
				sessionActive: false,
				error: "",
				wsStatus: "connecting",
			});
			appendDebug(
				`schedule reconnect #${attempt} in ${delay}ms: ${reason}`,
			);
			reconnectTimerRef.current = window.setTimeout(() => {
				reconnectTimerRef.current = null;
				if (!isVoiceRecoveryEligible() || reconnectInFlightRef.current) {
					return;
				}
				reconnectInFlightRef.current = true;
				appendDebug(`reconnect attempt #${attempt}: ${reason}`);
				void (async () => {
					let nextReason = "";
					try {
						await connectSocket();
						if (!isVoiceRecoveryEligible()) {
							return;
						}
						const started = startAsrTask(
							`reconnect attempt #${attempt}`,
						);
						if (!started) {
							throw new Error("语音 WebSocket 重连后无法启动 ASR");
						}
						reconnectAttemptRef.current = 0;
						patchVoiceChat({
							error: "",
							wsStatus: "open",
						});
					} catch (error) {
						nextReason =
							error instanceof Error ? error.message : String(error);
						appendDebug(
							`reconnect attempt #${attempt} failed: ${nextReason}`,
						);
					} finally {
						reconnectInFlightRef.current = false;
						if (nextReason) {
							scheduleVoiceReconnect(nextReason);
						}
					}
				})();
			}, delay);
		},
		[
			appendDebug,
			connectSocket,
			handleFatalError,
			isVoiceRecoveryEligible,
			patchVoiceChat,
			startAsrTask,
		],
	);

	scheduleVoiceReconnectRef.current = scheduleVoiceReconnect;

	const startVoiceChatForWorker = useCallback(async () => {
		if (!currentWorker || currentWorker.type !== "agent") {
			dispatch({ type: "SET_INPUT_MODE", mode: "text" });
			return;
		}
		if (startedAgentKeyRef.current === currentWorker.sourceId) {
			return;
		}

		startedAgentKeyRef.current = currentWorker.sourceId;
		dispatch({
			type: "SET_PENDING_NEW_CHAT_AGENT_KEY",
			agentKey: currentWorker.sourceId,
		});
		patchVoiceChat({
			status: "connecting",
			sessionActive: false,
			error: "",
			partialUserText: "",
			partialAssistantText: "",
			currentAgentKey: currentWorker.sourceId,
			currentAgentName: currentWorker.displayName,
		});

		try {
			if (!String(stateRef.current.accessToken || "").trim()) {
				throw new Error("voice access_token is required");
			}
			const setup = await ensureVoiceSetup();
			if (setup.capabilities?.asr?.configured === false) {
				throw new Error("当前语音后端未配置 ASR，语聊模式不可用");
			}
			if (setup.capabilities?.tts?.runnerConfigured === false) {
				throw new Error("当前语音后端未配置 runner，语聊模式不可用");
			}
			if (!setup.selectedVoice) {
				throw new Error("当前语音后端未返回可用音色");
			}
			await readyCuePlayerRef.current.prime().catch(() => undefined);
			await connectSocket();
			const sent = startAsrTask("initial connect");
			if (!sent) {
				throw new Error("语音 WebSocket 尚未连接");
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const recoverable =
				isVoiceRecoveryEligible() &&
				(message.includes("WebSocket") ||
					message.includes("连接失败") ||
					message.includes("尚未连接"));
			if (recoverable) {
				appendDebug(`voice start retry scheduled: ${message}`);
				scheduleVoiceReconnect(message);
				return;
			}
			startedAgentKeyRef.current = "";
			handleFatalError(message);
		}
	}, [
		appendDebug,
		connectSocket,
		currentWorker,
		dispatch,
		ensureVoiceSetup,
		handleFatalError,
		isVoiceRecoveryEligible,
		patchVoiceChat,
		scheduleVoiceReconnect,
		startAsrTask,
	]);

	const stopVoiceChatForModeExit = useCallback(() => {
		clearFlushTimer();
		cancelListeningTransition();
		pendingUtteranceRef.current = "";
		if (
			socketRef.current != null &&
			socketRef.current.readyState === WebSocket.OPEN
		) {
			if (assistantNodeIdRef.current) {
				sendJson({ type: "tts.stop", taskId: QA_TTS_TASK_ID });
			}
			flushVoiceAudioCaptureRemainder(
				audioCaptureStateRef.current,
				(chunk) => {
					const sent = sendJson({
						type: "asr.audio.append",
						taskId: QA_ASR_TASK_ID,
						audio: bytesToBase64(chunk),
					});
					if (sent) {
						asrChunkCounterRef.current += 1;
						appendDebug(
							`sent asr.audio.append (${asrChunkCounterRef.current})`,
						);
					}
				},
			);
			for (const frame of buildVoiceAsrStopFrames(
				QA_ASR_TASK_ID,
				new Uint8Array(0),
			)) {
				sendJson(frame);
				if (frame.type === "asr.audio.commit" || frame.type === "asr.stop") {
					appendDebug(`sent ${String(frame.type)}`);
				}
			}
		}
		resetVoiceSession();
	}, [appendDebug, cancelListeningTransition, clearFlushTimer, resetVoiceSession, sendJson]);

	useEffect(() => {
		const resetHandler = () => {
			resetVoiceSession({ forceTextMode: true });
		};
		window.addEventListener("agent:voice-reset", resetHandler);
		return () => {
			window.removeEventListener("agent:voice-reset", resetHandler);
			resetVoiceSession();
		};
	}, [resetVoiceSession]);

	useEffect(() => {
		playerRef.current.setMuted(state.audioMuted);
		readyCuePlayerRef.current.setMuted(state.audioMuted);
	}, [state.audioMuted]);

	useEffect(() => {
		const voiceEligible =
			Boolean(currentWorker) &&
			currentWorker?.type === "agent" &&
			!state.activeFrontendTool &&
			!state.streaming;

		if (state.inputMode !== "voice") {
			if (startedAgentKeyRef.current) {
				stopVoiceChatForModeExit();
			}
			return;
		}

		if (!voiceEligible || !currentWorker || currentWorker.type !== "agent") {
			stopVoiceChatForModeExit();
			dispatch({ type: "SET_INPUT_MODE", mode: "text" });
			return;
		}

		if (startedAgentKeyRef.current === currentWorker.sourceId) {
			return;
		}

		void startVoiceChatForWorker();
	}, [
		currentWorker,
		dispatch,
		startVoiceChatForWorker,
		state.activeFrontendTool,
		state.inputMode,
		state.streaming,
		stopVoiceChatForModeExit,
	]);
}
