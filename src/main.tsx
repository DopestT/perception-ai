import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { resolvePublicPage } from './public-site-routes'
import { FrontDoorBoundary } from './FrontDoorBoundary'
import './styles.css'

// Split the bundle: reading public pages never initializes the expensive
// authenticated workspace or WebGL. The home app retains all existing logic.
const App = lazy(() => import('./App'))
const PublicPages = lazy(async () => ({
  default: (await import('./PublicPages')).PublicPages,
}))
const publicPage = resolvePublicPage(window.location.pathname)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FrontDoorBoundary>
      <Suspense fallback={<div className="public-route-loading" role="status">OPENING PERCEPTION…</div>}>
        {publicPage ? <PublicPages page={publicPage} /> : <App />}
      </Suspense>
    </FrontDoorBoundary>
    <Analytics />
  </React.StrictMode>,
)
