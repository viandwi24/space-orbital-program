import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageLoad } from './$types';

// The viewer moved under Developer (plan 375); old links keep working, query and all.
export const ssr = false;
export const load: PageLoad = ({ url }) => {
	redirect(307, `${resolve('/developer/crew')}${url.search}`);
};
