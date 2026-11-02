import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import Arena from './Arena.tsx'
import Landing from './Landing.tsx'
import './index.css'

const PAGES: Record<string, () => React.JSX.Element> = { '/arena': Arena, '/owner': App }
const Page = PAGES[window.location.pathname.replace(/\/$/, '')] ?? Landing

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
