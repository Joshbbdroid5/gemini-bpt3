import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './components/App';
import './index.css';
import { Toaster } from 'react-hot-toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Toaster for global notifications */}
    <Toaster position="bottom-center" />
  </StrictMode>,
);
