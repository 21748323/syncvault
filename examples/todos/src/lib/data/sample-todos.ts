const SAMPLE_TODOS = [
	'Buy oat milk',
	'Walk the dog',
	'Book a dentist appointment',
	'Water the plants',
	'Call Mum',
	'Pay the electricity bill',
	'Take out the recycling',
	'Reply to the group chat',
	'Renew library books',
	'Clean the bathroom',
	'Pick up dry cleaning',
	'Back up laptop',
	'Change bed sheets',
	'Fix the squeaky door',
	'Return online order',
	'Plan weekend hike',
	'Read one chapter',
	'Defrost the freezer',
	'Update CV',
	'Book a haircut',
	'Buy a birthday card',
	'Meal prep for the week',
	'Vacuum the lounge',
	'Cancel unused subscription',
	'Charge the power bank',
	'Wash the car',
	'Submit timesheet',
	'Email the tutor',
	'Review lecture notes',
	'Start assignment draft',
	'Order printer ink',
	'Pump up bike tyres',
	'Sort the junk drawer',
	'Schedule a car service',
	'Buy coffee beans',
	'Clear out downloads folder',
	'Stretch for ten minutes',
	'Descale the kettle',
	'Write a thank-you note',
	'Check the mailbox',
];

// Prefers titles not already in use; falls back to any once all are taken.
export function randomTodoTitle(existingTitles: Iterable<string>) {
	const existing = new Set(existingTitles);
	const unused = SAMPLE_TODOS.filter((title) => !existing.has(title));
	const pool = unused.length > 0 ? unused : SAMPLE_TODOS;
	return pool[Math.floor(Math.random() * pool.length)];
}
