import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Post from './pages/Post';
import Admin from './pages/Admin';
import Recruit from './pages/Recruit';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/p/:postId" element={<Post />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/recruit" element={<Recruit />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
