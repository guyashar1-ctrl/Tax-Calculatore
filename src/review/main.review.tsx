// נקודת הכניסה של סביבת הסקירה. קיימת רק בענף הסקירה.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import '../components/ui/ui.css';
import '../components/ui/pivo-design.css';
import './review.css';
import ReviewApp from './ReviewApp';
import { ToastProvider } from '../components/ui/Toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ReviewApp />
    </ToastProvider>
  </StrictMode>,
);
