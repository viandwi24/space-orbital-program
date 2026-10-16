<script lang="ts">
	import { GAME_DESCRIPTION, GAME_NAME } from '../public/about';

	/**
	 * Title, description and the social-card tags of one page (plan 023). The pages are prerendered
	 * static HTML, so the tags are in the file a crawler fetches. `VITE_SITE_URL` (set when building
	 * for a host, README) makes the image address absolute, which most social sites require.
	 */
	let { title, description = GAME_DESCRIPTION }: { title: string; description?: string } = $props();

	const site = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/$/, '');
	const image = `${site}/social-preview.jpg`;
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={GAME_NAME} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="A rocket climbing away from a blue planet at sunrise" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />
</svelte:head>
