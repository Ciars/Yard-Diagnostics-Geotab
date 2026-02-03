import { Dashboard } from './components/Dashboard/Dashboard'
import { ErrorBoundary } from './components/ErrorBoundary'

function App() {
    return (
        <ErrorBoundary>
            <Dashboard />
        </ErrorBoundary>
    )
}

export default App
