// src/renderer/index.tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './theme/base.css';
import './theme/light.css';

createRoot(document.getElementById('root')!).render(<App />);
