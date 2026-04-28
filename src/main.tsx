import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './components.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
// Tue Apr 28 11:51:51 PM UTC 2026
// Tue Apr 28 11:52:02 PM UTC 2026
