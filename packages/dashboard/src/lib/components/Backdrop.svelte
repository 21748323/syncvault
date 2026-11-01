<!--
@component
Decoration behind the pre-dashboard pages: a soft glow in the brand's colours
and a dot grid, both fading out. It centres itself on
its positioned parent and sits behind it, so give an ancestor `isolate` and
clip the page's overflow.
-->

<div class="backdrop" aria-hidden="true">
	<div class="glow primary"></div>
	<div class="glow secondary"></div>
	<div class="glow primary low"></div>
	<div class="dots"></div>
</div>

<style>
	.backdrop {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: -1;
		width: 1200px;
		height: 1200px;
		translate: -50% -50%;
		pointer-events: none;
	}

	/* Blurred blobs, offset from the centre so the colours blend unevenly */
	.glow {
		position: absolute;
		border-radius: 50%;
		filter: blur(120px);

		&.primary {
			top: 340px;
			left: 340px;
			width: 440px;
			height: 400px;
			background: var(--color-brand-primary);
			opacity: 0.26;
		}

		&.secondary {
			top: 560px;
			left: 580px;
			width: 360px;
			height: 320px;
			background: var(--color-brand-secondary);
			opacity: 0.2;
		}

		&.low {
			top: 640px;
			left: 240px;
			width: 280px;
			height: 240px;
			opacity: 0.12;
		}
	}

	.dots {
		position: absolute;
		inset: 0;
		background-image: radial-gradient(
			rgb(255 255 255 / 12%) 1.2px,
			transparent 1.2px
		);
		background-size: 24px 24px;
		mask-image: radial-gradient(circle, #000 0, #000 160px, transparent 520px);
	}
</style>
