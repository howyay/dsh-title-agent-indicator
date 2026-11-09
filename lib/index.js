/**
 * dsh-title-agent-indicator — host half.
 *
 * This plugin is browser-only: every piece of behaviour is in the client half
 * (lib/client.js, declared through `dsh.client` in package.json). The host
 * half therefore contributes nothing at runtime. It still exists, and is still
 * loaded, because a dsh bundle's inserted row resolves the package root.
 */

/** No host services are required. */
export const inject = [];

/** Mount the (empty) host half. */
export function apply() {}
