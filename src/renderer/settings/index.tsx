// src/renderer/settings/index.tsx
import { createRoot } from 'react-dom/client';
import { SettingsApp } from './SettingsApp';
import '../theme/base.css';
import '../theme/light.css';

createRoot(document.getElementById('root')!).render(<SettingsApp />);
