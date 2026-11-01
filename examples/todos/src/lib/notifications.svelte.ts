// Error messages shown as toasts, for problems outside the sync dialog.

interface Notification {
	id: number;
	message: string;
}

const DURATION = 8000;

let nextId = 0;
let list = $state<Notification[]>([]);

export const notifications = {
	get list() {
		return list;
	},
	dismiss(id: number) {
		list = list.filter((notification) => notification.id !== id);
	},
};

/**
 * Shows an error toast for a while. A message that's already showing isn't
 * repeated, since some failures (like a sync that keeps failing) recur.
 */
export function notify(message: string) {
	if (list.some((notification) => notification.message === message)) return;
	const id = nextId++;
	list = [...list, { id, message }];
	setTimeout(() => notifications.dismiss(id), DURATION);
}
