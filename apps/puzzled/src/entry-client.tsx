/** @jsxImportSource solid-js */
import { mount, StartClient } from '@solidjs/start/client'
import './lib/observability/browser-startup'
import { captureInstallPrompt } from '@/shared/components/pwa-install-event'

captureInstallPrompt()
// Register the existing worker without asking for notification permission.
if ('serviceWorker' in navigator && window.isSecureContext) {
	void navigator.serviceWorker
		.register('/sw.js', { scope: '/', updateViaCache: 'none' })
		.catch(() => {})
}

const app = document.getElementById('app')
if (!app) throw new Error('Missing Tryit hydration root')
mount(() => <StartClient />, app)
