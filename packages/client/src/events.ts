// The server's event stream, read with fetch rather than EventSource, because
// EventSource can't send the Authorization header.

export interface ServerEvent {
	type: string;
	data: string;
}

/**
 * Splits buffered stream text into complete events, returning what's left
 * over for the next chunk.
 */
export function parseEvents(buffer: string) {
	const events: ServerEvent[] = [];
	const blocks = buffer.replaceAll('\r\n', '\n').split('\n\n');
	const rest = blocks.pop()!;
	for (const block of blocks) {
		let type = 'message';
		const data: string[] = [];
		for (const line of block.split('\n')) {
			if (line.startsWith('event:')) type = line.slice(6).trim();
			else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
		}
		events.push({ type, data: data.join('\n') });
	}
	return { events, rest };
}

interface EventStreamOptions {
	/** Opens the stream. Throws or returns a non-OK response on failure. */
	open(signal: AbortSignal): Promise<Response>;
	onChange(collection: string): void;
	/** Connected, at first or after a drop. */
	onOpen(): void;
	onDrop(): void;
}

/**
 * Keeps one stream open, reconnecting with backoff (1s doubling to 30s) after
 * any failure. A connection can look open while it's actually dead (e.g. a
 * proxy holding it after the server went away), so it also reconnects when
 * three pings in a row don't arrive.
 */
export function createEventStream(options: EventStreamOptions) {
	let controller: AbortController | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;
	let watchdog: ReturnType<typeof setTimeout> | undefined;
	let retryDelay = 1000;
	let running = false;

	function dropped() {
		clearTimeout(watchdog);
		controller?.abort();
		if (!running) return;
		options.onDrop();
		retry = setTimeout(connect, retryDelay);
		retryDelay = Math.min(retryDelay * 2, 30_000);
	}

	async function connect() {
		controller = new AbortController();
		const { signal } = controller;
		try {
			const response = await options.open(signal);
			if (!response.ok || !response.body) throw new Error(`${response.status}`);
			retryDelay = 1000;
			options.onOpen();
			await read(response.body, signal);
		} catch {
			// Reported through onDrop below.
		}
		if (!signal.aborted) dropped();
	}

	async function read(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		while (!signal.aborted) {
			const { value, done } = await reader.read();
			if (done) return;
			const parsed = parseEvents(
				buffer + decoder.decode(value, { stream: true })
			);
			buffer = parsed.rest;
			for (const event of parsed.events) handle(event);
		}
	}

	function handle(event: ServerEvent) {
		if (event.type === 'ping') {
			const { interval } = JSON.parse(event.data) as { interval: number };
			clearTimeout(watchdog);
			watchdog = setTimeout(dropped, interval * 3);
		} else if (event.type === 'change') {
			const { collection } = JSON.parse(event.data) as { collection: string };
			options.onChange(collection);
		}
	}

	return {
		start() {
			if (running) return;
			running = true;
			connect();
		},
		stop() {
			running = false;
			retryDelay = 1000;
			clearTimeout(retry);
			clearTimeout(watchdog);
			controller?.abort();
		},
	};
}
