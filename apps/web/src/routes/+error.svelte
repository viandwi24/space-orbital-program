<script lang="ts">
	import { GAME_NAME } from '../lib/public/about';
	import { page } from '$app/state';
	import ErrorScreen from '../lib/ui/ErrorScreen.svelte';
	import PageMeta from '../lib/ui/PageMeta.svelte';
</script>

<PageMeta title="{page.status === 404 ? 'Page not found' : 'Error'} · {GAME_NAME}" />
<ErrorScreen
	title={page.status === 404 ? 'There is nothing at this address' : 'Something went wrong'}
	message={page.error?.message ?? `Error ${page.status}`}
	onreload={() => location.reload()}
/>
