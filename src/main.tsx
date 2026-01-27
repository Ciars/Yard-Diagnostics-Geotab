import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeDrive } from '@geotab/zenith'
import { queryClient } from './lib/queryClient'
import { initGeotabPlugin } from './services/geotabPlugin'
import './index.css'
import '@geotab/zenith/dist/index.css'
import App from './App'

// Hook into Geotab lifecycle immediately
initGeotabPlugin();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <ThemeDrive>
                <App />
            </ThemeDrive>
        </QueryClientProvider>
    </StrictMode>,
)
