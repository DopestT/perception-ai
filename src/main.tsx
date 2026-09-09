import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { TokenEfficiencyPanel } from './TokenEfficiencyPanel'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <TokenEfficiencyPanel />
  </React.StrictMode>,
)
