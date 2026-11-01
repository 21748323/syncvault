// Server-sent events telling an app's devices which collection changed, so
// they pull it again. Events carry no data: the pull is the source of truth.

interface Stream {
	appId: number;
	deviceId: number;
	send(message: string): void;
	close(): void;
}

// A connection can die without either end noticing (a proxy holding it open,
// a phone changing networks), so ping regularly. Clients reconnect when pings
// stop, which is why the ping carries the interval.
export function createEvents(pingInterval: number) {
	const streams = new Set<Stream>();
	const ping = `event: ping\ndata: ${JSON.stringify({ interval: pingInterval })}\n\n`;

	function subscribe(appId: number, deviceId: number) {
		let stream: Stream;
		let timer: ReturnType<typeof setInterval>;
		const forget = () => {
			clearInterval(timer);
			streams.delete(stream);
		};
		const body = new ReadableStream<string>({
			start(controller) {
				stream = {
					appId,
					deviceId,
					// A stream can close or fail before cancel() runs. Drop it then,
					// rather than letting one dead connection break a push.
					send(message) {
						try {
							controller.enqueue(message);
						} catch {
							forget();
						}
					},
					close() {
						forget();
						try {
							controller.close();
						} catch {}
					},
				};
				streams.add(stream);
				stream.send(ping);
				timer = setInterval(() => stream.send(ping), pingInterval);
			},
			cancel: () => forget(),
		});
		return new Response(body, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			},
		});
	}

	function broadcast(appId: number, collection: string) {
		const message = `event: change\ndata: ${JSON.stringify({ collection })}\n\n`;
		for (const stream of [...streams]) {
			if (stream.appId === appId) stream.send(message);
		}
	}

	// Revoked devices lose their streams straight away, not just their tokens.
	function closeWhere(match: (stream: Stream) => boolean) {
		for (const stream of [...streams]) if (match(stream)) stream.close();
	}

	return {
		subscribe,
		broadcast,
		closeDevice: (deviceId: number) =>
			closeWhere((stream) => stream.deviceId === deviceId),
		closeApp: (appId: number) => closeWhere((stream) => stream.appId === appId),
		closeAll: () => closeWhere(() => true),
	};
}

export type Events = ReturnType<typeof createEvents>;
