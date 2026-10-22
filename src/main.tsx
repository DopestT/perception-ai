import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import { FrontDoorBoundary } from './FrontDoorBoundary'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FrontDoorBoundary>
      <App />
    </FrontDoorBoundary>
    <Analytics />
  </React.StrictMode>,
)
