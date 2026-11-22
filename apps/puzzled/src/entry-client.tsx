/** @jsxImportSource solid-js */
import { mount, StartClient } from '@solidjs/start/client'
import './lib/observability/browser-startup'

const app = document.getElementById('app')
if (!app) throw new Error('Missing Tryit hydration root')
mount(() => <StartClient />, app)
