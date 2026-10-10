import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const Site = lazy(() => import('./public/Site.jsx'));
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<Site />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
