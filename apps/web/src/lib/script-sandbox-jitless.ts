// The sandbox CSP has no 'unsafe-eval'. zod probes `new Function('')` once, when the first object
// schema is built, to decide whether it may compile validators; the probe is caught, but Firefox
// logs the CSP violation as a console error. Telling zod up front skips the probe. This module must
// be the first import of the script Worker: @orbital/core builds its schemas when it is imported
// (plan 032, found by the Firefox end-to-end run).
import { config } from 'zod';

config({ jitless: true });
