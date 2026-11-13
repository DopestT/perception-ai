import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import { PublicPages } from './PublicPages'
import { resolvePublicPage } from './public-site-routes'
import { FrontDoorBoundary } from './FrontDoorBoundary'
import './styles.css'

// Only the homepage mounts the authenticated Project World and WebGL canvas.
// Editorial pages stay lightweight, public and independently navigable.
const publicPage = resolvePublicPage(window.location.pathname)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FrontDoorBoundary>
      {publicPage ? <PublicPages page={publicPage} /> : <App />}
    </FrontDoorBoundary>
    <Analytics />
  </React.StrictMode>,
)
