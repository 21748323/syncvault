// Tracks a new service worker that has installed and is waiting to take over
// from the one controlling this page.
let waiting = $state.raw<ServiceWorker | null>(null);

export const swUpdate = {
	get available() {
		return waiting !== null;
	},
	apply() {
		waiting?.postMessage({ type: 'skip-waiting' });
	},
	dismiss() {
		waiting = null;
	},
};

export async function watchForUpdates() {
	if (!('serviceWorker' in navigator)) return;
	const sw = navigator.serviceWorker;

	// Reload once the new worker takes control, in every open tab, so none keep
	// running old code against a cache that's been deleted. A page that had no
	// controller (a first visit, or a hard reload, which bypasses the worker)
	// already runs the latest code, so it only needs the prompt cleared.
	let controller = sw.controller;
	sw.addEventListener('controllerchange', () => {
		const previous = controller;
		controller = sw.controller;
		if (previous) location.reload();
		else waiting = null;
	});

	const registration = await sw.ready;

	// Check the registration's active worker rather than this page's
	// controller, which is null after a hard reload even though an older
	// worker is still in charge.
	const track = (worker: ServiceWorker) => {
		worker.addEventListener('statechange', () => {
			if (worker.state === 'installed' && registration.active) {
				waiting = worker;
			}
		});
	};
	if (registration.waiting) waiting = registration.waiting;
	if (registration.installing) track(registration.installing);
	registration.addEventListener('updatefound', () => {
		if (registration.installing) track(registration.installing);
	});

	// Browsers only check for a new worker on full page loads, and this app is
	// usually left open, so also check when the tab comes back into view.
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			registration.update().catch(() => {
				// Offline; try again next time.
			});
		}
	});
}
