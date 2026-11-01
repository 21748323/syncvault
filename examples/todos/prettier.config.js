/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'es5',
	printWidth: 80,
	htmlWhitespaceSensitivity: 'ignore',
	proseWrap: 'always',
	plugins: [
		'prettier-plugin-svelte',
		'@trivago/prettier-plugin-sort-imports',
		'prettier-plugin-tailwindcss',
	],
	overrides: [
		{
			files: '*.svelte',
			options: {
				parser: 'svelte',
			},
		},
	],
	importOrderSortSpecifiers: true,
	tailwindStylesheet: './src/routes/layout.css',
};

export default config;
