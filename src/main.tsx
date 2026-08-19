import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'
import { startSession } from './state/session'

// Loop 7.1: hydrate the saved career and start writing changes back, before the
// first render — see state/session.ts for why this is not a hook.
startSession()

render(<App />, document.getElementById('app')!)
