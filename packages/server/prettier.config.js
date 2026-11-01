/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'es5',
	printWidth: 80,
	proseWrap: 'always',
	plugins: ['@trivago/prettier-plugin-sort-imports'],
	importOrderSortSpecifiers: true,
};

export default config;
