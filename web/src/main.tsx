// The site's stylesheet first: it declares Tailwind's layers before the
// stageshow kit declares its own, so the kit's layer outranks the reset
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import Arena from './Arena.tsx'
import Landing from './Landing.tsx'

const PAGES: Record<string, () => React.JSX.Element> = { '/arena': Arena, '/owner': App }
const Page = PAGES[window.location.pathname.replace(/\/$/, '')] ?? Landing

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
