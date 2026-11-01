import { ConnectError, normalizeServerUrl } from './auth.ts';
import { createCursors } from './cursors.ts';
import { deviceName } from './device-name.ts';
import { parseEvents } from './events.ts';
import { createPkce } from './pkce.ts';
import { memoryStorage } from './testing.ts';
import { verifyPkce } from '@syncvault/server/src/crypto.ts';
import { describe, expect, test } from 'bun:test';

describe('parseEvents', () => {
	test('splits complete events and keeps the rest', () => {
		const { events, rest } = parseEvents(
			'event: ping\ndata: {"interval":1}\n\nevent: change\ndata: {"collection":"a"}\n\nevent: cha'
		);
		expect(events).toEqual([
			{ type: 'ping', data: '{"interval":1}' },
			{ type: 'change', data: '{"collection":"a"}' },
		]);
		expect(rest).toBe('event: cha');
	});

	test('handles CRLF line endings', () => {
		const { events } = parseEvents('event: ping\r\ndata: {}\r\n\r\n');
		expect(events).toEqual([{ type: 'ping', data: '{}' }]);
	});
});

describe('normalizeServerUrl', () => {
	test('assumes https for a bare address', () => {
		expect(normalizeServerUrl('sync.example.com')).toBe(
			'https://sync.example.com'
		);
		expect(normalizeServerUrl(' localhost:3000/ ')).toBe(
			'https://localhost:3000'
		);
	});

	test('keeps a protocol that was typed', () => {
		expect(normalizeServerUrl('http://localhost:3000')).toBe(
			'http://localhost:3000'
		);
		expect(normalizeServerUrl('HTTPS://Sync.Example.com/vault/')).toBe(
			'https://sync.example.com/vault'
		);
	});

	test('refuses other protocols and non-addresses', () => {
		for (const input of ['ftp://sync.example.com', '', 'https://', 'a b']) {
			expect(() => normalizeServerUrl(input)).toThrow(ConnectError);
		}
	});
});

describe('cursors', () => {
	const cursors = () => createCursors(memoryStorage(), 'test');

	test('pulls everything until a sync has finished', () => {
		const c = cursors();
		c.record('todos', 5, 100);
		expect(c.since('todos', {})).toBeUndefined();
	});

	test('commits cursors from pulls during the last finished sync', () => {
		const c = cursors();
		c.record('todos', 5, 100);
		c.record('todos', 7, 150);
		expect(
			c.since('todos', { lastFinishedSyncStart: 90, lastFinishedSyncEnd: 200 })
		).toBe(7);
	});

	test('never commits a cursor from a sync that failed', () => {
		const c = cursors();
		c.record('todos', 5, 100);
		// Sync at 100 succeeded; the one at 300 failed, so the last finished
		// sync is still the earlier one.
		c.since('todos', { lastFinishedSyncStart: 90, lastFinishedSyncEnd: 200 });
		c.record('todos', 9, 300);
		expect(
			c.since('todos', { lastFinishedSyncStart: 90, lastFinishedSyncEnd: 200 })
		).toBe(5);
	});

	test('keeps collections apart and can be cleared', () => {
		const c = cursors();
		c.record('a', 5, 100);
		const finished = { lastFinishedSyncStart: 90, lastFinishedSyncEnd: 200 };
		expect(c.since('b', finished)).toBeUndefined();
		c.clear('a');
		expect(c.since('a', finished)).toBeUndefined();
	});
});

describe('deviceName', () => {
	test.each([
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
			'Firefox on macOS',
		],
		[
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
			'Edge on Windows',
		],
		[
			'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
			'Safari on iOS',
		],
		[
			'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
			'Chrome on Android',
		],
		['something else', 'Browser'],
	])('%s', (userAgent, expected) => {
		expect(deviceName(userAgent)).toBe(expected);
	});
});

test('PKCE challenges match what the server checks', async () => {
	const { verifier, challenge } = await createPkce();
	expect(verifyPkce(verifier, challenge)).toBe(true);
	expect(verifyPkce(`${verifier}x`, challenge)).toBe(false);
});
