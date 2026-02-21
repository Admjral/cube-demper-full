import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LangProvider } from './context/LangContext'
import { ThemeProvider } from './context/ThemeContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LangProvider>
        <App />
      </LangProvider>
    </ThemeProvider>
  </StrictMode>,
)
