/** @jsxImportSource solid-js */
import { mount, StartClient } from '@solidjs/start/client'

const app = document.getElementById('app')
if (!app) throw new Error('Missing Tryit hydration root')
mount(() => <StartClient />, app)
