import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import Arena from './Arena.tsx'
import './index.css'

const isArena = window.location.pathname.replace(/\/$/, '') === '/arena'

createRoot(document.getElementById('root')!).render(<StrictMode>{isArena ? <Arena /> : <App />}</StrictMode>)
