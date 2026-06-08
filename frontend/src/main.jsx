import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SalesChannelsProvider } from './context/SalesChannelsContext.jsx';
import { queryClient } from './queryClient';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SalesChannelsProvider>
              <App />
            </SalesChannelsProvider>
          </AuthProvider>
        </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
